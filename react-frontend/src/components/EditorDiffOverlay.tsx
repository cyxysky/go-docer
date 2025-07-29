import React, { useState } from 'react';
import './EditorDiffOverlay.css';

interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
  changeType: 'insert' | 'replace' | 'delete' | 'modify';
  confidence: number;
  applied?: boolean;
}

interface EditorDiffOverlayProps {
  changes: CodeChange[];
  onApply: (change: CodeChange) => void;
  onReject: (change: CodeChange) => void;
  onApplyAll: () => void;
  onRejectAll: () => void;
  onClose: () => void;
  strategy: 'preview' | 'auto' | 'manual';
}

const EditorDiffOverlay: React.FC<EditorDiffOverlayProps> = ({
  changes,
  onApply,
  onReject,
  onApplyAll,
  onRejectAll,
  onClose,
  strategy,
}) => {
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [showDiff, setShowDiff] = useState(true);

  if (changes.length === 0) return null;

  const currentChange = changes[currentChangeIndex];

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'insert': return '#22c55e';
      case 'replace': return '#f59e0b';
      case 'delete': return '#ef4444';
      case 'modify': return '#007acc';
      default: return '#6b7280';
    }
  };

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case 'insert': return '新增';
      case 'replace': return '替换';
      case 'delete': return '删除';
      case 'modify': return '修改';
      default: return '更改';
    }
  };

  const generateLineDiff = () => {
    const originalLines = (currentChange.originalCode || '').split('\n');
    const newLines = (currentChange.newCode || '').split('\n');
    const maxLines = Math.max(originalLines.length, newLines.length);

    return (
      <div className="editor-diff-content">
        {/* 行号 */}
        <div className="editor-diff-line-numbers">
          {Array.from({ length: maxLines }, (_, i) => (
            <div key={i} className="line-number">
              {i + 1}
            </div>
          ))}
        </div>

        {/* 原始代码 */}
        <div className="editor-diff-original">
          <div className="editor-diff-header">原始代码</div>
          {originalLines.map((line, i) => (
            <div 
              key={i} 
              className={`code-line ${currentChange.changeType === 'delete' ? 'deleted' : ''}`}
            >
              {currentChange.changeType === 'delete' && <span className="diff-marker">-</span>}
              {line || ' '}
            </div>
          ))}
        </div>

        {/* 新代码 */}
        <div className="editor-diff-new">
          <div className="editor-diff-header">建议修改</div>
          {newLines.map((line, i) => (
            <div 
              key={i} 
              className={`code-line ${
                currentChange.changeType === 'insert' ? 'inserted' : 
                currentChange.changeType === 'modify' ? 'modified' : 'added'
              }`}
            >
              {(currentChange.changeType === 'insert' || currentChange.changeType === 'modify') && 
                <span className="diff-marker">+</span>}
              {line || ' '}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="editor-diff-overlay">
      <div className="editor-diff-container">
        {/* 头部 */}
        <div className="editor-diff-header-bar">
          <div className="editor-diff-info">
            <span className="file-path">{currentChange.filePath}</span>
            <span className="change-description">{currentChange.description}</span>
            <div className="change-badges">
              <span 
                className="change-type-badge"
                style={{ backgroundColor: getChangeTypeColor(currentChange.changeType) }}
              >
                {getChangeTypeLabel(currentChange.changeType)}
              </span>
              <span className="confidence-badge">
                {Math.round(currentChange.confidence * 100)}%
              </span>
            </div>
          </div>
          
          <div className="editor-diff-controls">
            {changes.length > 1 && (
              <div className="navigation-controls">
                <button
                  onClick={() => setCurrentChangeIndex(Math.max(0, currentChangeIndex - 1))}
                  disabled={currentChangeIndex === 0}
                  className="nav-btn"
                >
                  ◀
                </button>
                <span className="change-counter">
                  {currentChangeIndex + 1} / {changes.length}
                </span>
                <button
                  onClick={() => setCurrentChangeIndex(Math.min(changes.length - 1, currentChangeIndex + 1))}
                  disabled={currentChangeIndex === changes.length - 1}
                  className="nav-btn"
                >
                  ▶
                </button>
              </div>
            )}
            
            <button
              onClick={() => setShowDiff(!showDiff)}
              className="toggle-diff-btn"
            >
              {showDiff ? '隐藏差异' : '显示差异'}
            </button>
            
            <button onClick={onClose} className="close-btn">
              ✕
            </button>
          </div>
        </div>

        {/* 差异内容 */}
        {showDiff && generateLineDiff()}

        {/* 操作按钮 */}
        {strategy !== 'auto' && !currentChange.applied && (
          <div className="editor-diff-actions">
            <div className="single-actions">
              <button
                onClick={() => onReject(currentChange)}
                className="reject-btn"
              >
                拒绝此更改
              </button>
              <button
                onClick={() => onApply(currentChange)}
                className="apply-btn"
              >
                应用此更改
              </button>
            </div>
            
            {changes.length > 1 && (
              <div className="batch-actions">
                <button
                  onClick={onRejectAll}
                  className="reject-all-btn"
                >
                  拒绝所有 ({changes.length})
                </button>
                <button
                  onClick={onApplyAll}
                  className="apply-all-btn"
                >
                  应用所有 ({changes.length})
                </button>
              </div>
            )}
          </div>
        )}

        {currentChange.applied && (
          <div className="applied-indicator">
            ✅ 此更改已应用
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorDiffOverlay; 