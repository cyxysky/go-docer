import React from 'react';
import type { FileItem } from '../types';
import './FileContextMenu.css';

interface FileContextMenuProps {
  file: FileItem;
  x: number;
  y: number;
  onClose: () => void;
  onDelete: (filePath: string) => void;
  onRename: (filePath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
}

const FileContextMenu: React.FC<FileContextMenuProps> = ({
  file,
  x,
  y,
  onClose,
  onDelete,
  onRename,
  onCreateFile,
  onCreateFolder
}) => {
  const handleDelete = () => {
    onDelete(file.path);
    onClose();
  };

  const handleRename = () => {
    onRename(file.path);
    onClose();
  };

  const handleCreateFile = () => {
    onCreateFile(file.is_dir ? file.path : file.path.split('/').slice(0, -1).join('/'));
    onClose();
  };

  const handleCreateFolder = () => {
    onCreateFolder(file.is_dir ? file.path : file.path.split('/').slice(0, -1).join('/'));
    onClose();
  };

  // 确保菜单不会超出屏幕边界
  const menuStyle = {
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - 200)
  };

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div 
        className="context-menu"
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-menu-item new-file" onClick={handleCreateFile}>
          <i className="fas fa-file"></i>
          <span>新建文件</span>
        </div>
        <div className="context-menu-item new-folder" onClick={handleCreateFolder}>
          <i className="fas fa-folder-plus"></i>
          <span>新建文件夹</span>
        </div>
        <div className="context-menu-separator"></div>
        <div className="context-menu-item rename" onClick={handleRename}>
          <i className="fas fa-edit"></i>
          <span>重命名</span>
        </div>
        <div className="context-menu-item delete" onClick={handleDelete}>
          <i className="fas fa-trash"></i>
          <span>删除</span>
        </div>
      </div>
    </>
  );
};

export default FileContextMenu; 