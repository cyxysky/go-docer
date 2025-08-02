import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNotification } from './NotificationProvider';
import { getStatusText } from '../utils';
import { workspaceAPI, imageAPI } from '../services/api';
import './WorkspacePanel.css';

const WorkspacePanel: React.FC = () => {
  const { 
    workspaces, 
          currentWorkspace, 
 
    selectWorkspace, 
    startWorkspace, 
    stopWorkspace, 
    deleteWorkspace,
    loadWorkspaces
  } = useWorkspace();
  const { showSuccess, showError } = useNotification();

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [availableImages, setAvailableImages] = useState<any[]>([]);
  const [dockerImages, setDockerImages] = useState<any[]>([]);
  const [environmentTemplates, setEnvironmentTemplates] = useState<any>({});
  const [customEnvironment, setCustomEnvironment] = useState<{[key: string]: string}>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [selectedWorkspaceForPort, setSelectedWorkspaceForPort] = useState<any>(null);
  const [portBindings, setPortBindings] = useState<Array<{containerPort: string, hostPort: string, protocol: string}>>([]);
  
  // 删除确认弹窗
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedWorkspaceForDelete, setSelectedWorkspaceForDelete] = useState<any>(null);
  const [deletingWorkspaces, setDeletingWorkspaces] = useState<Set<string>>(new Set());
  
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
    loadDockerImages();
    // 移除自动加载镜像配置，改为在打开创建弹窗时加载
  }, [loadWorkspaces]);

  // 加载Docker镜像列表
  const loadDockerImages = async () => {
    try {
      const response = await imageAPI.getImages();
      setDockerImages(response);
      // 如果还没有选择镜像，设置为第一个可用镜像
      if (response.length > 0 && !image) {
        const firstImage = response[0];
        const imageName = firstImage.tags && firstImage.tags.length > 0 
          ? firstImage.tags[0] 
          : firstImage.id;
        setImage(imageName);
      }
    } catch (error) {
      console.error('加载Docker镜像失败:', error);
    }
  };

  // 加载可用镜像配置（用于环境变量模板）
  const loadAvailableImages = async () => {
    try {
      const response = await workspaceAPI.getAvailableImages();
      setAvailableImages(response);
      
      // 如果还没有选择镜像，设置为第一个可用镜像
      if (response.length > 0 && !image) {
        const firstImage = response[0];
        setImage(firstImage.name);
        
        // 设置环境变量
        if (firstImage.environment) {
          setCustomEnvironment({ ...firstImage.environment });
        }
      }
    } catch (error) {
      console.error('加载可用镜像配置失败:', error);
    }
  };

  // 加载环境变量模板
  const loadEnvironmentTemplates = async () => {
    try {
      const templates = await workspaceAPI.getEnvironmentTemplates();
      setEnvironmentTemplates(templates);
    } catch (error) {
      console.error('加载环境变量模板失败:', error);
    }
  };

  // 处理镜像选择变化
  const handleImageChange = (selectedImage: string) => {
    setImage(selectedImage);
    
    // 根据选择的镜像填充环境变量
    const selectedImageConfig = availableImages.find(img => img.name === selectedImage);
    if (selectedImageConfig && selectedImageConfig.environment) {
      setCustomEnvironment({ ...selectedImageConfig.environment });
    } else {
      // 如果没有找到配置，设置默认环境变量
      setCustomEnvironment({
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "TERM": "xterm-256color",
        "HOME": "/root",
        "USER": "root",
        "SHELL": "/bin/bash",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "DEBIAN_FRONTEND": "noninteractive",
        "TZ": "Asia/Shanghai",
      });
    }
  };

  // 处理环境变量变化
  const handleEnvironmentChange = (key: string, value: string) => {
    setCustomEnvironment(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 添加环境变量 - 添加到最前面
  const addEnvironmentVariable = () => {
    const newKey = `NEW_VAR_${Date.now()}`;
    setCustomEnvironment(prev => ({
      [newKey]: '',
      ...prev
    }));
  };

  // 删除环境变量
  const removeEnvironmentVariable = (key: string) => {
    setCustomEnvironment(prev => {
      const newEnv = { ...prev };
      delete newEnv[key];
      return newEnv;
    });
  };

  

  // 处理打开创建弹窗
  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    // 在打开弹窗时加载镜像列表
    loadAvailableImages();
    loadEnvironmentTemplates();
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      // 获取选中的工具列表
      const tools = (Object.keys(selectedTools) as ToolKey[]).filter(tool => selectedTools[tool]);
      
      // 准备创建数据，包含环境变量
      const createData = {
        name,
        image,
        git_repo: gitRepo,
        git_branch: gitBranch,
        tools,
        ports: createPortBindings,
        environment: customEnvironment
      };
      
      await workspaceAPI.createWorkspace(createData);
      
      // 重置表单状态
      setName('');
      setGitRepo('');
      setGitBranch('main');
      setCustomEnvironment({});
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
      
      // 重新加载工作空间列表
      await loadWorkspaces();
      showSuccess('创建成功', '工作空间创建成功！');
    } catch (error) {
      console.error('创建工作空间失败:', error);
      showError('创建失败', '创建工作空间失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadWorkspaces(),
        loadDockerImages(),
        loadAvailableImages()
      ]);
      showSuccess('刷新成功', '工作空间列表刷新成功！');
    } catch (error) {
      console.error('刷新失败:', error);
      showError('刷新失败', '刷新工作空间列表失败');
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
      showSuccess('保存成功', '端口配置保存成功！');
    } catch (error) {
      console.error('保存端口配置失败:', error);
      showError('保存失败', '保存端口配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = async (workspaceId: string) => {
    try {
      await workspaceAPI.toggleFavorite(workspaceId);
      await loadWorkspaces(); // 重新加载工作空间列表
      showSuccess('操作成功', '收藏状态已更新！');
    } catch (error) {
      console.error('切换收藏状态失败:', error);
      showError('操作失败', '操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };



  // 处理删除工作空间确认
  const handleDeleteConfirm = (workspace: any) => {
    setSelectedWorkspaceForDelete(workspace);
    setShowDeleteModal(true);
  };

  // 执行删除工作空间
  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspaceForDelete) return;
    
    const workspaceId = selectedWorkspaceForDelete.id;
    
    try {
      // 添加到删除中状态
      setDeletingWorkspaces(prev => new Set(prev).add(workspaceId));
      
      await deleteWorkspace(workspaceId);
      
      // 删除成功后关闭弹窗
      setShowDeleteModal(false);
      setSelectedWorkspaceForDelete(null);
      showSuccess('删除成功', '工作空间删除成功！');
    } catch (error) {
      console.error('删除工作空间失败:', error);
      showError('删除失败', '删除工作空间失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      // 移除删除中状态
      setDeletingWorkspaces(prev => {
        const newSet = new Set(prev);
        newSet.delete(workspaceId);
        return newSet;
      });
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
          className="btn special-button" 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          title="刷新工作空间列表"
        >
          <i className={`fas ${isRefreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
        </button>
        <button className="btn special-button" onClick={handleOpenCreateModal} title="创建工作空间">
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
                    className={`btn action-button-green special-button ${workspace.is_favorite ? 'favorited' : ''}`} 
                    onClick={() => handleToggleFavorite(workspace.id)} 
                    title={workspace.is_favorite ? "取消收藏" : "收藏工作空间"}
                  >
                    <i className={workspace.is_favorite ? 'fas fa-star' : 'far fa-star'}></i>
                  </button>
                  <button className="btn action-button-blue special-button" onClick={() => selectWorkspace(workspace.id)} title="选择工作空间">
                    <i className="fas fa-folder-open"></i>
                  </button>
                  <button className="btn action-button-blue special-button" onClick={() => handleOpenPortConfig(workspace)} title="端口配置">
                    <i className="fas fa-network-wired"></i>
                  </button>
                  {workspace.status !== 'running' ? (
                    <button className="btn action-button-green special-button" onClick={() => startWorkspace(workspace.id)} title="启动工作空间">
                      <i className="fas fa-play"></i>
                    </button>
                  ) : (
                    <button className="btn action-button-warning special-button" onClick={() => stopWorkspace(workspace.id)} title="停止工作空间">
                      <i className="fas fa-stop"></i>
                    </button>
                  )}
                  <button 
                    className="btn action-button-red special-button" 
                    onClick={() => handleDeleteConfirm(workspace)} 
                    title="删除工作空间"
                    disabled={deletingWorkspaces.has(workspace.id)}
                  >
                    {deletingWorkspaces.has(workspace.id) ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-trash"></i>
                    )}
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
                <select className="form-control" value={image} onChange={(e) => handleImageChange(e.target.value)}>
                  <option value="">请选择镜像</option>
                  {dockerImages.map((img: any) => {
                    const imageName = img.tags && img.tags.length > 0 ? img.tags[0] : img.id;
                    const displayName = img.tags && img.tags.length > 0 
                      ? img.tags[0] 
                      : `<未标记>:${img.id.substring(0, 12)}`;
                    return (
                      <option key={img.id} value={imageName}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
                <small>选择Docker中已存在的镜像</small>
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

              {/* 环境变量配置 */}
              <div className="form-group">
                <div className="config-section">
                  <div className="section-header">
                    <h4>环境变量配置 (可选)</h4>
                    <button type="button" className="btn btn-small" onClick={addEnvironmentVariable}>
                      <i className="fas fa-plus"></i> 添加变量
                    </button>
                  </div>
                  
                  {Object.keys(customEnvironment).length === 0 ? (
                    <div className="empty-state">
                      <p>暂无环境变量</p>
                      <small>选择镜像后会自动填充默认环境变量，您也可以手动添加</small>
                    </div>
                  ) : (
                    <div className="config-list">
                      {Object.entries(customEnvironment).map(([key, value]) => (
                        <div key={key} className="config-item">
                          <input
                            type="text"
                            placeholder="变量名"
                            value={key}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              const newEnv = { ...customEnvironment };
                              delete newEnv[key];
                              newEnv[newKey] = value;
                              setCustomEnvironment(newEnv);
                            }}
                            className="form-control config-field field-key"
                          />
                          <span className="config-separator">=</span>
                          <input
                            type="text"
                            placeholder="变量值"
                            value={value}
                            onChange={(e) => handleEnvironmentChange(key, e.target.value)}
                            className="form-control config-field field-value"
                          />
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => removeEnvironmentVariable(key)}
                            title="删除环境变量"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="info-section">
                    <h5>常用环境变量模板</h5>
                    <div className="template-buttons">
                      {Object.entries(environmentTemplates).map(([name, template]: [string, any]) => (
                        <button
                          key={name}
                          type="button"
                          className="btn"
                          onClick={() => setCustomEnvironment(prev => ({ ...prev, ...template }))}
                          title={`应用 ${name} 环境变量模板`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 端口配置 */}
              <div className="form-group">
                <div className="config-section">
                  <div className="section-header">
                    <h4>端口配置 (可选)</h4>
                    <button type="button" className="btn btn-small" onClick={handleCreateAddPortBinding}>
                      <i className="fas fa-plus"></i> 添加端口
                    </button>
                  </div>
                  
                  {createPortBindings.length === 0 ? (
                    <div className="empty-state">
                      <p>暂无端口绑定</p>
                    </div>
                  ) : (
                    <div className="config-list">
                      {createPortBindings.map((binding, index) => (
                        <div key={index} className="config-item port-config-item">
                          <input
                            type="text"
                            placeholder="容器端口"
                            value={binding.containerPort}
                            onChange={(e) => handleCreatePortBindingChange(index, 'containerPort', e.target.value)}
                            className="form-control config-field field-key"
                            title="容器端口"
                          />
                          <span className="config-separator">→</span>
                          <input
                            type="text"
                            placeholder="宿主机端口 (留空自动分配)"
                            value={binding.hostPort}
                            onChange={(e) => handleCreatePortBindingChange(index, 'hostPort', e.target.value)}
                            className="form-control config-field field-value"
                            title="宿主机端口"
                          />
                          <select
                            value={binding.protocol}
                            onChange={(e) => handleCreatePortBindingChange(index, 'protocol', e.target.value)}
                            className="form-control config-field"
                            title="协议"
                          >
                            <option value="tcp">TCP</option>
                            <option value="udp">UDP</option>
                          </select>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleCreateRemovePortBinding(index)}
                            title="删除端口绑定"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
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
              <div className="config-section">
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
                  <div className="config-list">
                    {portBindings.map((binding, index) => (
                      <div key={index} className="config-item port-config-item">
                        <input
                          type="text"
                          placeholder="容器端口"
                          value={binding.containerPort}
                          onChange={(e) => handlePortBindingChange(index, 'containerPort', e.target.value)}
                          className="form-control config-field field-key"
                          title="容器端口"
                        />
                        <span className="config-separator">→</span>
                        <input
                          type="text"
                          placeholder="宿主机端口 (留空自动分配)"
                          value={binding.hostPort}
                          onChange={(e) => handlePortBindingChange(index, 'hostPort', e.target.value)}
                          className="form-control config-field field-value"
                          title="宿主机端口"
                        />
                        <select
                          value={binding.protocol}
                          onChange={(e) => handlePortBindingChange(index, 'protocol', e.target.value)}
                          className="form-control config-field"
                          title="协议"
                        >
                          <option value="tcp">TCP</option>
                          <option value="udp">UDP</option>
                        </select>
                        <button
                          className="delete-button"
                          onClick={() => handleRemovePortBinding(index)}
                          title="删除端口绑定"
                        >
                          <i className="fas fa-times"></i>
                        </button>
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

      {/* 删除确认弹窗 */}
      {showDeleteModal && selectedWorkspaceForDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除工作空间</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="confirm-content">
                <div className="confirm-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="confirm-text">
                  <p>您确定要删除工作空间 <strong>"{selectedWorkspaceForDelete.display_name}"</strong> 吗？</p>
                  <p className="warning-text">此操作将会：</p>
                  <ul className="warning-list">
                    <li>删除容器及其所有运行数据</li>
                    <li>删除工作空间内的所有文件</li>
                    <li>释放所占用的端口资源</li>
                    <li><strong>此操作不可恢复</strong></li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingWorkspaces.has(selectedWorkspaceForDelete.id)}
              >
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDeleteWorkspace}
                disabled={deletingWorkspaces.has(selectedWorkspaceForDelete.id)}
              >
                {deletingWorkspaces.has(selectedWorkspaceForDelete.id) ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    删除中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash"></i>
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

             
    </>
  );
};

export default WorkspacePanel; 