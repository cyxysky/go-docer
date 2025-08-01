import React, { useRef, useEffect, useState, useCallback } from 'react';
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

/**
 * Diff编辑器配置
 */
const diffEditorConfig: monaco.editor.IStandaloneDiffEditorConstructionOptions = {
  enableSplitViewResizing: true,
  renderMarginRevertIcon: true,
  renderOverviewRuler: true,
  originalEditable: false, // 原始代码不可编辑
  diffCodeLens: true,
  automaticLayout: true,
  fontSize: 14,
  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
  renderSideBySide: false,
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
  filePath?: string;
  isActive?: boolean;
  onActivate?: () => void;
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

const MonacoEditor: React.FC<MonacoEditorProps> = ({ className, filePath, onActivate }) => {
  /** 编辑器html元素ref */
  const editorRef = useRef<HTMLDivElement>(null);
  /** 编辑器ref */
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  /** diff编辑器ref */
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  /** 保存时间ref */
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 更新时间ref */
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** AI助手是否可见 */
  const [isAIVisible, setIsAIVisible] = useState(false);
  /** 待处理更改 */
  const [pendingChanges, setPendingChanges] = useState<CodeChange[]>([]);
  /** 是否为diff模式 */
  const [isDiffMode, setIsDiffMode] = useState(false);
  /** 是否正在更新 */
  const [isUpdating, setIsUpdating] = useState(false);
  /** 最后加载的内容 */
  const [lastLoadedContent, setLastLoadedContent] = useState<string>('');
  /** 编辑器id */
  const [editorId] = useState(() => `editor-${Math.random().toString(36).substr(2, 9)}`);
  /** 当前工作空间 */
  const { currentWorkspace } = useWorkspace();
  /** 打开的标签页 */
  const { openTabs, activeTab, updateTabContent } = useFile();
  /** 主题 */
  const { theme } = useTheme();

  // 使用ref来获取最新的activeTab值
  const activeTabRef = useRef<string | null>(null);
  /** 当前工作空间ref */
  const currentWorkspaceRef = useRef<string | null>(null);
  /** 打开的标签页ref */
  const openTabsRef = useRef<Map<string, any>>(new Map());
  // 使用ref来跟踪openTabs的最新状态
  openTabsRef.current = openTabs;
  activeTabRef.current = activeTab;
  currentWorkspaceRef.current = currentWorkspace;

  /**
   * 直接保存文件
   * @param filePathToSave 文件路径
   */
  const saveFileDirectly = async (filePathToSave: string) => {
    const workspace = currentWorkspaceRef.current;
    if (!workspace) {
      throw new Error('请先选择工作空间');
    }
    const content = monacoRef.current?.getValue();
    const contentToSave = content || '';
    await fileAPI.writeFile(workspace, filePathToSave, contentToSave);
  };

  /**
   * 编辑器内容变化触发事件
   */
  const editorContentChangeEvent = () => {
    const filePath = activeTabRef.current;
    if (filePath) {
      // 触发自定义事件，通知其他编辑器区域更新内容
      const content = monacoRef.current?.getValue();
      console.log("editorContentChangeEvent", editorId)
      // const updateEvent = new CustomEvent('file-content-updated', {
      //   detail: {
      //     filePath,
      //     content,
      //     sourceEditorId: editorId // 标识触发更新的编辑器
      //   }
      // });
      // // updateTabContent(filePath, content || '');
      // window.dispatchEvent(updateEvent);

      saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveFile();
      }, 2000);
    }
  }

  /**
   * 保存文件
   */
  const saveFile = () => {
    activeTabRef.current && updateTabContent(activeTabRef.current, monacoRef.current?.getValue() || '');
    activeTabRef.current && saveFileDirectly(activeTabRef.current);
  }

  /**
   * 设置编辑器事件
   * @param editor 编辑器
   */
  const setEditorEvent = (editor: monaco.editor.IStandaloneCodeEditor) => {
    // 确保编辑器不是只读的
    editor.updateOptions({ readOnly: false });
    // 监听内容变化并自动保存
    editor.onDidChangeModelContent(editorContentChangeEvent);
    // 添加保存快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveFile);
    // 添加AI助手快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, function () {
      setIsAIVisible(prev => !prev);
    });
  }

  /**
   * 清除编辑器
   */
  const clearEditor = () => {
    if (monacoRef.current) {
      try {
        monacoRef.current.dispose();
      } catch (error) {
        console.warn('Editor disposal warning:', error);
      }
      monacoRef.current = null;
    }
    if (diffEditorRef.current) {
      try {
        diffEditorRef.current.dispose();
      } catch (error) {
        console.warn('Diff editor disposal warning:', error);
      }
      diffEditorRef.current = null;
    }
  }

  /**
   * 创建编辑器
   */
  const createEditor = (code?: string) => {
    if (!editorRef.current) return;
    // 确保先清理现有编辑器
    clearEditor();
    const editor = monaco.editor.create(editorRef.current, {
      ...defaultEditorConfig,
      theme: theme === 'dark' ? 'vs-dark' : 'vs',
      value: code || '',
      readOnly: false, // 确保编辑器可编辑
    });
    monacoRef.current = editor;
    setEditorEvent(editor);
  };

  /**
   * 预览代码差异
   * @param originalCode 原始代码
   * @param modifiedCode 修改后的代码
   */
  const previewCodeEditor = (originalCode: string, modifiedCode: string) => {
    if (!editorRef.current) return;
    clearEditor();
    // 获取当前文件的语言类型

    const tab = openTabs.get(activeTab || '');
    const fileExtension = tab?.path.split('.').pop()?.toLowerCase();
    const language = languageMap[fileExtension || ''] || 'plaintext';
    // 创建diff编辑器
    const diffEditor = monaco.editor.createDiffEditor(editorRef.current, { ...diffEditorConfig, theme: theme === 'dark' ? 'vs-dark' : 'vs' });
    diffEditor.setModel({
      original: monaco.editor.createModel(originalCode, language),
      modified: monaco.editor.createModel(modifiedCode, language),
    });
    diffEditorRef.current = diffEditor;
    setIsDiffMode(true);
  };

  /**
   * 切换回普通编辑器
   */
  const switchToNormalEditor = (code?: string) => {
    if (!editorRef.current) return;
    clearEditor();
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

  // 创建编辑器实例
  useEffect(() => {
    if (!editorRef.current || monacoRef.current) return;
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
      if (codeChanges && codeChanges.length > 0) {
        setPendingChanges(codeChanges);
      }
    };

    // 监听其他编辑器区域的内容更新事件
    const handleFileContentUpdate = (event: CustomEvent) => {
      const { filePath: updatedFilePath, content: updatedContent, sourceEditorId } = event.detail;
      const currentEditorId = editorId;
      const currentFilePath = filePath;
      const isCurrentlyActive = activeTabRef.current === currentFilePath; // 检查是否是当前激活的tab

      console.log('🔄 收到同步事件:', {
        filePath,
        updatedFilePath,
        currentFilePath,
        activeTab: activeTabRef.current,
        matches: currentFilePath === updatedFilePath,
        sourceEditorId,
        currentEditorId,
        isFromThisEditor: sourceEditorId === currentEditorId,
        isCurrentlyActive,
        hasEditor: !!monacoRef.current,
        contentLength: updatedContent.length
      });

      // 关键修复：不要同步到正在编辑的编辑器（当前激活的tab对应的编辑器）
      if (currentFilePath === updatedFilePath &&
        monacoRef.current &&
        sourceEditorId !== currentEditorId &&
        !isCurrentlyActive) { // 关键：不是当前激活的tab才同步

        const editor = monacoRef.current;
        const currentContent = editor.getValue();

        // 只有当内容确实不同时才更新
        if (currentContent !== updatedContent) {
          console.log('🔄 同步到非激活编辑器:', updatedFilePath, '内容长度:', updatedContent.length);

          // 保存当前光标位置
          const position = editor.getPosition();

          // 更新内容
          editor.setValue(updatedContent);

          // 恢复光标位置
          if (position) {
            editor.setPosition(position);
          }

          // 更新lastLoadedContent以避免触发重复更新
          setLastLoadedContent(updatedContent);
        } else {
          console.log('🔄 内容相同，跳过同步');
        }
      } else if (sourceEditorId === currentEditorId) {
        console.log('🔄 忽略自己触发的同步事件');
      } else if (isCurrentlyActive) {
        console.log('🔄 跳过同步到当前激活的编辑器，避免干扰用户输入');
      }
    };

    window.addEventListener('ai-code-changes', handleAIMessage as EventListener);
    window.addEventListener('file-content-updated', handleFileContentUpdate as EventListener);
    // 清理内容
    return () => {
      window.removeEventListener('ai-code-changes', handleAIMessage as EventListener);
      window.removeEventListener('file-content-updated', handleFileContentUpdate as EventListener);
      if (monacoRef.current) {
        monacoRef.current.dispose();
        monacoRef.current = null;
      }
      if (diffEditorRef.current) {
        diffEditorRef.current.dispose();
        diffEditorRef.current = null;
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // 当激活标签页或文件路径改变时，更新编辑器内容
  useEffect(() => {
    updateTimeoutRef.current && clearTimeout(updateTimeoutRef.current);
    if (!editorRef.current || isUpdating || !filePath) return;
    // 使用防抖来避免快速切换导致的问题
    updateTimeoutRef.current = setTimeout(() => {
      setIsUpdating(true);
      try {
        // 从全局FileContext获取文件内容
        const tab = openTabs.get(filePath);
        if (!tab) {
          setIsUpdating(false);
          return;
        }

        const tabContent = tab.content || '';

        // 判断是否存在待处理的代码变更
        const changes = pendingChanges.find(changes => changes.filePath === filePath);
        if (changes) {
          previewCodeEditor(changes.originalCode, changes.newCode);
          setIsUpdating(false);
          return;
        }

        if (isDiffMode) {
          switchToNormalEditor(tabContent);
          setIsUpdating(false);
          return;
        }

        if (!monacoRef.current) {
          // 如果编辑器不存在，创建一个新的
          createEditor(tabContent);
          setLastLoadedContent(tabContent);
          setIsUpdating(false);
          return;
        }

        const editor = monacoRef.current;
        editor.setValue(tabContent || '');
        setLastLoadedContent(tabContent);
        // 只有当tab内容与上次加载的内容不同时才更新（表示切换了文件）
        // if (tabContent !== lastLoadedContent) {
          
        //   setLastLoadedContent(tabContent);
        // }

        // 根据文件扩展名设置语言
        const fileExtension = filePath.split('.').pop()?.toLowerCase();
        const language = languageMap[fileExtension || ''] || 'plaintext';
        const model = editor.getModel();
        model && monaco.editor.setModelLanguage(model, language);

      } catch (error) {
        console.error('Error updating editor:', error);
        // 如果出错，重新创建编辑器
        try {
          const tab = openTabs.get(filePath);
          const newContent = tab ? tab.content : '';
          createEditor(newContent);
          setLastLoadedContent(newContent);
        } catch (createError) {
          console.error('Error creating editor:', createError);
        }
      } finally {
        setIsUpdating(false);
      }
    }, 100); // 100ms 防抖延迟

    return () => {
      updateTimeoutRef.current && clearTimeout(updateTimeoutRef.current);
    };
  }, [activeTab, filePath, pendingChanges, isDiffMode, openTabs]);

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
    const targetTab = filePath || activeTab;
    const changes = pendingChanges.find(changes => changes.filePath === targetTab);
    changes && previewCodeEditor(changes.originalCode, changes.newCode);
  }, [pendingChanges, activeTab, filePath])


  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {editorId}

      {/* 编辑器容器 */}
      <div
        ref={editorRef}
        style={{ width: '100%', height: '100%' }}
        onClick={onActivate}
      />

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
          bottom: '10px',
          right: 'calc(50% - 80px)',
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
            ✓ Accept
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
            ✗ Reject
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