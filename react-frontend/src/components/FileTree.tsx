import React, { useState, useEffect } from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getFileIcon } from '../utils';
import type { FileItem } from '../types';
import FileContextMenu from './FileContextMenu';
import './FileTree.css';

interface FileTreeItemProps {
  file: FileItem;
  level: number;
  onFileClick: (file: FileItem) => void;
  onDeleteFile: (filePath: string) => void;
  onRenameFile: (filePath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onMoveFile: (sourcePath: string, targetPath: string) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ 
  file, 
  level, 
  onFileClick, 
  onDeleteFile,
  onRenameFile,
  onCreateFile,
  onCreateFolder,
  onMoveFile
}) => {
  const { files, loadSubFiles } = useFile();
  const { currentWorkspace } = useWorkspace();
  const [showActions, setShowActions] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 获取当前文件的子文件
  const getChildFiles = () => {
    return files.filter(f => {
      const pathParts = f.path.split('/');
      const filePathParts = file.path.split('/');
      return pathParts.length === filePathParts.length + 1 && 
             f.path.startsWith(file.path + '/');
    });
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (file.is_dir) {
      // 切换展开状态
      if (isExpanded) {
        setIsExpanded(false);
      } else {
        setIsExpanded(true);
        // 如果还没有加载过子文件，则加载
        if (children.length === 0 && currentWorkspace) {
          try {
            // 使用loadSubFiles加载子文件，不改变当前目录
            const subFiles = await loadSubFiles(currentWorkspace, file.path);
            setChildren(subFiles);
          } catch (error) {
            console.error('加载文件夹内容失败:', error);
          }
        }
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
    }
  };

  const paddingLeft = level * 16;

  return (
    <>
      <div 
        className={`file-tree-item ${file.is_dir ? 'folder' : 'file'} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
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
              <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} ${isExpanded ? 'expanded' : ''}`}></i>
            ) : null}
            <i className={file.is_dir ? 'fas fa-folder' : getFileIcon(file.name)}></i>
          </div>
          <span className="file-tree-item-name">{file.name}</span>
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
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
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

  const handleFileClick = (file: FileItem) => {
    if (!file.is_dir) {
      openFile(file.path);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    try {
      await deleteFile(filePath);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`创建文件夹失败: ${errorMessage}`);
    }
  };

  const handleMoveFile = async (sourcePath: string, targetPath: string) => {
    try {
      await moveFile(sourcePath, targetPath);
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