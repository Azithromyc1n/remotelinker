import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from "react-router-dom";
import { useParams } from 'react-router-dom';
import styles from '@/styles/ChatRoom.module.css';  //styles
import { safeUUID, waitBufferedLow } from "@/utils/chat/utils";   //utils
import type {  SignalData, ChatMessage, FileOffer, FileAccept, FileEnd, FileReject, IncomingStream  } from '@/types/chat/types';    //types

import {  membersList  } from '@/components/chat/MembersList';
import MessagesList from '@/components/chat/MessagesList';
import {  ShareInfo  } from "@/components/chat/ShareModal";
import PromptModal from '@/components/PromptModal/PromptModal';
import Dropdown from '@/components/Menu/DropdownMenu';


import { io, type Socket } from 'socket.io-client';
declare global {
  interface Window {
    showSaveFilePicker?: (options?: any) => Promise<FileSystemFileHandle>;
  }
}

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

    const [pendingFile, setPendingFile] = useState<File | null>(null);          //渲染文件meta
    //useRef
    const socketRef = useRef<Socket | null>(null);                              //socket连接
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());         //webRTC连接
    const textDataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());     //文本通道
    const fileDataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());     //文件通道
    const queuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());   //candidate候选队列
    const makingOfferMap = useRef<Map<string, boolean>>(new Map());

    const userListRef = useRef(new Map<string, string>());      //防止闭包捕获旧值
    const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());   //ice重启尝试
    const iceRestartingRef = useRef<Map<string, boolean>>(new Map()); 

    const fileInputRef = useRef<HTMLInputElement | null>(null);         //文件meta渲染

    const outgoingFilesRef = useRef<Map<string, File>>(new Map());      //发送文件offer时记录
    const incomingStreamRef = useRef<Map<string, IncomingStream | null>>(new Map());    //接收文件流

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

        // pc.ontrack = (event) => {}
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

    
    const scheduleIceRestart = (userID: string) => {
        const attempts = iceRestartAttemptsRef.current.get(userID) ?? 0;
        if (attempts >= 5) {
            console.warn(`[ICE] ${userID} reached max restart attempts`);
            return;
        }
        if (iceRestartingRef.current.get(userID)) return;

        const delay = Math.min(1000 * Math.pow(2, attempts), 15000);
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
            // 在 createOffer 时传入 iceRestart: true
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

            //ui提示用户已进入房间并且datachannel状态正常
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

                if (data instanceof ArrayBuffer) {
                    const activeStreamId = Array.from(incomingStreamRef.current.keys())[0];
                    const streamInfo = activeStreamId ? incomingStreamRef.current.get(activeStreamId) : null;
                    if(streamInfo) {
                        if (streamInfo.mods === 'fs' && streamInfo.writable) {
                            streamInfo.writable.write(data).catch((e:any) => console.error("写入分片失败", e));
                        }
                        if (streamInfo.mods === 'blob' && streamInfo.chunks) {
                            streamInfo.chunks.push(data);
                        }
                        streamInfo.received += data.byteLength;
                    }
                    return;
                }

                if (typeof data === "string") {
                    const msg = JSON.parse(data);
                    if (msg.type === "file-offer") {
                        const name = userListRef.current.get(userID) ?? msg.fromName ?? userID;
                        setMessages(prev => [...prev, {
                            id: msg.id, kind: "file", fromID: userID, fromName: name,
                            fileName: msg.name, size: msg.size, mime: msg.mime, ts: msg.ts, status: "offer"
                        }]);
                    }
                    if (msg.type === "file-accept") {
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "transferring" } : m));
                        startSendFileChunks(userID, msg.id);
                    }
                    if (msg.type === "file-end") {
                        const streamInfo = incomingStreamRef.current.get(msg.id);
                        if (streamInfo) {
                            let downloadUrl = undefined;

                            if (streamInfo.mods === 'fs' && streamInfo.writable) {
                                streamInfo.writable.close();
                            }
                            if (streamInfo.mods === 'blob' && streamInfo.chunks) {
                                const blob = new Blob(streamInfo.chunks, { type: streamInfo.mime });
                                downloadUrl = URL.createObjectURL(blob);
                            }
                            incomingStreamRef.current.delete(msg.id);

                            setMessages(prev => prev.map(m => 
                                m.id === msg.id && m.kind === "file" 
                                    ? { ...m, status: "ready", url: downloadUrl } 
                                    : m
                            ));
                        }
                        console.log("Send over by ", userList.get(msg.fromID));
                    }
                    if (msg.type === "file-reject") {
                        console.log("Sending file canceled by ", userListRef.current.get(msg.fromID));
                    }
                }
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

        for (const [, dc] of textDataChannelsRef.current.entries()) {
            if (dc.readyState === "open") {
                dc.send(JSON.stringify(payload));
            }
        }
    }

    const sendFileMeta = (file: File) => {
        const myId = socketRef.current?.id;
        if (!myId || !username) return;

        const id = crypto.randomUUID(); // 文件消息id
        const ts = Date.now();
        outgoingFilesRef.current.set(id, file);

        setMessages((prev) => [
            ...prev,
            {
                id,
                kind: "file",
                fromID: myId,
                fromName: username,
                fileName: file.name,
                size: file.size,
                mime: file.type || "application/octet-stream",
                ts,
                status: "offer",
            },
        ]);

        const payload = {
            type: "file-offer",
            id,
            name: file.name,
            size: file.size,
            mime: file.type || "application/octet-stream",
            ts,
            fromName: username,
        } as FileOffer;

        for (const [, dc] of fileDataChannelsRef.current.entries()) {
            if (dc.readyState === "open") {
                dc.send(JSON.stringify(payload));
            }
        }

    }

    const formatFileDraft = (f: File) =>`[FILE] ${f.name} (${Math.ceil(f.size / 1024)} KB)`;
    const onPickFile = () => { fileInputRef.current?.click(); };

    //分片发送文件并设置低水位高水位
    const startSendFileChunks = async (peerID: string, fileID: string) => {
        const file = outgoingFilesRef.current.get(fileID);
        const dc = fileDataChannelsRef.current.get(peerID);
        if (!file || !dc || dc.readyState !== "open") return;

        dc.bufferedAmountLowThreshold = 4 * 1024 * 1024;    //4MB

        const CHUNK_SIZE = 1 * 1024 * 1024; //1MB
        const HIGH_WATER = 8 * 1024 * 1024; //8MB

        let offset = 0;
        while (offset < file.size){
            const blob = file.slice(offset, offset + CHUNK_SIZE);
            const buf = await blob.arrayBuffer();
            dc.send(buf);
            offset += buf.byteLength;

            if (dc.bufferedAmount > HIGH_WATER) {
                await waitBufferedLow(dc);
            }
        }

        const endMsg: FileEnd = { type: "file-end", id: fileID };
        dc.send(JSON.stringify(endMsg));
    }

    const acceptFileStream = async (fileMsg: Extract<ChatMessage, { kind: "file" }>) => {
        const myId = socketRef.current?.id;
        if (!myId) return;

        const isIncoming = fileMsg.fromID !== myId;
        if (!isIncoming || fileMsg.status !== "offer") return;

        const dc = fileDataChannelsRef.current.get(fileMsg.fromID);
        if (!dc || dc.readyState !== "open") return;

        const HALF_ONE_GB = 536870912;  //500MB文件限制

        //文件参数
        const opt = {
            suggestedName: fileMsg.fileName
        }

        const supportsFS = 'showSaveFilePicker' in window;

        if (supportsFS) {
            try {
                if (window.showSaveFilePicker) {
                    const handle = await window.showSaveFilePicker(opt);
                    const writable = await handle.createWritable();

                    incomingStreamRef.current.set(fileMsg.id, {
                        id: fileMsg.id,
                        name: fileMsg.fileName,
                        size: fileMsg.size,
                        mime: fileMsg.mime,
                        received: 0,
                        ts: Date.now(),
                        mods: 'fs',
                        writable: writable,
                    })

                    setMessages(prev => prev.map(msg => msg.id === fileMsg.id ? { ...msg, status: "transferring" } : msg));
                    dc.send(JSON.stringify({ type: "file-accept", id: fileMsg.id, fromID: fileMsg.fromID } as FileAccept));
                }
            } catch (err: any) {
                console.warn("取消了接收或接收出现问题: ",err);
                if (err.name === "AbortError") {
                    dc.send(JSON.stringify({ type: "file-reject", id: fileMsg.id, fromID: fileMsg.fromID, reason: "User canceled" } as FileReject));
                }
            }
        } else {
            //如果不适配showSaveFIlePicker，则转为内存Blob接收并限制500MB
            if (fileMsg.size > HALF_ONE_GB ){
                alert("当前浏览器不支持超大文件保存, 仅接收500MB以内文件,请尝试更换浏览器");
                dc.send(JSON.stringify({ type: "file-reject", id: fileMsg.id, fromID: fileMsg.fromID, reason: "Browser limit exceeded (>1GB)" } as FileReject));
                return;
            }
            incomingStreamRef.current.set(fileMsg.id, {
                id: fileMsg.id,
                name: fileMsg.fileName,
                size: fileMsg.size,
                mime: fileMsg.mime,
                received: 0,
                ts: Date.now(),
                mods: 'blob',
                chunks: [],
            })

            setMessages(prev => prev.map(msg => msg.id === fileMsg.id ? { ...msg, status: "transferring" } : msg));
            dc.send(JSON.stringify({ type: "file-accept", id: fileMsg.id, fromID: fileMsg.fromID } as FileAccept));
        }
    }

    const onSend = () => {

        if (pendingFile) {
            sendFileMeta(pendingFile);
            setPendingFile(null);
            setDraft("");
            return;
        }

        const text = draft;
        if (!text) return;
        sendChat(text);
        setDraft("")
    }

    const navigate = useNavigate();
    const onExit = () => {
        cleanupAndReset();
        navigate("/", { replace: true });
    }

    const fakeOnClick = () => {
        //TODO: 
        console.log("click menu")
    }

    const cleanupAndReset = () => {
        socketRef.current?.disconnect();
        socketRef.current = null;

        for (const pc of peersRef.current.values()) {
            try { pc.close(); } catch {}
        }
        peersRef.current.clear();

        for (const dc of textDataChannelsRef.current.values()) {
            try { dc.close(); } catch {}
        }
        textDataChannelsRef.current.clear();

        for (const dc of fileDataChannelsRef.current.values()) {
            try { dc.close(); } catch {}
        }
        fileDataChannelsRef.current.clear();

        queuesRef.current.clear();
        makingOfferMap.current.clear();

        setUserList(new Map());
        setMessages([]);
        setDraft("");
        setUsername(null);
        setConfirmed(false);
        setIsModalOpen(true);
        console.log("user exit"); 
    };

    

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
                                <button className={styles.actionButton} onClick={onExit}>Exit</button>
                            </div>
                        </div>

                        {/* 聊天区域和输入框 */}
                        <div className={styles.chatArea}>

                            <MessagesList
                                messagesList={messages}
                                myId={socketRef.current?.id}
                                onFileClick={(fileMsg) => {
                                    if (fileMsg.status === 'offer') {
                                        acceptFileStream(fileMsg);
                                    }
                                }}
                            />

                            {/* 消息输入区域 */}
                            <div className={styles.inputArea}>
                                <input 
                                    type="text" 
                                    className={styles.textInput} 
                                    placeholder="Type a message..."
                                    value={draft}
                                    onChange={(e) => {
                                        if (pendingFile) return;
                                        setDraft(e.target.value)
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSend();
                                    }}
                                    readOnly={!!pendingFile}
                                />

                                {pendingFile && (
                                    <button type="button"
                                        className={styles.cancelFileButton}
                                        onClick={() => {
                                            setPendingFile(null);
                                            setDraft("");
                                        }}
                                        title="Cancel file">x</button>
                                )}

                                <button className={styles.sendButton} onClick={onSend}>
                                    SEND
                                </button>
                                <Dropdown 
                                    trigger={<button className={styles.addButton}>+</button>}
                                >
                                    <div className={styles.noSelect} data-close="true" onClick={onPickFile}>File</div>
                                    <div className={styles.noSelect} data-close="true" onClick={fakeOnClick}>Voice</div>
                                    <div className={styles.noSelect} data-close="true" onClick={fakeOnClick}>Video</div>
                                </Dropdown>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: "none" }}
                                    multiple={false}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0] ?? null;
                                        if (!f) return;
                                        setPendingFile(f);
                                        setDraft(formatFileDraft(f));
                                        e.currentTarget.value = "";
                                    }}
                                />
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