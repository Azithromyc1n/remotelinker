import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import styles from '@/styles/ChatRoom.module.css';  //styles
import { safeUUID } from "@/utils/chat/utils";   //utils
import type {  SignalData, ChatMessage, FileCtrl, IncomingFile  } from '@/types/chat/types';    //types

import {  membersList  } from '@/components/chat/MembersList';
import {  messagesList  } from '@/components/chat/MessagesList';
import {  ShareInfo  } from "@/components/chat/ShareModal";

import PromptModal from '@/components/PromptModal/PromptModal';
import { io, type Socket } from 'socket.io-client';

/**
 * 聊天室组件
 */
const ChatRoom: React.FC = () => {

    // === 常量配置 ===
    // const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL as string;
    const ICE_SERVERS: RTCConfiguration = {
        iceServers: JSON.parse(import.meta.env.VITE_ICE_SERVERS || "[]"),
    };  
    const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL as string;

    const { roomID } = useParams<{ roomID: string }>();

    //useState    
    const [isShareOpen, setIsShareOpen] = useState(false);
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

    
    const handleShareInfoClose = () => {
        setIsShareOpen(false);
    }
    const handleClickShareBtn = () => {
        setIsShareOpen(true);
    }
    
    useEffect(() => {
        if (!username || !confirmed || !roomID) return;
        //从url中获取房间号
        console.log('roomID: ',roomID,' username: ',username);

        socketRef.current = io(SIGNALING_SERVER,{
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

    

    const myID = socketRef.current?.id;

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
                        
                            {membersList(userList, myID)}

                            <div className={styles.sidebarFooter}>
                                <button className={styles.actionButton} onClick={handleClickShareBtn}>Share</button>
                                <button className={styles.actionButton}>Exit</button>
                            </div>
                        </div>

                        {/* 聊天区域和输入框 */}
                        <div className={styles.chatArea}>
                        
                            {messagesList(messages, myID)}

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