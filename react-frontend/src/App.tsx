import React, { useState, useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { FileProvider, useFile } from './contexts/FileContext';
import { ImageProvider, useImage } from './contexts/ImageContext';
import { TerminalProvider, useTerminal } from './contexts/TerminalContext';
import WorkspacePanel from './components/WorkspacePanel';
import FilePanel from './components/FilePanel';
import ImagePanel from './components/ImagePanel';
import TerminalPanel from './components/TerminalPanel';
import GitPanel from './components/GitPanel';
import StatsPanel from './components/StatsPanel';
import ToastComponent from './components/Toast';
import './App.css';

// 主应用组件
const AppContent: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [activeSidebarTab, setActiveSidebarTab] = useState('workspace');
  const [activePanel, setActivePanel] = useState('terminal');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [toasts, setToasts] = useState<Array<{id: string, message: string, type: 'success' | 'error' | 'warning' | 'info'}>>([]);

  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // 主题切换
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    showToast(`已切换到${newTheme === 'dark' ? '暗色' : '亮色'}主题`, 'success');
  };

  // Toast通知系统
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 4000);
  };

  return (
    <div className="app" data-theme={theme}>
      {/* 顶部菜单栏 */}
      <div className="top-menu">
        <div className="brand">
          <i className="fas fa-code"></i> 在线代码编辑器
        </div>

        <div className="menu-items">
          <button className="btn btn-sm theme-toggle" onClick={toggleTheme} title="切换主题">
            <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
        </div>
      </div>

      {/* 主容器 */}
      <div className="main-container">
        {/* 左侧边栏 */}
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

        {/* 主编辑区域 */}
        <div className="editor-container">
          {/* 编辑器标签栏 */}
          <EditorTabs />
          
          {/* Monaco Editor */}
          <div className="monaco-editor-container">
            <div id="monaco-editor"></div>
          </div>

          {/* 底部面板 */}
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
              {activePanel === 'terminal' && <TerminalPanel />}
              {activePanel === 'git' && (
                <GitPanel currentWorkspace={currentWorkspace} />
              )}
              {activePanel === 'stats' && (
                <StatsPanel currentWorkspace={currentWorkspace} />
              )}
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
  const { openTabs, activeTab, closeTab } = useFile();

  return (
    <div className="editor-tabs">
      {Array.from(openTabs.values()).map((tab: any) => (
        <div 
          key={tab.id}
          className={`editor-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => {/* 切换标签逻辑 */}}
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
    <WorkspaceProvider>
      <WorkspaceConsumer />
    </WorkspaceProvider>
  );
};

// 工作空间消费者组件
const WorkspaceConsumer: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  
  return (
    <FileProvider currentWorkspace={currentWorkspace}>
      <ImageProvider>
        <TerminalProvider>
          <AppContent />
        </TerminalProvider>
      </ImageProvider>
    </FileProvider>
  );
};

export default App;
