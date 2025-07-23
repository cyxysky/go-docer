import React, { useState, useEffect, useCallback } from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getFileIcon } from '../utils';
import type { FileItem } from '../types';
import FileContextMenu from './FileContextMenu';
import './FileTree.css';
// 全局展开状态管理
interface ExpandedState {
  [path: string]: boolean;
}

// 全局子文件缓存
interface FileCache {
  [path: string]: {
    files: FileItem[];
    timestamp: number;
  };
}

let globalExpandedState: ExpandedState = {};
let globalFileCache: FileCache = {};
const CACHE_DURATION = 30000; // 30秒缓存

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
  const [showActions, setShowActions] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
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
      globalFileCache = newCache;
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
      globalExpandedState = newExpandedState;

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
    globalFileCache = newCache;
  };

  // 拖拽相关处理
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', file.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
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
      globalFileCache = newCache;
    }
  };

  // 处理创建文件后的缓存清理
  const handleCreateFileWrapper = (parentPath: string) => {
    onCreateFile(parentPath);
    
    // 清理父目录缓存
    const newCache = { ...fileCache };
    delete newCache[parentPath];
    setFileCache(newCache);
    globalFileCache = newCache;
  };

  const handleCreateFolderWrapper = (parentPath: string) => {
    onCreateFolder(parentPath);
    
    // 清理父目录缓存
    const newCache = { ...fileCache };
    delete newCache[parentPath];
    setFileCache(newCache);
    globalFileCache = newCache;
  };

  const paddingLeft = level * 16;

  return (
    <>
      <div 
        className={`file-tree-item ${file.is_dir ? 'folder' : 'file'} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${isLoadingChildren ? 'loading' : ''}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
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
              <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} ${isExpanded ? 'expanded' : ''} ${isLoadingChildren ? 'fa-spin fa-spinner' : ''}`}></i>
            ) : null}
            <i className={file.is_dir ? 'fas fa-folder' : getFileIcon(file.name)}></i>
          </div>
          <span className="file-tree-item-name">{file.name}</span>
          {isLoadingChildren && (
            <span className="loading-indicator">
              <i className="fas fa-spinner fa-spin"></i>
            </span>
          )}
        </div>
        
        {showActions && (
          <div className="file-tree-item-actions">
            <button 
              className="file-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRenameFile(file.path);
              }}
              title="重命名"
            >
              <i className="fas fa-edit"></i>
            </button>
            <button 
              className="file-action-btn"
              onClick={handleDelete}
              title="删除"
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        )}
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
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileParentPath, setNewFileParentPath] = useState('');
  const [renameFilePath, setRenameFilePath] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  
  // 使用全局状态
  const [expandedState, setExpandedState] = useState<ExpandedState>(globalExpandedState);
  const [fileCache, setFileCache] = useState<FileCache>(globalFileCache);

  // 监听files变化，更新展开状态
  useEffect(() => {
    setExpandedState(globalExpandedState);
    setFileCache(globalFileCache);
  }, [files]);

  const handleFileClick = (file: FileItem) => {
    if (!file.is_dir) {
      openFile(file.path);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    try {
      await deleteFile(filePath);
      // 文件删除后会触发刷新，保持展开状态
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`删除文件失败: ${errorMessage}`);
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
      globalFileCache = newCache;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`重命名失败: ${errorMessage}`);
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
      globalFileCache = newCache;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`创建文件失败: ${errorMessage}`);
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
      globalFileCache = newCache;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`创建文件夹失败: ${errorMessage}`);
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
      globalFileCache = newCache;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`移动文件失败: ${errorMessage}`);
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
    </>
  );
};

export default FileTree; 