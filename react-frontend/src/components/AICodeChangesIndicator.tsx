import React from 'react';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';
import { useFile } from '../contexts/FileContext';

const AICodeChangesIndicator: React.FC = () => {
  const { pendingChanges, hasChangesForFile } = useAICodeChanges();
  const { openTabs } = useFile();

  // 检查打开的标签页中是否有待处理的修改
  const tabsWithChanges = Array.from(openTabs.keys()).filter(tabPath => 
    hasChangesForFile(tabPath)
  );

  if (pendingChanges.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      right: '20px',
      zIndex: 1000,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      backdropFilter: 'blur(10px)'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'scale(1) translateY(0)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    }}
    >
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: 'linear-gradient(45deg, #ff6b6b, #ffa500)',
        animation: 'pulse 2s infinite',
        boxShadow: '0 0 10px rgba(255, 107, 107, 0.5)'
      }} />
      <span style={{
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
      }}>
        🤖 {pendingChanges.length} 个AI操作待处理
        {tabsWithChanges.length > 0 && (
          <span style={{ opacity: 0.8, fontSize: '11px' }}>
            {' '}({tabsWithChanges.length} 个已打开)
          </span>
        )}
      </span>
    </div>
  );
};

export default AICodeChangesIndicator; 