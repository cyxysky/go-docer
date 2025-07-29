import React from 'react';

interface ToolCallProps {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
}

const ToolCall: React.FC<ToolCallProps> = ({
  name,
  parameters,
  result,
  status,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '🔧';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return '执行中';
      case 'success':
        return '成功';
      case 'error':
        return '失败';
      default:
        return '未知';
    }
  };

  return (
    <div style={{
      padding: '8px',
      backgroundColor: '#2a2a2a',
      borderRadius: '4px',
      marginBottom: '4px',
      fontSize: '12px',
    }}>
      <div style={{ color: '#4CAF50', marginBottom: '4px' }}>
        {getStatusIcon()} {name}
      </div>
      <div style={{ color: '#ccc', fontSize: '11px' }}>
        状态: {getStatusText()}
      </div>
      {parameters && Object.keys(parameters).length > 0 && (
        <div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>
          参数: {JSON.stringify(parameters)}
        </div>
      )}
      {result && (
        <div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>
          结果: {JSON.stringify(result)}
        </div>
      )}
    </div>
  );
};

export default ToolCall; 