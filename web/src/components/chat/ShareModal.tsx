import { QRCodeCanvas } from "qrcode.react";
import styles from '@/styles/Share.module.css';

interface ShareInfo {
    isOpen: boolean;
    onClose: () => void;
}

export const ShareInfo: React.FC<ShareInfo> = ({
        isOpen,
        onClose,
    }) => {

        if (!isOpen) {
            return null;
        }

        const url = window.location.href;
        const room = window.location.pathname.split("/")[2];
        
        return (
            <div className={styles.backdrop} onClick={onClose}>
                <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.container}>
                        <div className={styles.roomText}>
                            RoomID: {room}
                        </div>
                        <QRCodeCanvas value={url} size={180} />
                    </div>
                </div>
            </div>
        );
    }