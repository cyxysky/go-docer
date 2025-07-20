import React, { useState, useCallback } from 'react';
import './GitPanel.css';

interface GitPanelProps {
  currentWorkspace: string | null;
}

const GitPanel: React.FC<GitPanelProps> = ({ currentWorkspace }) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState('');

  const handleGitOperation = useCallback(async (operation: string, files?: string[]) => {
    if (!currentWorkspace) {
      alert('请先选择工作空间');
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
          message: commitMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Git操作失败: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (operation === 'status') {
        setGitStatus(result.output);
      } else {
        alert(`Git操作成功: ${operation}`);
        // 刷新状态
        handleGitOperation('status');
      }
    } catch (error) {
      console.error('Git操作失败:', error);
      alert(`Git操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, commitMessage]);

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) {
      alert('请输入提交信息');
      return;
    }
    handleGitOperation('commit');
    setCommitMessage('');
  }, [commitMessage, handleGitOperation]);

  return (
    <div className="git-panel">
      <div className="git-section">
        <div className="git-section-title">
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <i className="fas fa-code-branch"></i>
            源代码管理
          </div>
        </div>
        <div className="git-actions">
          <button 
            className="btn"
            onClick={() => handleGitOperation('status')}
            disabled={isLoading}
          >
            <i className="fas fa-info-circle"></i>
            <span>状态</span>
          </button>
          <button 
            className="btn"
            onClick={() => handleGitOperation('add')}
            disabled={isLoading}
          >
            <i className="fas fa-plus"></i>
            <span>暂存</span>
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
        </div>
        
        {gitStatus && (
          <div className="git-status">
            <pre>{gitStatus}</pre>
          </div>
        )}
        
        <div className="commit-input">
          <input 
            type="text" 
            className="form-control" 
            placeholder="输入提交信息..." 
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <button 
          className="btn-primary w-100"
          onClick={handleCommit}
          disabled={isLoading || !commitMessage.trim()}
        >
          <i className="fas fa-check"></i>
          <span>提交更改</span>
        </button>
      </div>
    </div>
  );
};

export default GitPanel; 