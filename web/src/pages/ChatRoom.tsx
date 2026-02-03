import React, { useEffect, useState, useRef } from 'react';
import styles from '@/styles/ChatRoom.module.css';
import shareStyles from '@/styles/Share.module.css';
import { useParams } from 'react-router-dom';
import PromptModal from '@/components/PromptModal/PromptModal';
import { io, type Socket } from 'socket.io-client';
import { QRCodeCanvas } from "qrcode.react";


interface SignalPayload {
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidate;
}

//接收Signal
interface SignalData {
    sender: string,
    senderName? :string,
    signal: SignalPayload,
}


type ChatMessage = {
    id: string;
    kind: "text";
    fromID: string;     // userID
    fromName: string;   //userName
    text: string;     // msg.msg
    ts: number;       // msg.ts
} | { 
    id: string;
    kind: "file"; 
    fromID: string; 
    fromName: string; 
    fileName: string; 
    size: number; 
    mime: string; 
    url: string; 
    ts: number 
};

type FileCtrl =
  | { type: "file-meta"; id: string; name: string; size: number; mime: string; ts: number }
  | { type: "file-end"; id: string; ts: number };

type IncomingFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  chunks: ArrayBuffer[];
  received: number;
  ts: number;
};

/**
 * 聊天室组件
 */
const ChatRoom: React.FC = () => {

    // === 常量配置 ===
    // const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL as string;
    const ICE_SERVERS: RTCConfiguration = {
        iceServers: JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]"),
    };  

    const { roomID } = useParams<{ roomID: string }>();

    //useState    
    const [isModalOpen, setIsModalOpen] = useState(true); //开关状态
    const [username, setUsername] = useState<string | null>(null); //本机用户名
    const [confirmed, setConfirmed] = useState(false);   //控制是否渲染chat页面
    const [userList, setUserList] = useState<Map<string, string>>(() => new Map());   //用户列表{userID, username}
    const [messages, setMessages] = useState<ChatMessage[]>([]);    //消息列表
    const [draft, setDraft] = useState<string>("");     //消息输入state
    //useRef
    const socketRef = useRef<Socket | null>(null);                              //socket连接
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());         //webRTC连接
    const textDataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());     //文本通道
    const fileDataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());     //文件通道
    const queuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());   //candidate候选队列
    const makingOfferMap = useRef<Map<string, boolean>>(new Map());

    const userListRef = useRef(new Map<string, string>());      //防止闭包捕获旧值
    
    //增加用户
    const upsertUser = (userID: string, username: string) => {
        setUserList(prev => {
            const next = new Map(prev);
            next.set(userID, username);
            return next;
        });
    }
    //删除用户
    const deleteUser = (userID: string) => {
        setUserList(prev => {
            const next = new Map(prev);
            next.delete(userID)
            return next;
        })
    }   
    
    //控制弹窗组件
    const handleSubmit = ( username: string ) => { //控制按钮提交
        setUsername(username);
        setConfirmed(true);
    };
    const handleClose = () => { //控制关闭
        setIsModalOpen(false);
    };

    useEffect(() => {
        if (!username || !confirmed || !roomID) return;
        //从url中获取房间号
        console.log('roomID: ',roomID,' username: ',username);

        socketRef.current = io({
            path: "/socket.io",
            transports: ["websocket", "polling"],
        });

        initSocketEvents(roomID);

        //关闭连接
        return () => {
            socketRef.current?.disconnect();
            for (const pc of peersRef.current.values()) {
                pc.close();
            }
            peersRef.current.clear();
            queuesRef.current.clear();
            makingOfferMap.current.clear();
        };
    },[username]);

    useEffect(() => {
        userListRef.current = userList;
    },[userList]);

    const initPeerConnection = (targetUserID: string) => {
        if (peersRef.current.has(targetUserID)) return peersRef.current.get(targetUserID);

        const pc = new RTCPeerConnection(ICE_SERVERS);
        //初始化该peer状态
        peersRef.current.set(targetUserID, pc);
        queuesRef.current.set(targetUserID, []);
        makingOfferMap.current.set(targetUserID, false);
        

        //onicecandidate事件挂载
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current?.emit('signal', { //signal.emit
                    target: targetUserID,
                    signal: { candidate: event.candidate },
                });
            }
        };

        //监控ICE状态
        pc.oniceconnectionstatechange = () => {
            console.log("ICE state:", pc.iceConnectionState);
            switch (pc.iceConnectionState) {
                case "connected":
                case "completed":
                    iceRestartAttemptsRef.current.set(targetUserID, 0);
                    break;
                case "failed":
                    scheduleIceRestart(targetUserID);
                break;
            }
        };

        pc.getStats().then(r => {
            r.forEach(report => {
                if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
                console.log("selected pair", report.localCandidateId, report.remoteCandidateId);
                }
                if (report.type === "local-candidate") {
                // 看 candidateType: host/srflx/relay
                // relay 就是走 TURN
                console.log("local", report.candidateType, report.protocol, report.address, report.port);
                }
            });
        });

        pc.ondatachannel = (event) => {
            setupDataChannel(targetUserID, event.channel);
        }

        pc.ontrack = (event) => {}
        return pc;
    }

    /**
     * 构建socket连接
     * @returns 
     */
    const initSocketEvents = ( roomID: string ) => {
        if (!socketRef.current) return;

        const socket = socketRef.current;

        socket.on("connect", () => {
            const myId = socket.id as string;
            console.log("connected:", myId);
            if (username) upsertUser(myId, username);
            socket.emit("join-room", { roomID, username });
        });
        
        //监控其他用户加入
        socketRef.current.on('user-connected',({ socketId, username })=> {
            console.log("新用户加入, 用户ID:", socketId, " 用户名：", username);
            upsertUser(socketId, username);
            startWebRTC(socketId);
        });

        //接收其他用户的signal
        socketRef.current.on('signal', async (data: SignalData) => {

            if (data.senderName) upsertUser(data.sender, data.senderName);  //确保后加入的也能存入先加入的信息

            const pc = initPeerConnection(data.sender);
            if (!pc) return;

            const socket = socketRef.current;
            if (!socket || !socket.id) {
                console.warn("Socket 未连接或 ID 丢失，无法处理信令");
                return;
            }

            //
            const isPolite = socket.id < data.sender;   //是否为polite方
            const isMakingOffer = makingOfferMap.current.get(data.sender) || false;


            try {
                //收到offer
                if (data.signal.offer) {

                    //是否有offer冲突
                    const offerCollision = (pc.signalingState !== 'stable' || isMakingOffer);

                    if (offerCollision && !isPolite) return;


                    if (offerCollision) {

                        await pc.setLocalDescription({ type: "rollback" });

                    }

                    await pc.setRemoteDescription(data.signal.offer);

                    //发送answer
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    
                    socketRef.current?.emit('signal', {
                        target: data.sender,
                        targetName: username,
                        signal: { answer },
                    });
                    processQueuedCandidates(data.sender);
                }

                //收到answer
                if (data.signal.answer) {
                    await pc.setRemoteDescription(data.signal.answer);
                    processQueuedCandidates(data.sender);
                }

                //收到candidate
                if (data.signal.candidate) {
                    if (!pc.remoteDescription || !pc.remoteDescription.type) {
                        const queue = queuesRef.current.get(data.sender);
                        if (!queue) return;
                        queue.push(data.signal.candidate);
                    } else {
                        await pc.addIceCandidate(data.signal.candidate);
                    }
                }
            } catch (e) {
                console.error("WebRTC Signaling Error:", e);
            }
        });

        

        socketRef.current.on("user-disconnect",({ userId }) => {
            console.log("用户ID: ",userId,"已断开连接");
            deleteUser(userId);
        });
    }


    /**
     * 构建webRTC连接
     * @param userID 
     */
    const startWebRTC = async ( userID: string ) => {
        const pc = initPeerConnection(userID);
        if (!pc) return;

        //创建datachannel
        if(!textDataChannelsRef.current.has(userID)) {
            const chatDC = pc.createDataChannel("chat", { ordered: true});
            setupDataChannel(userID, chatDC);
        }
        if(!fileDataChannelsRef.current.has(userID)) {
            const fileDC = pc.createDataChannel("file", { ordered: true});
            setupDataChannel(userID, fileDC);
        }

        try {
            makingOfferMap.current.set(userID, true);
            //给新加入用户发送offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socketRef.current?.emit('signal',{
                target: userID,
                signal: { offer }
            }); 
        } catch (e) {
            console.error(e);
        } finally {
            makingOfferMap.current.set(userID, false);
        }
        

    }

    const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());
    const iceRestartingRef = useRef<Map<string, boolean>>(new Map());
    const scheduleIceRestart = (userID: string) => {
        const attempts = iceRestartAttemptsRef.current.get(userID) ?? 0;
        if (attempts >= 5) {
            console.warn(`[ICE] ${userID} reached max restart attempts`);
            return;
        }
        if (iceRestartingRef.current.get(userID)) return;

        const delay = Math.min(1000 * Math.pow(2, attempts), 15000); // 1s/2s/4s... capped
        iceRestartAttemptsRef.current.set(userID, attempts + 1);
        iceRestartingRef.current.set(userID, true);

        setTimeout(async () => {
            try {
            await handleIceRestart(userID);
            } finally {
            iceRestartingRef.current.set(userID, false);
            }
        }, delay);
    };

    const handleIceRestart = async (userID: string) => {
        const pc = peersRef.current.get(userID);
        if (!pc) return;
        try {
            console.log("正在尝试 ICE Restart...");
            // 关键：在 createOffer 时传入 iceRestart: true
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
                
            // 发送新的 Offer 给对方
            socketRef.current?.emit('signal', {
                target: userID,
                signal: { offer }
            });
        } catch (e) {
            console.error("ICE Restart 失败:", e);
        }
    }
    /**
     * 处理webRTC的candidate候选队列
     * @returns 
     */
    const processQueuedCandidates = async (targetUserID: string) => {
        const pc = peersRef.current.get(targetUserID);
        if (!pc) return;

        const queue = queuesRef.current.get(targetUserID);
        if (!queue) return;

        while (queue.length > 0) {
            const cand = queue.shift();
            try {
                if (cand) await pc.addIceCandidate(cand);
            } catch (e) {
                console.log('add candidate failed: ',e)
            }
        }
    }

    const setupDataChannel = (userID: string, dc: RTCDataChannel) => {
        dc.binaryType = "arraybuffer";

        if (dc.label === "chat") {
            textDataChannelsRef.current.set(userID, dc);
        }

        if (dc.label === "file") {
            fileDataChannelsRef.current.set(userID, dc);
        }

        dc.onopen = () => {
            console.log("DataChannel open:", userID);

            const name = userListRef.current.get(userID);

            
        }
        dc.onclose = () => {
            console.log("DataChannel close:", userID);
            if (textDataChannelsRef.current.has(userID)) {
                textDataChannelsRef.current.delete(userID);
            }
            if (fileDataChannelsRef.current.has(userID)) {
                fileDataChannelsRef.current.delete(userID);
            }
        }
        dc.onerror = (e) => {
            console.error("DataChannel error:", userID, e);
        }
        dc.onmessage = (event) => {
            const data = event.data;
            //文本消息
            if (dc.label === "chat") {
                if (typeof data !== "string") return;
                const msg = JSON.parse(data);
                const name = userListRef.current.get(userID) ?? userID;
                console.log("来自谁: (id: ", userID," name: ",userListRef.current.get(userID), ") 内容：", msg.msg, "时间：", msg.ts);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: safeUUID(),
                        kind: "text",
                        fromID: userID,
                        fromName: name,
                        text: msg.msg,
                        ts: msg.ts
                    },
                ]);

            }           

            //文件消息
            if (dc.label === "file") {
                //TODO: 
                

            }

        }
    }

    const sendChat = (msg: string) => {

        if (!socketRef.current?.id) return;
        if (!username) return;

        const userID = socketRef.current?.id;

        const payload = { type: "chat", msg, ts: Date.now() };

        setMessages((prev) => [
            ...prev,
            {
                id: safeUUID(),
                kind : "text",
                fromID: userID,
                fromName: username,
                text: msg,
                ts: payload.ts,
            }
        ]);

        for (const [userID, dc] of textDataChannelsRef.current.entries()) {
            if (dc.readyState === "open") {
                dc.send(JSON.stringify(payload));
            }
        }
    }

    const sendFile = () => {
        //TODO: 
    }

    const onSend = () => {
        const text = draft;
        if (!text) return;
        sendChat(text);
        setDraft("")
    }

    //生成随机颜色
    const colorFromId = (id: string) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue} 70% 55%)`;
    };

    //基于用户名生成首字符
    const getFirstWord = (username: string) => {
        const s = username.trim();
        return s[0].toUpperCase();
    }

    //时间格式转换
    const formatDateTime = (time : number) => {
        const d = new Date(time);

        const yyyy = d.getFullYear();
        const MM = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");

        const HH = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");

        return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    }

    const safeUUID = () => {
        // 现代浏览器
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }

        // 次优：用 crypto.getRandomValues 生成 16 bytes
        if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            // 简单转 hex
            return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        // 最后兜底：时间戳+随机数（不够强但够用做 key）
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };


    // 渲染成员列表
    const renderMembers = () => {

        const myID = socketRef.current?.id;
        const members = Array.from(userList.entries());
        
        return (
                    <div className={styles.membersList}>
                        {members.map(([memberID, memberName]) => {
                            
                            const isMe = !!myID && memberID === myID;
                            const avatarColor = colorFromId(memberID);
                            
                            return (

                                <div key={memberID} className={styles.memberItem}>
                                    <div 
                                        className={styles.memberAvatar}
                                        style={{ backgroundColor: avatarColor}}
                                        title={memberName}
                                    >
                                        {getFirstWord(memberName)}
                                    </div>
                                    <span className={isMe ? styles.memberMe : ''}>
                                        {memberName}
                                        {isMe ? "(me)" : ""}
                                    </span>
                                </div>
                        )})}
                    </div>
        );
    }

    const renderMessages = () => {
        
        const myID = socketRef.current?.id;

        return (
        <div className={styles.messagesContainer}>
            {messages.map((msg) => {

                const isMe = !!myID && msg.fromID === myID;

                return (
                    <div 
                        key={msg.id} 
                        className={`${styles.message} ${isMe ? styles.messageFromMe : styles.messageFromOthers}`}
                    >
                        {/* 头像渲染 */}
                        <div 
                            className={styles.memberAvatar}
                            style={{  backgroundColor: colorFromId(msg.fromID)  }}
                            title={msg.fromName}
                        >
                            {getFirstWord(msg.fromName)}
                        </div>
                        
                        {/* 渲染消息内容 */}
                        <div 
                            className={`${styles.messageContent} ${isMe ? styles.contentMe : styles.contentOthers}`}
                            title={formatDateTime(msg.ts)}
                        >

                            {msg.kind === "text" ? (msg.text) : (
                                <a href={msg.url} download={msg.fileName}>
                                    {msg.fileName} ({Math.ceil(msg.size / 1024)} KB)
                                </a>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );}


    interface ShareInfo {
        isOpen: boolean;
        onClose: () => void;
    }
    const [isShareOpen, setIsShareOpen] = useState(false);
    const handleShareInfoClose = () => {
        setIsShareOpen(false);
    }
    const handleClickShareBtn = () => {
        setIsShareOpen(true);
    }
    const ShareInfo: React.FC<ShareInfo> = ({
        isOpen,
        onClose,
    }) => {

        if (!isOpen) {
            return null;
        }

        const url = window.location.href;
        const room = window.location.pathname.split("/")[2];


        return (
            <div className={shareStyles.backdrop} onClick={onClose}>
                <div className={shareStyles.modal} onClick={(e) => e.stopPropagation()}>
                    <div className={shareStyles.container}>
                        <div className={shareStyles.roomText}>
                            RoomID: {room}
                        </div>
                        <QRCodeCanvas value={url} size={180} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <PromptModal 
                isOpen={isModalOpen}
                placeHolder='please input your username'
                onSubmit={handleSubmit}
                onClose={handleClose}
                closeOnBackdrop={false}
            />

            {confirmed && 
                <div className={styles.container}>
                    <div className={styles.chatWindow}>
                        {/* 侧边栏：成员列表和操作按钮 */}
                        <div className={styles.sidebar}>
                            <div className={styles.sidebarHeader}>
                                members
                            </div>
                        
                            {renderMembers()}

                            <div className={styles.sidebarFooter}>
                                <button className={styles.actionButton} onClick={handleClickShareBtn}>Share</button>
                                <button className={styles.actionButton}>Exit</button>
                            </div>
                        </div>

                        {/* 聊天区域和输入框 */}
                        <div className={styles.chatArea}>
                        
                            {renderMessages()}

                            {/* 消息输入区域 */}
                            <div className={styles.inputArea}>
                                <input 
                                    type="text" 
                                    className={styles.textInput} 
                                    placeholder="Type a message..."
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSend();
                                    }}
                                />
                                <button className={styles.sendButton} onClick={onSend}>
                                    SEND
                                </button>
                                <button className={styles.addButton}>
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    <ShareInfo 
                        isOpen={isShareOpen}
                        onClose={handleShareInfoClose}
                    />
                </div>

                
            }
            
        </>

        
    );
};

export default ChatRoom;