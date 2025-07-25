import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getStatusText } from '../utils';
import { workspaceAPI } from '../services/api';
import './WorkspacePanel.css';

const WorkspacePanel: React.FC = () => {
  const { 
    workspaces, 
          currentWorkspace, 
    createWorkspace, 
    selectWorkspace, 
    startWorkspace, 
    stopWorkspace, 
    deleteWorkspace,
    loadWorkspaces
  } = useWorkspace();

  const [name, setName] = useState('');
  const [image, setImage] = useState('node:18-slim');
  const [gitRepo, setGitRepo] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [selectedWorkspaceForPort, setSelectedWorkspaceForPort] = useState<any>(null);
  const [portBindings, setPortBindings] = useState<Array<{containerPort: string, hostPort: string, protocol: string}>>([]);
  
  // 创建工作空间时的端口绑定配置
  const [createPortBindings, setCreatePortBindings] = useState<Array<{containerPort: string, hostPort: string, protocol: string}>>([]);
  
  // 搜索和排序
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'name' | 'status'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // 定义工具类型
  type ToolKey = 'git' | 'curl' | 'wget' | 'vim' | 'nano' | 'tree' | 'htop' | 'jq' | 'zip' | 'unzip';
  
  // 基础工具选择状态
  const [selectedTools, setSelectedTools] = useState<Record<ToolKey, boolean>>({
    git: true,
    curl: true,
    wget: true,
    vim: true,
    nano: false,
    tree: false,
    htop: false,
    jq: false,
    zip: false,
    unzip: false
  });

  // 可选择的基础工具列表
  const availableTools: Array<{ key: ToolKey; name: string; description: string }> = [
    { key: 'git', name: 'Git', description: 'Git 版本控制工具' },
    { key: 'curl', name: 'cURL', description: 'HTTP 客户端工具' },
    { key: 'wget', name: 'Wget', description: '文件下载工具' },
    { key: 'vim', name: 'Vim', description: 'Vim 编辑器' },
    { key: 'nano', name: 'Nano', description: 'Nano 编辑器' },
    { key: 'tree', name: 'Tree', description: '目录树显示工具' },
    { key: 'htop', name: 'Htop', description: '交互式进程查看器' },
    { key: 'jq', name: 'jq', description: 'JSON 处理工具' },
    { key: 'zip', name: 'Zip', description: '压缩工具' },
    { key: 'unzip', name: 'Unzip', description: '解压工具' }
  ];


  // 初始加载工作空间
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      // 获取选中的工具列表
      const tools = (Object.keys(selectedTools) as ToolKey[]).filter(tool => selectedTools[tool]);
      
      await createWorkspace(name, image, gitRepo, gitBranch, tools, createPortBindings);
      setName('');
      setGitRepo('');
      setGitBranch('main');
      // 重置工具选择为默认值
      setSelectedTools({
        git: true,
        curl: true,
        wget: true,
        vim: true,
        nano: false,
        tree: false,
        htop: false,
        jq: false,
        zip: false,
        unzip: false
      });
      // 重置端口配置
      setCreatePortBindings([]);
      setShowCreateModal(false);
    } catch (error) {
      console.error('创建工作空间失败:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadWorkspaces();
    } catch (error) {
      console.error('刷新工作空间失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 处理工具选择变化
  const handleToolToggle = (toolKey: ToolKey) => {
    setSelectedTools(prev => ({
      ...prev,
      [toolKey]: !prev[toolKey]
    }));
  };

  // 创建工作空间时的端口配置处理函数
  const handleCreateAddPortBinding = () => {
    setCreatePortBindings(prev => [...prev, { containerPort: '', hostPort: '', protocol: 'tcp' }]);
  };

  const handleCreateRemovePortBinding = (index: number) => {
    setCreatePortBindings(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreatePortBindingChange = (index: number, field: string, value: string) => {
    setCreatePortBindings(prev => prev.map((binding, i) => 
      i === index ? { ...binding, [field]: value } : binding
    ));
  };

  // 打开端口配置弹窗
  const handleOpenPortConfig = (workspace: any) => {
    setSelectedWorkspaceForPort(workspace);
    // 初始化端口绑定数据
    if (workspace.ports && workspace.ports.length > 0) {
      setPortBindings(workspace.ports.map((port: any) => ({
        containerPort: port.container_port,
        hostPort: port.host_port || '',
        protocol: port.protocol || 'tcp'
      })));
    } else {
      // 默认添加一些常用端口
      setPortBindings([
        { containerPort: '3000', hostPort: '', protocol: 'tcp' },
        { containerPort: '8000', hostPort: '', protocol: 'tcp' },
        { containerPort: '8080', hostPort: '', protocol: 'tcp' }
      ]);
    }
    setShowPortModal(true);
  };

  // 添加端口绑定
  const handleAddPortBinding = () => {
    setPortBindings(prev => [...prev, { containerPort: '', hostPort: '', protocol: 'tcp' }]);
  };

  // 删除端口绑定
  const handleRemovePortBinding = (index: number) => {
    setPortBindings(prev => prev.filter((_, i) => i !== index));
  };

  // 更新端口绑定
  const handlePortBindingChange = (index: number, field: string, value: string) => {
    setPortBindings(prev => prev.map((binding, i) => 
      i === index ? { ...binding, [field]: value } : binding
    ));
  };

  // 保存端口配置
  const handleSavePortConfig = async () => {
    if (!selectedWorkspaceForPort) return;
    
    try {
      await workspaceAPI.updatePortBindings(selectedWorkspaceForPort.id, portBindings);
      console.log('端口配置保存成功');
      setShowPortModal(false);
      setSelectedWorkspaceForPort(null);
      await loadWorkspaces(); // 重新加载工作空间列表
    } catch (error) {
      console.error('保存端口配置失败:', error);
      alert('保存端口配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = async (workspaceId: string) => {
    try {
      await workspaceAPI.toggleFavorite(workspaceId);
      await loadWorkspaces(); // 重新加载工作空间列表
    } catch (error) {
      console.error('切换收藏状态失败:', error);
      alert('操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 测试端口
  const handleTestPort = async (port: string) => {
    if (!selectedWorkspaceForPort) return;
    
    try {
      const result = await workspaceAPI.testPort(selectedWorkspaceForPort.id, port);
      alert(`端口测试已启动!\n\n${result.message}\n\n测试URL: ${result.test_url}\n\n${result.note}`);
    } catch (error) {
      console.error('端口测试失败:', error);
      alert('端口测试失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 过滤和排序工作空间
  const filteredAndSortedWorkspaces = React.useMemo(() => {
    if (!workspaces) return [];

    // 搜索过滤
    let filtered = workspaces.filter((workspace: any) => {
      const query = searchQuery.toLowerCase();
      return (
        workspace.name.toLowerCase().includes(query) ||
        workspace.image.toLowerCase().includes(query) ||
        workspace.status.toLowerCase().includes(query) ||
        workspace.id.toLowerCase().includes(query)
      );
    });

    // 排序：收藏的工作空间始终排在前面
    filtered.sort((a: any, b: any) => {
      // 首先按收藏状态排序
      if (a.is_favorite !== b.is_favorite) {
        return b.is_favorite ? 1 : -1;
      }

      // 然后按指定字段排序
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'created':
        default:
          aValue = new Date(a.created).getTime();
          bValue = new Date(b.created).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [workspaces, searchQuery, sortBy, sortOrder]);

  return (
    <>
      {/* 工具栏 */}
      <div className="workspace-toolbar">
        <div className="toolbar-left">
        <button 
          className="btn" 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          title="刷新工作空间列表"
        >
          <i className={`fas ${isRefreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
        </button>
        <button className="btn" onClick={() => setShowCreateModal(true)} title="创建工作空间">
          <i className="fas fa-plus"></i>
        </button>
        </div>
        
        <div className="toolbar-right">
          <select 
            value={`${sortBy}-${sortOrder}`} 
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field as 'created' | 'name' | 'status');
              setSortOrder(order as 'asc' | 'desc');
            }}
            className="sort-select"
            title="排序方式"
          >
            <option value="created-desc">创建时间(新→旧)</option>
            <option value="created-asc">创建时间(旧→新)</option>
            <option value="name-asc">名称(A→Z)</option>
            <option value="name-desc">名称(Z→A)</option>
            <option value="status-asc">状态</option>
          </select>
        </div>
      </div>

      <div className="workspace-search">
        <div className="toolbar-center">
            <div className="search-box">
              <i className="fas fa-search search-icon"></i>
              <input
                type="text"
                placeholder="搜索工作空间..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
      </div>

      {/* 工作空间列表 */}
      <div className="workspace-list">
        <div className="workspace-list-content">
          {!workspaces || workspaces.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', color: '#969696'}}>
              <i className="fas fa-folder-open" style={{fontSize: '2rem', marginBottom: '8px'}}></i>
              <div>暂无工作空间</div>
              <div style={{fontSize: '11px', marginTop: '4px'}}>点击上方加号创建您的第一个工作空间</div>
            </div>
          ) : filteredAndSortedWorkspaces.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', color: '#969696'}}>
              <i className="fas fa-search" style={{fontSize: '2rem', marginBottom: '8px'}}></i>
              <div>没有找到匹配的工作空间</div>
              <div style={{fontSize: '11px', marginTop: '4px'}}>请尝试其他搜索关键词</div>
            </div>
          ) : (
            filteredAndSortedWorkspaces.map((workspace: any) => (
              <div 
                key={workspace.id}
                className={`workspace-item ${currentWorkspace === workspace.id ? 'active' : ''} ${workspace.is_favorite ? 'favorite' : ''}`}
              >
                <div className="workspace-name">
                  <i className="fas fa-cube"></i>
                  {workspace.display_name}
                </div>
                <div className="workspace-details">
                  <span className="workspace-image">{workspace.image}</span>
                  <span className={`workspace-status ${workspace.status}`}>
                    {getStatusText(workspace.status)}
                  </span>
                  {workspace.ports && workspace.ports.length > 0 && workspace.status === 'running' && (
                    <div className="workspace-ports">
                      {workspace.ports.filter((port: any) => port.host_port).map((port: any, index: number) => (
                        <a 
                          key={index}
                          href={`http://localhost:${port.host_port}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="port-link"
                          title={`容器端口 ${port.container_port} → 宿主机端口 ${port.host_port}`}
                        >
                          {port.host_port}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="workspace-actions">
                  <button 
                    className={`btn favorite-btn ${workspace.is_favorite ? 'favorited' : ''}`} 
                    onClick={() => handleToggleFavorite(workspace.id)} 
                    title={workspace.is_favorite ? "取消收藏" : "收藏工作空间"}
                  >
                    <i className={workspace.is_favorite ? 'fas fa-star' : 'far fa-star'}></i>
                  </button>
                  <button className="btn" onClick={() => selectWorkspace(workspace.id)} title="选择工作空间">
                    <i className="fas fa-folder-open"></i>
                  </button>
                  {workspace.status !== 'running' ? (
                    <button className="btn" onClick={() => startWorkspace(workspace.id)} title="启动工作空间">
                      <i className="fas fa-play"></i>
                    </button>
                  ) : (
                    <button className="btn" onClick={() => stopWorkspace(workspace.id)} title="停止工作空间">
                      <i className="fas fa-stop"></i>
                    </button>
                  )}
                  <button className="btn" onClick={() => handleOpenPortConfig(workspace)} title="端口配置">
                    <i className="fas fa-network-wired"></i>
                  </button>
                  <button className="btn" onClick={() => deleteWorkspace(workspace.id)} title="删除工作空间">
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 创建工作空间弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建工作空间</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">名称</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="输入工作空间名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">开发环境</label>
                <select className="form-control" value={image} onChange={(e) => setImage(e.target.value)}>
                  <option value="node:18-slim">Node.js 18 (Debian Slim)</option>
                  <option value="python:3.11-slim">Python 3.11 (Debian Slim)</option>
                  <option value="golang:1.24-slim">Go 1.24 (Debian Slim)</option>
                  <option value="openjdk:17-slim">Java 17 (Debian Slim)</option>
                  <option value="php:8.2-cli-slim">PHP 8.2 CLI (Debian Slim)</option>
                  <option value="ruby:3.2-slim">Ruby 3.2 (Debian Slim)</option>
                </select>
              </div>
              
              {/* 基础工具选择 */}
              <div className="form-group">
                <label className="form-label">基础工具选择</label>
                <div className="tools-selection">
                  {availableTools.map(tool => (
                    <div key={tool.key} className="tool-item">
                      <label className="tool-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedTools[tool.key] || false}
                          onChange={() => handleToolToggle(tool.key)}
                        />
                        <span className="checkmark"></span>
                        <div className="tool-info">
                          <span className="tool-name">{tool.name}</span>
                          <span className="tool-description">{tool.description}</span>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="tools-info">
                  <small>💡 默认推荐选择：Git、cURL、Wget、Vim</small>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Git 仓库 (可选)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="https://github.com/user/repo.git"
                  value={gitRepo}
                  onChange={(e) => setGitRepo(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">分支</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="main" 
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                />
              </div>

              {/* 端口配置 */}
              <div className="form-group">
                <div className="port-bindings-section">
                  <div className="section-header">
                    <h4>端口配置 (可选)</h4>
                    <button type="button" className="btn btn-small" onClick={handleCreateAddPortBinding}>
                      <i className="fas fa-plus"></i> 添加端口
                    </button>
                  </div>
                  
                  {createPortBindings.length === 0 ? (
                    <div className="empty-state">
                      <p>暂无端口绑定</p>
                      <button type="button" className="btn btn-primary" onClick={handleCreateAddPortBinding}>
                        添加第一个端口绑定
                      </button>
                    </div>
                  ) : (
                    <div className="port-bindings-list">
                      {createPortBindings.map((binding, index) => (
                        <div key={index} className="port-binding-item">
                          <div className="port-binding-fields">
                            <div className="field-group">
                              <label>容器端口</label>
                              <input
                                type="text"
                                placeholder="3000"
                                value={binding.containerPort}
                                onChange={(e) => handleCreatePortBindingChange(index, 'containerPort', e.target.value)}
                                className="form-control"
                              />
                            </div>
                            <div className="field-group">
                              <label>宿主机端口</label>
                              <input
                                type="text"
                                placeholder="3000 (留空自动分配)"
                                value={binding.hostPort}
                                onChange={(e) => handleCreatePortBindingChange(index, 'hostPort', e.target.value)}
                                className="form-control"
                              />
                            </div>
                            <div className="field-group">
                              <label>协议</label>
                              <select
                                value={binding.protocol}
                                onChange={(e) => handleCreatePortBindingChange(index, 'protocol', e.target.value)}
                                className="form-control"
                              >
                                <option value="tcp">TCP</option>
                                <option value="udp">UDP</option>
                              </select>
                            </div>
                            <div className="field-group">
                              <button
                                type="button"
                                className="port-delete-button"
                                onClick={() => handleCreateRemovePortBinding(index)}
                                title="删除端口绑定"
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="port-info">
                    <h5>端口配置说明</h5>
                    <ul>
                      <li><code>容器端口</code>：应用在容器内监听的端口</li>
                      <li><code>宿主机端口</code>：外部访问的端口，留空则自动分配</li>
                      <li><code>协议</code>：网络协议，通常选择TCP</li>
                      <li>创建后可通过 <code>localhost:宿主机端口</code> 访问应用</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreate}>
                <i className="fas fa-rocket"></i> 创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 端口配置弹窗 */}
      {showPortModal && selectedWorkspaceForPort && (
        <div className="modal-overlay" onClick={() => setShowPortModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>端口配置 - {selectedWorkspaceForPort.name}</h3>
              <button className="modal-close" onClick={() => setShowPortModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="port-bindings-section">
                <div className="section-header">
                  <h4>端口绑定</h4>
                  <button className="btn btn-small" onClick={handleAddPortBinding}>
                    <i className="fas fa-plus"></i> 添加端口
                  </button>
                </div>
                
                {portBindings.length === 0 ? (
                  <div className="empty-state">
                    <p>暂无端口绑定</p>
                    <button className="btn btn-primary" onClick={handleAddPortBinding}>
                      添加第一个端口绑定
                    </button>
                  </div>
                ) : (
                  <div className="port-bindings-list">
                    {portBindings.map((binding, index) => (
                      <div key={index} className="port-binding-item">
                        <div className="port-binding-fields">
                          <div className="field-group">
                            <label>容器端口</label>
                            <input
                              type="text"
                              placeholder="3000"
                              value={binding.containerPort}
                              onChange={(e) => handlePortBindingChange(index, 'containerPort', e.target.value)}
                              className="form-control"
                            />
                          </div>
                          <div className="field-group">
                            <label>宿主机端口</label>
                            <input
                              type="text"
                              placeholder="3000 (留空自动分配)"
                              value={binding.hostPort}
                              onChange={(e) => handlePortBindingChange(index, 'hostPort', e.target.value)}
                              className="form-control"
                            />
                          </div>
                          <div className="field-group">
                            <label>协议</label>
                            <select
                              value={binding.protocol}
                              onChange={(e) => handlePortBindingChange(index, 'protocol', e.target.value)}
                              className="form-control"
                            >
                              <option value="tcp">TCP</option>
                              <option value="udp">UDP</option>
                            </select>
                          </div>
                          <div className="field-group">
                            <button
                              className="port-test-button"
                              onClick={() => handleTestPort(binding.containerPort)}
                              title="测试此端口"
                              disabled={!binding.hostPort}
                            >
                              <i className="fas fa-rocket"></i>
                            </button>
                            <button
                              className="port-delete-button"
                              onClick={() => handleRemovePortBinding(index)}
                              title="删除端口绑定"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPortModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSavePortConfig}>
                <i className="fas fa-save"></i> 保存配置
              </button>
            </div>
          </div>
        </div>
      )}

             
    </>
  );
};

export default WorkspacePanel; 