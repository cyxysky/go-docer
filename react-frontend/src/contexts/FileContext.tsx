import React, { createContext, useContext, useState, useCallback } from 'react';
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
  openFile: (filePath: string) => Promise<void>;
  openTab: (filePath: string, content: string) => void;
  closeTab: (tabId: string) => void;
  saveFile: () => Promise<void>;
  updateTabContent: (tabId: string, content: string) => void;
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

  const loadFileTree = useCallback(async (workspaceId: string, path: string = '') => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);
    try {
      console.log(`加载文件树: workspaceId=${workspaceId}, path="${path}"`);
      const data = await fileAPI.getFileTree(workspaceId, path);
      console.log('文件树数据:', data);
      // 确保 data 是数组
      setFiles(Array.isArray(data) ? data : []);
      setCurrentDirectory(path);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载文件树失败';
      setError(errorMessage);
      console.error('加载文件树失败:', err);
      // 设置空数组避免渲染错误
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

    setOpenTabs(prev => new Map(prev).set(tabId, newTab));
    setActiveTab(tabId);
    setCurrentFile(filePath);
  }, []);

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

  const saveFile = useCallback(async () => {
    if (!currentWorkspace || !activeTab) {
      throw new Error('请先打开文件');
    }

    const tab = openTabs.get(activeTab);
    if (!tab) return;

    setError(null);
    try {
      await fileAPI.writeFile(currentWorkspace, tab.path, tab.content);
      
      setOpenTabs(prev => {
        const newTabs = new Map(prev);
        const updatedTab = { ...tab, originalContent: tab.content, modified: false };
        newTabs.set(activeTab, updatedTab);
        return newTabs;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存文件失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, activeTab, openTabs]);

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

  // 当工作空间改变时，清空文件相关状态
  React.useEffect(() => {
    if (!currentWorkspace) {
      setFiles([]);
      setCurrentDirectory('');
      setOpenTabs(new Map());
      setActiveTab(null);
      setCurrentFile(null);
    } else {
      loadFileTree(currentWorkspace);
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
    openFile,
    openTab,
    closeTab,
    saveFile,
    updateTabContent
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
}; 