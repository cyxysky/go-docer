import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import './StatsPanel.css';

interface NetworkInfo {
  workspace_ip: string;
  access_urls: Array<{
    port: string;
    protocol: string;
    internal_url: string;
    external_url?: string;
    status: string;
  }>;
}

const StatsPanel: React.FC = () => {
  const { currentWorkspace, workspaces } = useWorkspace();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  const workspace = workspaces.find(w => w.id === currentWorkspace);

  const fetchStats = useCallback(async () => {
    if (!currentWorkspace || !workspace || workspace.status !== 'running') {
      setStats(null);
      setNetworkInfo(null);
      return;
    }

    setIsLoading(true);
    try {
      // 获取容器统计信息
      const statsResponse = await fetch(`/api/v1/containers/${workspace.container_id}/stats`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      // 获取网络信息
      const networkResponse = await fetch(`/api/v1/workspaces/${currentWorkspace}/ports/status`);
      if (networkResponse.ok) {
        const networkData = await networkResponse.json();
        setNetworkInfo(networkData);
      }
    } catch (error) {
      console.error('获取统计信息失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, workspace]);

  const checkPorts = useCallback(async () => {
    if (!currentWorkspace) return;
    
    try {
      await fetch(`/api/v1/workspaces/${currentWorkspace}/ports/check`, {
        method: 'POST'
      });
      // 延迟刷新状态
      setTimeout(() => fetchStats(), 2000);
    } catch (error) {
      console.error('检查端口失败:', error);
    }
  }, [currentWorkspace, fetchStats]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // 每5秒更新一次
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!currentWorkspace || !workspace) {
    return (
      <div className="stats-panel">
        <div className="stats-empty-state">
          <i className="fas fa-chart-line"></i>
          <h3>系统监控</h3>
          <p>请先选择一个工作空间</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-panel">
      {/* 工作空间基本信息 */}
      <div className="stats-section">
        <div className="stats-section-title">
          <i className="fas fa-info-circle"></i>
          <span>工作空间信息</span>
        </div>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">名称:</span>
            <span className="value">{workspace.name}</span>
          </div>
          <div className="info-item">
            <span className="label">镜像:</span>
            <span className="value">{workspace.image}</span>
          </div>
          <div className="info-item">
            <span className="label">状态:</span>
            <span className={`value status ${workspace.status}`}>{workspace.status}</span>
          </div>
          <div className="info-item">
            <span className="label">创建时间:</span>
            <span className="value">{workspace.created ? new Date(workspace.created).toLocaleString() : '--'}</span>
          </div>
        </div>
      </div>

      {/* 网络信息 */}
      {workspace.status === 'running' && (
        <div className="stats-section">
          <div className="stats-section-title">
            <i className="fas fa-network-wired"></i>
            <span>网络信息</span>
            <button 
              className="btn-icon"
              onClick={checkPorts}
              title="检查端口状态"
            >
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
          
          {networkInfo && (
            <div className="network-details">
              <div className="ip-info">
                <span className="label">容器IP:</span>
                <span className="value ip-address">{networkInfo.workspace_ip}</span>
              </div>
              
              {networkInfo.access_urls && networkInfo.access_urls.length > 0 && (
                <div className="ports-section">
                  <h4>可用端口</h4>
                  <div className="ports-list">
                    {networkInfo.access_urls.map((url, index) => (
                      <div key={index} className={`port-item ${url.status}`}>
                        <div className="port-info">
                          <span className="port-number">:{url.port}</span>
                          <span className={`status-indicator ${url.status}`}>
                            <i className={`fas ${
                              url.status === 'available' ? 'fa-check-circle' : 
                              url.status === 'checking' ? 'fa-spinner fa-spin' : 
                              'fa-times-circle'
                            }`}></i>
                            {url.status === 'available' ? '可用' : 
                             url.status === 'checking' ? '检查中' : '不可用'}
                          </span>
                        </div>
                        {url.status === 'available' && (
                          <div className="port-links">
                            <a 
                              href={url.internal_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="link-btn internal"
                              title="容器内访问"
                            >
                              <i className="fas fa-external-link-alt"></i>
                              访问
                            </a>
                            {url.external_url && (
                              <a 
                                href={url.external_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="link-btn external"
                                title="外部访问"
                              >
                                <i className="fas fa-globe"></i>
                                外部
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 资源使用情况 */}
      {workspace.status === 'running' && stats && (
        <div className="stats-section">
          <div className="stats-section-title">
            <i className="fas fa-chart-line"></i>
            <span>资源使用</span>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">CPU使用率</div>
              <div className="stat-value">{stats.cpu_usage?.toFixed(1) || '0'}%</div>
              <div className="progress-bar">
                <div 
                  className="progress-fill cpu" 
                  style={{ width: `${Math.min(stats.cpu_usage || 0, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">内存使用率</div>
              <div className="stat-value">{stats.memory_usage?.toFixed(1) || '0'}%</div>
              <div className="progress-bar">
                <div 
                  className="progress-fill memory" 
                  style={{ width: `${Math.min(stats.memory_usage || 0, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">内存使用</div>
              <div className="stat-value">
                {stats.memory_used ? `${(stats.memory_used / 1024 / 1024).toFixed(0)}MB` : '0MB'}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">内存限制</div>
              <div className="stat-value">
                {stats.memory_limit ? `${(stats.memory_limit / 1024 / 1024).toFixed(0)}MB` : '512MB'}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-indicator">
          <i className="fas fa-spinner fa-spin"></i>
          <span>更新中...</span>
        </div>
      )}
    </div>
  );
};

export default StatsPanel; 