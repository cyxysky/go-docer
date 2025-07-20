import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Workspace } from '../types';
import { workspaceAPI } from '../services/api';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: string | null;
  isLoading: boolean;
  error: string | null;
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, image: string, gitRepo: string, gitBranch: string) => Promise<void>;
  selectWorkspace: (id: string) => void;
  startWorkspace: (id: string) => Promise<void>;
  stopWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceAPI.getWorkspaces();
      // API 已经返回解析后的 JSON 数据，不需要再次解析
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工作空间失败');
      console.error('加载工作空间失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string, image: string, gitRepo: string, gitBranch: string) => {
    setError(null);
    try {
      await workspaceAPI.createWorkspace({
        name,
        image,
        git_repo: gitRepo || undefined,
        git_branch: gitBranch,
      });
      await loadWorkspaces(); // 重新加载数据
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建工作空间失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [loadWorkspaces]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setCurrentWorkspace(workspaceId);
  }, []);

  const startWorkspace = useCallback(async (workspaceId: string) => {
    setError(null);
    try {
      await workspaceAPI.startWorkspace(workspaceId);
      await loadWorkspaces(); // 重新加载数据
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '启动工作空间失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [loadWorkspaces]);

  const stopWorkspace = useCallback(async (workspaceId: string) => {
    setError(null);
    try {
      await workspaceAPI.stopWorkspace(workspaceId);
      await loadWorkspaces(); // 重新加载数据
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '停止工作空间失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [loadWorkspaces]);

  const deleteWorkspace = useCallback(async (workspaceId: string) => {
    setError(null);
    try {
      // 先停止工作空间
      await workspaceAPI.stopWorkspace(workspaceId);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 然后删除
      await workspaceAPI.deleteWorkspace(workspaceId);
      
      // 如果删除的是当前选中的工作空间，清空选择
      if (currentWorkspace === workspaceId) {
        setCurrentWorkspace(null);
      }
      
      await loadWorkspaces(); // 重新加载数据
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除工作空间失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentWorkspace, loadWorkspaces]);

  // 初始化时加载工作空间
  useEffect(() => {
    loadWorkspaces();
    
    // 设置定时刷新
    const interval = setInterval(loadWorkspaces, 5000);
    return () => clearInterval(interval);
  }, [loadWorkspaces]);

  const value: WorkspaceContextType = {
    workspaces,
    currentWorkspace,
    isLoading,
    error,
    loadWorkspaces,
    createWorkspace,
    selectWorkspace,
    startWorkspace,
    stopWorkspace,
    deleteWorkspace
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}; 