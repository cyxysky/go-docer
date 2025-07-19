import React from 'react';
import { useFile } from '../contexts/FileContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getFileIcon } from '../utils';
import './FilePanel.css';

const FilePanel: React.FC = () => {
  const { files, currentDirectory, loadFileTree, openFile, isLoading, error } = useFile();
  const { currentWorkspace } = useWorkspace();

  const handleFileClick = (file: any) => {
    if (!currentWorkspace) return;
    
    if (file.is_dir) {
      loadFileTree(currentWorkspace, file.path);
    } else {
      openFile(file.path);
    }
  };

  const handleBackClick = () => {
    if (!currentWorkspace || currentDirectory === '') return;
    const parentPath = currentDirectory.split('/').slice(0, -1).join('/') || '';
    loadFileTree(currentWorkspace, parentPath);
  };

  return (
    <>
      <div className="file-toolbar">
        <button className="btn btn-sm" title="刷新">
          <i className="fas fa-sync"></i>
        </button>
        <button className="btn btn-sm" title="新建文件">
          <i className="fas fa-file-plus"></i>
        </button>
        <button className="btn btn-sm" title="新建文件夹">
          <i className="fas fa-folder-plus"></i>
        </button>
      </div>

      <div className="file-tree">
        {currentDirectory !== '' && (
          <div className="file-item back-item" onClick={handleBackClick}>
            <div className="file-name">
              <i className="fas fa-level-up-alt"></i>
              <span>返回上一级</span>
            </div>
          </div>
        )}
        
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
        ) : !files || files.length === 0 ? (
          <div className="file-tree-empty">
            <i className="fas fa-folder-open"></i>
            <div>当前目录为空</div>
          </div>
        ) : (
          files.map((file: any) => (
            <div 
              key={file.path}
              className={`file-item ${file.is_dir ? 'folder-item' : 'file-item-file'}`}
              onClick={() => handleFileClick(file)}
            >
              <div className="file-name">
                <i className={file.is_dir ? 'fas fa-folder' : getFileIcon(file.name)}></i>
                <span>{file.name}</span>
              </div>
              {!file.is_dir && (
                <div className="file-actions">
                  <button className="btn btn-sm" onClick={(e) => {
                    e.stopPropagation();
                    openFile(file.path);
                  }} title="打开文件">
                    <i className="fas fa-external-link-alt"></i>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
};

export default FilePanel; 