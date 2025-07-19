import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminal } from '../contexts/TerminalContext';
import './TerminalPanel.css';

const TerminalPanel: React.FC = () => {
  const { 
    terminalStatus, 
    connectTerminal, 
    disconnectTerminal, 
    clearTerminal,
    sendCommand,
    setTerminalWriter
  } = useTerminal();

  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitializedRef = useRef(false);

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current || isInitializedRef.current) return;

    // 创建终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Fira Code, Consolas, Monaco, monospace',
      theme: {
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
      },
      rows: 20,
      cols: 80,
      allowTransparency: true,
      convertEol: true,
      disableStdin: false,
      screenReaderMode: false,
      windowsMode: false,
      macOptionIsMeta: false,
      macOptionClickForcesSelection: false,
      rightClickSelectsWord: false,
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5,
      scrollOnUserInput: true
    });

    // 创建 FitAddon 用于自适应大小
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // 打开终端
    terminal.open(terminalRef.current);
    console.log('终端实例:', terminal);
    
    // 延迟执行 fit 以确保容器有正确的尺寸
    setTimeout(() => {
      try {
        fitAddon.fit();
        console.log('终端尺寸适配成功');
        
        // 在 fit 完成后清空终端并显示欢迎信息
        terminal.clear();
        terminal.write('\x1B[1;36m欢迎使用在线代码编辑器终端\x1B[0m\r\n');
        terminal.write('请选择工作空间并点击"连接终端"开始使用\r\n\r\n');
        isInitializedRef.current = true;
      } catch (error) {
        console.warn('终端尺寸适配失败:', error);
      }
    }, 300);

    // 保存引用
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 确保终端获得焦点
    setTimeout(() => {
      terminal.focus();
      console.log('终端已获得焦点');
    }, 500);

    // 监听终端输入
    terminal.onData((data) => {
      console.log('终端输入:', data, '字符码:', data.charCodeAt(0), '状态:', terminalStatus);
      if (terminalStatus === 'connected') {
        // 只处理 Enter 键提交命令
        if (data === '\r' || data === '\n') {
          try {
            // 获取当前行内容
            const line = terminal.buffer.active.getLine(terminal.buffer.active.baseY + terminal.buffer.active.cursorY);
            if (line) {
              const lineContent = line.translateToString(true);
              // 移除提示符部分
              const command = lineContent.replace(/^\$ /, '').trim();
              if (command) {
                console.log('发送命令:', command);
                sendCommand(command);
              }
            }
            terminal.write('\r\n\x1B[1;36m$ \x1B[0m');
          } catch (error) {
            console.warn('处理终端输入时出错:', error);
            terminal.write('\r\n\x1B[1;36m$ \x1B[0m');
          }
        } else {
          // 对于其他输入，直接写入终端（让 xterm.js 处理显示）
          // 但避免写入 $ 符号，因为我们已经有了提示符
          if (data !== '$') {
            terminal.write(data);
          }
        }
      } else {
        console.log('终端未连接，忽略输入');
      }
    });

    // 监听窗口大小变化
    const handleResize = () => {
      if (fitAddon) {
        try {
          fitAddon.fit();
        } catch (error) {
          console.warn('终端尺寸适配失败:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  // 处理终端状态变化
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal) return;

    console.log('终端状态变化:', terminalStatus);

    // 避免在初始化时重复显示
    if (terminalStatus === 'disconnected') {
      // 只在真正断开连接时显示，不是初始化时
      const hasContent = terminal.buffer.active.getLine(0)?.translateToString(true);
      if (hasContent && hasContent.trim()) {
        terminal.clear();
        terminal.write('\x1B[1;36m欢迎使用在线代码编辑器终端\x1B[0m\r\n');
        terminal.write('请选择工作空间并点击"连接终端"开始使用\r\n\r\n');
      }
    } else if (terminalStatus === 'connected') {
      terminal.clear();
      terminal.write('\x1B[1;32m✓ 终端已连接\x1B[0m\r\n');
      terminal.write('\x1B[1;36m$ \x1B[0m');
      console.log('终端已连接，显示提示符');
    } else if (terminalStatus === 'connecting') {
      terminal.clear();
      terminal.write('\x1B[1;33m⏳ 正在连接终端...\x1B[0m\r\n');
    } else if (terminalStatus === 'error') {
      terminal.clear();
      terminal.write('\x1B[1;31m✗ 连接失败\x1B[0m\r\n');
    }
  }, [terminalStatus]);

  // 设置终端写入器
  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (terminal) {
      // 创建一个包装函数来写入终端
      const writeToTerminalWrapper = (data: string) => {
        if (terminal) {
          console.log('写入终端数据:', data);
          terminal.write(data);
          // 如果数据以换行符结尾，添加新的提示符
          if (data.endsWith('\r\n') || data.endsWith('\n')) {
            // 检查是否已经有提示符，避免重复
            const lastLine = terminal.buffer.active.getLine(terminal.buffer.active.baseY + terminal.buffer.active.cursorY);
            if (lastLine) {
              const lastLineContent = lastLine.translateToString(true);
              if (!lastLineContent.includes('$ ')) {
                terminal.write('\x1B[1;36m$ \x1B[0m');
              }
            }
          }
        }
      };
      
      // 将包装函数设置到 context 中
      setTerminalWriter(writeToTerminalWrapper);
      console.log('终端写入器已设置');
    }
  }, [setTerminalWriter]);

  const handleConnect = async () => {
    try {
      await connectTerminal();
    } catch (error) {
      console.error('连接终端失败:', error);
    }
  };

  const handleDisconnect = () => {
    disconnectTerminal();
  };

  const handleClear = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
      // 清屏后重新显示提示符
      if (terminalStatus === 'connected') {
        terminalInstanceRef.current.write('\x1B[1;36m$ \x1B[0m');
      }
    }
    clearTerminal();
  };

  const handleNewTerminal = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
      terminalInstanceRef.current.write('\x1B[1;36m新建终端会话\x1B[0m\r\n\r\n');
      if (terminalStatus === 'connected') {
        terminalInstanceRef.current.write('\x1B[1;36m$ \x1B[0m');
      }
    }
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-title">
          <i className="fas fa-terminal"></i>
          <span>终端</span>
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
          <button 
            className="btn btn-sm" 
            onClick={handleNewTerminal}
            title="新建终端"
          >
            <i className="fas fa-plus"></i>
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