import React, { useState, useEffect } from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNotification } from './NotificationProvider';
import FileTree from './FileTree';
import FileSelector from './FileSelector';
import './FilePanel.css';

const FilePanel: React.FC = () => {
  const { 
    files, 
    isLoading, 
    error, 
    createFile, 
    createFolder, 
    refreshFileTree 
  } = useFile();
  const { currentWorkspace } = useWorkspace();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showExportFilesDialog, setShowExportFilesDialog] = useState(false);
  const [showExportImageDialog, setShowExportImageDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  
  // 导出相关状态
  const [exportPath, setExportPath] = useState('');
  const [exportFormat, setExportFormat] = useState('zip');
  const [imageName, setImageName] = useState('');
  const [imageTag, setImageTag] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [exportMode, setExportMode] = useState<'all' | 'path' | 'selected'>('all');

  // 监听工作空间变化，提供用户反馈
  useEffect(() => {
    if (currentWorkspace) {
      console.log('🔄 FilePanel: 工作空间已切换到', currentWorkspace);
      // 重置导出表单
      setExportPath('');
      setImageName(`exported_${currentWorkspace}`);
      setImageTag('latest');
      setSelectedFiles([]);
      setExportMode('all');
    }
  }, [currentWorkspace]);

  const handleRefresh = async () => {
    if (!currentWorkspace) {
      showWarning('操作受限', '请先选择工作空间');
      return;
    }
    showInfo('刷新中', '正在刷新文件树...');
    await refreshFileTree();
  };

  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    
    try {
      await createFile(newFileName.trim());
      setNewFileName('');
      setShowNewFileDialog(false);
      showSuccess('创建成功', '文件创建成功！');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('创建失败', `创建文件失败: ${errorMessage}`);
    }
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderDialog(false);
      showSuccess('创建成功', '文件夹创建成功！');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('创建失败', `创建文件夹失败: ${errorMessage}`);
    }
  };

  // 导出工作空间文件
  const handleExportFiles = async () => {
    if (!currentWorkspace) return;
    
    // 验证选择模式
    if (exportMode === 'selected' && selectedFiles.length === 0) {
      showWarning('选择错误', '请选择要导出的文件或文件夹');
      return;
    }
    
    setIsExporting(true);
    try {
      const exportData: any = {
        type: 'files',
        format: exportFormat,
      };

      // 根据导出模式设置参数
      if (exportMode === 'path') {
        exportData.path = exportPath.trim();
      } else if (exportMode === 'selected') {
        exportData.selected_files = selectedFiles;
      }
      // 'all' 模式不需要额外参数

      const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error(`导出失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // 触发下载
        const downloadUrl = `/api/v1/downloads/${result.download_id}/file`;
        window.open(downloadUrl, '_blank');
        
        setShowExportFilesDialog(false);
        setExportPath('');
        setSelectedFiles([]);
        showSuccess('导出成功', '文件导出成功，下载已开始！');
        
      } else {
        throw new Error(result.message || '导出失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      showError('导出失败', `导出失败: ${errorMessage}`);
      console.error('文件导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // 导出工作空间镜像
  const handleExportImage = async () => {
    if (!currentWorkspace) return;
    
    setIsExporting(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'image',
          image_name: imageName.trim() || `exported_${currentWorkspace}`,
          image_tag: imageTag.trim() || 'latest',
        }),
      });

      if (!response.ok) {
        throw new Error(`导出失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // 触发下载
        const downloadUrl = `/api/v1/downloads/${result.download_id}/file`;
        window.open(downloadUrl, '_blank');
        
        setShowExportImageDialog(false);
        showSuccess('导出成功', '镜像导出成功，下载已开始！');
      } else {
        throw new Error(result.message || '导出失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      showError('导出失败', `镜像导出失败: ${errorMessage}`);
      console.error('镜像导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    } else if (e.key === 'Escape') {
      setShowNewFileDialog(false);
      setShowNewFolderDialog(false);
      setShowExportFilesDialog(false);
      setShowExportImageDialog(false);
      setNewFileName('');
      setNewFolderName('');
    }
  };

  return (
    <div className="file-panel">
      <div className="file-toolbar">
        <button 
          className="btn btn-sm" 
          title="刷新文件列表" 
          onClick={handleRefresh}
          disabled={!currentWorkspace}
        >
          <i className="fas fa-sync"></i>
        </button>
        <button 
          className="btn btn-sm" 
          title="新建文件"
          onClick={() => setShowNewFileDialog(true)}
          disabled={!currentWorkspace}
        >
          <i className="fas fa-file"></i>
        </button>
        <button 
          className="btn btn-sm" 
          title="新建文件夹"
          onClick={() => setShowNewFolderDialog(true)}
          disabled={!currentWorkspace}
        >
          <i className="fas fa-folder-plus"></i>
        </button>
        
        <div className="toolbar-divider"></div>
        
        <button 
          className="btn btn-sm btn-export" 
          title="导出工作空间文件"
          onClick={() => setShowExportFilesDialog(true)}
          disabled={!currentWorkspace || isExporting}
        >
          <i className="fas fa-download"></i>
        </button>
        <button 
          className="btn btn-sm btn-export" 
          title="导出工作空间镜像"
          onClick={() => setShowExportImageDialog(true)}
          disabled={!currentWorkspace || isExporting}
        >
          <i className="fab fa-docker"></i>
        </button>
      </div>

      {/* 新建文件对话框 */}
      {showNewFileDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewFileDialog(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3>新建文件</h3>
            <input
              type="text"
              placeholder="输入文件名（包含扩展名）"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleNewFile)}
              autoFocus
            />
            <div className="dialog-actions">
              <button onClick={handleNewFile} disabled={!newFileName.trim()}>
                创建
              </button>
              <button onClick={() => setShowNewFileDialog(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建文件夹对话框 */}
      {showNewFolderDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewFolderDialog(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3>新建文件夹</h3>
            <input
              type="text"
              placeholder="输入文件夹名"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleNewFolder)}
              autoFocus
            />
            <div className="dialog-actions">
              <button onClick={handleNewFolder} disabled={!newFolderName.trim()}>
                创建
              </button>
              <button onClick={() => setShowNewFolderDialog(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出文件对话框 */}
      {showExportFilesDialog && (
        <div className="dialog-overlay" onClick={() => setShowExportFilesDialog(false)}>
          <div className="dialog-content export-dialog large-dialog" onClick={(e) => e.stopPropagation()}>
            <h3><i className="fas fa-download"></i> 导出工作空间文件</h3>
            
            <div className="form-group">
              <label className="form-label">导出模式</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="all"
                    checked={exportMode === 'all'}
                    onChange={(e) => setExportMode(e.target.value as any)}
                  />
                  <span>导出整个工作空间</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    value="path"
                    checked={exportMode === 'path'}
                    onChange={(e) => setExportMode(e.target.value as any)}
                  />
                  <span>导出指定路径</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    value="selected"
                    checked={exportMode === 'selected'}
                    onChange={(e) => setExportMode(e.target.value as any)}
                  />
                  <span>选择文件导出</span>
                </label>
              </div>
            </div>

            {exportMode === 'path' && (
              <div className="form-group">
                <label className="form-label">导出路径</label>
                <input
                  type="text"
                  placeholder="输入要导出的路径，如 'src' 或 'docs/images'"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                />
                <small>例如：src、docs/images、components</small>
              </div>
            )}

            {exportMode === 'selected' && (
              <div className="form-group">
                <label className="form-label">选择文件和文件夹</label>
                <div className="file-selector-container">
                  <FileSelector
                    selectedFiles={selectedFiles}
                    onSelectionChange={setSelectedFiles}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">压缩格式</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="zip"
                    checked={exportFormat === 'zip'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <span>ZIP格式（推荐）</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    value="tar.gz"
                    checked={exportFormat === 'tar.gz'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <span>tar.gz格式</span>
                </label>
              </div>
            </div>

            <div className="dialog-actions">
              <button 
                onClick={handleExportFiles} 
                disabled={isExporting || (exportMode === 'selected' && selectedFiles.length === 0)}
                className="btn-primary"
              >
                {isExporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    导出中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-download"></i>
                    开始导出
                  </>
                )}
              </button>
              <button 
                onClick={() => {
                  setShowExportFilesDialog(false);
                  setSelectedFiles([]);
                  setExportMode('all');
                }} 
                disabled={isExporting}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出镜像对话框 */}
      {showExportImageDialog && (
        <div className="dialog-overlay" onClick={() => setShowExportImageDialog(false)}>
          <div className="dialog-content export-dialog" onClick={(e) => e.stopPropagation()}>
            <h3><i className="fab fa-docker"></i> 导出工作空间镜像</h3>
            
            <div className="form-group">
              <label className="form-label">镜像名称</label>
              <input
                type="text"
                placeholder="镜像名称"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
              />
              <small>例如：my-project、frontend-app</small>
            </div>

            <div className="form-group">
              <label className="form-label">镜像标签</label>
              <input
                type="text"
                placeholder="镜像标签"
                value={imageTag}
                onChange={(e) => setImageTag(e.target.value)}
              />
              <small>例如：latest、v1.0、dev</small>
            </div>

            <div className="export-info">
              <i className="fas fa-info-circle"></i>
              <div>
                <strong>说明：</strong>
                <p>将把当前容器的完整状态保存为Docker镜像，包括已安装的软件、配置和所有文件。生成的镜像文件可以在其他Docker环境中导入使用。</p>
              </div>
            </div>

            <div className="dialog-actions">
              <button 
                onClick={handleExportImage} 
                disabled={isExporting}
                className="btn-primary"
              >
                {isExporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    导出中...
                  </>
                ) : (
                  <>
                    <i className="fab fa-docker"></i>
                    开始导出
                  </>
                )}
              </button>
              <button onClick={() => setShowExportImageDialog(false)} disabled={isExporting}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="file-tree">
        {isLoading ? (
          <div className="file-tree-loading">
            <i className="fas fa-spinner fa-spin"></i>
            <div>加载中...</div>
          </div>
        ) : error ? (
          <div className="file-tree-error">
            <i className="fas fa-exclamation-triangle"></i>
            <div>{error}</div>
          </div>
        ) : !currentWorkspace ? (
          <div className="file-tree-empty">
            <i className="fas fa-folder-open"></i>
            <div>请先选择工作空间</div>
          </div>
        ) : !files || files.length === 0 ? (
          <div className="file-tree-empty">
            <i className="fas fa-folder-open"></i>
            <div>当前目录为空</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              点击上方按钮创建文件或文件夹
            </div>
          </div>
        ) : (
          <FileTree />
        )}
      </div>
    </div>
  );
};

export default FilePanel; 