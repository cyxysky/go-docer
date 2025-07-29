import React from 'react';

interface CodeComparisonProps {
  originalCode: string;
  newCode: string;
  filePath: string;
  description: string;
  onAccept: () => void;
  onReject: () => void;
}

const CodeComparison: React.FC<CodeComparisonProps> = ({
  originalCode,
  newCode,
  filePath,
  description,
  onAccept,
  onReject,
}) => {
  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: '8px',
      marginBottom: '12px',
      overflow: 'hidden',
      backgroundColor: '#1e1e1e',
    }}>
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#2a2a2a',
        borderBottom: '1px solid #444',
        fontSize: '12px',
        color: '#ccc',
      }}>
        {filePath} - {description}
      </div>
      
      <div style={{
        display: 'flex',
        maxHeight: '300px',
        overflow: 'auto',
      }}>
        {/* 原始代码 */}
        <div style={{
          flex: 1,
          padding: '8px',
          backgroundColor: '#1e1e1e',
          borderRight: '1px solid #444',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            原始代码
          </div>
          <pre style={{
            margin: 0,
            fontSize: '12px',
            color: '#ccc',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {originalCode}
          </pre>
        </div>
        
        {/* 新代码 */}
        <div style={{
          flex: 1,
          padding: '8px',
          backgroundColor: '#1e1e1e',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            建议修改
          </div>
          <pre style={{
            margin: 0,
            fontSize: '12px',
            color: '#4CAF50',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {newCode}
          </pre>
        </div>
      </div>
      
      {/* 操作按钮 */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={onReject}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#d32f2f',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          拒绝
        </button>
        <button
          onClick={onAccept}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          接受
        </button>
      </div>
    </div>
  );
};

export default CodeComparison; 