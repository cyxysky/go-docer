import React, { useState } from 'react';
import './ToolCall.css';

interface ToolCallProps {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
  output?: string;
  executionId?: string;
  rollback?: {
    type: string;
    path: string;
    content: string;
    command: string;
    description: string;
    is_visible: boolean;
  };
  onFileOperation?: (operation: 'create' | 'edit' | 'delete', filePath: string, content?: string, originalContent?: string) => void;
  onActionTaken?: (action: 'accept' | 'reject') => void;
  onRollback?: (executionId: string) => void;
  actionTaken?: 'accept' | 'reject' | null;
  isRolledBack?: boolean;
  currentWorkspace?: string;
  isAutoMode?: boolean;
}

const ToolCall: React.FC<ToolCallProps> = ({
  name,
  parameters,
  result,
  status,
  output,
  executionId,
  // rollback,
  onFileOperation,
  onActionTaken,
  onRollback,
  actionTaken,
  // isRolledBack,
  // currentWorkspace,
  isAutoMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // const getStatusIcon = () => {
  //   switch (status) {
  //     case 'pending':
  //       return <div className="status-spinner" />;
  //     case 'success':
  //       return <span className="status-icon status-success">✓</span>;
  //     case 'error':
  //       return <span className="status-icon status-error">✗</span>;
  //     default:
  //       return <span className="status-icon status-default">◦</span>;
  //   }
  // };

  const getToolDisplayName = () => {
    switch (name) {
      case 'execute_shell':
        return 'Shell';
      case 'file_read':
        return 'Read';
      case 'file_write':
        return 'Write';
      case 'file_create':
        return 'Create';
      case 'file_delete':
        return 'Delete';
      case 'code_analysis':
        return 'Analyze';
      default:
        return name;
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

  const isFileOperation = () => {
    return ['file_write', 'file_create', 'file_delete'].includes(name);
  };

  // const canShowRollback = () => {
  //   return rollback && rollback.is_visible && !isRolledBack && status === 'success';
  // };

  // const handleRollback = () => {
  //   if (executionId && onRollback) {
  //     onRollback(executionId);
  //   }
  // };

  const getFileOperationType = () => {
    switch (name) {
      case 'file_write':
        return 'edit';
      case 'file_create':
        return 'create';
      case 'file_delete':
        return 'delete';
      default:
        return null;
    }
  };

  const handleFileOperation = (action: 'accept' | 'reject') => {
    if (!isFileOperation()) return;

    // 自动模式：AI已经执行了操作，确认只是隐藏按钮，取消执行回退
    if (isAutoMode) {
      if (action === 'reject' && executionId && onRollback) {
        // 取消操作 - 执行回退
        onRollback(executionId);
      }
      // 确认操作 - 只是隐藏按钮，不执行任何操作
      onActionTaken?.(action);
      return;
    }

    // 手动模式：确认才执行操作，取消隐藏按钮
    if (!onFileOperation) return;

    const operationType = getFileOperationType();
    const filePath = parameters?.path || parameters?.file_path;
    
    if (!operationType || !filePath) return;

    if (action === 'accept') {
      // 确认操作 - 执行文件操作
      if (operationType === 'delete') {
        onFileOperation('delete', filePath);
      } else if (operationType === 'create') {
        onFileOperation('create', filePath, parameters?.content || '');
      } else if (operationType === 'edit') {
        onFileOperation('edit', filePath, parameters?.content || '', parameters?.original_content || '');
      }
    }
    // 取消操作 - 只是隐藏按钮，不执行任何操作

    // 通知父组件操作已完成
    onActionTaken?.(action);
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
        {/* 工具名称 */}
        <span className="tool-call-name">
          {getToolDisplayName()}
        </span>

        {/* 主要参数 */}
        {truncatedParam && (
          <span className="tool-call-param">
            {truncatedParam }
          </span>
        )}

        {/* 文件操作按钮 */}
        {isFileOperation() && status === 'success' && !actionTaken && (
          <div className="tool-call-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="tool-call-action-btn tool-call-accept"
              onClick={() => handleFileOperation('accept')}
              title={isAutoMode ? "确认（隐藏按钮）" : "确认执行"}
            >
              ✓
            </button>
            <button
              className="tool-call-action-btn tool-call-reject"
              onClick={() => handleFileOperation('reject')}
              title={isAutoMode ? "取消（执行回退）" : "取消（隐藏按钮）"}
            >
              ✗
            </button>
          </div>
        )}
        
        {/* 操作状态显示 */}
        {actionTaken && (
          <div className="tool-call-action-status">
            <span className={`tool-call-action-status-${actionTaken}`}>
              {actionTaken === 'accept' 
                ? (isAutoMode ? '✓ 已确认' : '✓ 已执行') 
                : (isAutoMode ? '↩ 已回退' : '✗ 已取消')
              }
            </span>
          </div>
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