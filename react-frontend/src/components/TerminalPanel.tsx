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

  // 命令历史
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const tempInputRef = useRef<string>(''); // 临时保存当前输入，用于历史导航
  const cursorPositionRef = useRef<number>(0); // 光标在当前行的位置


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
          // 添加到命令历史
          const command = currentInputRef.current.trim();
          if (command && (commandHistoryRef.current.length === 0 || commandHistoryRef.current[commandHistoryRef.current.length - 1] !== command)) {
            commandHistoryRef.current.push(command);
            // 限制历史记录长度
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
          
          // 删除光标前的字符
          currentInputRef.current = input.slice(0, pos - 1) + input.slice(pos);
          cursorPositionRef.current--;
          
          // 简单的退格处理：向左移动，删除字符，重新显示后续内容
          terminal.write('\b'); // 向左移动光标
          terminal.write('\x1b[K'); // 清除从光标到行尾的内容
          
          // 重新显示删除位置后的内容
          const remainingText = currentInputRef.current.slice(cursorPositionRef.current);
          if (remainingText) {
            terminal.write(remainingText);
            // 将光标移回正确位置
            terminal.write(`\x1b[${remainingText.length}D`);
          }
        }
        return;
      }

      // 处理 Ctrl+C (复制或中断命令)
      if (code === 3) {
        // 检查是否有选中的文本
        const selection = terminal.getSelection();
        if (selection) {
          // 复制选中的文本到剪贴板
          navigator.clipboard.writeText(selection).then(() => {
            console.log('文本已复制到剪贴板');
          }).catch(err => {
            console.error('复制失败:', err);
          });
          return;
        } else {
          // 没有选中文本，发送中断信号
        terminal.write('^C\r\n');
        currentInputRef.current = '';
          historyIndexRef.current = -1;
          tempInputRef.current = '';
        sendToWebSocket('\x03');
          return;
        }
      }

      // 处理 Ctrl+V (粘贴)
      if (code === 22) {
        navigator.clipboard.readText().then(text => {
          if (text) {
            const input = currentInputRef.current;
            const pos = cursorPositionRef.current;
            
            // 在光标位置插入粘贴的文本
            currentInputRef.current = input.slice(0, pos) + text + input.slice(pos);
            cursorPositionRef.current += text.length;
            
            // 简单的插入处理
            terminal.write('\x1b[K'); // 清除从光标到行尾的内容
            
            // 显示从当前位置开始的所有内容
            const remainingText = currentInputRef.current.slice(pos);
            terminal.write(remainingText);
            
            // 将光标移到正确位置
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
      if (data === '\x1b[A') { // 上箭头 - 历史命令
        if (commandHistoryRef.current.length > 0) {
          // 保存当前输入（如果是第一次按上键）
          if (historyIndexRef.current === -1) {
            tempInputRef.current = currentInputRef.current;
          }
          
          // 导航历史
          if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
            historyIndexRef.current++;
            const historyCommand = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
            
            // 清除当前输入行的内容
            if (currentInputRef.current.length > 0) {
              terminal.write(`\x1b[${cursorPositionRef.current}D`); // 移动到输入开始位置
              terminal.write('\x1b[K'); // 清除到行尾
            }
            
            // 更新当前输入和光标位置
            currentInputRef.current = historyCommand;
            cursorPositionRef.current = historyCommand.length;
            
            // 显示历史命令
            terminal.write(historyCommand);
          }
        }
        return;
      }
      if (data === '\x1b[B') { // 下箭头 - 历史命令
        if (historyIndexRef.current > -1) {
          historyIndexRef.current--;
          
          let newCommand = '';
          if (historyIndexRef.current === -1) {
            // 恢复原始输入
            newCommand = tempInputRef.current;
          } else {
            // 显示历史命令
            newCommand = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
          }
          
          // 清除当前输入行的内容
          if (currentInputRef.current.length > 0) {
            terminal.write(`\x1b[${cursorPositionRef.current}D`); // 移动到输入开始位置
            terminal.write('\x1b[K'); // 清除到行尾
          }
          
          // 更新内容
          currentInputRef.current = newCommand;
          cursorPositionRef.current = newCommand.length;
          
          // 显示新命令
          terminal.write(newCommand);
        }
        return;
      }
      if (data === '\x1b[C') { // 右箭头 - 本地光标移动
        if (cursorPositionRef.current < currentInputRef.current.length) {
          cursorPositionRef.current++;
          terminal.write('\x1b[C');
        }
        return;
      }
      if (data === '\x1b[D') { // 左箭头 - 本地光标移动
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
        
        // 在光标位置插入字符
        currentInputRef.current = input.slice(0, pos) + data + input.slice(pos);
        cursorPositionRef.current++;
        
        // 简单的字符插入
        terminal.write('\x1b[K'); // 清除从光标到行尾
        
        // 显示从当前位置开始的所有内容
        const remainingText = currentInputRef.current.slice(pos);
        terminal.write(remainingText);
        
        // 如果插入的不是在末尾，调整光标位置
        if (pos < input.length) {
          terminal.write(`\x1b[${remainingText.length - 1}D`);
        }
      } else if (code >= 128) {
        const input = currentInputRef.current;
        const pos = cursorPositionRef.current;
        
        // 在光标位置插入字符
        currentInputRef.current = input.slice(0, pos) + data + input.slice(pos);
        cursorPositionRef.current++;
        
        // 简单的字符插入
        terminal.write('\x1b[K'); // 清除从光标到行尾
        
        // 显示从当前位置开始的所有内容
        const remainingText = currentInputRef.current.slice(pos);
        terminal.write(remainingText);
        
        // 如果插入的不是在末尾，调整光标位置
        if (pos < input.length) {
          terminal.write(`\x1b[${remainingText.length - 1}D`);
        }
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