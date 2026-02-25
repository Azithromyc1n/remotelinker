import styles from '@/styles/ChatRoom.module.css';
import type {  Messages  } from '@/types/chat/types';
import { colorFromId, getFirstWord, formatDateTime } from '@/utils/chat/utils';

const MessagesList: React.FC<Messages> = ({
    messagesList,
    myId,
    onFileClick
}) => {
        
        const myID = myId;
        const messages = messagesList;
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
                                <div>
                                    <div 
                                        className={styles.fileName}
                                        role={onFileClick ? "button" : undefined}
                                        tabIndex={onFileClick ? 0 : -1}
                                        onClick={() => onFileClick?.(msg)}
                                        style={{ cursor: onFileClick ? "pointer" : "default" }}
                                    >
                                        {msg.fileName} ({Math.ceil(msg.size / 1024)} KB)
                                    </div>

                                    {/* status  */}
                                    {msg.status === "offer" && (
                                        <div className={styles.fileHint}>
                                            {isMe ? "Waiting for receiver..." : "Click to receive"}
                                        </div>
                                    )}
                                    {msg.status === "transferring" && (
                                        <div className={styles.fileHint}>
                                            Transferring...
                                        </div>
                                    )}
                                    {msg.status === "ready" && msg.url && (
                                        <a 
                                            className={styles.fileDownload}
                                            href={msg.url}
                                            download={msg.fileName}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            Download
                                        </a>
                                    )}
                                    {msg.status === "ready" && !msg.url && (
                                        <div className={styles.fileHint}>
                                            Ready
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );}

export default MessagesList;