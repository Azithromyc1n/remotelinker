import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '@/styles/Home.module.css';
import PromptModal from '@/components/PromptModal/PromptModal.tsx';

const Home: React.FC = () => {

    const [isModalOpen, setIsModalOpen] = useState(false)

    const navigate = useNavigate();

    //创建房间事件 
    const handleCreateRoom = () => {
        const newRoomId = Math.random().toString(36).substring(2, 8);

        navigate(`/chat/${newRoomId}`)
    };

    //加入房间事件
    const handleJoinRoom = () => {
        setIsModalOpen(true);
    };

    const handleSubmit = (roomId:string) => {
        
        const targetRoomId = roomId;
        
        navigate(`/chat/${targetRoomId}`);
    };

    const handleClose = () => {
        setIsModalOpen(false);
    }

    return (
        <div className={styles.container}>

            <header className={styles.header}>
                <span className={styles.languageSelect}>ENGLISH</span>
            </header>


            <main className={styles.mainContent}>
                <h1 className={styles.mainTitle}>
                    Quickly and Securely <br />
                    Transfer file
                </h1>

                <div className={styles.actionButtons}>
                    <button 
                        className={styles.btn} 
                        onClick={handleCreateRoom}
                    >
                        Create Room
                    </button>

                

                    <button 
                        className={styles.btn} 
                        onClick={handleJoinRoom}
                    >
                        Join Room
                    </button>
                </div>
            </main>

            <section className={styles.featuresSection}>
                <h2 className={styles.featuresTitle}>Features</h2>
                
                <div className={styles.featuresGrid}>

                    <div className={styles.featureItem}>
                        <p>
                            Files are transferred directly <br />
                            between devices using <br />
                            <strong>WebRTC</strong>, with no server relay.
                        </p>
                    </div>

                    <div className={styles.featureItem}>
                        <p>
                            Connect easily between <br />
                            phones, tablets, and computers <br />
                            —just scan the <strong>QR code</strong>.
                        </p>
                    </div>

                    <div className={styles.featureItem}>
                        <p>
                            No installation, no registration <br />
                            —open the webpage and start <br />
                            sharing immediately.
                        </p>
                    </div>
                </div>
            </section>

            <PromptModal 
                isOpen={isModalOpen}
                placeHolder='please input room id'
                onSubmit={handleSubmit}
                onClose={handleClose}
            />

        </div>
    );
};

export default Home;