import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useWorkspace } from './WorkspaceContext';

interface TerminalContextType {
  terminalStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectTerminal: () => Promise<void>;
  disconnectTerminal: () => void;
  clearTerminal: () => void;
  sendCommand: (command: string) => void;
  setTerminalWriter: (writer: (data: string) => void) => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export const useTerminal = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
};

interface TerminalProviderProps {
  children: React.ReactNode;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const { currentWorkspace } = useWorkspace();
  const [terminalStatus, setTerminalStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const writeToTerminalRef = useRef<(data: string) => void>(() => {});

  const connectTerminal = useCallback(async () => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    setTerminalStatus('connecting');

    try {
      // 模拟连接过程
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 显示欢迎信息
      writeToTerminalRef.current('欢迎使用在线代码编辑器终端！\r\n');
      writeToTerminalRef.current(`当前工作空间: ${currentWorkspace}\r\n`);
      writeToTerminalRef.current('输入 "help" 查看可用命令\r\n\r\n');
      
      setTerminalStatus('connected');
    } catch (error) {
      setTerminalStatus('error');
      throw error;
    }
  }, [currentWorkspace]);

  const disconnectTerminal = useCallback(() => {
    writeToTerminalRef.current('终端已断开连接\r\n');
    setTerminalStatus('disconnected');
  }, []);

  const clearTerminal = useCallback(() => {
    // 清屏功能由 xterm.js 处理
  }, []);

  const sendCommand = useCallback((command: string) => {
    if (!command.trim()) return;
    
    // 简单的命令处理
    if (command.trim() === 'help') {
      writeToTerminalRef.current('可用命令:\r\n');
      writeToTerminalRef.current('  help     - 显示帮助信息\r\n');
      writeToTerminalRef.current('  clear    - 清屏\r\n');
      writeToTerminalRef.current('  pwd      - 显示当前目录\r\n');
      writeToTerminalRef.current('  ls       - 列出文件\r\n');
      writeToTerminalRef.current('  date     - 显示当前时间\r\n\r\n');
    } else if (command.trim() === 'clear') {
      // 清屏功能由 xterm.js 处理
    } else if (command.trim() === 'pwd') {
      writeToTerminalRef.current('/workspace\r\n');
    } else if (command.trim() === 'ls') {
      writeToTerminalRef.current('README.md  src/  package.json\r\n');
    } else if (command.trim() === 'date') {
      writeToTerminalRef.current(new Date().toString() + '\r\n');
    } else {
      writeToTerminalRef.current(`命令未找到: ${command}\r\n`);
    }
  }, []);

  const setTerminalWriter = useCallback((writer: (data: string) => void) => {
    writeToTerminalRef.current = writer;
  }, []);

  // 当工作空间改变时，断开终端连接
  useEffect(() => {
    if (!currentWorkspace) {
      disconnectTerminal();
    }
  }, [currentWorkspace, disconnectTerminal]);

  const value: TerminalContextType = {
    terminalStatus,
    connectTerminal,
    disconnectTerminal,
    clearTerminal,
    sendCommand,
    setTerminalWriter
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}; 