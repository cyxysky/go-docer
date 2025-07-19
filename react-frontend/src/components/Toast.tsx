import React from 'react';
import type { Toast as ToastType } from '../types';
import './Toast.css';

interface ToastProps {
  toasts: ToastType[];
}

const Toast: React.FC<ToastProps> = ({ toasts }) => {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type} show`}>
          <i className={`fas ${
            toast.type === 'success' ? 'fa-check-circle' :
            toast.type === 'error' ? 'fa-exclamation-triangle' :
            toast.type === 'warning' ? 'fa-exclamation-circle' :
            'fa-info-circle'
          }`}></i>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export default Toast; 