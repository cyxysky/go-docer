import React, { useState, useEffect, useRef } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { FileProvider, useFile } from './contexts/FileContext';
import { ImageProvider } from './contexts/ImageContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { MultiTerminalProvider } from './contexts/MultiTerminalContext';
import { NotificationProvider } from './components/NotificationProvider';
import { DragProvider } from './contexts/DragContext';
import WorkspacePanel from './components/WorkspacePanel';
import FilePanel from './components/FilePanel';
import ImagePanel from './components/ImagePanel';
import TerminalPanel from './components/TerminalPanel';
import GitPanel from './components/GitPanel';
import StatsPanel from './components/StatsPanel';
import ResizablePanel from './components/ResizablePanel';
import MonacoEditor from './components/MonacoEditor';
import ToastComponent from './components/Toast';
import ThemeToggle from './components/ThemeToggle';
import './App.css';

// 主应用组件
const AppContent: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [activeSidebarTab, setActiveSidebarTab] = useState('workspace');
  const [activePanel, setActivePanel] = useState('terminal');
  const { theme } = useTheme();
  const [toasts] = useState<Array<{id: string, message: string, type: 'success' | 'error' | 'warning' | 'info'}>>([]);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(250);
  const [isResizingBottomPanel, setIsResizingBottomPanel] = useState(false);
  const startPosRef = useRef(0);
  const startHeightRef = useRef(0);
  const isResizingRef = useRef(false); // 使用ref来跟踪拖拽状态

  // 底部面板拖拽调整大小
  const handleBottomPanelMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 立即设置ref状态
    isResizingRef.current = true;
    setIsResizingBottomPanel(true);
    
    startPosRef.current = e.clientY;
    startHeightRef.current = bottomPanelHeight;
    
    document.addEventListener('mousemove', handleBottomPanelMouseMove);
    document.addEventListener('mouseup', handleBottomPanelMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleBottomPanelMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) {
      return;
    }

    const delta = startPosRef.current - e.clientY; // 向上拖动增加高度
    const newHeight = Math.max(150, Math.min(500, startHeightRef.current + delta));
    
    setBottomPanelHeight(newHeight);
  };

  const handleBottomPanelMouseUp = () => {
    isResizingRef.current = false;
    setIsResizingBottomPanel(false);
    document.removeEventListener('mousemove', handleBottomPanelMouseMove);
    document.removeEventListener('mouseup', handleBottomPanelMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleBottomPanelMouseMove);
      document.removeEventListener('mouseup', handleBottomPanelMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      isResizingRef.current = false;
    };
  }, []);

  // 主题切换功能现在由ThemeContext提供

  return (
    <div className="app" data-theme={theme}>
      {/* 顶部菜单栏 */}
      <div className="top-menu">
        <div className="brand">
          <i className="fas fa-code"></i> 在线代码编辑器
        </div>

        <div className="menu-items">
          <ThemeToggle />
        </div>
      </div>

      {/* 主容器 */}
      <div className="main-container">
        {/* 左侧边栏 - 可调整大小 */}
        <ResizablePanel
          direction="horizontal"
          initialSize={280}
          minSize={200}
          maxSize={500}
          className="sidebar-resizable"
        >
          <div className="sidebar">
            {/* 侧边栏标签 */}
            <div className="sidebar-tabs">
              <div 
                className={`sidebar-tab ${activeSidebarTab === 'workspace' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('workspace')}
                title="工作空间"
              >
                <i className="fas fa-cube"></i>
              </div>
              <div 
                className={`sidebar-tab ${activeSidebarTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('files')}
                title="文件管理器"
              >
                <i className="fas fa-folder-tree"></i>
              </div>
              <div 
                className={`sidebar-tab ${activeSidebarTab === 'images' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('images')}
                title="镜像管理"
              >
                <i className="fas fa-layer-group"></i>
              </div>
            </div>

            {/* 侧边栏内容 */}
            <div className="sidebar-content">
              {/* 工作空间标签页 */}
              {activeSidebarTab === 'workspace' && (
                <div className="sidebar-tab-content active">
                  <WorkspacePanel />
                </div>
              )}

              {/* 文件管理器标签页 */}
              {activeSidebarTab === 'files' && (
                <div className="sidebar-tab-content active">
                  <FilePanel />
                </div>
              )}

              {/* 镜像管理标签页 */}
              {activeSidebarTab === 'images' && (
                <div className="sidebar-tab-content active">
                  <ImagePanel />
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {/* 主编辑区域 */}
        <div className="editor-container">
          {/* 编辑器标签栏 */}
          <EditorTabs />
          
          {/* Monaco Editor */}
          <div className="monaco-editor-container">
            <MonacoEditor />
          </div>

          {/* 底部面板拖拽手柄 */}
          <div 
            className={`bottom-panel-resize-handle ${isResizingBottomPanel ? 'resizing' : ''}`}
            onMouseDown={handleBottomPanelMouseDown}
          >
            <div className="resize-handle-line"></div>
          </div>

          {/* 底部面板 - 可调整大小 */}
          <div 
            className="bottom-panel-container"
            style={{ height: `${bottomPanelHeight}px` }}
          >
            <div className="bottom-panel">
              <div className="panel-tabs">
                <div 
                  className={`panel-tab ${activePanel === 'terminal' ? 'active' : ''}`}
                  onClick={() => setActivePanel('terminal')}
                >
                  <i className="fas fa-terminal"></i>
                  <span>终端</span>
                </div>
                <div 
                  className={`panel-tab ${activePanel === 'git' ? 'active' : ''}`}
                  onClick={() => setActivePanel('git')}
                >
                  <i className="fas fa-git-alt"></i>
                  <span>Git</span>
                </div>
                <div 
                  className={`panel-tab ${activePanel === 'stats' ? 'active' : ''}`}
                  onClick={() => setActivePanel('stats')}
                >
                  <i className="fas fa-chart-line"></i>
                  <span>状态</span>
                </div>
              </div>

              <div className="panel-content">
                <div className={`panel-tab-content ${activePanel === 'terminal' ? 'active' : ''}`}>
                  <TerminalPanel />
                </div>
                <div className={`panel-tab-content ${activePanel === 'git' ? 'active' : ''}`}>
                  <GitPanel currentWorkspace={currentWorkspace} />
                </div>
                <div className={`panel-tab-content ${activePanel === 'stats' ? 'active' : ''}`}>
                  <StatsPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <StatusBar />

      {/* Toast 通知 */}
      <ToastComponent toasts={toasts} />
    </div>
  );
};

// 编辑器标签栏组件
const EditorTabs: React.FC = () => {
  const { openTabs, activeTab, closeTab, setActiveTab } = useFile();

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
  };

  return (
    <div className="editor-tabs">
      {Array.from(openTabs.values()).map((tab: any) => (
        <div 
          key={tab.id}
          className={`editor-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.id)}
        >
          <i className="fas fa-file-code"></i>
          <span className="tab-name">{tab.path.split('/').pop()}</span>
          <i 
            className="fas fa-times editor-tab-close" 
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          ></i>
        </div>
      ))}
      {openTabs.size === 0 && (
        <div className="editor-tab active">
          <i className="fas fa-home"></i>
          <span>欢迎</span>
        </div>
      )}
    </div>
  );
};

// 状态栏组件
const StatusBar: React.FC = () => {
  const { currentFile } = useFile();
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <i className="fas fa-circle" style={{color: '#3fb950', fontSize: '8px'}}></i>
          <span>{currentFile || '未选择文件'}</span>
        </div>
        <div className="status-item">
          <i className="fas fa-code-branch"></i>
          <span>main</span>
        </div>
      </div>
      <div className="status-right">
        <div className="status-item">
          <span>{currentWorkspace ? '已连接' : '未连接'}</span>
        </div>
        <div className="status-item">
          <i className="fas fa-docker"></i>
          <span>Docker</span>
        </div>
      </div>
    </div>
  );
};

// 主应用组件（包含Provider）
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <WorkspaceProvider>
          <DragProvider>
            <WorkspaceConsumer />
          </DragProvider>
        </WorkspaceProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
};

// 工作空间消费者组件
const WorkspaceConsumer: React.FC = () => {
  const { currentWorkspace, workspaces } = useWorkspace();
  
  // 获取当前工作空间的状态
  const currentWorkspaceStatus = currentWorkspace 
    ? workspaces.find(ws => ws.id === currentWorkspace)?.status 
    : undefined;
  
  return (
    <FileProvider currentWorkspace={currentWorkspace} workspaceStatus={currentWorkspaceStatus}>
      <ImageProvider>
        <MultiTerminalProvider>
          <AppContent />
        </MultiTerminalProvider>
      </ImageProvider>
    </FileProvider>
  );
};

export default App;
