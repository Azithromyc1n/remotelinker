import { colorFromId, getFirstWord } from '@/utils/chat/utils';
import styles from '@/styles/ChatRoom.module.css';
import type { RoomUser } from '@/types/chat/types';

const getStatusConfig = (status: RoomUser['status']) => {
    switch (status) {
        case 'connected': return { color: '#4caf50', title: 'P2P Connected' };
        case 'connecting': return { color: '#ff9800', title: 'Connecting...' };
        case 'disconnected': return { color: '#f44336', title: 'Disconnected' };
        default: return { color: '#9e9e9e', title: 'Unknown' };
    }
};
export const membersList = ( userList: Map<string, RoomUser>, myid: string | undefined ) => {

        const myID = myid;
        const members = Array.from(userList.entries());
        
        return (
                    <div className={styles.membersList}>
                        {members.map(([memberID, member]) => {
                            
                            const isMe = !!myID && memberID === myID;
                            const avatarColor = colorFromId(memberID);
                            const statusConfig = getStatusConfig(member.status);
                            
                            return (

                                <div key={memberID} className={styles.memberItem}>
                                    <div className={styles.avatarWrapper}>
                                        <div 
                                            className={styles.memberAvatar}
                                            style={{ backgroundColor: avatarColor}}
                                            title={member.name}
                                        >
                                            {getFirstWord(member.name)}
                                        </div>

                                        <div 
                                            className={styles.statusDot}
                                            style={{ backgroundColor: statusConfig.color }}
                                            title={statusConfig.title}
                                        />
                                    </div>
                                    <div className={styles.memberInfo}>
                                        <span className={isMe ? styles.memberMe : ''}>
                                            {member.name}
                                            {isMe ? "(me)" : ""}
                                        </span>
                                    </div>
                                </div>
                        )})}
                    </div>
        );
    }