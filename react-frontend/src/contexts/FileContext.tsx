import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { FileItem, Tab } from '../types';
import { fileAPI } from '../services/api';

interface FileContextType {
  files: FileItem[];
  currentDirectory: string;
  openTabs: Map<string, Tab>;
  activeTab: string | null;
  currentFile: string | null;
  isLoading: boolean;
  error: string | null;
  loadFileTree: (workspaceId: string, path?: string) => Promise<void>;
  loadSubFiles: (workspaceId: string, path: string) => Promise<FileItem[]>;
  openFile: (filePath: string) => Promise<void>;
  openTab: (filePath: string, content: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  saveFile: (tabId?: string | null) => Promise<void>;
  updateTabContent: (tabId: string, content: string) => void;
  createFile: (fileName: string) => Promise<void>;
  createFolder: (folderName: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  renameFile: (oldPath: string, newName: string) => Promise<void>;
  moveFile: (sourcePath: string, targetPath: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
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
}

export const FileProvider: React.FC<FileProviderProps> = ({ children, currentWorkspace }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [openTabs, setOpenTabs] = useState<Map<string, Tab>>(new Map());
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 使用ref来跟踪currentWorkspace的变化
  const currentWorkspaceRef = useRef<string | null>(null);
  currentWorkspaceRef.current = currentWorkspace;
  
  // 使用ref来跟踪openTabs的最新状态
  const openTabsRef = useRef<Map<string, Tab>>(new Map());
  openTabsRef.current = openTabs;

  const loadFileTree = useCallback(async (workspaceId: string, path: string = '') => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await fileAPI.getFileTree(workspaceId, path);
      // 确保 data 是数组
      setFiles(Array.isArray(data) ? data : []);
      setCurrentDirectory(path);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载文件树失败';
      setError(errorMessage);
      // 设置空数组避免渲染错误
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSubFiles = useCallback(async (workspaceId: string, path: string): Promise<FileItem[]> => {
    if (!workspaceId) return [];

    try {
      const data = await fileAPI.getFileTree(workspaceId, path);
      // 返回子文件列表，不改变当前状态
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('加载子文件失败:', err);
      return [];
    }
  }, []);

  const refreshFileTree = useCallback(async () => {
    if (!currentWorkspace) return;
    await loadFileTree(currentWorkspace, currentDirectory);
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  const createFile = useCallback(async (fileName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const filePath = currentDirectory ? `${currentDirectory}/${fileName}` : fileName;
    
    setError(null);
    try {
      await fileAPI.createFile(currentWorkspace, filePath);
      // 刷新文件树
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建文件失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  const createFolder = useCallback(async (folderName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const folderPath = currentDirectory ? `${currentDirectory}/${folderName}` : folderName;
    
    setError(null);
    try {
      await fileAPI.createFolder(currentWorkspace, folderPath);
      // 刷新文件树
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建文件夹失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    if (!confirm(`确定要删除 ${filePath} 吗？`)) {
      return;
    }

    setError(null);
    try {
      await fileAPI.deleteFile(currentWorkspace, filePath);
      // 刷新文件树
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree]);

  const renameFile = useCallback(async (oldPath: string, newName: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    const pathParts = oldPath.split('/');
    pathParts.pop(); // 移除文件名
    const parentPath = pathParts.join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    setError(null);
    try {
      // 使用移动文件API来实现重命名
      await fileAPI.moveFile(currentWorkspace, oldPath, newPath);
      
      // 更新相关的tab路径
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTabs = new Map<string, Tab>();
        
        for (const [tabId, tab] of newTabs) {
          if (tab.path === oldPath) {
            // 更新重命名的文件的tab路径
            const updatedTab = { ...tab, path: newPath };
            updatedTabs.set(newPath, updatedTab);
            
            // 如果这个tab是当前激活的tab，也要更新activeTab
            if (activeTab === tabId) {
              setActiveTab(newPath);
            }
          } else {
            updatedTabs.set(tabId, tab);
          }
        }
        
        return updatedTabs;
      });
      
      // 刷新文件树
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '重命名失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, activeTab]);

  const moveFile = useCallback(async (sourcePath: string, targetPath: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    setError(null);
    try {
      await fileAPI.moveFile(currentWorkspace, sourcePath, targetPath);
      
      // 更新相关的tab路径
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTabs = new Map<string, Tab>();
        
        for (const [tabId, tab] of newTabs) {
          if (tab.path === sourcePath) {
            // 更新移动的文件的tab路径
            const updatedTab = { ...tab, path: targetPath };
            updatedTabs.set(targetPath, updatedTab);
            
            // 如果这个tab是当前激活的tab，也要更新activeTab
            if (activeTab === tabId) {
              setActiveTab(targetPath);
            }
          } else {
            updatedTabs.set(tabId, tab);
          }
        }
        
        return updatedTabs;
      });
      
      // 刷新文件树
      await loadFileTree(currentWorkspace, currentDirectory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '移动文件失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, currentDirectory, loadFileTree, activeTab]);

  const openFile = useCallback(async (filePath: string) => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    setError(null);
    try {
      const content = await fileAPI.readFile(currentWorkspace, filePath);
      openTab(filePath, content);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '打开文件失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace]);

  const openTab = useCallback((filePath: string, content: string) => {
    const tabId = filePath;
    const newTab: Tab = {
      id: tabId,
      path: filePath,
      content,
      originalContent: content,
      modified: false
    };

    setOpenTabs(prev => {
      const newTabs = new Map(prev).set(tabId, newTab);
      return newTabs;
    });
    
    setActiveTab(tabId);
    setCurrentFile(filePath);
    
  }, []);

  const setActiveTabCallback = useCallback((tabId: string) => {
    setActiveTab(tabId);
    const tab = openTabs.get(tabId);
    if (tab) {
      setCurrentFile(tab.path);
    }
  }, [openTabs]);

  const closeTab = useCallback((tabId: string) => {
    const tab = openTabs.get(tabId);
    if (tab?.modified && !confirm('文件有未保存的更改，确定要关闭吗？')) {
      return;
    }

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
        setCurrentFile(null);
      }
    }
  }, [openTabs, activeTab]);

  const saveFile = useCallback(async (tabId?: string | null) => {
    // 使用传入的tabId或当前activeTab
    const targetTabId = tabId || activeTab;
    
    if (!currentWorkspace || !targetTabId) {
      let error = '';
      if (!currentWorkspace) {
        error = '请先选择工作空间。在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间。';
      } else if (!targetTabId) {
        error = '请先打开文件。在左侧文件面板中点击文件来打开。';
      }
      throw new Error(error);
    }

    // 使用ref获取最新的openTabs状态
    const latestOpenTabs = openTabsRef.current;
    const tab = latestOpenTabs.get(targetTabId);
    
    if (!tab) {
      console.error('标签页不存在');
      return;
    }

    setError(null);
    try {
      await fileAPI.writeFile(currentWorkspace, tab.path, tab.content);
      
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTab = { ...tab, originalContent: tab.content, modified: false };
        newTabs.set(targetTabId, updatedTab);
        return newTabs;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存文件失败';
      console.error('❌ 保存失败:', errorMessage);
      console.error('❌ 错误详情:', err);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, activeTab]);

  const updateTabContent = useCallback((tabId: string, content: string) => {
    setOpenTabs(prev => {
      const newTabs = new Map(prev);
      const tab = newTabs.get(tabId);
      if (tab) {
        const updatedTab = {
          ...tab,
          content,
          modified: content !== tab.originalContent
        };
        newTabs.set(tabId, updatedTab);
      }
      return newTabs;
    });
  }, []);

  // 当工作空间改变时，清空文件相关状态并重新加载
  React.useEffect(() => {
    if (!currentWorkspace) {
      setFiles([]);
      setCurrentDirectory('');
      setOpenTabs(new Map());
      setActiveTab(null);
      setCurrentFile(null);
      setError(null);
    } else {
      // 当工作空间改变时，自动加载根目录
      loadFileTree(currentWorkspace, '');
    }
  }, [currentWorkspace, loadFileTree]);

  const value: FileContextType = {
    files,
    currentDirectory,
    openTabs,
    activeTab,
    currentFile,
    isLoading,
    error,
    loadFileTree,
    loadSubFiles,
    openFile,
    openTab,
    closeTab,
    setActiveTab: setActiveTabCallback,
    saveFile,
    updateTabContent,
    createFile,
    createFolder,
    deleteFile,
    renameFile,
    moveFile,
    refreshFileTree
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
}; 