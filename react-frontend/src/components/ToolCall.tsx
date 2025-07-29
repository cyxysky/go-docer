import React, { useState } from 'react';
import './ToolCall.css';

interface ToolCallProps {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
  output?: string;
  executionId?: string;
}

const ToolCall: React.FC<ToolCallProps> = ({
  name,
  parameters,
  result,
  status,
  output,
  executionId,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <div className="status-spinner" />;
      case 'success':
        return <span className="status-icon status-success">✓</span>;
      case 'error':
        return <span className="status-icon status-error">✗</span>;
      default:
        return <span className="status-icon status-default">◦</span>;
    }
  };

  const getToolDisplayName = () => {
    switch (name) {
      case 'execute_shell':
        return 'Shell';
      case 'file_read':
        return 'Read';
      case 'file_write':
        return 'Write';
      case 'code_analysis':
        return 'Analyze';
      default:
        return name.slice(0, 8);
    }
  };

  const getMainParameter = () => {
    if (name === 'execute_shell' && parameters?.command) {
      return parameters.command;
    }
    if (parameters && typeof parameters === 'object') {
      const keys = Object.keys(parameters);
      if (keys.length > 0) {
        return parameters[keys[0]];
      }
    }
    return null;
  };

  const hasDetails = () => {
    return output || result || (parameters && Object.keys(parameters).length > 1);
  };

  const mainParam = getMainParameter();
  const truncatedParam = mainParam && String(mainParam).length > 30 
    ? String(mainParam).substring(0, 30) + '...'
    : String(mainParam || '');

  return (
    <div className="tool-call-container">
      {/* 主要的一行显示 */}
      <div 
        className={`tool-call-main ${!hasDetails() ? 'no-details' : ''}`}
        onClick={() => hasDetails() && setIsExpanded(!isExpanded)}
      >
        {/* 状态图标 */}
        <div className="tool-call-status">
          {getStatusIcon()}
        </div>

        {/* 工具名称 */}
        <span className="tool-call-name">
          {getToolDisplayName()}
        </span>

        {/* 主要参数 */}
        {truncatedParam && (
          <span className="tool-call-param">
            {truncatedParam}
          </span>
        )}

        {/* 展开按钮 */}
        {hasDetails() && (
          <span className={`tool-call-expand ${isExpanded ? 'expanded' : ''}`}>
            ▼
          </span>
        )}

        {/* 执行ID */}
        {executionId && (
          <span className="tool-call-id">
            #{executionId.slice(-4)}
          </span>
        )}
      </div>

      {/* 展开的详细信息 */}
      {isExpanded && hasDetails() && (
        <div className="tool-call-details">
          {/* 完整参数 */}
          {parameters && Object.keys(parameters).length > 1 && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">参数</div>
              <div className="tool-call-section-content">
                {JSON.stringify(parameters, null, 2)}
              </div>
            </div>
          )}

          {/* 结果 */}
          {result && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">结果</div>
              <div className="tool-call-section-content">
                {typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}
              </div>
            </div>
          )}

          {/* 输出 */}
          {output && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">输出</div>
              <div className="tool-call-section-content tool-call-output">
                {output}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCall; 