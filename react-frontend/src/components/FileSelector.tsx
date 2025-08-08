import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import './FileSelector.css';

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children?: FileItem[];
  expanded?: boolean;
}

interface FileSelectorProps {
  onSelectionChange: (selectedFiles: string[]) => void;
  selectedFiles: string[];
  onReset?: boolean;
}

const FileSelector: React.FC<FileSelectorProps> = ({ onSelectionChange, selectedFiles, onReset }) => {
  const { currentWorkspace } = useWorkspace();
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // 获取文件树
  const loadFileTree = async (path: string = ''): Promise<FileItem[]> => {
    if (!currentWorkspace) return [];

    try {
      const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`获取文件列表失败: ${response.status}`);
      }
      
      const files = await response.json();
      return files.map((file: any) => ({
        name: file.name,
        path: file.path,
        is_dir: file.is_dir,
        size: file.size,
        children: file.is_dir ? [] : undefined,
        expanded: false
      }));
    } catch (error) {
      console.error('加载文件树失败:', error);
      throw error;
    }
  };

  // 递归加载文件夹内容
  const loadFolderContent = async (folderPath: string): Promise<FileItem[]> => {
    return await loadFileTree(folderPath);
  };

  // 初始化文件树
  useEffect(() => {
    if (!currentWorkspace) return;

    setIsLoading(true);
    setError(null);
    
    loadFileTree()
      .then(files => {
        setFileTree(files);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [currentWorkspace]);

  // 重置展开状态
  const resetExpandedState = () => {
    setExpandedFolders(new Set());
  };

  // 监听重置回调
  useEffect(() => {
    if (onReset === true) {
      resetExpandedState();
    }
  }, [onReset]);

  // 切换文件夹展开/收起
  const toggleFolder = async (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    
    if (expandedFolders.has(folderPath)) {
      // 收起文件夹时，同时收起所有子文件夹
      const toRemove = Array.from(newExpanded).filter(path => path.startsWith(folderPath + '/'));
      toRemove.forEach(path => newExpanded.delete(path));
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
      
      // 加载文件夹内容
      try {
        const folderContent = await loadFolderContent(folderPath);
        updateFileTreeWithContent(folderPath, folderContent);
      } catch (error) {
        console.error('加载文件夹内容失败:', error);
      }
    }
    
    setExpandedFolders(newExpanded);
  };

  // 更新文件树中特定文件夹的内容
  const updateFileTreeWithContent = (folderPath: string, content: FileItem[]) => {
    const updateTree = (items: FileItem[]): FileItem[] => {
      return items.map(item => {
        if (item.path === folderPath && item.is_dir) {
          return { ...item, children: content, expanded: true };
        } else if (item.children) {
          return { ...item, children: updateTree(item.children) };
        }
        return item;
      });
    };
    
    setFileTree(updateTree(fileTree));
  };

  // 处理单个文件/文件夹的选择
  const handleItemToggle = (itemPath: string, isDir: boolean) => {
    const newSelected = new Set(selectedFiles);
    
    if (newSelected.has(itemPath)) {
      // 取消选择
      newSelected.delete(itemPath);
      
      // 如果是文件夹，也取消选择其所有子项
      if (isDir) {
        const toRemove = Array.from(newSelected).filter(path => path.startsWith(itemPath + '/'));
        toRemove.forEach(path => newSelected.delete(path));
      }
      
      // 向上递归检查父级文件夹状态
      updateParentSelection(newSelected, itemPath);
    } else {
      // 选择
      newSelected.add(itemPath);
      
      // 如果是文件夹，不自动选择其所有子项，只选择文件夹本身
      // 这样可以让后端知道用户选择了文件夹路径作为上下文
      
      // 向上递归检查父级文件夹状态
      updateParentSelection(newSelected, itemPath);
    }
    
    onSelectionChange(Array.from(newSelected));
  };

  // 更新父级文件夹的选择状态
  const updateParentSelection = (selectedSet: Set<string>, itemPath: string) => {
    const pathParts = itemPath.split('/');
    
    // 从直接父级开始，逐级向上检查
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('/');
      
      // 检查父级文件夹是否存在且有子项
      const parentItem = findItemByPath(fileTree, parentPath);
      if (!parentItem || !parentItem.is_dir || !parentItem.children) {
        continue;
      }
      
      // 检查父级文件夹的所有子项是否都被选中
      const allChildrenSelected = parentItem.children.every(child => {
        const childPath = parentPath ? `${parentPath}/${child.name}` : child.name;
        return selectedSet.has(childPath);
      });
      
      // 检查父级文件夹的所有子项是否都没有被选中
      const noChildrenSelected = parentItem.children.every(child => {
        const childPath = parentPath ? `${parentPath}/${child.name}` : child.name;
        return !selectedSet.has(childPath);
      });
      
      if (allChildrenSelected) {
        // 如果所有子项都被选中，选择父级文件夹
        selectedSet.add(parentPath);
      } else if (noChildrenSelected) {
        // 如果没有任何子项被选中，取消选择父级文件夹
        selectedSet.delete(parentPath);
      }
      // 如果部分子项被选中，保持父级文件夹的当前状态不变
    }
  };

  // 根据路径查找文件项
  const findItemByPath = (items: FileItem[], targetPath: string): FileItem | null => {
    for (const item of items) {
      if (item.path === targetPath) {
        return item;
      }
      if (item.children) {
        const found = findItemByPath(item.children, targetPath);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  // 获取所有文件路径（包括文件夹和文件）
  const getAllFilePaths = (items: FileItem[]): string[] => {
    const paths: string[] = [];
    
    const collectPaths = (fileItems: FileItem[]) => {
      fileItems.forEach(item => {
        paths.push(item.path);
        if (item.children && item.children.length > 0) {
          collectPaths(item.children);
        }
      });
    };
    
    collectPaths(items);
    return paths;
  };

  // 检查项目是否被选中
  const isItemSelected = (itemPath: string): boolean => {
    return selectedFiles.includes(itemPath);
  };

  // 检查文件夹是否完全选中（所有子项都被选中）
  const isFullySelected = (folderPath: string, children?: FileItem[]): boolean => {
    if (!children || children.length === 0) return false;
    
    // 递归检查所有子项是否都被选中
    const checkAllChildren = (items: FileItem[], basePath: string): boolean => {
      return items.every(child => {
        const childPath = basePath ? `${basePath}/${child.name}` : child.name;
        
        if (child.is_dir) {
          if (child.children && child.children.length > 0) {
            // 如果是文件夹且有子项，检查是否整个子树都被选中
            return checkAllChildren(child.children, childPath);
          } else {
            // 空文件夹，检查是否被选中
            return selectedFiles.includes(childPath);
          }
        } else {
          // 如果是文件，检查是否被选中
          return selectedFiles.includes(childPath);
        }
      });
    };
    
    return checkAllChildren(children, folderPath);
  };

  // 检查文件夹是否有任何子项被选中
  const hasSelectedChildren = (folderPath: string, children?: FileItem[]): boolean => {
    if (!children || children.length === 0) return false;
    
    // 递归检查是否有任何子项被选中
    const checkAnyChildren = (items: FileItem[], basePath: string): boolean => {
      return items.some(child => {
        const childPath = basePath ? `${basePath}/${child.name}` : child.name;
        if (selectedFiles.includes(childPath)) {
          return true;
        }
        if (child.is_dir && child.children && child.children.length > 0) {
          return checkAnyChildren(child.children, childPath);
        }
        return false;
      });
    };
    
    return checkAnyChildren(children, folderPath);
  };

  // 检查文件夹是否应该显示为部分选中状态
  const isPartiallySelected = (folderPath: string, children?: FileItem[]): boolean => {
    if (!children || children.length === 0) return false;
    
    const hasSelected = hasSelectedChildren(folderPath, children);
    const isFully = isFullySelected(folderPath, children);
    const isDirectlySelected = selectedFiles.includes(folderPath);
    
    // 部分选中：有子项被选中但不是全部，且自己没有被直接选中
    return hasSelected && !isFully && !isDirectlySelected;
  };



  // 渲染文件/文件夹项
  const renderFileItem = (item: FileItem, level: number = 0): React.ReactNode => {
    // 对于文件夹，检查是否被直接选中或所有子项都被选中
    let isSelected = isItemSelected(item.path);
    let isPartial = false;
    
    if (item.is_dir && item.children && item.children.length > 0) {
      const fullySelected = isFullySelected(item.path, item.children);
      
      // 如果没有被直接选中，但所有子项都被选中，则显示为选中状态
      if (!isSelected && fullySelected) {
        isSelected = true;
      }
      
      // 使用新的部分选中检查函数
      isPartial = isPartiallySelected(item.path, item.children);
    }
    
    const isExpanded = expandedFolders.has(item.path);

    return (
      <div key={item.path} className="fs-file-selector-item">
        <div 
          className={`fs-file-item-row ${isSelected ? 'selected' : ''}`}
        >
          {item.is_dir && (
            <button
              className={`fs-expand-btn ${isExpanded ? 'expanded' : ''}`}
              onClick={() => toggleFolder(item.path)}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          )}
          
          <label className="fs-file-item-label">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleItemToggle(item.path, item.is_dir)}
              ref={input => {
                if (input) {
                  input.indeterminate = isPartial;
                }
              }}
            />
            
            <i className={`fs-file-icon ${item.is_dir ? 'fas fa-folder' : getFileIcon(item.name)} ${isSelected ? 'selected' : ''}`}></i>
            
            <span className="fs-file-name">{item.name}</span>
            
            {!item.is_dir && (
              <span className="fs-file-size">{formatFileSize(item.size)}</span>
            )}
          </label>
        </div>
        
        {item.is_dir && isExpanded && item.children && (
          <div className="fs-file-children">
            {item.children.map(child => renderFileItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 获取文件图标
  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': return 'fab fa-js-square';
      case 'ts': case 'tsx': return 'fas fa-file-code';
      case 'py': return 'fab fa-python';
      case 'java': return 'fab fa-java';
      case 'html': return 'fab fa-html5';
      case 'css': return 'fab fa-css3-alt';
      case 'json': return 'fas fa-file-code';
      case 'md': return 'fab fa-markdown';
      case 'txt': return 'fas fa-file-alt';
      case 'pdf': return 'fas fa-file-pdf';
      case 'png': case 'jpg': case 'gif': case 'svg': return 'fas fa-file-image';
      default: return 'fas fa-file';
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="fs-file-selector-loading">
        <i className="fas fa-spinner fa-spin"></i>
        <span>加载文件列表...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fs-file-selector-error">
        <i className="fas fa-exclamation-triangle"></i>
        <span>加载失败: {error}</span>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="fs-file-selector-empty">
        <i className="fas fa-folder-open"></i>
        <span>请先选择工作空间</span>
      </div>
    );
  }

  return (
    <div className="fs-file-selector">
      <div className="fs-file-selector-header">
        <span>选择要导出的文件和文件夹</span>
        <div className="fs-selection-actions">
          <button
            className="fs-btn-link"
            onClick={() => onSelectionChange([])}
          >
            清空选择
          </button>
          <button
            className="fs-btn-link"
            onClick={() => {
              const allPaths = getAllFilePaths(fileTree);
              onSelectionChange(allPaths);
            }}
          >
            全选
          </button>
        </div>
      </div>
      
      <div className="fs-file-selector-tree">
        {fileTree.length === 0 ? (
          <div className="fs-file-selector-empty">
            <i className="fas fa-folder-open"></i>
            <span>当前目录为空</span>
          </div>
        ) : (
          fileTree.map(item => renderFileItem(item))
        )}
      </div>
    </div>
  );
};

export default FileSelector; 