import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminal } from '../contexts/TerminalContext';
import { useTheme } from '../contexts/ThemeContext';
import { useMultiTerminal } from '../contexts/MultiTerminalContext';
import { TerminalProvider } from '../contexts/TerminalContext';
import TerminalTabs from './TerminalTabs';
import './TerminalPanel.css';
import { useNotification } from './NotificationProvider';

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
  const { showError } = useNotification();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const statusRef = useRef(terminalStatus);
  const currentInputRef = useRef('');
  const [isVisible, setIsVisible] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // 命令历史
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const tempInputRef = useRef<string>('');
  const cursorPositionRef = useRef<number>(0);

  // 终端主题配置
  const terminalTheme = useMemo(() => theme === 'dark' ? {
    background: '#0f172a',
    foreground: '#f8fafc',
    cursor: '#3b82f6',
    selection: 'rgba(59, 130, 246, 0.3)',
    black: '#0f172a',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#f8fafc',
    brightBlack: '#64748b',
    brightRed: '#f87171',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  } : {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#3b82f6',
    selection: 'rgba(59, 130, 246, 0.2)',
    black: '#000000',
    red: '#dc2626',
    green: '#059669',
    yellow: '#d97706',
    blue: '#2563eb',
    magenta: '#7c3aed',
    cyan: '#0891b2',
    white: '#374151',
    brightBlack: '#6b7280',
    brightRed: '#ef4444',
    brightGreen: '#10b981',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#8b5cf6',
    brightCyan: '#06b6d4',
    brightWhite: '#f9fafb'
  }, [theme]);

  // 发送数据到WebSocket的函数
  const sendToWebSocket = useCallback((data: string) => {
    if (statusRef.current === 'connected') {
      sendCommand(data);
    } else {
      console.log(`[Terminal ${terminalId}] WebSocket未连接，忽略数据:`, data);
    }
  }, [sendCommand, terminalId]);

  // 初始化终端的函数
  const initializeTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstanceRef.current || isInitialized) return;

    console.log(`[Terminal ${terminalId}] 开始初始化终端...`);

    // 创建终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Fira Code, Consolas, Monaco, monospace',
      theme: terminalTheme,
      allowTransparency: true,
      convertEol: true,
      scrollOnUserInput: true,
      scrollback: 5000,
      cols: 80,
      rows: 24,
      cursorStyle: 'block',
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5
    });

    // 创建 FitAddon 用于自适应大小
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // 打开终端
    terminal.open(terminalRef.current);

    // 延迟执行 fit 以确保容器有正确的尺寸
    const setupTerminal = () => {
      try {
        fitAddon.fit();
        terminal.clear();
        terminal.write('\x1B[1;36m欢迎使用在线代码编辑器终端\x1B[0m\r\n');
        terminal.write('请选择工作空间并点击"连接终端"开始使用\r\n\r\n');
        terminal.write('\x1B[1;36m$ \x1B[0m');
        terminal.focus();
        setIsInitialized(true);
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
        return;
      }

      const code = data.charCodeAt(0);

      // 处理回车键
      if (code === 13) {
        terminal.write('\r\n');
        if (currentInputRef.current.trim()) {
          const command = currentInputRef.current.trim();
          if (command && (commandHistoryRef.current.length === 0 || commandHistoryRef.current[commandHistoryRef.current.length - 1] !== command)) {
            commandHistoryRef.current.push(command);
            if (commandHistoryRef.current.length > 100) {
              commandHistoryRef.current.shift();
            }
          }
          historyIndexRef.current = -1;
          tempInputRef.current = '';

          sendToWebSocket(currentInputRef.current);
          currentInputRef.current = '';
          cursorPositionRef.current = 0;
        } else {
          sendToWebSocket('\r');
        }
        return;
      }

      // 处理退格键
      if (code === 127 || code === 8) {
        if (cursorPositionRef.current > 0) {
          const input = currentInputRef.current;
          const pos = cursorPositionRef.current;

          currentInputRef.current = input.slice(0, pos - 1) + input.slice(pos);
          cursorPositionRef.current--;

          terminal.write('\b');
          terminal.write('\x1b[K');

          const remainingText = currentInputRef.current.slice(cursorPositionRef.current);
          if (remainingText) {
            terminal.write(remainingText);
            terminal.write(`\x1b[${remainingText.length}D`);
          }
        }
        return;
      }

      // 处理 Ctrl+C
      if (code === 3) {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).then(() => {
            console.log('文本已复制到剪贴板');
          }).catch(err => {
            console.error('复制失败:', err);
          });
          return;
        } else {
          terminal.write('^C\r\n');
          currentInputRef.current = '';
          historyIndexRef.current = -1;
          tempInputRef.current = '';
          sendToWebSocket('\x03');
          return;
        }
      }

      // 处理 Ctrl+V
      if (code === 22) {
        navigator.clipboard.readText().then(text => {
          if (text) {
            const input = currentInputRef.current;
            const pos = cursorPositionRef.current;

            currentInputRef.current = input.slice(0, pos) + text + input.slice(pos);
            cursorPositionRef.current += text.length;

            terminal.write('\x1b[K');
            const remainingText = currentInputRef.current.slice(pos);
            terminal.write(remainingText);

            const moveBack = remainingText.length - text.length;
            if (moveBack > 0) {
              terminal.write(`\x1b[${moveBack}D`);
            }
          }
        }).catch(err => {
          console.error('粘贴失败:', err);
        });
        return;
      }

      // 处理 Ctrl+D
      if (code === 4) {
        sendToWebSocket('\x04');
        return;
      }

      // 处理 Ctrl+Z
      if (code === 26) {
        sendToWebSocket('\x1a');
        return;
      }

      // 处理方向键
      if (data === '\x1b[A') { // 上箭头
        if (commandHistoryRef.current.length > 0) {
          if (historyIndexRef.current === -1) {
            tempInputRef.current = currentInputRef.current;
          }

          if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
            historyIndexRef.current++;
            const historyCommand = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];

            if (currentInputRef.current.length > 0) {
              terminal.write(`\x1b[${cursorPositionRef.current}D`);
              terminal.write('\x1b[K');
            }

            currentInputRef.current = historyCommand;
            cursorPositionRef.current = historyCommand.length;
            terminal.write(historyCommand);
          }
        }
        return;
      }
      if (data === '\x1b[B') { // 下箭头
        if (historyIndexRef.current > -1) {
          historyIndexRef.current--;

          let newCommand = '';
          if (historyIndexRef.current === -1) {
            newCommand = tempInputRef.current;
          } else {
            newCommand = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
          }

          if (currentInputRef.current.length > 0) {
            terminal.write(`\x1b[${cursorPositionRef.current}D`);
            terminal.write('\x1b[K');
          }

          currentInputRef.current = newCommand;
          cursorPositionRef.current = newCommand.length;
          terminal.write(newCommand);
        }
        return;
      }
      if (data === '\x1b[C') { // 右箭头
        if (cursorPositionRef.current < currentInputRef.current.length) {
          cursorPositionRef.current++;
          terminal.write('\x1b[C');
        }
        return;
      }
      if (data === '\x1b[D') { // 左箭头
        if (cursorPositionRef.current > 0) {
          cursorPositionRef.current--;
          terminal.write('\x1b[D');
        }
        return;
      }

      // 处理Tab键
      if (code === 9) {
        sendToWebSocket('\t');
        return;
      }

      // 处理普通字符输入
      if (code >= 32 && code <= 126) {
        const input = currentInputRef.current;
        const pos = cursorPositionRef.current;

        currentInputRef.current = input.slice(0, pos) + data + input.slice(pos);
        cursorPositionRef.current++;

        terminal.write('\x1b[K');
        const remainingText = currentInputRef.current.slice(pos);
        terminal.write(remainingText);

        if (pos < input.length) {
          terminal.write(`\x1b[${remainingText.length - 1}D`);
        }
      } else if (code >= 128) {
        const input = currentInputRef.current;
        const pos = cursorPositionRef.current;

        currentInputRef.current = input.slice(0, pos) + data + input.slice(pos);
        cursorPositionRef.current++;

        terminal.write('\x1b[K');
        const remainingText = currentInputRef.current.slice(pos);
        terminal.write(remainingText);

        if (pos < input.length) {
          terminal.write(`\x1b[${remainingText.length - 1}D`);
        }
      }
    });

    // 监听窗口大小变化和容器大小变化
    const handleResize = () => {
      if (fitAddon && terminalInstanceRef.current && isVisible) {
        try {
          let timer = setTimeout(() => {
            fitAddon.fit();
            clearTimeout(timer);
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
  }, [isInitialized, sendCommand, terminalId, theme, terminalTheme]);

  // 监听主题变化，更新终端主题
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (terminal && isInitialized) {
      terminal.options.theme = terminalTheme;
      // 重新渲染终端以应用新主题
      terminal.refresh(0, terminal.rows - 1);
    }
  }, [terminalTheme, isInitialized]);

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
      initializeTerminal();
    }
  }, [isVisible, isInitialized, initializeTerminal, terminalId]);

  // 更新状态引用
  useEffect(() => {
    statusRef.current = terminalStatus;
    setIsConnected(terminalStatus === 'connected');
  }, [terminalStatus]);

  // 处理终端状态变化
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal || !isInitialized) return;

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
      showError('连接终端失败', String(error));
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
          <div className={`terminal-status ${terminalStatus}`}>
            <span>
              {terminalStatus === 'connected' && '已连接'}
              {terminalStatus === 'connecting' && '连接中...'}
              {terminalStatus === 'disconnected' && '未连接'}
              {terminalStatus === 'error' && '连接失败'}
            </span>
          </div>
        </div>
        <div className="terminal-controls">
          <button
            className="terminal-control-btn connect special-button"
            onClick={handleConnect}
            title="连接终端"
            disabled={terminalStatus === 'connecting' || terminalStatus === 'connected'}
          >
            <i className="fas fa-play"></i>
          </button>
          <button
            className="terminal-control-btn clear special-button"
            onClick={handleClear}
            title="清屏"
            disabled={terminalStatus !== 'connected'}
          >
            <i className="fas fa-trash"></i>
          </button>
          <button
            className="terminal-control-btn kill special-button"
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