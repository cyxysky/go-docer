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
      background: '#ff6b6b',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '500',
      boxShadow: '0 2px 8px rgba(255, 107, 107, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'scale(1.05)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'scale(1)';
    }}
    >
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: 'white',
        animation: 'pulse 2s infinite'
      }} />
      <span>
        {pendingChanges.length} 个AI代码修改待处理
        {tabsWithChanges.length > 0 && ` (${tabsWithChanges.length} 个已打开)`}
      </span>
    </div>
  );
};

export default AICodeChangesIndicator; 