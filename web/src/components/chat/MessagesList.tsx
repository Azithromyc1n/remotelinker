import styles from '@/styles/ChatRoom.module.css';
import type {  ChatMessage  } from '@/types/chat/types';
import { colorFromId, getFirstWord, formatDateTime } from '@/utils/chat/utils';

export const messagesList = ( messagesList: ChatMessage[], myId : string | undefined ) => {
        
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