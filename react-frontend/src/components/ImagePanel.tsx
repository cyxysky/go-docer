import React, { useState, useEffect } from 'react';
import { useImage } from '../contexts/ImageContext';
import { formatBytes } from '../utils';
import { imageAPI, workspaceAPI, registryAPI } from '../services/api';
import { useNotification } from './NotificationProvider';
import './ImagePanel.css';

const ImagePanel: React.FC = () => {
  const { images, loadImages, deleteImage } = useImage();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [showEditConfigModal, setShowEditConfigModal] = useState(false);
  const [showImageSearchModal, setShowImageSearchModal] = useState(false);
  const [showRegistryConfigModal, setShowRegistryConfigModal] = useState(false);
  const [showAddRegistryModal, setShowAddRegistryModal] = useState(false);
  const [showEditRegistryModal, setShowEditRegistryModal] = useState(false);
  const [editingRegistry, setEditingRegistry] = useState<any>(null);
  const [availableImages, setAvailableImages] = useState<any[]>([]);
  const [environmentTemplates, setEnvironmentTemplates] = useState<any>({});
  const [isAdding, setIsAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [registries, setRegistries] = useState<any[]>([]);
  const [selectedRegistry, setSelectedRegistry] = useState('dockerhub');
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importImageName, setImportImageName] = useState('');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<any>(null);
  const [showDeleteRegistryConfirmModal, setShowDeleteRegistryConfirmModal] = useState(false);
  const [registryToDelete, setRegistryToDelete] = useState<any>(null);
  
  // 自定义镜像表单状态
  const [customImageForm, setCustomImageForm] = useState({
    name: '',
    description: '',
    shell: '/bin/bash',
    environment: {} as {[key: string]: string}
  });

  // 编辑配置状态
  const [editingConfig, setEditingConfig] = useState<any>(null);

  // 镜像源表单状态
  const [registryForm, setRegistryForm] = useState({
    name: '',
    code: '',
    base_url: '',
    description: '',
    type: 'registry'
  });

  useEffect(() => {
    loadImages(); // 加载镜像列表
    loadAvailableImages();
    loadEnvironmentTemplates();
    loadRegistries();
  }, []);

  // 加载可用镜像配置
  const loadAvailableImages = async () => {
    try {
      const response = await workspaceAPI.getAvailableImages();
      setAvailableImages(response);
    } catch (error) {
      console.error('加载可用镜像失败:', error);
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

  // 加载镜像源列表
  const loadRegistries = async () => {
    try {
      const response = await registryAPI.getRegistries();
      setRegistries(response.registries || []);
    } catch (error) {
      console.error('加载镜像源失败:', error);
    }
  };

  // 处理环境变量变化
  const handleEnvironmentChange = (key: string, value: string) => {
    setCustomImageForm(prev => ({
      ...prev,
      environment: {
        ...prev.environment,
        [key]: value
      }
    }));
  };

  // 添加环境变量 - 添加到最前面
  const addEnvironmentVariable = () => {
    const newKey = `NEW_VAR_${Date.now()}`;
    setCustomImageForm(prev => ({
      ...prev,
      environment: {
        [newKey]: '',
        ...prev.environment
      }
    }));
  };

  // 删除环境变量
  const removeEnvironmentVariable = (key: string) => {
    setCustomImageForm(prev => {
      const newEnv = { ...prev.environment };
      delete newEnv[key];
      return {
        ...prev,
        environment: newEnv
      };
    });
  };

  // 应用环境变量模板
  const applyTemplate = (templateName: string) => {
    const template = environmentTemplates[templateName];
    if (template) {
      setCustomImageForm(prev => ({
        ...prev,
        environment: {
          ...prev.environment,
          ...template
        }
      }));
    }
  };

  // 提交自定义镜像
  const handleAddCustomImage = async () => {
    if (!customImageForm.name.trim()) {
      showError('输入错误', '请输入镜像名称');
      return;
    }

    setIsAdding(true);
    try {
      await imageAPI.addCustomImage(customImageForm);
      
      // 重置表单
      setCustomImageForm({
        name: '',
        description: '',
        shell: '/bin/bash',
        environment: {}
      });
      
      setShowAddCustomModal(false);
      
      // 重新加载镜像列表
      await loadImages();
      await loadAvailableImages();
      showSuccess('添加成功', '自定义镜像添加成功！');
    } catch (error) {
      console.error('添加自定义镜像失败:', error);
      showError('添加失败', '添加自定义镜像失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsAdding(false);
    }
  };

  // 编辑镜像配置
  const handleEditImageConfig = (config: any) => {
    setEditingConfig({ ...config });
    setCustomImageForm({
      name: config.name,
      description: config.description || '',
      shell: config.shell || '/bin/bash',
      environment: { ...config.environment }
    });
    setShowEditConfigModal(true);
  };

  // 删除镜像配置
  const handleDeleteImageConfig = async (imageName: string) => {
    try {
      await imageAPI.deleteCustomImage(imageName);
      await loadAvailableImages();
      showSuccess('删除成功', '配置删除成功！');
    } catch (error) {
      console.error('删除配置失败:', error);
      showError('删除失败', '删除配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 切换镜像源状态
  const toggleRegistryStatus = async (code: string, enabled: boolean) => {
    try {
      await registryAPI.toggleRegistry(code, enabled);
      await loadRegistries(); // 重新加载镜像源列表
      showSuccess('操作成功', `镜像源${enabled ? '启用' : '禁用'}成功！`);
    } catch (error) {
      console.error('切换镜像源状态失败:', error);
      showError('操作失败', '操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 添加镜像源
  const handleAddRegistry = async () => {
    if (!registryForm.name.trim() || !registryForm.code.trim() || !registryForm.base_url.trim()) {
      showError('输入错误', '请填写名称、代码和基础URL');
      return;
    }

    try {
      await registryAPI.addRegistry(registryForm);
      
      // 重置表单
      setRegistryForm({
        name: '',
        code: '',
        base_url: '',
        description: '',
        type: 'registry'
      });
      
      setShowAddRegistryModal(false);
      await loadRegistries();
      showSuccess('添加成功', '镜像源添加成功！');
    } catch (error) {
      console.error('添加镜像源失败:', error);
      showError('添加失败', '添加失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 编辑镜像源
  const handleEditRegistry = (registry: any) => {
    setEditingRegistry(registry);
    setRegistryForm({
      name: registry.name,
      code: registry.code,
      base_url: registry.base_url || '',
      description: registry.description || '',
      type: registry.type || 'registry'
    });
    setShowEditRegistryModal(true);
  };

  // 更新镜像源
  const handleUpdateRegistry = async () => {
    if (!registryForm.name.trim() || !registryForm.base_url.trim()) {
      showError('输入错误', '请填写名称和基础URL');
      return;
    }

    try {
      await registryAPI.updateRegistry(editingRegistry.code, {
        name: registryForm.name,
        base_url: registryForm.base_url,
        description: registryForm.description,
        type: registryForm.type
      });
      
      setShowEditRegistryModal(false);
      setEditingRegistry(null);
      await loadRegistries();
      showSuccess('更新成功', '镜像源更新成功！');
    } catch (error) {
      console.error('更新镜像源失败:', error);
      showError('更新失败', '更新失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 确认删除镜像源
  const confirmDeleteRegistry = (registry: any) => {
    if (registry.is_default) {
      showWarning('操作受限', '默认镜像源不能删除');
      return;
    }
    setRegistryToDelete(registry);
    setShowDeleteRegistryConfirmModal(true);
  };

  // 执行删除镜像源
  const executeDeleteRegistry = async () => {
    if (!registryToDelete) return;
    
    try {
      await registryAPI.deleteRegistry(registryToDelete.code);
      await loadRegistries();
      showSuccess('删除成功', '镜像源删除成功！');
    } catch (error) {
      console.error('删除镜像源失败:', error);
      showError('删除失败', '删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setShowDeleteRegistryConfirmModal(false);
      setRegistryToDelete(null);
    }
  };

  // 搜索Docker镜像
  const searchDockerImages = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsSearching(true);
    try {
      // 调用镜像搜索API，使用选定的镜像源
      const response = await imageAPI.searchDockerHub(searchQuery, 25, selectedRegistry);
      
      // 转换为前端需要的格式
      const results = response.results.map((result: any) => ({
        name: result.name,
        description: result.description || '无描述',
        stars: result.star_count || 0,
        official: result.is_official || false,
        automated: result.is_automated || false,
        pulls: result.pull_count || 0
      }));
      
      setSearchResults(results);
      
      // 如果没有搜索结果，提示用户
      if (results.length === 0) {
      }
    } catch (error) {
      console.error('搜索镜像失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 检查文件类型
      if (!file.name.endsWith('.tar') && !file.name.endsWith('.tar.gz')) {
        showError('文件格式错误', '只支持 .tar 和 .tar.gz 格式的文件');
        return;
      }
      setImportFile(file);
    }
  };

  // 导入镜像
  const handleImportImage = async () => {
    if (!importFile) {
      showError('文件错误', '请选择要导入的镜像文件');
      return;
    }

    if (!importImageName.trim()) {
      showError('输入错误', '请输入镜像名称');
      return;
    }

    setIsImporting(true);
    try {
      const response = await imageAPI.importImage(importFile, importImageName);
      
      if (response.success) {
        // 显示导入任务已开始的消息
        showInfo('导入开始', `镜像导入任务已开始！任务ID: ${response.import_id}`);
        setShowImportModal(false);
        setImportFile(null);
        setImportImageName('');
        
        // 开始轮询导入状态
        pollImportStatus(response.import_id);
      } else {
        showError('导入失败', '镜像导入失败: ' + response.message);
      }
    } catch (error) {
      console.error('导入镜像失败:', error);
      showError('导入失败', '导入镜像失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsImporting(false);
    }
  };

  // 轮询导入状态
  const pollImportStatus = async (importId: string) => {
    const maxAttempts = 60; // 最多轮询60次（5分钟）
    let attempts = 0;
    
    const poll = async () => {
      try {
        const status = await imageAPI.getImportStatus(importId);
        
        if (status.status === 'completed') {
          showSuccess('导入成功', `镜像导入成功！镜像名称: ${status.image_name}`);
          await loadImages(); // 重新加载镜像列表
          return;
        } else if (status.status === 'failed') {
          showError('导入失败', `镜像导入失败: ${status.error}`);
          return;
        } else if (status.status === 'importing') {
          // 继续轮询
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 5000); // 5秒后再次查询
          } else {
            showWarning('导入超时', '导入超时，请稍后手动检查镜像列表');
          }
        }
      } catch (error) {
        console.error('查询导入状态失败:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          showError('查询失败', '查询导入状态失败，请稍后手动检查镜像列表');
        }
      }
    };
    
    // 开始轮询
    poll();
  };

  // 确认删除镜像
  const confirmDeleteImage = (image: any) => {
    setImageToDelete(image);
    setShowDeleteConfirmModal(true);
  };

  // 执行删除镜像
  const executeDeleteImage = async () => {
    if (!imageToDelete) return;
    
    try {
      await deleteImage(imageToDelete.id);
      showSuccess('删除成功', '镜像删除成功！');
    } catch (error) {
      console.error('删除镜像失败:', error);
      showError('删除失败', '删除镜像失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setShowDeleteConfirmModal(false);
      setImageToDelete(null);
    }
  };

  return (
    <>
      <div className="image-toolbar">
        <button className="btn btn-sm" onClick={loadImages} title="刷新镜像列表">
          <i className="fas fa-sync-alt"></i>
        </button>
        {
          /**
          <button 
          className="btn btn-sm btn-info" 
          onClick={() => setShowImageSearchModal(true)} 
          title="搜索Docker镜像"
        >
          <i className="fas fa-search"></i>
        </button>
        <button 
          className="btn btn-sm btn-warning" 
          onClick={() => setShowRegistryConfigModal(true)} 
          title="镜像源配置"
        >
          <i className="fas fa-cog"></i>
        </button>
           */
        }
        <button 
          className="btn btn-sm btn-success" 
          onClick={() => setShowImportModal(true)} 
          title="导入镜像"
        >
          <i className="fas fa-upload"></i>
        </button>
        <button 
          className="btn btn-sm btn-primary" 
          onClick={() => setShowAddCustomModal(true)} 
          title="添加自定义镜像"
        >
          <i className="fas fa-plus"></i>
        </button>
      </div>

      {/* 镜像管理 */}
      <div className="images-section">
        <div className="image-list">
          {images.length === 0 ? (
            <div className="image-empty">
              <i className="fas fa-layer-group"></i>
              <div>暂无镜像，点击刷新加载镜像列表</div>
            </div>
          ) : (
            images.map((image: any) => {
              // 为每个标签创建一个镜像项
              const tags = image.tags && image.tags.length > 0 ? image.tags : [`<未标记>:${image.id.substring(0, 12)}`];
              
              return tags.map((tag: string, tagIndex: number) => {
                // 查找对应的可用镜像配置
                const imageConfig = availableImages.find(config => config.name === tag);
                
                return (
                  <div key={`${image.id}-${tagIndex}`} className="image-item">
                    <div className="image-header">
                      <div className="image-name">
                        {tag}
                      </div>
                    <div className="image-actions">
                      {imageConfig && (
                        <button 
                          className="btn btn-sm" 
                          onClick={() => handleEditImageConfig(imageConfig)}
                          title="编辑配置"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                      )}
                      {imageConfig && imageConfig.is_custom && (
                        <button 
                          className="btn btn-sm action-button-red" 
                          onClick={() => handleDeleteImageConfig(imageConfig.name)}
                          title="删除配置"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                      <button 
                        className="btn btn-sm action-button-red" 
                        onClick={() => confirmDeleteImage(image)} 
                        title="删除镜像"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                  <div className="image-details">
                    <div className="image-info">
                      <span>ID: {image.id.substring(0, 12)}</span>
                      <span className="image-size">{formatBytes(image.size)}</span>
                    </div>
                    {imageConfig && (
                      <div className="image-config-info">
                        <div className="config-description">{imageConfig.description}</div>
                        <div className="config-env-count">
                          环境变量: {Object.keys(imageConfig.environment || {}).length} 个
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          }).flat()
          )}
        </div>
      </div>

      {/* 搜索Docker镜像弹窗 */}
      {showImageSearchModal && (
        <div className="modal-overlay" onClick={() => setShowImageSearchModal(false)}>
          <div className="modal-content search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>搜索Docker镜像</h3>
              <button className="modal-close" onClick={() => setShowImageSearchModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="search-section">
                <div className="registry-selector">
                  <label className="form-label">选择镜像源</label>
                  <select 
                    className="form-control" 
                    value={selectedRegistry}
                    onChange={(e) => setSelectedRegistry(e.target.value)}
                  >
                    {registries.filter(reg => reg.enabled).map((registry) => (
                      <option key={registry.code} value={registry.code}>
                        {registry.name} - {registry.description}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="search-input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="搜索镜像名称，如: nginx, node, python..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchDockerImages()}
                  />
                  <button 
                    className="btn btn-primary" 
                    onClick={searchDockerImages}
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? (
                      <><i className="fas fa-spinner fa-spin"></i> 搜索中</>
                    ) : (
                      <><i className="fas fa-search"></i> 搜索</>
                    )}
                  </button>
                </div>
                <small>🔍 从选定的镜像源搜索镜像，支持多种国内外镜像仓库</small>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  <h5>搜索结果</h5>
                  <div className="results-list">
                    {searchResults.map((result: any, index: number) => (
                      <div key={index} className="result-item">
                        <div className="result-info">
                          <div className="result-header">
                            <div className="result-name">{result.name}</div>
                            <div className="result-badges">
                              {result.official && (
                                <span className="badge badge-official" title="官方镜像">
                                  <i className="fas fa-check-circle"></i> 官方
                                </span>
                              )}
                              {result.automated && (
                                <span className="badge badge-automated" title="自动构建">
                                  <i className="fas fa-robot"></i> 自动
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="result-description">{result.description}</div>
                          <div className="result-stats">
                            <span className="stars" title="星级评分">
                              <i className="fas fa-star"></i> {result.stars}
                            </span>
                            {result.pulls > 0 && (
                              <span className="pulls" title="下载次数">
                                <i className="fas fa-download"></i> {result.pulls.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setCustomImageForm(prev => ({ ...prev, name: result.name }));
                            setShowImageSearchModal(false);
                            setShowAddCustomModal(true);
                          }}
                        >
                          选择
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑镜像配置弹窗 */}
      {showEditConfigModal && (
        <div className="modal-overlay" onClick={() => setShowEditConfigModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑镜像配置</h3>
              <button className="modal-close" onClick={() => setShowEditConfigModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">镜像名称</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={customImageForm.name}
                  disabled
                />
                <small>镜像名称不可修改</small>
              </div>
              
              <div className="form-group">
                <label className="form-label">描述</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="镜像描述（可选）"
                  value={customImageForm.description}
                  onChange={(e) => setCustomImageForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">默认Shell</label>
                <select 
                  className="form-control" 
                  value={customImageForm.shell}
                  onChange={(e) => setCustomImageForm(prev => ({ ...prev, shell: e.target.value }))}
                >
                  <option value="/bin/bash">Bash</option>
                  <option value="/bin/sh">Shell</option>
                  <option value="/bin/zsh">Zsh</option>
                  <option value="/bin/fish">Fish</option>
                </select>
              </div>

              {/* 环境变量配置 */}
              <div className="form-group">
                <div className="config-section">
                  <div className="section-header">
                    <h4>环境变量配置</h4>
                    <button type="button" className="btn btn-small" onClick={addEnvironmentVariable}>
                      <i className="fas fa-plus"></i> 添加变量
                    </button>
                  </div>
                  
                  {Object.keys(customImageForm.environment).length === 0 ? (
                    <div className="empty-state">
                      <p>暂无环境变量</p>
                      <small>您可以手动添加或应用模板</small>
                    </div>
                  ) : (
                    <div className="config-list">
                      {Object.entries(customImageForm.environment).map(([key, value]) => (
                        <div key={key} className="config-item">
                          <input
                            type="text"
                            placeholder="变量名"
                            value={key}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              const newEnv = { ...customImageForm.environment };
                              delete newEnv[key];
                              newEnv[newKey] = value;
                              setCustomImageForm(prev => ({ ...prev, environment: newEnv }));
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
                  
                  <div className="environment-info">
                    <h5>环境变量模板</h5>
                    <div className="template-buttons">
                      {Object.entries(environmentTemplates).map(([name, template]: [string, any]) => (
                        <button
                          key={name}
                          type="button"
                          className="btn "
                          onClick={() => applyTemplate(name)}
                          title={`应用 ${name} 环境变量模板`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowEditConfigModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={async () => {
                  try {
                    await imageAPI.updateCustomImage(editingConfig.name, {
                      description: customImageForm.description,
                      shell: customImageForm.shell,
                      environment: customImageForm.environment
                    });
                    setShowEditConfigModal(false);
                    await loadAvailableImages();
                    showSuccess('更新成功', '配置更新成功！');
                  } catch (error) {
                    console.error('更新配置失败:', error);
                    showError('更新失败', '更新配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
                  }
                }}
              >
                <i className="fas fa-save"></i>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加自定义镜像弹窗 */}
      {showAddCustomModal && (
        <div className="modal-overlay" onClick={() => setShowAddCustomModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加自定义镜像</h3>
              <button className="modal-close" onClick={() => setShowAddCustomModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">镜像名称 *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="例如: nginx:latest 或 ubuntu:20.04"
                  value={customImageForm.name}
                  onChange={(e) => setCustomImageForm(prev => ({ ...prev, name: e.target.value }))}
                />
                <small>输入完整的镜像名称，系统将自动拉取该镜像</small>
              </div>
              
              <div className="form-group">
                <label className="form-label">描述</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="镜像描述（可选）"
                  value={customImageForm.description}
                  onChange={(e) => setCustomImageForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">默认Shell</label>
                <select 
                  className="form-control" 
                  value={customImageForm.shell}
                  onChange={(e) => setCustomImageForm(prev => ({ ...prev, shell: e.target.value }))}
                >
                  <option value="/bin/bash">Bash</option>
                </select>
              </div>

              {/* 环境变量配置 */}
              <div className="form-group">
                <div className="config-section">
                  <div className="section-header">
                    <h4>环境变量配置</h4>
                    <button type="button" className="btn btn-small" onClick={addEnvironmentVariable}>
                      <i className="fas fa-plus"></i> 添加变量
                    </button>
                  </div>
                  
                  {Object.keys(customImageForm.environment).length === 0 ? (
                    <div className="empty-state">
                      <p>暂无环境变量</p>
                      <small>您可以手动添加或应用模板</small>
                    </div>
                  ) : (
                    <div className="config-list">
                      {Object.entries(customImageForm.environment).map(([key, value]) => (
                        <div key={key} className="config-item">
                          <input
                            type="text"
                            placeholder="变量名"
                            value={key}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              const newEnv = { ...customImageForm.environment };
                              delete newEnv[key];
                              newEnv[newKey] = value;
                              setCustomImageForm(prev => ({ ...prev, environment: newEnv }));
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
                  
                  <div className="environment-info">
                    <h5>环境变量模板</h5>
                    <div className="template-buttons">
                      {Object.entries(environmentTemplates).map(([name, template]: [string, any]) => (
                        <button
                          key={name}
                          type="button"
                          className="btn "
                          onClick={() => applyTemplate(name)}
                          title={`应用 ${name} 环境变量模板`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowAddCustomModal(false)}
                disabled={isAdding}
              >
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleAddCustomImage}
                disabled={isAdding || !customImageForm.name.trim()}
              >
                {isAdding ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    添加中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i>
                    添加镜像
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 镜像源配置弹窗 */}
      {showRegistryConfigModal && (
        <div className="modal-overlay" onClick={() => setShowRegistryConfigModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>镜像源配置</h3>
              <button className="modal-close" onClick={() => setShowRegistryConfigModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
                              <div className="registry-config-section">
                  <div className="section-header">
                    <p>配置镜像搜索源，您可以启用或禁用不同的镜像仓库：</p>
                    <button 
                      className="btn btn-primary btn-small"
                      onClick={() => setShowAddRegistryModal(true)}
                    >
                      <i className="fas fa-plus"></i> 添加镜像源
                    </button>
                  </div>
                  
                  <div className="registry-list">
                    {registries.map((registry) => (
                      <div key={registry.code} className="registry-item">
                        <div className="registry-info">
                          <div className="registry-header">
                            <span className="registry-name">{registry.name}</span>
                            <div className="registry-badges">
                              <span className={`registry-type ${registry.type}`}>
                                {registry.type === 'docker_cli' ? 'Docker CLI' : 
                                 registry.type === 'api' ? 'API' : '镜像源'}
                              </span>
                              {registry.is_default && (
                                <span className="registry-default">默认</span>
                              )}
                            </div>
                          </div>
                          <div className="registry-description">{registry.description}</div>
                          <div className="registry-urls">
                            <small>基础URL: {registry.base_url}</small>
                          </div>
                        </div>
                        <div className="registry-actions">
                          {!registry.is_default && (
                            <>
                              <button
                                className="btn-small btn-secondary"
                                onClick={() => handleEditRegistry(registry)}
                                title="编辑镜像源"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                className="btn-small btn-danger"
                                onClick={() => confirmDeleteRegistry(registry)}
                                title="删除镜像源"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </>
                          )}
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={registry.enabled}
                              onChange={(e) => toggleRegistryStatus(registry.code, e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                
                <div className="registry-note">
                  <p><strong>说明：</strong></p>
                  <ul>
                    <li><strong>Docker Hub (官方)</strong>：使用Docker CLI搜索，速度最快，但可能受网络限制</li>
                    <li><strong>国内镜像源</strong>：提供常见镜像的快速访问，适合国内用户</li>
                    <li>禁用的镜像源将不会出现在搜索选项中</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-primary" 
                onClick={() => setShowRegistryConfigModal(false)}
              >
                <i className="fas fa-check"></i>
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加镜像源弹窗 */}
      {showAddRegistryModal && (
        <div className="modal-overlay" onClick={() => setShowAddRegistryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加镜像源</h3>
              <button className="modal-close" onClick={() => setShowAddRegistryModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">名称 *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="例如: 我的私有镜像源"
                  value={registryForm.name}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">代码 *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="例如: my-registry（用于系统内部标识）"
                  value={registryForm.code}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, code: e.target.value }))}
                />
                <small>只能包含字母、数字和连字符</small>
              </div>
              
              <div className="form-group">
                <label className="form-label">基础URL *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="例如: registry.example.com"
                  value={registryForm.base_url}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, base_url: e.target.value }))}
                />
                <small>镜像仓库的基础地址</small>
              </div>
              
              
              <div className="form-group">
                <label className="form-label">类型</label>
                <select 
                  className="form-control" 
                  value={registryForm.type}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="registry">镜像源</option>
                  <option value="api">API搜索</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">描述</label>
                <textarea 
                  className="form-control" 
                  placeholder="描述这个镜像源的用途..."
                  value={registryForm.description}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowAddRegistryModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleAddRegistry}
              >
                <i className="fas fa-plus"></i>
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑镜像源弹窗 */}
      {showEditRegistryModal && (
        <div className="modal-overlay" onClick={() => setShowEditRegistryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑镜像源</h3>
              <button className="modal-close" onClick={() => setShowEditRegistryModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">名称 *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={registryForm.name}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">代码</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={registryForm.code}
                  disabled
                />
                <small>代码不可修改</small>
              </div>
              
              <div className="form-group">
                <label className="form-label">基础URL *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={registryForm.base_url}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, base_url: e.target.value }))}
                />
              </div>
              
              
              <div className="form-group">
                <label className="form-label">类型</label>
                <select 
                  className="form-control" 
                  value={registryForm.type}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="registry">镜像源</option>
                  <option value="api">API搜索</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">描述</label>
                <textarea 
                  className="form-control" 
                  value={registryForm.description}
                  onChange={(e) => setRegistryForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowEditRegistryModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleUpdateRegistry}
              >
                <i className="fas fa-save"></i>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入镜像弹窗 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>导入镜像</h3>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">选择镜像文件 *</label>
                <input 
                  type="file" 
                  className="form-control" 
                  accept=".tar,.tar.gz"
                  onChange={handleFileSelect}
                />
                <small>支持 .tar 和 .tar.gz 格式的镜像文件</small>
              </div>
              
              <div className="form-group">
                <label className="form-label">镜像名称 *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="例如: my-image:latest"
                  value={importImageName}
                  onChange={(e) => setImportImageName(e.target.value)}
                />
                <small>为导入的镜像指定一个名称和标签</small>
              </div>
              
              {importFile && (
                <div className="file-info">
                  <p><strong>已选择文件:</strong> {importFile.name}</p>
                  <p><strong>文件大小:</strong> {(importFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
              
              <div className="import-note">
                <p><strong>说明：</strong></p>
                <ul>
                  <li>支持从其他Docker环境导出的镜像文件</li>
                  <li>导入过程可能需要几分钟时间，请耐心等待</li>
                  <li>导入成功后，镜像将出现在镜像列表中</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowImportModal(false)}
                disabled={isImporting}
              >
                取消
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleImportImage}
                disabled={isImporting || !importFile}
              >
                {isImporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    导入中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-upload"></i>
                    导入镜像
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirmModal && imageToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除</h3>
              <button className="modal-close" onClick={() => setShowDeleteConfirmModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="delete-confirm-content">
                <div className="delete-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="delete-message">
                  <p><strong>确定要删除这个镜像吗？</strong></p>
                  <p>镜像名称: {imageToDelete.tags && imageToDelete.tags.length > 0 ? imageToDelete.tags[0] : imageToDelete.id.substring(0, 12)}</p>
                  <p>镜像ID: {imageToDelete.id.substring(0, 12)}</p>
                  <p className="delete-warning">此操作不可撤销，删除后将无法恢复！</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowDeleteConfirmModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={executeDeleteImage}
              >
                <i className="fas fa-trash"></i>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除镜像源确认弹窗 */}
      {showDeleteRegistryConfirmModal && registryToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteRegistryConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除镜像源</h3>
              <button className="modal-close" onClick={() => setShowDeleteRegistryConfirmModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="delete-confirm-content">
                <div className="delete-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="delete-message">
                  <p><strong>确定要删除这个镜像源吗？</strong></p>
                  <p>镜像源名称: {registryToDelete.name}</p>
                  <p>镜像源代码: {registryToDelete.code}</p>
                  <p>基础URL: {registryToDelete.base_url}</p>
                  <p className="delete-warning">此操作不可撤销，删除后将无法恢复！</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn " 
                onClick={() => setShowDeleteRegistryConfirmModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={executeDeleteRegistry}
              >
                <i className="fas fa-trash"></i>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImagePanel; 