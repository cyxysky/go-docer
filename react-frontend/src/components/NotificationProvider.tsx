import React, { createContext, useContext, useState, useCallback } from 'react';
import Notification from './Notification';

export interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notification: Omit<NotificationItem, 'id'>) => void;
  showSuccess: (title: string, message: string, duration?: number) => void;
  showError: (title: string, message: string, duration?: number) => void;
  showWarning: (title: string, message: string, duration?: number) => void;
  showInfo: (title: string, message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const showNotification = useCallback((notification: Omit<NotificationItem, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification = { ...notification, id };
    
    setNotifications(prev => [...prev, newNotification]);
  }, []);

  const showSuccess = useCallback((title: string, message: string, duration = 5000) => {
    showNotification({ type: 'success', title, message, duration });
  }, [showNotification]);

  const showError = useCallback((title: string, message: string, duration = 8000) => {
    showNotification({ type: 'error', title, message, duration });
  }, [showNotification]);

  const showWarning = useCallback((title: string, message: string, duration = 6000) => {
    showNotification({ type: 'warning', title, message, duration });
  }, [showNotification]);

  const showInfo = useCallback((title: string, message: string, duration = 5000) => {
    showNotification({ type: 'info', title, message, duration });
  }, [showNotification]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const contextValue: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="notification-container">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            {...notification}
            onClose={removeNotification}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}; 