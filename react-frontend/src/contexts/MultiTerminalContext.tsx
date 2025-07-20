import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface TerminalTab {
  id: string;
  title: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  isActive: boolean;
}

interface MultiTerminalContextType {
  terminalTabs: TerminalTab[];
  activeTerminalId: string | null;
  addTerminal: () => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalStatus: (id: string, status: TerminalTab['status']) => void;
  updateTerminalTitle: (id: string, title: string) => void;
}

const MultiTerminalContext = createContext<MultiTerminalContextType | undefined>(undefined);

interface MultiTerminalProviderProps {
  children: ReactNode;
}

export const MultiTerminalProvider: React.FC<MultiTerminalProviderProps> = ({ children }) => {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([
    {
      id: 'terminal-1',
      title: '终端 1',
      status: 'disconnected',
      isActive: true
    }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('terminal-1');

  const addTerminal = useCallback(() => {
    const newId = `terminal-${Date.now()}`;
    const newTerminal: TerminalTab = {
      id: newId,
      title: `终端 ${terminalTabs.length + 1}`,
      status: 'disconnected',
      isActive: false
    };

    setTerminalTabs(prev => {
      // 将当前活动终端设为非活动
      const updatedTabs = prev.map(tab => ({
        ...tab,
        isActive: false
      }));
      
      // 添加新终端并设为活动
      newTerminal.isActive = true;
      return [...updatedTabs, newTerminal];
    });

    setActiveTerminalId(newId);
  }, [terminalTabs.length]);

  const removeTerminal = useCallback((id: string) => {
    setTerminalTabs(prev => {
      const filtered = prev.filter(tab => tab.id !== id);
      
      // 如果删除的是活动终端，激活第一个终端
      if (activeTerminalId === id && filtered.length > 0) {
        const firstTerminal = filtered[0];
        firstTerminal.isActive = true;
        setActiveTerminalId(firstTerminal.id);
      }
      
      return filtered.map((tab, index) => ({
        ...tab,
        title: `终端 ${index + 1}`
      }));
    });
  }, [activeTerminalId]);

  const setActiveTerminal = useCallback((id: string) => {
    setTerminalTabs(prev => prev.map(tab => ({
      ...tab,
      isActive: tab.id === id
    })));
    setActiveTerminalId(id);
  }, []);

  const updateTerminalStatus = useCallback((id: string, status: TerminalTab['status']) => {
    setTerminalTabs(prev => prev.map(tab => 
      tab.id === id ? { ...tab, status } : tab
    ));
  }, []);

  const updateTerminalTitle = useCallback((id: string, title: string) => {
    setTerminalTabs(prev => prev.map(tab => 
      tab.id === id ? { ...tab, title } : tab
    ));
  }, []);

  return (
    <MultiTerminalContext.Provider value={{
      terminalTabs,
      activeTerminalId,
      addTerminal,
      removeTerminal,
      setActiveTerminal,
      updateTerminalStatus,
      updateTerminalTitle
    }}>
      {children}
    </MultiTerminalContext.Provider>
  );
};

export const useMultiTerminal = (): MultiTerminalContextType => {
  const context = useContext(MultiTerminalContext);
  if (context === undefined) {
    throw new Error('useMultiTerminal must be used within a MultiTerminalProvider');
  }
  return context;
}; 