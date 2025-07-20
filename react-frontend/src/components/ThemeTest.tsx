import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeTest: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div style={{ 
      padding: '20px', 
      background: 'var(--secondary-color)', 
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      margin: '20px'
    }}>
      <h3 style={{ color: 'var(--text-primary)' }}>主题测试</h3>
      <p style={{ color: 'var(--text-secondary)' }}>
        当前主题: {theme === 'dark' ? '暗色' : '亮色'}
      </p>
      <button 
        onClick={toggleTheme}
        style={{
          background: 'var(--primary-color)',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        切换主题
      </button>
      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <p>CSS变量测试:</p>
        <ul>
          <li>主色: <span style={{ color: 'var(--primary-color)' }}>Primary Color</span></li>
          <li>成功色: <span style={{ color: 'var(--success-color)' }}>Success Color</span></li>
          <li>警告色: <span style={{ color: 'var(--warning-color)' }}>Warning Color</span></li>
          <li>危险色: <span style={{ color: 'var(--danger-color)' }}>Danger Color</span></li>
        </ul>
      </div>
    </div>
  );
};

export default ThemeTest; 