import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';
import { fileAPI } from '../services/api';
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
  parameterHints: { enabled: true },
  hover: { enabled: true },
  links: true,
  colorDecorators: true
};

/**
 * Diff编辑器配置
 */
const diffEditorConfig: monaco.editor.IStandaloneDiffEditorConstructionOptions = {
  enableSplitViewResizing: true,
  renderMarginRevertIcon: true,
  renderOverviewRuler: true,
  originalEditable: false,
  diffCodeLens: true,
  automaticLayout: true,
  fontSize: 14,
  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
  renderSideBySide: false,
};

// 配置TypeScript
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



const MonacoEditor: React.FC<MonacoEditorProps> = ({
  className,
  filePath,
  onActivate
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDiffMode, setIsDiffMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const { currentWorkspace } = useWorkspace();
  const {
    updateTabContent,
    getTabContent,
    activeTab
  } = useFile();
  const { 
    pendingChanges, 
    getChangesForFile, 
    removePendingChanges,
    markChangeAsApplied 
  } = useAICodeChanges();
  const { theme } = useTheme();

  // 获取文件扩展名对应的语言
  const getLanguageFromPath = useCallback((path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    return languageMap[extension || ''] || 'plaintext';
  }, []);

  // 保存文件
  const saveFile = useCallback(async () => {
    if (!currentWorkspace || !filePath || !monacoRef.current) return;
    const content = monacoRef.current.getValue();
    // 同步更新其他tab内容
    updateTabContent(filePath, content);
    await fileAPI.writeFile(currentWorkspace, filePath, content);
  }, [currentWorkspace, filePath, updateTabContent]);

  // 编辑器内容变化处理
  const handleContentChange = useCallback(() => {
    if (!filePath ) return;
    const content = monacoRef.current?.getValue() || '';
    updateTabContent(filePath, content);
    // 防抖保存
    saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveFile();
    }, 2000);
  }, [filePath, saveFile]);

  // 设置编辑器事件
  const setupEditorEvents = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.updateOptions({ readOnly: false });
    editor.onDidChangeModelContent(handleContentChange);

    // 快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveFile);
  }, [handleContentChange, saveFile]);

  // 清理编辑器
  const cleanupEditor = useCallback(() => {
    if (monacoRef.current) {
      monacoRef.current.dispose();
      monacoRef.current = null;
    }
    if (diffEditorRef.current) {
      diffEditorRef.current.dispose();
      diffEditorRef.current = null;
    }
  }, []);

  // 创建编辑器
  const createEditor = useCallback((content: string = '', language: string = 'javascript') => {
    if (!editorRef.current) return;
    cleanupEditor();
    const editor = monaco.editor.create(editorRef.current, {
      ...defaultEditorConfig,
      theme: theme === 'dark' ? 'vs-dark' : 'vs',
      value: content,
      language,
      readOnly: false,
    });
    monacoRef.current = editor;
    setupEditorEvents(editor);
  }, [cleanupEditor, theme, setupEditorEvents]);

  // 预览代码差异
  const previewCodeDiff = useCallback((originalCode: string, modifiedCode: string, language: string, operation?: 'create' | 'edit' | 'delete') => {
    if (!editorRef.current) return;
    cleanupEditor();
    const diffEditor = monaco.editor.createDiffEditor(editorRef.current, {
      ...diffEditorConfig,
      theme: theme === 'dark' ? 'vs-dark' : 'vs'
    });
    
    // 根据操作类型设置不同的标题
    let originalTitle = 'Original';
    let modifiedTitle = 'Modified';
    
    if (operation === 'create') {
      originalTitle = 'Empty File';
      modifiedTitle = 'New File';
    } else if (operation === 'delete') {
      originalTitle = 'Current File';
      modifiedTitle = 'Will be deleted';
    }
    
    diffEditor.setModel({
      original: monaco.editor.createModel(originalCode, language),
      modified: monaco.editor.createModel(modifiedCode, language),
    });
    
    // 设置标题
    const originalModel = diffEditor.getModel()?.original;
    const modifiedModel = diffEditor.getModel()?.modified;
    if (originalModel) {
      originalModel.setValue(originalCode);
    }
    if (modifiedModel) {
      modifiedModel.setValue(modifiedCode);
    }
    
    diffEditorRef.current = diffEditor;
    setIsDiffMode(true);
  }, [cleanupEditor, theme]);

  // 切换回普通编辑器
  const switchToNormalEditor = useCallback((content: string = '', language: string = 'javascript') => {
    if (!editorRef.current) return;

    console.log('切换回普通编辑器:', { content: content.length, language });
    
    cleanupEditor();
    setIsDiffMode(false);
    createEditor(content, language);
    
    // 更新tab内容
    if (filePath) {
      updateTabContent(filePath, content);
      console.log('已更新tab内容');
    }
  }, [cleanupEditor, createEditor, filePath, updateTabContent]);

  // 应用代码更改
  const applyCodeChanges = useCallback(() => {
    if (!filePath || !diffEditorRef.current) return;

    console.log('开始应用代码更改:', filePath);

    const editor = diffEditorRef.current;
    const modifiedContent = editor.getModel()?.modified?.getValue() || '';
    const originalContent = editor.getModel()?.original?.getValue() || '';

    console.log('应用代码更改内容:', { 
      originalLength: originalContent.length, 
      modifiedLength: modifiedContent.length 
    });

    // 根据内容判断操作类型
    let operation = 'edit';
    if (originalContent === '' && modifiedContent !== '') {
      operation = 'create';
    } else if (originalContent !== '' && modifiedContent === '') {
      operation = 'delete';
    }

    console.log('文件操作类型:', operation);

    // 触发实际的文件操作
    window.dispatchEvent(new CustomEvent('execute-file-operation', {
      detail: {
        operation,
        filePath,
        content: modifiedContent
      }
    }));

    // 更新tab内容
    updateTabContent(filePath, modifiedContent);
    console.log('已更新tab内容');
    
    // 移除待处理的修改
    removePendingChanges(filePath);
    console.log('已移除待处理的修改');
    
    // 标记为已应用
    markChangeAsApplied(filePath);
    console.log('已标记为已应用');
    
    // 切换到普通编辑器
    switchToNormalEditor(modifiedContent, getLanguageFromPath(filePath));
    console.log('应用代码更改完成');
  }, [filePath, updateTabContent, removePendingChanges, markChangeAsApplied, switchToNormalEditor, getLanguageFromPath]);

  // 处理文件操作
  const handleFileOperation = useCallback((operation: 'create' | 'edit' | 'delete', filePath: string, content?: string, originalContent?: string) => {
    if (!currentWorkspace) return;

    const language = getLanguageFromPath(filePath);
    console.log('Handling file operation:', { operation, filePath, content, originalContent });
    
    // 触发文件打开事件，确保文件在tab中打开
    window.dispatchEvent(new CustomEvent('open-file-in-tab', {
      detail: { filePath }
    }));
    
    // 延迟一点时间确保文件已打开，然后显示差异
    setTimeout(() => {
      switch (operation) {
        case 'create':
          if (content) {
            console.log('Showing create diff for:', filePath);
            previewCodeDiff('', content, language, 'create');
          }
          break;
        case 'edit':
          if (content && originalContent) {
            console.log('Showing edit diff for:', filePath);
            previewCodeDiff(originalContent, content, language, 'edit');
          }
          break;
        case 'delete':
          if (originalContent) {
            console.log('Showing delete diff for:', filePath);
            previewCodeDiff(originalContent, '', language, 'delete');
          }
          break;
      }
    }, 200); // 给文件打开更多时间
  }, [currentWorkspace, getLanguageFromPath, previewCodeDiff]);

  // 监听文件操作事件
  useEffect(() => {
    const handleFileOperationEvent = (event: CustomEvent) => {
      const { operation, filePath, content, originalContent } = event.detail;
      console.log('MonacoEditor received file operation:', { operation, filePath, content, originalContent });
      
      // 如果当前编辑器显示的是这个文件，立即显示差异
      if (filePath === activeTab) {
        handleFileOperation(operation, filePath, content, originalContent);
      } else {
        // 如果当前编辑器显示的不是这个文件，但文件已打开，也显示差异
        const changes = getChangesForFile(filePath);
        if (changes) {
          handleFileOperation(operation, filePath, content, originalContent);
        }
      }
    };

    window.addEventListener('file-operation', handleFileOperationEvent as EventListener);
    return () => {
      window.removeEventListener('file-operation', handleFileOperationEvent as EventListener);
    };
  }, [handleFileOperation, activeTab, getChangesForFile]);

  // 监听文件打开事件，确保文件打开后显示差异
  useEffect(() => {
    const handleOpenFileEvent = (event: CustomEvent) => {
      const { filePath } = event.detail;
      console.log('MonacoEditor received open file event:', filePath);
      
      // 如果这个文件有待处理的变更，等待文件加载完成后显示差异
      setTimeout(() => {
        const changes = getChangesForFile(filePath);
        if (changes) {
          const language = getLanguageFromPath(filePath);
          console.log('Showing diff for opened file:', filePath, changes);
          
          // 根据变更类型确定操作类型
          let operation: 'create' | 'edit' | 'delete' | undefined;
          if (changes.changeType === 'insert') {
            operation = 'create';
          } else if (changes.changeType === 'delete') {
            operation = 'delete';
          } else {
            operation = 'edit';
          }
          
          previewCodeDiff(changes.originalCode, changes.newCode, language, operation);
        }
      }, 200); // 给文件加载更多时间
    };

    window.addEventListener('open-file-in-tab', handleOpenFileEvent as EventListener);
    return () => {
      window.removeEventListener('open-file-in-tab', handleOpenFileEvent as EventListener);
    };
  }, [getChangesForFile, getLanguageFromPath, previewCodeDiff]);

  // 拒绝代码更改
  const rejectCodeChanges = useCallback(() => {
    if (!filePath) return;

    console.log('开始拒绝代码更改:', filePath);

    // 获取原始内容（从diff编辑器的original模型）
    let originalContent = '';
    if (diffEditorRef.current) {
      originalContent = diffEditorRef.current.getModel()?.original?.getValue() || '';
      console.log('从diff编辑器获取原始内容:', originalContent);
    }

    // 如果没有原始内容，尝试从tab内容获取
    if (!originalContent) {
      originalContent = getTabContent(filePath) || '';
      console.log('从tab内容获取原始内容:', originalContent);
    }

    // 移除待处理的修改
    removePendingChanges(filePath);
    console.log('已移除待处理的修改');
    
    // 切换到普通编辑器，显示原始内容
    switchToNormalEditor(originalContent, getLanguageFromPath(filePath));
    console.log('已切换到普通编辑器');
    
    // 如果是删除操作被拒绝，需要恢复文件
    if (diffEditorRef.current) {
      const modifiedContent = diffEditorRef.current.getModel()?.modified?.getValue() || '';
      
      if (originalContent !== '' && modifiedContent === '') {
        console.log('删除操作被拒绝，恢复文件');
        // 这是删除操作，拒绝时需要恢复文件
        window.dispatchEvent(new CustomEvent('execute-file-operation', {
          detail: {
            operation: 'create',
            filePath,
            content: originalContent
          }
        }));
      }
    }

    console.log('拒绝代码更改完成，恢复原始内容:', { filePath, originalContent });
  }, [filePath, getTabContent, removePendingChanges, switchToNormalEditor, getLanguageFromPath]);

  // 监听AI消息事件
  const handleAIMessage = useCallback((event: CustomEvent) => {
    const { codeChanges } = event.detail;
    if (codeChanges && codeChanges.length > 0) {
      // 现在AI代码修改由全局状态管理，这里不需要设置本地状态
      console.log('收到AI代码修改:', codeChanges);
    }
  }, []);

  // 初始化编辑器
  useEffect(() => {
    if (!editorRef.current || monacoRef.current) return;

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

    window.addEventListener('ai-code-changes', handleAIMessage as EventListener);

    return () => {
      window.removeEventListener('ai-code-changes', handleAIMessage as EventListener);
      cleanupEditor();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [createEditor, handleAIMessage, cleanupEditor]);

  // 更新编辑器内容
  useEffect(() => {
    console.log('更新编辑器内容:', { filePath, pendingChanges: pendingChanges.length });
    if (!filePath || isUpdating) return;

    setIsUpdating(true);

    try {
      const tabContent = getTabContent(filePath) || '';
      const language = getLanguageFromPath(filePath);

      // 检查是否有待处理的代码变更
      const changes = getChangesForFile(filePath);
      if (changes) {
        console.log('发现待处理的代码变更，显示差异:', changes);
        
        // 根据变更类型确定操作类型
        let operation: 'create' | 'edit' | 'delete' | undefined;
        if (changes.changeType === 'insert') {
          operation = 'create';
        } else if (changes.changeType === 'delete') {
          operation = 'delete';
        } else {
          operation = 'edit';
        }
        
        previewCodeDiff(changes.originalCode, changes.newCode, language, operation);
        setIsUpdating(false);
        return;
      }

      // 如果没有待处理的变更，且当前在差异模式，切换回普通编辑器
      if (isDiffMode) {
        console.log('没有待处理的变更，切换回普通编辑器');
        switchToNormalEditor(tabContent, language);
        setIsUpdating(false);
        return;
      }

      // 创建或更新普通编辑器
      if (!monacoRef.current) {
        console.log('创建新编辑器');
        createEditor(tabContent, language);
        setIsUpdating(false);
        return;
      }

      const editor = monacoRef.current;
      const currentContent = editor.getValue();

      // 只有当内容确实不同时才更新
      if (currentContent !== tabContent) {
        console.log('更新编辑器内容');
        editor.setValue(tabContent);

        // 更新语言
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelLanguage(model, language);
        }
      }
    } catch (error) {
      console.error('更新编辑器失败:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [filePath, activeTab, pendingChanges, isDiffMode, getTabContent, getLanguageFromPath, previewCodeDiff, switchToNormalEditor, createEditor]);

  // 主题变化
  useEffect(() => {
    if (!monacoRef.current) return;

    const editor = monacoRef.current;
    const model = editor.getModel();
    if (model) {
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }
  }, [theme]);

  // AI代码变化时预览差异
  useEffect(() => {
    if (!filePath) return;

    const changes = getChangesForFile(filePath);
    if (changes) {
      const language = getLanguageFromPath(filePath);
      
      // 根据变更类型确定操作类型
      let operation: 'create' | 'edit' | 'delete' | undefined;
      if (changes.changeType === 'insert') {
        operation = 'create';
      } else if (changes.changeType === 'delete') {
        operation = 'delete';
      } else {
        operation = 'edit';
      }
      
      console.log('AI代码变化，显示差异:', { filePath, changes, operation });
      previewCodeDiff(changes.originalCode, changes.newCode, language, operation);
    }
  }, [pendingChanges, filePath, previewCodeDiff, getLanguageFromPath, getChangesForFile]);

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* 编辑器容器 */}
      <div
        ref={editorRef}
        style={{ width: '100%', height: '100%' }}
        onClick={onActivate}
      />

      {/* 工作空间提示 */}
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
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📁</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先选择工作空间</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间
          </div>
        </div>
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
    </div>
  );
};

export default MonacoEditor; 