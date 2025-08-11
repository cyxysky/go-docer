import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface ContainerStats {
  cpu_usage?: number;
  memory_usage?: number;
  memory_used?: number;
  memory_limit?: number;
  network_rx?: number;
  network_tx?: number;
  disk_usage?: number;
}

interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  color?: string;
  icon?: string;
}

const StatsPanel: React.FC = () => {
  const { currentWorkspace, workspaces } = useWorkspace();
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30000);

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
    } catch (error) {
      console.error('获取统计信息失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, workspace]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchStats, refreshInterval]);

  // 计算统计项
  const statsItems = useMemo((): StatItem[] => {
    if (!stats) return [];

    return [
      {
        label: 'CPU使用率',
        value: stats.cpu_usage?.toFixed(1) || 0,
        unit: '%',
        color: stats.cpu_usage && stats.cpu_usage > 80 ? 'danger' : stats.cpu_usage && stats.cpu_usage > 60 ? 'warning' : 'success',
        icon: 'fas fa-microchip'
      },
      {
        label: '内存使用率',
        value: stats.memory_usage?.toFixed(1) || 0,
        unit: '%',
        color: stats.memory_usage && stats.memory_usage > 80 ? 'danger' : stats.memory_usage && stats.memory_usage > 60 ? 'warning' : 'success',
        icon: 'fas fa-memory'
      },
      {
        label: '内存使用',
        value: stats.memory_used ? (stats.memory_used / 1024 / 1024).toFixed(0) : 0,
        unit: 'MB',
        icon: 'fas fa-hdd'
      },
      {
        label: '内存限制',
        value: stats.memory_limit ? (stats.memory_limit / 1024 / 1024).toFixed(0) : 512,
        unit: 'MB',
        icon: 'fas fa-server'
      }
    ];
  }, [stats]);

  // 网络端口信息
  const networkItems = useMemo(() => {
    if (!networkInfo?.access_urls) return [];

    return networkInfo.access_urls.map((url, index) => ({
      id: index,
      port: url.port,
      protocol: url.protocol,
      internal: url.internal_url,
      external: url.external_url,
      status: url.status,
      icon: url.protocol === 'http' ? 'fas fa-globe' : 'fas fa-shield-alt'
    }));
  }, [networkInfo]);

  // 工作空间基本信息
  const workspaceInfo = useMemo(() => {
    if (!workspace) return [];

    return [
      {
        label: '名称',
        value: workspace.name,
        icon: 'fas fa-folder'
      },
      {
        label: '镜像',
        value: workspace.image,
        icon: 'fas fa-cube'
      },
      {
        label: '状态',
        value: workspace.status,
        color: workspace.status === 'running' ? 'success' : workspace.status === 'stopped' ? 'danger' : 'warning',
        icon: workspace.status === 'running' ? 'fas fa-play-circle' : workspace.status === 'stopped' ? 'fas fa-stop-circle' : 'fas fa-pause-circle'
      },
      {
        label: '创建时间',
        value: workspace.created ? new Date(workspace.created).toLocaleString() : '--',
        icon: 'fas fa-calendar'
      }
    ];
  }, [workspace]);

  const handleRefresh = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  const handleIntervalChange = useCallback((interval: number) => {
    setRefreshInterval(interval);
  }, []);

  // 空状态渲染
  if (!currentWorkspace || !workspace) {
    return (
      <div className="stats-panel">
        <div className="stats-empty">
          <i className="fas fa-chart-line"></i>
          <p>系统监控</p>
          <small>请先选择一个工作空间</small>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-panel">
      {/* 统计面板头部 */}
      <div className="stats-header">
        <div className="stats-title">
          <i className="fas fa-chart-line"></i>
          <span>系统监控</span>
        </div>
        <div className="stats-controls">
          <button 
            className="stats-refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading}
            title="刷新数据"
          >
            <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i>
          </button>
          <select 
            className="stats-interval-select"
            value={refreshInterval}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            title="刷新间隔"
          >
            <option value={2000}>2秒</option>
            <option value={5000}>5秒</option>
            <option value={10000}>10秒</option>
            <option value={30000}>30秒</option>
          </select>
        </div>
      </div>

      {/* 统计内容区域 */}
      <div className="stats-content">
        {/* 工作空间基本信息 */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <i className="fas fa-info-circle"></i>
              <span>工作空间信息</span>
            </div>
          </div>
          <div className="stats-grid">
            {workspaceInfo.map((item, index) => (
              <div key={index} className="stats-item">
                <div className="stats-item-icon">
                  <i className={item.icon}></i>
                </div>
                <div className="stats-item-content">
                  <div className="stats-label">{item.label}</div>
                  <div className={`stats-value ${item.color ? `text-${item.color}` : ''}`}>
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 资源使用情况 */}
        {workspace.status === 'running' && (
          <div className="stats-card">
            <div className="stats-card-header">
              <div className="stats-card-title">
                <i className="fas fa-chart-bar"></i>
                <span>资源使用</span>
              </div>
            </div>
            <div className="stats-grid">
              {statsItems.map((item, index) => (
                <div key={index} className="stats-item">
                  <div className="stats-item-icon">
                    <i className={item.icon}></i>
                  </div>
                  <div className="stats-item-content">
                    <div className="stats-label">{item.label}</div>
                    <div className={`stats-value ${item.color ? `text-${item.color}` : ''}`}>
                      {item.value}{item.unit}
                    </div>
                    {item.trend && (
                      <div className={`stats-trend ${item.trend}`}>
                        <i className={`fas fa-arrow-${item.trend === 'up' ? 'up' : item.trend === 'down' ? 'down' : 'right'}`}></i>
                        {item.trendValue && `${item.trendValue}%`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 网络端口信息 */}
        {networkItems.length > 0 && (
          <div className="stats-card">
            <div className="stats-card-header">
              <div className="stats-card-title">
                <i className="fas fa-network-wired"></i>
                <span>网络端口</span>
              </div>
            </div>
            <div className="stats-list">
              {networkItems.map((item) => (
                <div key={item.id} className="stats-list-item">
                  <div className="stats-list-icon">
                    <i className={item.icon}></i>
                  </div>
                  <div className="stats-list-content">
                    <div className="stats-list-title">
                      {item.protocol.toUpperCase()} - 端口 {item.port}
                    </div>
                    <div className="stats-list-subtitle">
                      {item.internal}
                      {item.external && ` → ${item.external}`}
                    </div>
                  </div>
                  <div className={`stats-list-value status-${item.status}`}>
                    <i className={`fas fa-circle`}></i>
                    <span>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && (
          <div className="stats-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <span>更新中...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel; 