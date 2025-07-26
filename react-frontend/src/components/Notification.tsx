import React, { useState, useEffect } from 'react';
import './Notification.css';

export interface NotificationProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number; // 自动消失时间（毫秒），0表示不自动消失
  onClose: (id: string) => void;
}

const Notification: React.FC<NotificationProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 显示动画
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    // 自动消失
    if (duration > 0) {
      const hideTimer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }

    return () => {
      clearTimeout(showTimer);
    };
  }, [duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose(id);
    }, 300); // 等待动画完成
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'fas fa-check-circle';
      case 'error':
        return 'fas fa-exclamation-circle';
      case 'warning':
        return 'fas fa-exclamation-triangle';
      case 'info':
        return 'fas fa-info-circle';
      default:
        return 'fas fa-info-circle';
    }
  };

  return (
    <div className={`notification notification-${type} ${isVisible ? 'notification-show' : ''}`}>
      <div className="notification-icon">
        <i className={getIcon()}></i>
      </div>
      <div className="notification-content">
        <div className="notification-title">{title}</div>
        <div className="notification-message">{message}</div>
      </div>
      <button className="notification-close" onClick={handleClose}>
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default Notification; 