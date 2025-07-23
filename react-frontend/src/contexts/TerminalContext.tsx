import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { useMultiTerminal } from './MultiTerminalContext';

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
  terminalId: string; // 添加终端ID参数
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children, terminalId }) => {
  const { currentWorkspace } = useWorkspace();
  const { updateTerminalStatus } = useMultiTerminal();
  const [terminalStatus, setTerminalStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const writeToTerminalRef = useRef<(data: string) => void>(() => { });
  const webSocketRef = useRef<WebSocket | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  // 更新多终端上下文中的状态
  const updateStatus = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    setTerminalStatus(status);
    updateTerminalStatus(terminalId, status);
  }, [terminalId, updateTerminalStatus]);

  const connectTerminal = useCallback(async () => {
    if (!currentWorkspace) {
      throw new Error('请先选择工作空间');
    }

    updateStatus('connecting');

    try {
      // 首先创建终端会话
      const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/terminal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cols: 80,
          rows: 20,
        }),
      });

      if (!response.ok) {
        throw new Error('创建终端会话失败');
      }

      const terminalData = await response.json();
      terminalIdRef.current = terminalData.id;

      // 连接WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/workspaces/${currentWorkspace}/terminal/${terminalData.id}/ws`;

      console.log(`[Terminal ${terminalId}] 终端ID:`, terminalData.id);

      const ws = new WebSocket(wsUrl);
      webSocketRef.current = ws;

      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error(`[Terminal ${terminalId}] WebSocket连接超时`);
          ws.close();
          updateStatus('error');
        }
      }, 5000);

      ws.onopen = function () {
        console.log(`[Terminal ${terminalId}] WebSocket连接已建立`);
        clearTimeout(connectionTimeout);
        updateStatus('connected');
        console.log(`[Terminal ${terminalId}] 等待后端终端初始化...`);
      };

      // 前端ASCII控制符过滤函数
      const filterControlCharacters = (text: string): string => {
        if (!text || text.length === 0) return '';
        
        // 过滤括号粘贴模式
        if (text.includes('\x1b[?2004l') || text.includes('\x1b[?2004h') || 
            text.includes('\x1b[201~') || text.includes('\x1b[200~')) {
          return '';
        }
        // 过滤各种控制序列
        let filtered = text
        return filtered;
      };

      ws.onmessage = function (event) {
        let outputText = '';
        
        if (typeof event.data === 'string') {
          let asc = event.data.split('').map(c => c.charCodeAt(0));
          outputText = String.fromCodePoint(...asc.slice(7, asc.length));
        } else if (event.data instanceof ArrayBuffer) {
          outputText = String.fromCodePoint(...new Uint8Array(event.data));
        } else {
          outputText = String.fromCodePoint(event.data);
        }
        
        // 在前端也过滤控制字符
        const filteredText = filterControlCharacters(outputText);
        if (filteredText) {
          writeToTerminalRef.current(filteredText);
        }
      };

      ws.onclose = function (event) {
        console.log(`[Terminal ${terminalId}] WebSocket连接已关闭:`, event.code, event.reason);
        clearTimeout(connectionTimeout);
        webSocketRef.current = null;
        terminalIdRef.current = null;
        updateStatus('disconnected');
      };

      ws.onerror = function (error) {
        console.error(`[Terminal ${terminalId}] WebSocket错误:`, error);
        clearTimeout(connectionTimeout);
        updateStatus('error');
      };

    } catch (error) {
      console.error(`[Terminal ${terminalId}] 连接失败:`, error);
      updateStatus('error');
      throw error;
    }
  }, [currentWorkspace, terminalId, updateStatus]);

  const disconnectTerminal = useCallback(() => {
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
    terminalIdRef.current = null;
    updateStatus('disconnected');
  }, [updateStatus]);

  const clearTerminal = useCallback(() => {
    // 清屏功能由 xterm.js 处理
  }, []);

  const sendCommand = useCallback((command: string) => {
    console.log(`[Terminal ${terminalId}] WebSocket状态:`, webSocketRef.current?.readyState);

    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      console.log(`[Terminal ${terminalId}] WebSocket未连接，忽略命令:`, command);
      return;
    }


    if (command.length === 1 && (command.charCodeAt(0) < 32 || command.charCodeAt(0) === 127)) {
      webSocketRef.current.send(command);
    } else if (command.startsWith('\x1b[')) {
      webSocketRef.current.send(command);
    } else {
      webSocketRef.current.send(command + '\n');
    }
  }, [terminalId]);

  const setTerminalWriter = useCallback((writer: (data: string) => void) => {
    writeToTerminalRef.current = writer;
  }, []);

  // 当工作空间改变时，断开终端连接
  useEffect(() => {
    if (!currentWorkspace) {
      disconnectTerminal();
    }
  }, [currentWorkspace, disconnectTerminal]);

  // 组件卸载时清理WebSocket连接
  useEffect(() => {
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, []);

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