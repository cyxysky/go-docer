import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FileItem, Tab } from '../types';
import { fileAPI } from '../services/api';
import { clearAllCache } from '../components/FileTree';
import { useNotification } from '../components/NotificationProvider';

interface FileContextType {
  // 文件树状态
  files: FileItem[];
  currentDirectory: string;
  isLoading: boolean;
  error: string | null;
  
  // 标签页管理
  openTabs: Map<string, Tab>;
  activeTab: string | null;
  
  // 文件操作
  loadFileTree: (workspaceId: string, path?: string) => Promise<void>;
  loadSubFiles: (workspaceId: string, path: string) => Promise<FileItem[]>;
  openFile: (filePath: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  
  // 文件系统操作
  createFile: (fileName: string) => Promise<void>;
  createFolder: (folderName: string) => Promise<void>;
  deleteFile: (filePath: string, onConfirm?: () => Promise<void>) => Promise<void>;
  renameFile: (oldPath: string, newName: string) => Promise<void>;
  moveFile: (sourcePath: string, targetPath: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  
  // 获取当前激活的标签页内容
  getActiveTabContent: () => string;
  getTabContent: (tabId: string) => string | null;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export const useFile = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFile must be used within a FileProvider');
  }
  return context;
};

interface FileProviderProps {
  children: React.ReactNode;
  currentWorkspace: string | null;
  workspaceStatus?: string;
}

export const FileProvider: React.FC<FileProviderProps> = ({ children, currentWorkspace, workspaceStatus }) => {
  // 文件树状态
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 标签页状态
  const [openTabs, setOpenTabs] = useState<Map<string, Tab>>(new Map());
  const [activeTab, setActiveTab] = useState<string | null>(null);
  
  const { showError } = useNotification();

  // 加载文件树
  const loadFileTree = useCallback(async (workspaceId: string, path: string = '') => {
    if (!workspaceId) return;

    console.log(`📁 加载文件树: ${workspaceId}, 路径: ${path || '/'}`);
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fileAPI.getFileTree(workspaceId, path);
      const fileList = Array.isArray(data) ? data : [];
      setFiles(fileList);
      setCurrentDirectory(path);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载文件树失败';
      console.error('❌ 加载文件树失败:', errorMessage);
      setError(errorMessage);
      showError('加载失败', errorMessage);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  // 加载子文件
  const loadSubFiles = useCallback(async (workspaceId: string, path: string): Promise<FileItem[]> => {
    if (!workspaceId) return [];

    try {
      const data = await fileAPI.getFileTree(workspaceId, path);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载子文件失败';
      console.error('加载子文件失败:', err);
      showError('加载失败', errorMessage);
      return [];
    }
  }, [showError]);

  // 刷新文件树
  const refreshFileTree = useCallback(async () => {
    if (!currentWorkspace) return;
    await loadFileTree(currentWorkspace, currentDirectory);
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  // 打开文件
  const openFile = useCallback(async (filePath: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    try {
      const content = await fileAPI.readFile(currentWorkspace, filePath);
      const tabId = filePath;
      const newTab: Tab = {
        id: tabId,
        path: filePath,
        content,
        originalContent: content,
        modified: false
      };

      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        newTabs.set(tabId, newTab);
        return newTabs;
      });
      
      setActiveTab(tabId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '打开文件失败';
      showError('打开失败', errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, showError]);

  // 关闭标签页
  const closeTab = useCallback((tabId: string) => {
    setOpenTabs(prev => {
      const newTabs = new Map(prev);
      newTabs.delete(tabId);
      return newTabs;
    });

    if (activeTab === tabId) {
      const remainingTabs = Array.from(openTabs.keys()).filter(id => id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[remainingTabs.length - 1]);
      } else {
        setActiveTab(null);
      }
    }
  }, [openTabs, activeTab]);

  // 设置激活标签页
  const setActiveTabCallback = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  // 更新标签页内容
  const updateTabContent = useCallback((tabId: string, content: string) => {
    setOpenTabs(prev => {
      const tab = prev.get(tabId);
      if (!tab) return prev;
      
      if (tab.content === content) {
        return prev; // 内容没有变化，避免不必要的重新渲染
      }
      
      const newTabs = new Map(prev);
      const updatedTab = {
        ...tab,
        content,
        modified: content !== tab.originalContent
      };
      newTabs.set(tabId, updatedTab);
      return newTabs;
    });
  }, []);

  // 获取激活标签页内容
  const getActiveTabContent = useCallback(() => {
    if (!activeTab) return '';
    const tab = openTabs.get(activeTab);
    return tab?.content || '';
  }, [activeTab, openTabs]);

  // 获取指定标签页内容
  const getTabContent = useCallback((tabId: string) => {
    const tab = openTabs.get(tabId);
    return tab?.content || null;
  }, [openTabs]);

  // 创建文件
  const createFile = useCallback(async (fileName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const filePath = currentDirectory ? `${currentDirectory}/${fileName}` : fileName;
    
    try {
      await fileAPI.createFile(currentWorkspace, filePath);
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建文件失败';
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  // 创建文件夹
  const createFolder = useCallback(async (folderName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const folderPath = currentDirectory ? `${currentDirectory}/${folderName}` : folderName;
    
    try {
      await fileAPI.createFolder(currentWorkspace, folderPath);
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建文件夹失败';
      showError('创建失败', errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, showError]);

  // 删除文件
  const deleteFile = useCallback(async (filePath: string, onConfirm?: () => Promise<void>) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    if (onConfirm) {
      await onConfirm();
    } else {
      if (!confirm(`确定要删除 ${filePath} 吗？`)) {
        return;
      }
    }

    try {
      await fileAPI.deleteFile(currentWorkspace, filePath);
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除失败';
      showError('删除失败', errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, showError]);

  // 重命名文件
  const renameFile = useCallback(async (oldPath: string, newName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const pathParts = oldPath.split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    try {
      await fileAPI.moveFile(currentWorkspace, oldPath, newPath);
      
      // 更新相关的tab路径
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTabs = new Map<string, Tab>();
        
        for (const [tabId, tab] of newTabs) {
          if (tab.path === oldPath) {
            const updatedTab = { ...tab, path: newPath };
            updatedTabs.set(newPath, updatedTab);
            
            if (activeTab === tabId) {
              setActiveTab(newPath);
            }
          } else {
            updatedTabs.set(tabId, tab);
          }
        }
        
        return updatedTabs;
      });
      
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '重命名失败';
      showError('重命名失败', errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, activeTab, showError]);

  // 移动文件
  const moveFile = useCallback(async (sourcePath: string, targetPath: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    try {
      await fileAPI.moveFile(currentWorkspace, sourcePath, targetPath);
      
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTabs = new Map<string, Tab>();
        
        for (const [tabId, tab] of newTabs) {
          if (tab.path === sourcePath) {
            const updatedTab = { ...tab, path: targetPath };
            updatedTabs.set(targetPath, updatedTab);
            
            if (activeTab === tabId) {
              setActiveTab(targetPath);
            }
          } else {
            updatedTabs.set(tabId, tab);
          }
        }
        
        return updatedTabs;
      });
      
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '移动文件失败';
      showError('移动失败', errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, activeTab, showError]);

  // 工作空间变化时重置状态
  React.useEffect(() => {
    console.log('🔄 工作空间变化:', currentWorkspace);
    
    if (!currentWorkspace) {
      setFiles([]);
      setCurrentDirectory('');
      setOpenTabs(new Map());
      setActiveTab(null);
      setIsLoading(false);
      setError(null);
      clearAllCache();
    } else {
      clearAllCache();
      setFiles([]);
      setCurrentDirectory('');
      
      const loadNewWorkspace = async () => {
        try {
          await loadFileTree(currentWorkspace, '');
        } catch (error) {
          console.error('❌ 加载工作空间文件失败:', error);
        }
      };
      
      loadNewWorkspace();
    }
  }, [currentWorkspace, loadFileTree]);

  // 监听open-file-in-tab事件
  React.useEffect(() => {
    const handleOpenFileInTab = async (event: CustomEvent) => {
      const { filePath } = event.detail;
      console.log('FileContext: 收到open-file-in-tab事件:', filePath);
      
      if (filePath && currentWorkspace) {
        try {
          await openFile(filePath);
          console.log('FileContext: 文件已打开到tab:', filePath);
        } catch (error) {
          console.error('FileContext: 打开文件失败:', error);
        }
      }
    };

    window.addEventListener('open-file-in-tab', handleOpenFileInTab as EventListener);
    
    return () => {
      window.removeEventListener('open-file-in-tab', handleOpenFileInTab as EventListener);
    };
  }, [currentWorkspace, openFile]);

  // 工作空间状态变化时刷新文件列表
  React.useEffect(() => {
    if (currentWorkspace && workspaceStatus === 'running' && files.length === 0) {
      console.log('🔄 工作空间状态变为running，刷新文件列表');
      loadFileTree(currentWorkspace, currentDirectory);
    }
  }, [workspaceStatus, currentWorkspace, files.length, currentDirectory, loadFileTree]);

  const value: FileContextType = {
    files,
    currentDirectory,
    isLoading,
    error,
    openTabs,
    activeTab,
    loadFileTree,
    loadSubFiles,
    openFile,
    closeTab,
    setActiveTab: setActiveTabCallback,
    updateTabContent,
    createFile,
    createFolder,
    deleteFile,
    renameFile,
    moveFile,
    refreshFileTree,
    getActiveTabContent,
    getTabContent
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
}; 