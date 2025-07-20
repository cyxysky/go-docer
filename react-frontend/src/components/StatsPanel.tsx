import React, { useState, useEffect, useCallback } from 'react';
import './StatsPanel.css';

interface StatsPanelProps {
  currentWorkspace: string | null;
}

interface ContainerStats {
  cpu_usage: number;
  memory_usage: number;
  memory_limit: number;
  memory_used: number;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ currentWorkspace }) => {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!currentWorkspace) return;

    setIsLoading(true);
    setError(null);
    try {
      // 首先获取工作空间信息以获取容器ID
      const workspaceResponse = await fetch(`/api/v1/workspaces/${currentWorkspace}`);
      if (!workspaceResponse.ok) {
        throw new Error('获取工作空间信息失败');
      }
      const workspace = await workspaceResponse.json();

      if (!workspace.container_id) {
        throw new Error('容器未运行');
      }

      // 获取容器统计信息
      const statsResponse = await fetch(`/api/v1/containers/${workspace.container_id}/stats`);
      if (!statsResponse.ok) {
        throw new Error('获取容器统计信息失败');
      }
      const statsData = await statsResponse.json();
      setStats(statsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取状态失败';
      setError(errorMessage);
      console.error('获取容器状态失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  // 当工作空间改变时，获取状态
  useEffect(() => {
    if (currentWorkspace) {
      fetchStats();
    } else {
      setStats(null);
      setError(null);
    }
  }, [currentWorkspace, fetchStats]);

  // 自动刷新状态（每60秒）
  useEffect(() => {
    if (!currentWorkspace) return;

    const interval = setInterval(fetchStats, 60000);
    
    return () => {
      clearInterval(interval);
    };
  }, [currentWorkspace, fetchStats]);

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="stats-panel">
      <div className="git-section-title">
        <span>
          <i className="fas fa-chart-line" style={{ marginRight: '8px' }}></i>
          容器状态
        </span>
        <button 
          className="btn btn-secondary refresh"
          onClick={fetchStats}
          disabled={isLoading}
        >
          <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i> 
          <span>{isLoading ? '刷新中' : '刷新'}</span>
        </button>
      </div>
      
      {error && (
        <div className="stats-error">
          <i className="fas fa-exclamation-triangle"></i>
          <span>{error}</span>
        </div>
      )}
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {stats ? `${stats.cpu_usage.toFixed(1)}%` : '--'}
          </div>
          <div className="stat-label">
            <i className="fas fa-microchip" style={{ marginRight: '4px', fontSize: '10px' }}></i>
            CPU 使用率
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? `${stats.memory_usage.toFixed(1)}%` : '--'}
          </div>
          <div className="stat-label">
            <i className="fas fa-memory" style={{ marginRight: '4px', fontSize: '10px' }}></i>
            内存使用率
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? formatMemory(stats.memory_used) : '--'}
          </div>
          <div className="stat-label">
            <i className="fas fa-hdd" style={{ marginRight: '4px', fontSize: '10px' }}></i>
            已用内存
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? formatMemory(stats.memory_limit) : '--'}
          </div>
          <div className="stat-label">
            <i className="fas fa-shield-alt" style={{ marginRight: '4px', fontSize: '10px' }}></i>
            内存限制
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel; 