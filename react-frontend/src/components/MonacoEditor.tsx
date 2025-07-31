import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { fileAPI } from '../services/api';
import AIAgent from './AIAgent';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 语言映射
 */
const languageMap: { [key: string]: string } = {
  'js': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'py': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'go': 'go',
  'rs': 'rust',
  'php': 'php',
  'rb': 'ruby',
  'html': 'html',
  'css': 'css',
  'scss': 'scss',
  'less': 'less',
  'json': 'json',
  'xml': 'xml',
  'yaml': 'yaml',
  'yml': 'yaml',
  'md': 'markdown',
  'sql': 'sql',
  'sh': 'shell',
  'bash': 'shell',
  'dockerfile': 'dockerfile',
};

/**
 * 默认编辑器配置
 */
const defaultEditorConfig: monaco.editor.IStandaloneEditorConstructionOptions = {
  value: '// 欢迎使用代码编辑器',
  language: 'javascript',
  automaticLayout: true,
  codeLens: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
  lineNumbers: 'on',
  roundedSelection: false,
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    verticalScrollbarSize: 12,
    horizontalScrollbarSize: 12,
  },
  folding: true,
  wordWrap: 'off',
  renderWhitespace: 'selection',
  selectOnLineNumbers: true,
  contextmenu: true,
  quickSuggestions: true,

  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as any,
  tabCompletion: 'on',
  wordBasedSuggestions: 'allDocuments',
  parameterHints: {
    enabled: true
  },
  hover: {
    enabled: true
  },
  links: true,
  colorDecorators: true
}

const diffEditorConfig: monaco.editor.IStandaloneDiffEditorConstructionOptions = {
  enableSplitViewResizing: true,
  renderMarginRevertIcon: true,
  renderOverviewRuler: true,
  originalEditable: false, // 原始代码不可编辑
  diffCodeLens: true,
  automaticLayout: true,
  fontSize: 14,
  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
}

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});

monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES2015,
  allowNonTsExtensions: true,
});

interface MonacoEditorProps {
  className?: string;
}

interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
  changeType: 'insert' | 'replace' | 'delete' | 'modify';
  confidence: number;
  applied?: boolean;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({ className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<CodeChange[]>([]);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const { openTabs, activeTab, updateTabContent } = useFile();
  const { theme } = useTheme();
  // 使用ref来获取最新的activeTab值
  const activeTabRef = useRef<string | null>(null);
  activeTabRef.current = activeTab;

  // 使用ref来获取最新的currentWorkspace值
  const currentWorkspaceRef = useRef<string | null>(null);
  currentWorkspaceRef.current = currentWorkspace;

  // 使用ref来跟踪openTabs的最新状态
  const openTabsRef = useRef<Map<string, any>>(new Map());
  openTabsRef.current = openTabs;

  // 创建保存文件的方法
  const saveFileDirectly = async (tabId: string) => {
    const workspace = currentWorkspaceRef.current;
    if (!workspace) {
      throw new Error('请先选择工作空间');
    }

    const latestOpenTabs = openTabsRef.current;
    const tab = latestOpenTabs.get(tabId);

    if (!tab) {
      throw new Error('标签页不存在');
    }

    try {
      await fileAPI.writeFile(workspace, tab.path, tab.content);
      console.log('✅ 文件保存成功:', tab.path);
    } catch (error) {
      console.error('❌ 文件保存失败:', error);
      throw error;
    }
  };

  // 创建编辑器的函数
  const createEditor = (code?: string) => {
    if (!editorRef.current) return;
    const editor = monaco.editor.create(editorRef.current, { ...defaultEditorConfig, theme: theme === 'dark' ? 'vs-dark' : 'vs', value: code || '' });
    monacoRef.current = editor;
    // 监听内容变化并自动保存
    editor.onDidChangeModelContent(() => {
      const currentActiveTab = activeTabRef.current;
      if (currentActiveTab) {
        const content = editor.getValue();
        updateTabContent(currentActiveTab, content);
        saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          const latestActiveTab = activeTabRef.current;
          latestActiveTab && saveFileDirectly(latestActiveTab);
        }, 2000);
      }
    });
    // 添加保存快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
      const currentActiveTab = activeTabRef.current;
      currentActiveTab && saveFileDirectly(currentActiveTab);
    });
    // 添加AI助手快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, function () {
      setIsAIVisible(prev => !prev);
    });
  };

  // 创建编辑器实例
  useEffect(() => {
    if (!editorRef.current) return;
    if (monacoRef.current) return;
    // 检查容器高度
    const containerHeight = editorRef.current.offsetHeight;

    if (containerHeight === 0) {
      requestAnimationFrame(() => {
        if (editorRef.current && !monacoRef.current) {
          createEditor();
        }
      });
      return;
    }

    createEditor();

    // 监听AI消息事件
    const handleAIMessage = (event: CustomEvent) => {
      const { codeChanges } = event.detail;
      console.log(codeChanges)
      if (codeChanges && codeChanges.length > 0) {
        setPendingChanges(codeChanges);
      }
    };

    window.addEventListener('ai-code-changes', handleAIMessage as EventListener);

    return () => {
      window.removeEventListener('ai-code-changes', handleAIMessage as EventListener);
      if (monacoRef.current) {
        monacoRef.current.dispose();
        monacoRef.current = null;
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 当活动标签页改变时，更新编辑器内容
  useEffect(() => {
    if (!activeTab) {
      return;
    }
    // 判断是否存在待处理的代码变更
    const changes = pendingChanges.find(changes => changes.filePath === activeTab);
    if (changes) {
      previewCodeEditor(changes.originalCode, changes.newCode);
      return;
    }

    const tab = openTabs.get(activeTab);
    if (!tab) return;
    if (isDiffMode) {
      switchToNormalEditor(tab.content);
      return;
    }

    if (!monacoRef.current) return;

    const editor = monacoRef.current;
    const currentValue = editor.getValue();

    // 只有当内容不同时才更新，避免光标位置重置
    if (currentValue !== tab.content) {
      editor.setValue(tab.content || '');
    }

    // 根据文件扩展名设置语言
    const fileExtension = tab.path.split('.').pop()?.toLowerCase();
    const language = languageMap[fileExtension || ''] || 'plaintext';
    const model = editor.getModel();
    model && monaco.editor.setModelLanguage(model, language);
  }, [activeTab]);

  // 主题变化
  useEffect(() => {
    if (!monacoRef.current) return;
    const editor = monacoRef.current;
    const model = editor.getModel();
    if (model) {
      monaco.editor.setTheme(theme === 'dark' ? "vs-dark" : "vs");
    }
  }, [theme])

  // ai代码变化时，预览代码差异
  useEffect(() => {
    const changes = pendingChanges.find(changes => changes.filePath === activeTab);
    changes && previewCodeEditor(changes.originalCode, changes.newCode);
  }, [pendingChanges])

  /**
   * 预览代码差异
   * @param originalCode 原始代码
   * @param modifiedCode 修改后的代码
   */
  const previewCodeEditor = (originalCode: string, modifiedCode: string) => {
    if (!editorRef.current) return;
    try {
      // 先清理现有编辑器
      if (monacoRef.current) {
        monacoRef.current.dispose();
        monacoRef.current = null;
      }
      if (diffEditorRef.current) {
        diffEditorRef.current.dispose();
        diffEditorRef.current = null;
      }
      // 获取当前文件的语言类型
      const tab = openTabs.get(activeTab || '');
      const fileExtension = tab?.path.split('.').pop()?.toLowerCase();
      const language = languageMap[fileExtension || ''] || 'plaintext';
      // 创建diff模型
      const originalModel = monaco.editor.createModel(originalCode, language);
      const modifiedModel = monaco.editor.createModel(modifiedCode, language);
      // 创建diff编辑器
      const diffEditor = monaco.editor.createDiffEditor(editorRef.current, { ...diffEditorConfig, theme: theme === 'dark' ? 'vs-dark' : 'vs' });
      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });
      diffEditorRef.current = diffEditor;
      setIsDiffMode(true);
    } catch (error) {
      console.error('❌ 创建Diff编辑器失败:', error);
    }
  };

  /**
   * 切换回普通编辑器
   */
  const switchToNormalEditor = (code?: string) => {
    if (!editorRef.current) return;
    // 清理diff编辑器
    if (monacoRef.current) {
      monacoRef.current.dispose();
      monacoRef.current = null;
    }
    if (diffEditorRef.current) {
      diffEditorRef.current.dispose();
      diffEditorRef.current = null;
    }
    // 重新创建普通编辑器
    setIsDiffMode(false);
    createEditor(code);
  };

  /**
   * 应用代码更改
   */
  const applyCodeChanges = () => {
    const changes = pendingChanges.find(change => change.filePath === activeTab);
    if (changes && activeTab) {
      const editor = diffEditorRef.current;
      if (editor) {
        // 更新标签页内容
        updateTabContent(activeTab, editor.getModel()?.modified?.getValue() || '');
        // 标记为已应用
        setPendingChanges(prev => prev.filter(change => change.filePath !== activeTab));
        // 切换回普通编辑器
        switchToNormalEditor(editor.getModel()?.modified?.getValue() || '');
      }
    }
  };

  /**
   * 拒绝代码更改
   */
  const rejectCodeChanges = () => {
    if (activeTab) {
      const tab = openTabs.get(activeTab);
      // 移除当前文件的待处理更改
      setPendingChanges(prev =>
        prev.filter(change => change.filePath !== activeTab)
      );
      tab && switchToNormalEditor(tab.content);
    }
  };


  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* 编辑器容器 */}
      <div ref={editorRef} style={{ width: '100%', height: '100%' }} />

      {/* 当没有工作空间时显示提示 */}
      {!currentWorkspace && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#969696',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px', display: 'block' }}>📁</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先选择工作空间</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间
          </div>
        </div>
      )}

      {/* 浮动AI按钮 */}
      {currentWorkspace && (
        <button
          onClick={() => setIsAIVisible(!isAIVisible)}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '22px',
            boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
          }}
          title="AI代码助手 (Ctrl+Shift+A)"
        >
          🤖
        </button>
      )}

      {/* Diff模式控制按钮 */}
      {isDiffMode && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={applyCodeChanges}
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#059669';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#10b981';
            }}
          >
            ✓ 应用更改
          </button>
          <button
            onClick={rejectCodeChanges}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
            }}
          >
            ✗ 拒绝更改
          </button>
        </div>
      )}

      {/* AI助手侧边栏 */}
      <AIAgent
        editor={monacoRef.current}
        onClose={() => setIsAIVisible(false)}
        isVisible={isAIVisible}
        currentWorkspace={currentWorkspace || undefined}
        fileTree={undefined}
      />
    </div>
  );
};

export default MonacoEditor; 