import React, { useState } from 'react';

interface CodeComparisonProps {
  change: {
    filePath: string;
    originalCode: string;
    newCode: string;
    description: string;
    changeType: 'insert' | 'replace' | 'delete' | 'modify';
    confidence: number;
    applied?: boolean;
  };
  onApply: () => void;
  onReject: () => void;
  strategy: 'preview' | 'auto' | 'manual';
}

const CodeComparison: React.FC<CodeComparisonProps> = ({
  change,
  onApply,
  onReject,
  strategy,
}) => {
  const { filePath, originalCode, newCode, description, changeType, confidence, applied } = change;
  const [isExpanded, setIsExpanded] = useState(strategy === 'preview');
  const [showDiff, setShowDiff] = useState(false);

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

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return '#22c55e';
    if (conf >= 0.6) return '#f59e0b';
    return '#ef4444';
  };

  const getStatusBadge = () => {
    if (applied) {
      return (
        <div style={{
          padding: '2px 6px',
          backgroundColor: '#22c55e',
          color: '#fff',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
        }}>
          <span>✓</span>
          <span>已应用</span>
        </div>
      );
    }
    
    if (strategy === 'auto') {
      return (
        <div style={{
          padding: '2px 6px',
          backgroundColor: '#007acc',
          color: '#fff',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: '500',
        }}>
          自动应用
        </div>
      );
    }
    
    return null;
  };

  // 生成简单的行差异
  const generateLineDiff = () => {
    if (!showDiff) return null;

    const originalLines = (originalCode || '').split('\n');
    const newLines = (newCode || '').split('\n');
    const maxLines = Math.max(originalLines.length, newLines.length);

    return (
      <div style={{
        display: 'flex',
        maxHeight: '300px',
        overflow: 'auto',
        fontSize: '12px',
        fontFamily: 'Fira Code, Consolas, Monaco, "Courier New", monospace',
        backgroundColor: '#1e1e1e',
      }}>
        {/* 行号 */}
        <div style={{
          backgroundColor: '#252526',
          padding: '12px 8px',
          borderRight: '1px solid #3e3e3e',
          color: '#858585',
          minWidth: '50px',
          textAlign: 'right',
          userSelect: 'none',
        }}>
          {Array.from({ length: maxLines }, (_, i) => (
            <div key={i} style={{ lineHeight: '1.4', minHeight: '16.8px' }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* 原始代码 */}
        <div style={{
          flex: 1,
          padding: '12px',
          backgroundColor: '#1e1e1e',
          borderRight: '1px solid #3e3e3e',
        }}>
          {originalLines.map((line, i) => (
            <div key={i} style={{
              lineHeight: '1.4',
              minHeight: '16.8px',
              backgroundColor: changeType === 'delete' ? 'rgba(244, 63, 94, 0.15)' : 'transparent',
              color: changeType === 'delete' ? '#f87171' : '#cccccc',
              padding: '0 8px',
              margin: '0 -8px',
            }}>
              {changeType === 'delete' && <span style={{ color: '#f87171', marginRight: '8px' }}>-</span>}
              {line || ' '}
            </div>
          ))}
        </div>

        {/* 新代码 */}
        <div style={{
          flex: 1,
          padding: '12px',
          backgroundColor: '#1e1e1e',
        }}>
          {newLines.map((line, i) => (
            <div key={i} style={{
              lineHeight: '1.4',
              minHeight: '16.8px',
              backgroundColor: changeType === 'insert' ? 'rgba(34, 197, 94, 0.15)' : 
                              changeType === 'modify' ? 'rgba(0, 122, 204, 0.15)' : 'transparent',
              color: changeType === 'insert' ? '#4ade80' :
                     changeType === 'modify' ? '#60a5fa' : '#22c55e',
              padding: '0 8px',
              margin: '0 -8px',
            }}>
              {(changeType === 'insert' || changeType === 'modify') && 
                <span style={{ color: '#4ade80', marginRight: '8px' }}>+</span>}
              {line || ' '}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      border: '1px solid #3e3e3e',
      borderRadius: '6px',
      marginBottom: '12px',
      overflow: 'hidden',
      backgroundColor: '#252526',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
    }}>
      {/* 头部 */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#2d2d30',
        borderBottom: '1px solid #3e3e3e',
        fontSize: '12px',
        color: '#cccccc',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: '#858585',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            ▶
          </button>
          <span style={{ 
            fontWeight: '500', 
            color: '#cccccc',
            fontSize: '12px',
          }}>
            {filePath}
          </span>
          <span style={{ 
            color: '#858585',
            fontSize: '11px',
          }}>
            {description}
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {getStatusBadge()}
          <span style={{
            padding: '2px 6px',
            backgroundColor: getChangeTypeColor(changeType),
            color: '#fff',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: '500',
          }}>
            {getChangeTypeLabel(changeType)}
          </span>
          <span style={{
            padding: '2px 6px',
            backgroundColor: getConfidenceColor(confidence),
            color: '#fff',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: '500',
          }}>
            {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <>
          {/* 工具栏 */}
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#252526',
            borderBottom: '1px solid #3e3e3e',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}>
            <button
              onClick={() => setShowDiff(!showDiff)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: showDiff ? '#007acc' : '#3c3c3c',
                color: showDiff ? '#ffffff' : '#cccccc',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!showDiff) {
                  e.currentTarget.style.backgroundColor = '#464647';
                }
              }}
              onMouseLeave={(e) => {
                if (!showDiff) {
                  e.currentTarget.style.backgroundColor = '#3c3c3c';
                }
              }}
            >
              {showDiff ? '隐藏差异' : '显示差异'}
            </button>
            <span style={{ fontSize: '11px', color: '#858585' }}>
              {(originalCode || '').split('\n').length} → {(newCode || '').split('\n').length} 行
            </span>
          </div>

          {/* 代码显示 */}
          {showDiff ? generateLineDiff() : (
            <div style={{
              display: 'flex',
              maxHeight: '250px',
              overflow: 'auto',
            }}>
              {/* 原始代码 */}
              <div style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#1e1e1e',
                borderRight: '1px solid #3e3e3e',
              }}>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#858585', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  原始代码
                </div>
                <pre style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#cccccc',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                  fontFamily: 'Fira Code, Consolas, Monaco, "Courier New", monospace',
                }}>
                  {originalCode || ''}
                </pre>
              </div>
              
              {/* 新代码 */}
              <div style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#1e1e1e',
              }}>
                <div style={{ 
                  fontSize: '11px', 
                  color: '#858585', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  建议修改
                </div>
                <pre style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#4ade80',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                  fontFamily: 'Fira Code, Consolas, Monaco, "Courier New", monospace',
                }}>
                  {newCode || ''}
                </pre>
              </div>
            </div>
          )}
          
          {/* 操作按钮 */}
          {!applied && strategy !== 'auto' && (
            <div style={{
              padding: '8px 12px',
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              backgroundColor: '#252526',
              borderTop: '1px solid #3e3e3e',
            }}>
              <button
                onClick={onReject}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#3c3c3c',
                  color: '#cccccc',
                  border: '1px solid #464647',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                  e.currentTarget.style.borderColor = '#ef4444';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3c3c3c';
                  e.currentTarget.style.borderColor = '#464647';
                  e.currentTarget.style.color = '#cccccc';
                }}
              >
                拒绝
              </button>
              <button
                onClick={onApply}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#007acc',
                  color: '#ffffff',
                  border: '1px solid #007acc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1177bb';
                  e.currentTarget.style.borderColor = '#1177bb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#007acc';
                  e.currentTarget.style.borderColor = '#007acc';
                }}
              >
                接受
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CodeComparison; 