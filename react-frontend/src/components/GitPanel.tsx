import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNotification } from './NotificationProvider';
import './GitPanel.css';

interface GitPanelProps {
  currentWorkspace: string | null;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

interface GitOperation {
  type: string;
  label: string;
  icon: string;
  color: string;
  disabled?: boolean;
}

const GitPanel: React.FC<GitPanelProps> = ({ currentWorkspace }) => {
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitOutput, setGitOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('');
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');

  // Git 操作配置
  const gitOperations: GitOperation[] = useMemo(() => [
    {
      type: 'add',
      label: '暂存所有',
      icon: 'fas fa-plus',
      color: 'success',
      disabled: isLoading || (gitStatus !== null && gitStatus.clean)
    },
    {
      type: 'pull',
      label: '拉取',
      icon: 'fas fa-download',
      color: 'info'
    },
    {
      type: 'push',
      label: '推送',
      icon: 'fas fa-upload',
      color: 'primary'
    },
    {
      type: 'log',
      label: '历史',
      icon: 'fas fa-history',
      color: 'secondary'
    }
  ], [isLoading, gitStatus]);

  const handleGitOperation = useCallback(async (operation: string, files?: string[], branch?: string, message?: string) => {
    if (!currentWorkspace) {
      showWarning('操作受限', '请先选择工作空间');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/git`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: operation,
          files: files || [],
          message: message || commitMessage,
          branch: branch || '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Git操作失败: ${response.statusText}`);
      }

      const result = await response.json();
      setGitOutput(result.output);
      setShowOutput(true);
      
      if (operation === 'status') {
        parseGitStatus(result.output);
      } else {
        showSuccess('操作成功', `Git ${operation} 操作执行成功！`);
        setTimeout(() => {
          handleGitOperation('status');
        }, 500);
      }
    } catch (error) {
      console.error('Git操作失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setGitOutput(`Git操作失败: ${errorMessage}`);
      setShowOutput(true);
      showError('操作失败', `Git ${operation} 操作失败: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, commitMessage, showSuccess, showError, showWarning]);

  const parseGitStatus = useCallback((output: string) => {
    const lines = output.split('\n');
    const status: GitStatus = {
      branch: '',
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      clean: true
    };

    // 解析分支信息
    const branchLine = lines.find(line => line.includes('On branch') || line.includes('HEAD detached'));
    if (branchLine) {
      const match = branchLine.match(/On branch (.+)|HEAD detached at (.+)/);
      if (match) {
        status.branch = match[1] || match[2] || 'unknown';
        setCurrentBranch(status.branch);
      }
    }

    // 解析文件状态
    lines.forEach(line => {
      if (line.match(/^M\s+/)) {
        status.staged.push(line.substring(3));
        status.clean = false;
      } else if (line.match(/^\sM\s+/)) {
        status.modified.push(line.substring(3));
        status.clean = false;
      } else if (line.match(/^\?\?\s+/)) {
        status.untracked.push(line.substring(3));
        status.clean = false;
      }
    });

    setGitStatus(status);
  }, []);

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) {
      showWarning('输入错误', '请输入提交信息');
      return;
    }
    handleGitOperation('commit', [], '', commitMessage);
    setCommitMessage('');
  }, [commitMessage, handleGitOperation, showWarning]);

  const handleRefresh = useCallback(() => {
    handleGitOperation('status');
  }, [handleGitOperation]);

  // 初始化时获取Git状态
  useEffect(() => {
    if (currentWorkspace) {
      handleGitOperation('status');
    }
  }, [currentWorkspace, handleGitOperation]);

  // 空状态渲染
  if (!currentWorkspace) {
    return (
      <div className="git-panel">
        <div className="git-empty">
          <i className="fas fa-code-branch"></i>
          <p>Git 版本控制</p>
          <small>请先选择一个工作空间</small>
        </div>
      </div>
    );
  }

  return (
    <div className="git-panel">
      {/* Git 头部 */}
      <div className="git-header">
        <div className="git-title">
          <i className="fas fa-code-branch"></i>
          <span>源代码管理</span>
        </div>
        <button 
          className="git-refresh-btn"
          onClick={handleRefresh}
          disabled={isLoading}
          title="刷新状态"
        >
          <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i>
        </button>
      </div>

      {/* Git 状态信息 */}
      {currentBranch && (
        <div className="git-status">
          <div className="git-branch">
            <i className="fas fa-code-branch"></i>
            <span>{currentBranch}</span>
          </div>
          {gitStatus && (
            <div className={`git-status-indicator ${gitStatus.clean ? 'clean' : 'dirty'}`}>
              <i className={`fas ${gitStatus.clean ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}></i>
              <span>{gitStatus.clean ? '干净' : '有变更'}</span>
            </div>
          )}
        </div>
      )}

      {/* Git 工具栏 */}
      <div className="git-toolbar">
        {gitOperations.map((op) => (
          <button 
            key={op.type}
            className={`btn btn-${op.color}`}
            onClick={() => handleGitOperation(op.type)}
            disabled={op.disabled || isLoading}
            title={op.label}
          >
            <i className={op.icon}></i>
            <span>{op.label}</span>
          </button>
        ))}
      </div>

      {/* Git 标签页 */}
      <div className="git-tabs">
        <div 
          className={`git-tab ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          <i className="fas fa-list"></i>
          <span>变更</span>
          {gitStatus && !gitStatus.clean && (
            <span className="tab-badge">
              {gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length}
            </span>
          )}
        </div>
        <div 
          className={`git-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => handleGitOperation('log')}
        >
          <i className="fas fa-history"></i>
          <span>历史</span>
        </div>
      </div>

      {/* Git 内容区域 */}
      <div className="git-content">
        <div className={`git-tab-content ${activeTab === 'changes' ? 'active' : ''}`}>
          {/* 变更列表 */}
          {gitStatus && !gitStatus.clean && (
            <div className="changes-list">
              {gitStatus.staged.length > 0 && (
                <div className="change-group">
                  <div className="change-group-title">
                    <i className="fas fa-plus-circle"></i>
                    <span>已暂存 ({gitStatus.staged.length})</span>
                  </div>
                  {gitStatus.staged.map((file, index) => (
                    <div key={index} className="change-item">
                      <div className="change-status added">
                        <i className="fas fa-plus"></i>
                      </div>
                      <div className="change-info">
                        <div className="change-path">{file}</div>
                        <div className="change-details">
                          <span>已暂存</span>
                        </div>
                      </div>
                      <div className="change-actions">
                        <button className="change-action-btn" title="取消暂存">
                          <i className="fas fa-undo"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {gitStatus.modified.length > 0 && (
                <div className="change-group">
                  <div className="change-group-title">
                    <i className="fas fa-edit"></i>
                    <span>已修改 ({gitStatus.modified.length})</span>
                  </div>
                  {gitStatus.modified.map((file, index) => (
                    <div key={index} className="change-item">
                      <div className="change-status modified">
                        <i className="fas fa-edit"></i>
                      </div>
                      <div className="change-info">
                        <div className="change-path">{file}</div>
                        <div className="change-details">
                          <span>已修改</span>
                        </div>
                      </div>
                      <div className="change-actions">
                        <button className="change-action-btn" title="暂存">
                          <i className="fas fa-plus"></i>
                        </button>
                        <button className="change-action-btn" title="查看差异">
                          <i className="fas fa-eye"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {gitStatus.untracked.length > 0 && (
                <div className="change-group">
                  <div className="change-group-title">
                    <i className="fas fa-question-circle"></i>
                    <span>未跟踪 ({gitStatus.untracked.length})</span>
                  </div>
                  {gitStatus.untracked.map((file, index) => (
                    <div key={index} className="change-item">
                      <div className="change-status untracked">
                        <i className="fas fa-question"></i>
                      </div>
                      <div className="change-info">
                        <div className="change-path">{file}</div>
                        <div className="change-details">
                          <span>未跟踪</span>
                        </div>
                      </div>
                      <div className="change-actions">
                        <button className="change-action-btn" title="添加到暂存">
                          <i className="fas fa-plus"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {gitStatus && gitStatus.clean && (
            <div className="git-empty">
              <i className="fas fa-check-circle"></i>
              <p>工作区干净</p>
              <small>没有未提交的更改</small>
            </div>
          )}
        </div>
      </div>

      {/* Git 输出区域 */}
      {showOutput && gitOutput && (
        <div className="git-output">
          <div className="output-header">
            <span>输出</span>
            <button 
              className="output-close-btn"
              onClick={() => setShowOutput(false)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          <pre className="output-content">{gitOutput}</pre>
        </div>
      )}
      
      {/* 提交区域 */}
      <div className="commit-section">
        <div className="commit-input">
          <textarea 
            className="commit-textarea" 
            placeholder="输入提交信息..." 
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            disabled={isLoading}
            rows={3}
          />
        </div>
        <button 
          className="commit-btn"
          onClick={handleCommit}
          disabled={isLoading || !commitMessage.trim() || (!gitStatus || gitStatus.staged.length === 0)}
        >
          <i className="fas fa-check"></i>
          <span>提交更改</span>
        </button>
      </div>
    </div>
  );
};

export default GitPanel; 