import { colorFromId, getFirstWord } from '@/utils/chat/utils';
import styles from '@/styles/ChatRoom.module.css';

export const membersList = ( userList: Map<string, string>, myid: string | undefined ) => {

        const myID = myid;
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