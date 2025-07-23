import React, { useState, useEffect } from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import FileTree from './FileTree';
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
  
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // 监听工作空间变化，提供用户反馈
  useEffect(() => {
    if (currentWorkspace) {
      console.log('🔄 FilePanel: 工作空间已切换到', currentWorkspace);
    }
  }, [currentWorkspace]);

  const handleRefresh = async () => {
    if (!currentWorkspace) {
      console.log('⚠️ 没有选择工作空间，无法刷新');
      return;
    }
    console.log('🔄 手动刷新文件树');
    await refreshFileTree();
  };

  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    
    try {
      await createFile(newFileName.trim());
      setNewFileName('');
      setShowNewFileDialog(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`创建文件失败: ${errorMessage}`);
    }
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderDialog(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`创建文件夹失败: ${errorMessage}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    } else if (e.key === 'Escape') {
      setShowNewFileDialog(false);
      setShowNewFolderDialog(false);
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