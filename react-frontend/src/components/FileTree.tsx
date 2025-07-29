import React, { useState, useEffect, useCallback } from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNotification } from './NotificationProvider';
import { useDrag } from '../contexts/DragContext';
import { getFileIcon } from '../utils';
import type { FileItem } from '../types';
import FileContextMenu from './FileContextMenu';
import './FileTree.css';

// 工作空间级别的状态管理
interface ExpandedState {
  [path: string]: boolean;
}

// 工作空间级别的子文件缓存
interface FileCache {
  [path: string]: {
    files: FileItem[];
    timestamp: number;
  };
}

// 按工作空间存储状态和缓存
const workspaceStates: { [workspaceId: string]: ExpandedState } = {};
const workspaceCaches: { [workspaceId: string]: FileCache } = {};
const CACHE_DURATION = 10000; // 减少缓存时间到10秒，提高响应性

// 清理特定工作空间的缓存
export const clearWorkspaceCache = (workspaceId: string) => {
  console.log('🧹 清理工作空间缓存:', workspaceId);
  delete workspaceStates[workspaceId];
  delete workspaceCaches[workspaceId];
};

// 清理所有缓存
export const clearAllCache = () => {
  console.log('🧹 清理所有文件树缓存');
  Object.keys(workspaceStates).forEach(key => delete workspaceStates[key]);
  Object.keys(workspaceCaches).forEach(key => delete workspaceCaches[key]);
};

interface FileTreeItemProps {
  file: FileItem;
  level: number;
  onFileClick: (file: FileItem) => void;
  onDeleteFile: (filePath: string) => void;
  onRenameFile: (filePath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onMoveFile: (sourcePath: string, targetPath: string) => void;
  expandedState: ExpandedState;
  setExpandedState: (state: ExpandedState) => void;
  fileCache: FileCache;
  setFileCache: (cache: FileCache) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ 
  file, 
  level, 
  onFileClick, 
  onDeleteFile,
  onRenameFile,
  onCreateFile,
  onCreateFolder,
  onMoveFile,
  expandedState,
  setExpandedState,
  fileCache,
  setFileCache
}) => {
  const { loadSubFiles } = useFile();
  const { currentWorkspace } = useWorkspace();
  const { setDraggedFiles, setIsDragging } = useDrag();
  const [showActions, setShowActions] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isDraggingLocal, setIsDraggingLocal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  const isExpanded = expandedState[file.path] || false;

  // 从缓存或服务器加载子文件
  const loadChildren = useCallback(async () => {
    if (!currentWorkspace || !file.is_dir) return;

    const now = Date.now();
    const cached = fileCache[file.path];
    
    // 检查缓存是否有效
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      setChildren(cached.files);
      return;
    }

    setIsLoadingChildren(true);
    try {
      const subFiles = await loadSubFiles(currentWorkspace, file.path);
      setChildren(subFiles);
      
      // 更新缓存
      const newCache = {
        ...fileCache,
        [file.path]: {
          files: subFiles,
          timestamp: now
        }
      };
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    } catch (error) {
      console.error('加载文件夹内容失败:', error);
    } finally {
      setIsLoadingChildren(false);
    }
  }, [currentWorkspace, file.path, file.is_dir, fileCache, setFileCache, loadSubFiles]);

  // 当组件挂载时，如果已展开，则加载子文件
  useEffect(() => {
    if (isExpanded && file.is_dir) {
      loadChildren();
    }
  }, [isExpanded, file.is_dir, loadChildren]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (file.is_dir) {
      const newExpandedState = {
        ...expandedState,
        [file.path]: !isExpanded
      };
      setExpandedState(newExpandedState);
      if (currentWorkspace) {
        workspaceStates[currentWorkspace] = newExpandedState;
      }

      // 如果展开且还没有子文件，则加载
      if (!isExpanded) {
        await loadChildren();
      }
    } else {
      onFileClick(file);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteFile(file.path);
    
    // 清理相关缓存
    const newCache = { ...fileCache };
    delete newCache[file.path];
    
    // 清理父目录缓存以触发刷新
    const parentPath = file.path.split('/').slice(0, -1).join('/');
    if (parentPath && newCache[parentPath]) {
      delete newCache[parentPath];
    }
    
    setFileCache(newCache);
    if (currentWorkspace) {
      workspaceCaches[currentWorkspace] = newCache;
    }
  };

  // 拖拽相关处理
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDraggingLocal(true);
    setIsDragging(true); // 设置全局拖拽状态
    setDraggedFiles([file.path]); // 设置拖拽的文件
    e.dataTransfer.setData('text/plain', file.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDraggingLocal(false);
    setIsDragging(false); // 清除全局拖拽状态
    setDraggedFiles([]); // 清除拖拽的文件
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (file.is_dir) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (!file.is_dir) return;
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath && sourcePath !== file.path) {
      const fileName = sourcePath.split('/').pop() || '';
      const targetPath = file.path ? `${file.path}/${fileName}` : fileName;
      onMoveFile(sourcePath, targetPath);
      
      // 清理缓存以触发刷新
      const newCache = { ...fileCache };
      delete newCache[file.path]; // 目标目录
      const sourceParentPath = sourcePath.split('/').slice(0, -1).join('/');
      if (sourceParentPath && newCache[sourceParentPath]) {
        delete newCache[sourceParentPath]; // 源目录
      }
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    }
  };

  // 处理创建文件后的缓存清理
  const handleCreateFileWrapper = (parentPath: string) => {
    onCreateFile(parentPath);
    
    // 清理父目录缓存
    const newCache = { ...fileCache };
    delete newCache[parentPath];
    setFileCache(newCache);
    if (currentWorkspace) {
      workspaceCaches[currentWorkspace] = newCache;
    }
  };

  const handleCreateFolderWrapper = (parentPath: string) => {
    onCreateFolder(parentPath);
    
    // 清理父目录缓存
    const newCache = { ...fileCache };
    delete newCache[parentPath];
    setFileCache(newCache);
    if (currentWorkspace) {
      workspaceCaches[currentWorkspace] = newCache;
    }
  };

  const paddingLeft = level * 16;

  return (
    <>
      <div 
        className={`file-tree-item ${file.is_dir ? 'folder' : 'file'} ${isDraggingLocal ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isLoadingChildren ? 'loading' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="file-tree-item-content">
          <div className="file-tree-item-icon">
            {file.is_dir ? (
              <i className={`fas fa-chevron-right ${isExpanded ? 'expanded' : ''}`}></i>
            ) : null}
            <i className={file.is_dir ? 'fas fa-folder' : getFileIcon(file.name)}></i>
          </div>
          <span className="file-tree-item-name">{file.name}</span>
          {isLoadingChildren && (
            <span className="loading-indicator">
              <i className="fas fa-spinner"></i>
            </span>
          )}
        </div>
      </div>

      {file.is_dir && isExpanded && children.length > 0 && (
        <div className="file-tree-children">
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              file={child}
              level={level + 1}
              onFileClick={onFileClick}
              onDeleteFile={onDeleteFile}
              onRenameFile={onRenameFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onMoveFile={onMoveFile}
              expandedState={expandedState}
              setExpandedState={setExpandedState}
              fileCache={fileCache}
              setFileCache={setFileCache}
            />
          ))}
        </div>
      )}

      {showContextMenu && (
        <FileContextMenu
          file={file}
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          onClose={() => setShowContextMenu(false)}
          onDelete={onDeleteFile}
          onRename={onRenameFile}
          onCreateFile={handleCreateFileWrapper}
          onCreateFolder={handleCreateFolderWrapper}
        />
      )}
    </>
  );
};

const FileTree: React.FC = () => {
  const { files, openFile, deleteFile, renameFile, createFile, createFolder, moveFile } = useFile();
  const { currentWorkspace } = useWorkspace();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string>('');
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileParentPath, setNewFileParentPath] = useState('');
  const [renameFilePath, setRenameFilePath] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  
  // 使用工作空间状态和缓存
  const [expandedState, setExpandedState] = useState<ExpandedState>(workspaceStates[currentWorkspace || ''] || {});
  const [fileCache, setFileCache] = useState<FileCache>(workspaceCaches[currentWorkspace || ''] || {});

  // 监听工作空间切换，清理状态和缓存
  useEffect(() => {
    if (currentWorkspace) {
      console.log('🔄 FileTree: 工作空间切换到', currentWorkspace);
      setExpandedState(workspaceStates[currentWorkspace] || {});
      setFileCache(workspaceCaches[currentWorkspace] || {});
    } else {
      console.log('🔄 FileTree: 清空工作空间状态');
      setExpandedState({});
      setFileCache({});
    }
  }, [currentWorkspace]);

  // 监听files变化，更新展开状态
  useEffect(() => {
    if (currentWorkspace) {
      setExpandedState(workspaceStates[currentWorkspace] || {});
      setFileCache(workspaceCaches[currentWorkspace] || {});
    }
  }, [files, currentWorkspace]);

  const handleFileClick = (file: FileItem) => {
    if (!file.is_dir) {
      openFile(file.path);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    setFileToDelete(filePath);
    setShowDeleteConfirmDialog(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteFile(fileToDelete, async () => {
        // 这个回调会在确认后执行，这里不需要做任何事情
        // 实际的删除操作会在deleteFile函数中执行
      });
      showSuccess('删除成功', '文件删除成功！');
      setShowDeleteConfirmDialog(false);
      setFileToDelete('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('删除失败', `删除文件失败: ${errorMessage}`);
      setShowDeleteConfirmDialog(false);
      setFileToDelete('');
    }
  };

  const handleRenameFile = (filePath: string) => {
    setRenameFilePath(filePath);
    setRenameNewName(filePath.split('/').pop() || '');
    setShowRenameDialog(true);
  };

  const handleRenameConfirm = async () => {
    if (!renameNewName.trim()) return;
    
    try {
      await renameFile(renameFilePath, renameNewName.trim());
      setRenameNewName('');
      setShowRenameDialog(false);
      
      // 清理缓存
      const newCache = { ...fileCache };
      delete newCache[renameFilePath];
      const parentPath = renameFilePath.split('/').slice(0, -1).join('/');
      if (parentPath && newCache[parentPath]) {
        delete newCache[parentPath];
      }
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('重命名失败', `重命名失败: ${errorMessage}`);
    }
  };

  const handleCreateFile = (parentPath: string) => {
    setNewFileParentPath(parentPath);
    setShowNewFileDialog(true);
  };

  const handleCreateFolder = (parentPath: string) => {
    setNewFileParentPath(parentPath);
    setShowNewFolderDialog(true);
  };

  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    
    const filePath = newFileParentPath ? `${newFileParentPath}/${newFileName.trim()}` : newFileName.trim();
    
    try {
      await createFile(filePath);
      setNewFileName('');
      setShowNewFileDialog(false);
      
      // 清理父目录缓存
      const newCache = { ...fileCache };
      delete newCache[newFileParentPath];
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('创建失败', `创建文件失败: ${errorMessage}`);
    }
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    
    const folderPath = newFileParentPath ? `${newFileParentPath}/${newFolderName.trim()}` : newFolderName.trim();
    
    try {
      await createFolder(folderPath);
      setNewFolderName('');
      setShowNewFolderDialog(false);
      
      // 清理父目录缓存
      const newCache = { ...fileCache };
      delete newCache[newFileParentPath];
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('创建失败', `创建文件夹失败: ${errorMessage}`);
    }
  };

  const handleMoveFile = async (sourcePath: string, targetPath: string) => {
    try {
      await moveFile(sourcePath, targetPath);
      
      // 清理相关缓存
      const newCache = { ...fileCache };
      const sourceParentPath = sourcePath.split('/').slice(0, -1).join('/');
      const targetParentPath = targetPath.split('/').slice(0, -1).join('/');
      
      delete newCache[sourceParentPath];
      delete newCache[targetParentPath];
      
      setFileCache(newCache);
      if (currentWorkspace) {
        workspaceCaches[currentWorkspace] = newCache;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showError('移动失败', `移动文件失败: ${errorMessage}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    } else if (e.key === 'Escape') {
      setShowNewFileDialog(false);
      setShowNewFolderDialog(false);
      setShowRenameDialog(false);
      setNewFileName('');
      setNewFolderName('');
      setRenameNewName('');
    }
  };

  // 只显示根级文件
  const rootFiles = files.filter(file => {
    const pathParts = file.path.split('/');
    return pathParts.length === 1;
  });

  return (
    <>
      <div className="file-tree-container">
        {rootFiles.map((file) => (
          <FileTreeItem
            key={file.path}
            file={file}
            level={0}
            onFileClick={handleFileClick}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onMoveFile={handleMoveFile}
            expandedState={expandedState}
            setExpandedState={setExpandedState}
            fileCache={fileCache}
            setFileCache={setFileCache}
          />
        ))}
      </div>

      {/* 新建文件对话框 */}
      {showNewFileDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewFileDialog(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              <i className="fas fa-file"></i>
              新建文件
            </h3>
            <input
              type="text"
              placeholder="输入文件名（如：index.js）"
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
            <h3>
              <i className="fas fa-folder-plus"></i>
              新建文件夹
            </h3>
            <input
              type="text"
              placeholder="输入文件夹名（如：src）"
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

      {/* 重命名对话框 */}
      {showRenameDialog && (
        <div className="dialog-overlay" onClick={() => setShowRenameDialog(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              <i className="fas fa-edit"></i>
              重命名
            </h3>
            <input
              type="text"
              placeholder="输入新名称"
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleRenameConfirm)}
              autoFocus
            />
            <div className="dialog-actions">
              <button onClick={handleRenameConfirm} disabled={!renameNewName.trim()}>
                确定
              </button>
              <button onClick={() => setShowRenameDialog(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirmDialog && (
        <div className="dialog-overlay" onClick={() => setShowDeleteConfirmDialog(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              <i className="fas fa-exclamation-triangle"></i>
              确认删除
            </h3>
            <div className="confirm-content">
              <p>确定要删除 <strong>"{fileToDelete}"</strong> 吗？</p>
            </div>
            <p className="warning-text">此操作不可撤销，删除后将无法恢复！</p>
            <div className="dialog-actions">
              <button onClick={handleDeleteConfirm} className="btn-danger">
                <i className="fas fa-trash"></i>
                确认删除
              </button>
              <button onClick={() => setShowDeleteConfirmDialog(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FileTree; 