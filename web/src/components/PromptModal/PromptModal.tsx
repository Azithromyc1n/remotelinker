import React, { useState, useEffect } from 'react';
import styles from '@/styles/PromptModal.module.css';
/**
 * 毛玻璃背景的单输入框弹窗组件
 * isOpen控制弹出或关闭
 * onSubmit接收输入框的数据
 * closeOnBackdrop控制能否点击窗口外部来关闭窗口
 */

interface PromptModalProps {
    isOpen: boolean;
    placeHolder: string;
    submitText?: string; /* 提交按钮文本 */
    onSubmit: (data:any) => void;
    onClose: () => void;
    closeOnBackdrop?: boolean
}

const PromptModal: React.FC<PromptModalProps> = ({
    isOpen,
    placeHolder,
    submitText = 'Confirm',
    onSubmit,
    onClose,
    closeOnBackdrop = true,
}) => {
    const [inputMsg, setInputMsg] = useState('')

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>)=>{
        setInputMsg(e.target.value);
    }

    useEffect(() => {
        if (isOpen) {
            setInputMsg('');
        }
    }, [isOpen]);

    const handleSubmit = () => {

        //非空校验
        if (!inputMsg.trim()) {
            return;
        }
        onSubmit(inputMsg);
        onClose();
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div className={styles.backdrop} onClick={closeOnBackdrop ? onClose : undefined}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <input 
                    type="text"
                    className={styles.inputField}
                    value={inputMsg}
                    onChange={handleInputChange}
                    placeholder={placeHolder}
                    autoFocus     
                />
                
                <div className={styles.actions}>
                    <button
                        className={styles.button}
                        onClick={handleSubmit}
                    >
                        {submitText}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default PromptModal;