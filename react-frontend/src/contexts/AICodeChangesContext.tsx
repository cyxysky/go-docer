import React, { createContext, useContext, useState, useCallback } from 'react';

interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  applied?: boolean;
}

interface AICodeChangesContextType {
  // AI代码修改状态
  pendingChanges: CodeChange[];
  
  // 操作方法
  setPendingChanges: (changes: CodeChange[]) => void;
  addPendingChanges: (changes: CodeChange[]) => void;
  removePendingChanges: (filePath: string) => void;
  clearPendingChanges: () => void;
  markChangeAsApplied: (filePath: string) => void;
  
  // 获取特定文件的修改
  getChangesForFile: (filePath: string) => CodeChange | undefined;
  hasChangesForFile: (filePath: string) => boolean;
}

const AICodeChangesContext = createContext<AICodeChangesContextType | undefined>(undefined);

export const useAICodeChanges = () => {
  const context = useContext(AICodeChangesContext);
  if (!context) {
    throw new Error('useAICodeChanges must be used within an AICodeChangesProvider');
  }
  return context;
};

interface AICodeChangesProviderProps {
  children: React.ReactNode;
}

export const AICodeChangesProvider: React.FC<AICodeChangesProviderProps> = ({ children }) => {
  const [pendingChanges, setPendingChangesState] = useState<CodeChange[]>([]);

  // 设置所有待处理的修改
  const setPendingChanges = useCallback((changes: CodeChange[]) => {
    setPendingChangesState(changes);
  }, []);

  // 添加新的修改
  const addPendingChanges = useCallback((changes: CodeChange[]) => {
    setPendingChangesState(prev => {
      // 过滤掉已存在的相同文件路径的修改
      const existingFilePaths = new Set(prev.map(change => change.filePath));
      const newChanges = changes.filter(change => !existingFilePaths.has(change.filePath));
      return [...prev, ...newChanges];
    });
  }, []);

  // 移除特定文件的修改
  const removePendingChanges = useCallback((filePath: string) => {
    setPendingChangesState(prev => prev.filter(change => change.filePath !== filePath));
  }, []);

  // 清空所有修改
  const clearPendingChanges = useCallback(() => {
    setPendingChangesState([]);
  }, []);

  // 标记修改为已应用
  const markChangeAsApplied = useCallback((filePath: string) => {
    setPendingChangesState(prev => 
      prev.map(change => 
        change.filePath === filePath 
          ? { ...change, applied: true }
          : change
      )
    );
  }, []);

  // 获取特定文件的修改
  const getChangesForFile = useCallback((filePath: string) => {
    return pendingChanges.find(change => change.filePath === filePath);
  }, [pendingChanges]);

  // 检查是否有特定文件的修改
  const hasChangesForFile = useCallback((filePath: string) => {
    return pendingChanges.some(change => change.filePath === filePath);
  }, [pendingChanges]);

  const value: AICodeChangesContextType = {
    pendingChanges,
    setPendingChanges,
    addPendingChanges,
    removePendingChanges,
    clearPendingChanges,
    markChangeAsApplied,
    getChangesForFile,
    hasChangesForFile
  };

  return (
    <AICodeChangesContext.Provider value={value}>
      {children}
    </AICodeChangesContext.Provider>
  );
}; 