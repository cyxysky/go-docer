import React from 'react';
import './StatsPanel.css';

interface StatsPanelProps {
  currentWorkspace: string | null;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ currentWorkspace }) => {
  return (
    <div className="stats-panel">
      <div className="git-section-title">容器状态</div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">--</div>
          <div className="stat-label">CPU 使用率</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">--</div>
          <div className="stat-label">内存使用率</div>
        </div>
      </div>
      <button className="btn btn-secondary w-100">
        <i className="fas fa-sync"></i> 刷新状态
      </button>
    </div>
  );
};

export default StatsPanel; 