import React, { useState, useEffect } from 'react';
import { useImage } from '../contexts/ImageContext';
import { formatBytes } from '../utils';
import { imageAPI, workspaceAPI, registryAPI } from '../services/api';
import './ImagePanel.css';

const ImagePanel: React.FC = () => {
  const { images, loadImages, deleteImage } = useImage();
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
      alert('请输入镜像名称');
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
    } catch (error) {
      console.error('添加自定义镜像失败:', error);
      alert('添加自定义镜像失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
    if (!confirm(`确定要删除镜像 ${imageName} 的配置吗？`)) {
      return;
    }

    try {
      await imageAPI.deleteCustomImage(imageName);
      await loadAvailableImages();
      alert('配置删除成功！');
    } catch (error) {
      console.error('删除配置失败:', error);
      alert('删除配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 切换镜像源状态
  const toggleRegistryStatus = async (code: string, enabled: boolean) => {
    try {
      await registryAPI.toggleRegistry(code, enabled);
      await loadRegistries(); // 重新加载镜像源列表
    } catch (error) {
      console.error('切换镜像源状态失败:', error);
      alert('操作失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 添加镜像源
  const handleAddRegistry = async () => {
    if (!registryForm.name.trim() || !registryForm.code.trim() || !registryForm.base_url.trim()) {
      alert('请填写名称、代码和基础URL');
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
      alert('镜像源添加成功！');
    } catch (error) {
      console.error('添加镜像源失败:', error);
      alert('添加失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
      alert('请填写名称和基础URL');
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
      alert('镜像源更新成功！');
    } catch (error) {
      console.error('更新镜像源失败:', error);
      alert('更新失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 删除镜像源
  const handleDeleteRegistry = async (code: string, name: string, isDefault: boolean) => {
    if (isDefault) {
      alert('默认镜像源不能删除');
      return;
    }

    if (!confirm(`确定要删除镜像源"${name}"吗？`)) {
      return;
    }

    try {
      await registryAPI.deleteRegistry(code);
      await loadRegistries();
      alert('镜像源删除成功！');
    } catch (error) {
      console.error('删除镜像源失败:', error);
      alert('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
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

  return (
    <>
      <div className="image-toolbar">
        <button className="btn btn-sm" onClick={loadImages} title="刷新镜像列表">
          <i className="fas fa-sync-alt"></i>
        </button>
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
              // 查找对应的可用镜像配置
              const imageName = image.tags && image.tags.length > 0 ? image.tags[0] : image.id;
              const imageConfig = availableImages.find(config => config.name === imageName);
              
              return (
                <div key={image.id} className="image-item">
                  <div className="image-header">
                    <div className="image-name">
                      {image.tags && image.tags.length > 0 ? image.tags[0] : `<未标记>:${image.id.substring(0, 12)}`}
                      {imageConfig && (
                        <span className={`config-badge ${imageConfig.is_custom ? 'custom' : 'builtin'}`}>
                          {imageConfig.is_custom ? '自定义配置' : '预设配置'}
                        </span>
                      )}
                    </div>
                    <div className="image-actions">
                      {imageConfig && (
                        <button 
                          className="btn-small " 
                          onClick={() => handleEditImageConfig(imageConfig)}
                          title="编辑配置"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                      )}
                      {imageConfig && imageConfig.is_custom && (
                        <button 
                          className="btn-small btn-danger-outline" 
                          onClick={() => handleDeleteImageConfig(imageConfig.name)}
                          title="删除配置"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                      <button 
                        className="btn-small " 
                        onClick={() => deleteImage(image.id)} 
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
            })
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
                    alert('配置更新成功！');
                  } catch (error) {
                    console.error('更新配置失败:', error);
                    alert('更新配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
                                onClick={() => handleDeleteRegistry(registry.code, registry.name, registry.is_default)}
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
    </>
  );
};

export default ImagePanel; 