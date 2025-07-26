import React, { useState, useCallback, useEffect } from 'react';
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

const GitPanel: React.FC<GitPanelProps> = ({ currentWorkspace }) => {
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitOutput, setGitOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('');

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
        // 显示操作成功通知
        showSuccess('操作成功', `Git ${operation} 操作执行成功！`);
        // 操作成功后刷新状态
        setTimeout(() => {
          handleGitOperation('status');
        }, 500);
      }
    } catch (error) {
      console.error('Git操作失败:', error);
      setGitOutput(`Git操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setShowOutput(true);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, commitMessage]);

  const parseGitStatus = (output: string) => {
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
  };

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) {
      showWarning('输入错误', '请输入提交信息');
      return;
    }
    handleGitOperation('commit', [], '', commitMessage);
    setCommitMessage('');
  }, [commitMessage, handleGitOperation, showWarning]);

  // 初始化时获取Git状态
  useEffect(() => {
    if (currentWorkspace) {
      handleGitOperation('status');
    }
  }, [currentWorkspace, handleGitOperation]);

  if (!currentWorkspace) {
    return (
      <div className="git-panel">
        <div className="git-empty-state">
          <i className="fas fa-code-branch"></i>
          <h3>Git 版本控制</h3>
          <p>请先选择一个工作空间</p>
        </div>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-section">
        <div className="git-section-title">
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <i className="fas fa-code-branch"></i>
            源代码管理
          </div>
          <button 
            className="btn-icon"
            onClick={() => handleGitOperation('status')}
            disabled={isLoading}
            title="刷新状态"
          >
            <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>

        {/* 分支信息 */}
        {currentBranch && (
          <div className="current-branch">
            <i className="fas fa-code-branch"></i>
            <span>当前分支: {currentBranch}</span>
          </div>
        )}

        {/* Git状态摘要 */}
        {gitStatus && (
          <div className="git-status-summary">
            {gitStatus.clean ? (
              <div className="status-clean">
                <i className="fas fa-check-circle"></i>
                <span>工作区干净</span>
              </div>
            ) : (
              <div className="status-changes">
                {gitStatus.staged.length > 0 && (
                  <div className="status-item staged">
                    <i className="fas fa-plus-circle"></i>
                    <span>{gitStatus.staged.length} 个已暂存</span>
                  </div>
                )}
                {gitStatus.modified.length > 0 && (
                  <div className="status-item modified">
                    <i className="fas fa-edit"></i>
                    <span>{gitStatus.modified.length} 个已修改</span>
                  </div>
                )}
                {gitStatus.untracked.length > 0 && (
                  <div className="status-item untracked">
                    <i className="fas fa-question-circle"></i>
                    <span>{gitStatus.untracked.length} 个未跟踪</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Git操作按钮 */}
        <div className="git-actions">
          <button 
            className="btn"
            onClick={() => handleGitOperation('add')}
            disabled={isLoading || (gitStatus !== null && gitStatus.clean)}
          >
            <i className="fas fa-plus"></i>
            <span>暂存所有</span>
          </button>
          <button 
            className="btn"
            onClick={() => handleGitOperation('pull')}
            disabled={isLoading}
          >
            <i className="fas fa-download"></i>
            <span>拉取</span>
          </button>
          <button 
            className="btn"
            onClick={() => handleGitOperation('push')}
            disabled={isLoading}
          >
            <i className="fas fa-upload"></i>
            <span>推送</span>
          </button>
          <button 
            className="btn"
            onClick={() => handleGitOperation('log')}
            disabled={isLoading}
          >
            <i className="fas fa-history"></i>
            <span>历史</span>
          </button>
        </div>
        
        {/* Git输出区域 */}
        {showOutput && gitOutput && (
          <div className="git-output">
            <div className="output-header">
              <span>输出</span>
              <button 
                className="btn-close"
                onClick={() => setShowOutput(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <pre>{gitOutput}</pre>
          </div>
        )}
        
        {/* 提交区域 */}
        <div className="commit-input">
          <textarea 
            className="form-control" 
            placeholder="输入提交信息..." 
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            disabled={isLoading}
            rows={3}
          />
        </div>
        <button 
          className="btn-primary w-100"
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