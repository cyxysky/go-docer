import React from 'react';
import './GitPanel.css';

interface GitPanelProps {
  currentWorkspace: string | null;
}

const GitPanel: React.FC<GitPanelProps> = ({ currentWorkspace }) => {
  return (
    <div className="git-panel">
      <div className="git-section">
        <div className="git-section-title">源代码管理</div>
        <div className="git-actions">
          <button className="btn btn-secondary btn-sm">
            <i className="fas fa-info-circle"></i> 状态
          </button>
          <button className="btn btn-secondary btn-sm">
            <i className="fas fa-plus"></i> 暂存
          </button>
          <button className="btn btn-secondary btn-sm">
            <i className="fas fa-download"></i> 拉取
          </button>
          <button className="btn btn-secondary btn-sm">
            <i className="fas fa-upload"></i> 推送
          </button>
        </div>
        <div className="commit-input">
          <input type="text" className="form-control" placeholder="提交信息" />
        </div>
        <button className="btn btn-primary w-100">
          <i className="fas fa-check"></i> 提交
        </button>
      </div>
    </div>
  );
};

export default GitPanel; 