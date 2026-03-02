import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '@/styles/Home.module.css';
import PromptModal from '@/components/PromptModal/PromptModal.tsx';
import { useTranslation } from 'react-i18next';


const Home: React.FC = () => {

    const [isModalOpen, setIsModalOpen] = useState(false)

    const navigate = useNavigate();

    const { t, i18n } = useTranslation();
    const toggleLanguage = () => {
        const nextLang = i18n.language?.startsWith('zh') ? 'en' : 'zh';
        i18n.changeLanguage(nextLang);
    };

    const handleCreateRoom = () => {
        const newRoomId = Math.random().toString(36).substring(2, 8);
        const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';
        navigate(`/chat/${newRoomId}?language=${currentLang}`)
    };
    const handleJoinRoom = () => {
        setIsModalOpen(true);
    };
    const handleSubmit = (roomId:string) => {
        const targetRoomId = roomId;
        const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';
        navigate(`/chat/${targetRoomId}?language=${currentLang}`);
    };
    const handleClose = () => {
        setIsModalOpen(false);
    }

    return (
        <div className={styles.container}>

            <header className={styles.header}>
                <div className={styles.title}>
                    REMOTELINKER
                </div>
                <div className={styles.githublogo}>
                    <a href="https://github.com/Azithromyc1n/remotelinker.git" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', color: 'inherit' }}>
                        <svg viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="24" height="24">
                            <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.932.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.222-22.242-5.378-22.242-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.485-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364C84.01 89.389 98 70.973 98 49.217 98 22 76.16 0 49.146 0h-.292z"></path>
                        </svg>
                    </a>
                    <span 
                        className={styles.languageSelect} 
                        onClick={toggleLanguage}
                    >
                        {i18n.language?.startsWith('zh') ? 'ENGLISH' : '中文'}
                    </span>
                </div>
            </header>


            <main className={styles.mainContent}>
                <h1 className={styles.mainTitle}>
                    {t('main_title_1', 'Quickly and Securely')} <br />
                    {t('main_title_2', 'Transfer file')}
                </h1>

                <div className={styles.actionButtons}>
                    <button 
                        className={styles.btn} 
                        onClick={handleCreateRoom}
                    >
                        {t('create_room', 'Create Room')}
                    </button>

                

                    <button 
                        className={styles.btn} 
                        onClick={handleJoinRoom}
                    >
                        {t('join_room', 'Join Room')}
                    </button>
                </div>
            </main>

            <section className={styles.featuresSection}>
                <h2 className={styles.featuresTitle}>{t('features_title', 'Features')}</h2>
                
                <div className={styles.featuresGrid}>

                    <div className={styles.featureItem}>
                        <p>
                            {t('feature_1_1', 'Files are transferred directly')} <br />
                            {t('feature_1_2', 'between devices using')} <br />
                            <strong>WebRTC</strong>{t('feature_1_3', ',with no server relay.')}
                        </p>
                    </div>

                    <div className={styles.featureItem}>
                        <p>
                            {t('feature_2_1', 'Connect easily between')} <br />
                            {t('feature_2_2', 'phones, tablets, and computers')} <br />
                            {t('feature_2_3', '—just scan the')}
                        </p>
                    </div>

                    <div className={styles.featureItem}>
                        <p>
                            {t('feature_3_1', 'No installation, no registration')} <br />
                            {t('feature_3_2', '—open the webpage and start')} <br />
                            {t('feature_3_3', 'sharing immediately.')}
                        </p>
                    </div>
                </div>
            </section>

            <PromptModal 
                isOpen={isModalOpen}
                placeHolder={t('placeholder_room_id', 'please input your username')}
                submitText={t('confirm_btn','Confirm')}
                onSubmit={handleSubmit}
                onClose={handleClose}
            />

        </div>
    );
};

export default Home;