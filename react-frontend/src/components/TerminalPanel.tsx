import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminal } from '../contexts/TerminalContext';
import { useTheme } from '../contexts/ThemeContext';
import { useMultiTerminal } from '../contexts/MultiTerminalContext';
import { TerminalProvider } from '../contexts/TerminalContext';
import TerminalTabs from './TerminalTabs';
// import stripAnsi from 'strip-ansi';
import './TerminalPanel.css';

const TerminalPanel: React.FC = () => {
  const { terminalTabs } = useMultiTerminal();

  return (
    <div className="terminal-container">
      {/* 终端标签栏 */}
      <TerminalTabs />

      {/* 终端内容区域 */}
      <div className="terminal-content-area">
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-panel ${tab.isActive ? 'active' : 'hidden'}`}
          >
            <TerminalProvider terminalId={tab.id}>
              <TerminalInstance terminalId={tab.id} />
            </TerminalProvider>
          </div>
        ))}
      </div>
    </div>
  );
};

// 独立的终端实例组件
interface TerminalInstanceProps {
  terminalId: string;
}

const TerminalInstance: React.FC<TerminalInstanceProps> = ({ terminalId }) => {
  const {
    terminalStatus,
    connectTerminal,
    disconnectTerminal,
    clearTerminal,
    sendCommand,
    setTerminalWriter
  } = useTerminal();
  const { theme } = useTheme();

  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const statusRef = useRef(terminalStatus);
  const currentInputRef = useRef('');
  const [isVisible, setIsVisible] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // 发送数据到WebSocket的函数
  const sendToWebSocket = useCallback((data: string) => {
    console.log(`[Terminal ${terminalId}] sendToWebSocket 调用:`, data, '状态:', statusRef.current);
    if (statusRef.current === 'connected') {
      console.log(`[Terminal ${terminalId}] 发送数据到WebSocket:`, data);
      sendCommand(data);
    } else {
      console.log(`[Terminal ${terminalId}] WebSocket未连接，忽略数据:`, data);
    }
  }, [sendCommand, terminalId]);

  // 初始化终端的函数
  const initializeTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstanceRef.current || isInitialized) return;

    console.log(`[Terminal ${terminalId}] 开始初始化终端...`);

    // 根据主题选择终端颜色
    const terminalTheme = theme === 'dark' ? {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#cccccc',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff'
    } : {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#333333',
      black: '#000000',
      red: '#cd3131',
      green: '#00bc00',
      yellow: '#949800',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#555555',
      brightBlack: '#666666',
      brightRed: '#cd3131',
      brightGreen: '#14ce14',
      brightYellow: '#b5ba00',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#a5a5a5'
    };

    // 创建终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Fira Code, Consolas, Monaco, monospace',
      theme: terminalTheme,
      allowTransparency: true,
      convertEol: true,
      scrollOnUserInput: true,
      scrollback: 1000
    });

    // 创建 FitAddon 用于自适应大小
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // 打开终端
    terminal.open(terminalRef.current);

    // 延迟执行 fit 以确保容器有正确的尺寸
    const setupTerminal = () => {
      try {
        console.log(`[Terminal ${terminalId}] 设置终端尺寸...`);
        fitAddon.fit();
        terminal.clear();
        terminal.write('\x1B[1;36m欢迎使用在线代码编辑器终端\x1B[0m\r\n');
        terminal.write('请选择工作空间并点击"连接终端"开始使用\r\n\r\n');

        terminal.write('\x1B[1;36m$ \x1B[0m');
        terminal.focus();
        setIsInitialized(true);
        console.log(`[Terminal ${terminalId}] 终端初始化完成`);
      } catch (error) {
        console.warn(`[Terminal ${terminalId}] 终端尺寸适配失败:`, error);
        setTimeout(() => {
          try {
            fitAddon.fit();
            terminal.focus();
            setIsInitialized(true);
          } catch (retryError) {
            console.warn(`[Terminal ${terminalId}] 终端尺寸适配重试失败:`, retryError);
          }
        }, 500);
      }
    };

    requestAnimationFrame(() => {
      setTimeout(setupTerminal, 100);
    });

    // 保存引用
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 监听终端输入
    terminal.onData((data) => {
      if (statusRef.current !== 'connected') {
        console.log(`[Terminal ${terminalId}] 未连接状态，忽略输入:`, data);
        return;
      }

      console.log(`[Terminal ${terminalId}] 处理输入:`, data, '状态:', statusRef.current);

      const code = data.charCodeAt(0);

      // 处理回车键
      if (code === 13) {
        terminal.write('\r\n');
        if (currentInputRef.current.trim()) {
          console.log(`[Terminal ${terminalId}] 发送命令:`, currentInputRef.current);
          sendToWebSocket(currentInputRef.current);
          currentInputRef.current = '';
        }
        return;
      }

      // 处理退格键
      if (code === 127 || code === 8) {
        if (currentInputRef.current.length > 0) {
          terminal.write('\b \b');
          currentInputRef.current = currentInputRef.current.slice(0, -1);
        }
        return;
      }

      // 处理 Ctrl+C (中断命令)
      if (code === 3) {
        terminal.write('^C\r\n');
        currentInputRef.current = '';
        sendToWebSocket('\x03');
        return;
      }

      // 处理 Ctrl+D (EOF)
      if (code === 4) {
        sendToWebSocket('\x04');
        return;
      }

      // 处理 Ctrl+Z (SUSP)
      if (code === 26) {
        sendToWebSocket('\x1a');
        return;
      }

      // 处理方向键
      if (data === '\x1b[A') { // 上箭头
        sendToWebSocket('\x1b[A');
        return;
      }
      if (data === '\x1b[B') { // 下箭头
        sendToWebSocket('\x1b[B');
        return;
      }
      if (data === '\x1b[C') { // 右箭头
        sendToWebSocket('\x1b[C');
        return;
      }
      if (data === '\x1b[D') { // 左箭头
        sendToWebSocket('\x1b[D');
        return;
      }

      // 处理Tab键
      if (code === 9) {
        sendToWebSocket('\t');
        return;
      }

      // 处理普通字符输入
      if (code >= 32 && code <= 126) {
        currentInputRef.current += data;
        terminal.write(data);
      } else if (code >= 128) {
        currentInputRef.current += data;
        terminal.write(data);
      }
    });

    // 监听窗口大小变化和容器大小变化
    const handleResize = () => {
      if (fitAddon && terminalInstanceRef.current && isVisible) {
        try {
          setTimeout(() => {
            fitAddon.fit();
          }, 50);
        } catch (error) {
          console.warn(`[Terminal ${terminalId}] 终端尺寸适配失败:`, error);
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [isInitialized, sendCommand, terminalId, theme]);

  // 监听面板可见性变化
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisible;
          setIsVisible(entry.isIntersecting);

          if (!wasVisible && entry.isIntersecting && !isInitialized) {
            console.log(`[Terminal ${terminalId}] 面板变为可见，初始化终端...`);
            initializeTerminal();
          }
        });
      },
      { threshold: 0.1 }
    );

    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isVisible, isInitialized, initializeTerminal, terminalId]);

  // 当面板变为可见时，重新调整终端尺寸
  useEffect(() => {
    if (isVisible && fitAddonRef.current && terminalInstanceRef.current && isInitialized) {
      setTimeout(() => {
        try {
          console.log(`[Terminal ${terminalId}] 重新调整终端尺寸...`);
          fitAddonRef.current?.fit();
          terminalInstanceRef.current?.focus();
        } catch (error) {
          console.warn(`[Terminal ${terminalId}] 终端尺寸重新适配失败:`, error);
        }
      }, 100);
    }
  }, [isVisible, isInitialized, terminalId]);

  // 监听父级容器大小变化
  useEffect(() => {
    if (!isInitialized) return;

    const handleParentResize = () => {
      if (fitAddonRef.current && terminalInstanceRef.current) {
        setTimeout(() => {
          try {
            console.log(`[Terminal ${terminalId}] 父级容器大小变化，重新调整终端尺寸...`);
            fitAddonRef.current?.fit();
          } catch (error) {
            console.warn(`[Terminal ${terminalId}] 终端尺寸调整失败:`, error);
          }
        }, 50);
      }
    };

    window.addEventListener('resize', handleParentResize);

    const resizeObserver = new ResizeObserver(handleParentResize);
    if (terminalRef.current?.parentElement) {
      resizeObserver.observe(terminalRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleParentResize);
      resizeObserver.disconnect();
    };
  }, [isInitialized, terminalId]);

  // 初始化终端
  useEffect(() => {
    if (isVisible && !isInitialized) {
      console.log(`[Terminal ${terminalId}] 触发终端初始化...`);
      initializeTerminal();
    }
  }, [isVisible, isInitialized, initializeTerminal, terminalId]);

  // 更新状态引用
  useEffect(() => {
    statusRef.current = terminalStatus;
  }, [terminalStatus]);

  // 处理终端状态变化
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal || !isInitialized) return;

    console.log(`[Terminal ${terminalId}] 状态变化:`, terminalStatus);

    if (terminalStatus === 'disconnected') {
      terminal.clear();
      terminal.write('\x1B[1;36m欢迎使用在线代码编辑器终端\x1B[0m\r\n');
      terminal.write('请选择工作空间并点击"连接终端"开始使用\r\n\r\n');
      currentInputRef.current = '';
    } else if (terminalStatus === 'connected') {
      terminal.write('\x1B[1;32m✓ 终端已连接\x1B[0m\r\n');
      currentInputRef.current = '';
      setTimeout(() => {
        terminal.focus();
        console.log(`[Terminal ${terminalId}] 终端已获得焦点`);
      }, 200);
    } else if (terminalStatus === 'connecting') {
      terminal.clear();
      terminal.write('\x1B[1;33m⏳ 正在连接终端...\x1B[0m\r\n');
      currentInputRef.current = '';
    } else if (terminalStatus === 'error') {
      terminal.clear();
      terminal.write('\x1B[1;31m✗ 连接失败\x1B[0m\r\n');
      currentInputRef.current = '';
    }
  }, [terminalStatus, isInitialized, terminalId]);

  // 设置终端写入器
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (terminal && isInitialized) {
      const writeToTerminalWrapper = (data: string) => {
        if (terminal) {
          terminal.write(data);
        }
      };

      setTerminalWriter(writeToTerminalWrapper);
    }
  }, [setTerminalWriter, isInitialized]);

  const handleConnect = async () => {
    try {
      await connectTerminal();
    } catch (error) {
      console.error(`[Terminal ${terminalId}] 连接终端失败:`, error);
    }
  };

  const handleDisconnect = () => {
    disconnectTerminal();
  };

  const handleClear = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
    }
    clearTerminal();
    currentInputRef.current = '';
  };

  return (
    <div className="terminal-instance">
      <div className="terminal-header">
        <div className="terminal-title">
          <i className="fas fa-terminal"></i>
          <span>终端 {terminalId}</span>
          {terminalStatus === 'connected' && (
            <span className="terminal-status connected">
              <i className="fas fa-circle"></i> 已连接
            </span>
          )}
          {terminalStatus === 'connecting' && (
            <span className="terminal-status connecting">
              <i className="fas fa-spinner fa-spin"></i> 连接中...
            </span>
          )}
          {terminalStatus === 'error' && (
            <span className="terminal-status error">
              <i className="fas fa-exclamation-triangle"></i> 连接失败
            </span>
          )}
        </div>
        <div className="terminal-controls">
          <button
            className="btn btn-sm"
            onClick={handleConnect}
            title="连接终端"
            disabled={terminalStatus === 'connecting' || terminalStatus === 'connected'}
          >
            <i className="fas fa-play"></i>
          </button>
          <button
            className="btn btn-sm"
            onClick={handleClear}
            title="清屏"
            disabled={terminalStatus !== 'connected'}
          >
            <i className="fas fa-trash"></i>
          </button>
          <button
            className="btn btn-sm"
            onClick={handleDisconnect}
            title="断开连接"
            disabled={terminalStatus !== 'connected'}
          >
            <i className="fas fa-stop"></i>
          </button>
        </div>
      </div>
      <div className="terminal-body">
        <div ref={terminalRef} className="terminal-content"></div>
      </div>
    </div>
  );
};

export default TerminalPanel; 