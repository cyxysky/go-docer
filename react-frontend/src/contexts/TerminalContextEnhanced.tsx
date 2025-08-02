import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import { useWorkspace } from './WorkspaceContext';


interface TerminalContextType {
  terminalStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectTerminal: () => Promise<void>;
  disconnectTerminal: () => void;
  clearTerminal: () => void;
  sendCommand: (command: string) => void;
  setTerminalWriter: (writer: (data: string) => void) => void;
}

const TerminalContext = createContext<TerminalContextType | null>(null);

export const useTerminal = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
};

interface TerminalProviderProps {
  children: React.ReactNode;
  terminalId: string;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children, terminalId }) => {
  const { currentWorkspace } = useWorkspace();
  const [terminalStatus, setTerminalStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const webSocketRef = useRef<WebSocket | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const writeToTerminalRef = useRef<((data: string) => void) | null>(null);

  const updateStatus = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    setTerminalStatus(status);
  }, []);

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

      // 处理WebSocket数据
      ws.onmessage = function (event) {
        // 直接写入数据到终端
        if (writeToTerminalRef.current) {
          writeToTerminalRef.current(event.data);
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

    // 发送命令到后端
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