import React, { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';
import { fileAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

// 统一转换所有内容为纯文本，避免 monaco 在处理 JSON/对象时报 Z.split 错误
const normalizeToString = (value: any, fallback: string = ''): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  try {
    // 对象或数组，尽量格式化为 JSON 字符串
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    // 数字、布尔等
    return String(value);
  } catch {
    return fallback;
  }
};

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
const defaultEditorConfig = {
  automaticLayout: true,
  codeLens: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  fontSize: 14,
  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
  lineNumbers: 'on' as const,
  roundedSelection: false,
  scrollbar: {
    vertical: 'visible' as const,
    horizontal: 'visible' as const,
    verticalScrollbarSize: 12,
    horizontalScrollbarSize: 12,
  },
  folding: true,
  wordWrap: 'off' as const,
  renderWhitespace: 'selection' as const,
  selectOnLineNumbers: true,
  contextmenu: true,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  tabCompletion: 'off' as const,
  wordBasedSuggestions: 'allDocuments' as const,
  parameterHints: { enabled: true },
  hover: { enabled: true },
  links: true,
  colorDecorators: true
};

/**
 * Diff编辑器配置
 */
const diffEditorConfig = {
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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDiffMode, setIsDiffMode] = useState(false);
  const [isCreatingDiff, setIsCreatingDiff] = useState(false);
  const [originalCode, setOriginalCode] = useState('');
  const [modifiedCode, setModifiedCode] = useState('');

  const { currentWorkspace } = useWorkspace();
  const {
    updateTabContent,
    getTabContent,
  } = useFile();
  const {
    pendingChanges,
    getChangesForFile,
    removePendingChanges,
    markChangeAsApplied
  } = useAICodeChanges();
  const { theme } = useTheme();

  // 获取文件扩展名对应的语言
  const getLanguageFromPath = (path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    return languageMap[extension || ''] || 'plaintext';
  }

  // 保存文件
  const saveFile = useCallback(async () => {
    if (!currentWorkspace || !filePath || !editorRef.current) return;
    const content = editorRef.current.getValue();
    // 同步更新其他tab内容
    updateTabContent(filePath, content);
    await fileAPI.writeFile(currentWorkspace, filePath, content);
  }, [currentWorkspace, filePath, updateTabContent]);

  // 编辑器内容变化处理
  const handleContentChange = useCallback((value: string | undefined) => {
    if (!filePath) return;
    const content = normalizeToString(value, '');
    updateTabContent(filePath, content);
    // 防抖保存
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveFile();
    }, 2000);
  }, [filePath, saveFile, updateTabContent]);

  // 编辑器挂载完成
  const handleEditorDidMount: OnMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;

    // 配置TypeScript
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      allowNonTsExtensions: true,
    });

    // 添加保存快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveFile);
  }, [saveFile]);

  // 差异编辑器挂载完成
  const handleDiffEditorDidMount: DiffOnMount = useCallback((editor: any, monaco: any) => {
    diffEditorRef.current = editor;

    // 配置TypeScript
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      allowNonTsExtensions: true,
    });
  }, []);

  // 预览代码差异
  const previewCodeDiff = useCallback((originalCode: string, modifiedCode: string) => {
    if (isCreatingDiff) return;

    setIsCreatingDiff(true);
    setOriginalCode(normalizeToString(originalCode, ''));
    setModifiedCode(normalizeToString(modifiedCode, ''));
    setIsDiffMode(true);
    setIsCreatingDiff(false);
  }, [isCreatingDiff]);

  // 切换回普通编辑器
  const switchToNormalEditor = useCallback((content: string = '') => {
    setIsDiffMode(false);
    setIsCreatingDiff(false);
    setOriginalCode('');
    setModifiedCode('');

    // 更新tab内容
    if (filePath) {
      updateTabContent(filePath, content);
    }
  }, [filePath, updateTabContent]);

  // 应用代码更改
  const applyCodeChanges = useCallback(() => {
    if (!filePath || !diffEditorRef.current) return;
    const modifiedContent = diffEditorRef.current.getModel()?.modified?.getValue() || '';
    const originalContent = originalCode;
    // 根据内容判断操作类型
    let operation = 'edit';
    if (originalContent === '' && modifiedContent !== '') {
      operation = 'create';
    } else if (originalContent !== '' && modifiedContent === '') {
      operation = 'delete';
    }
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
    // 移除待处理的修改
    removePendingChanges(filePath);
    // 标记为已应用
    markChangeAsApplied(filePath);
    // 切换到普通编辑器
    switchToNormalEditor(modifiedContent);
  }, [filePath, modifiedCode, originalCode, updateTabContent, removePendingChanges, markChangeAsApplied, switchToNormalEditor]);


  const rejectCodeChanges = useCallback(() => {
    if (!filePath) return;
    // 获取原始内容
    let originalContent = originalCode;
    // 如果没有原始内容，尝试从tab内容获取
    if (!originalContent) {
      originalContent = getTabContent(filePath) || '';
    }
    // 移除待处理的修改
    removePendingChanges(filePath);
    // 切换到普通编辑器，显示原始内容
    switchToNormalEditor(originalContent);
    // 如果是删除操作被拒绝，需要恢复文件
    if (originalContent !== '' && modifiedCode === '') {
      // 这是删除操作，拒绝时需要恢复文件
      window.dispatchEvent(new CustomEvent('execute-file-operation', {
        detail: {
          operation: 'create',
          filePath,
          content: originalContent
        }
      }));
    }
  }, [filePath, originalCode, modifiedCode, getTabContent, removePendingChanges, switchToNormalEditor]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // AI代码变化时预览差异
  useEffect(() => {
    if (!filePath) return;
    const changes = getChangesForFile(filePath);
    if (changes) {
      // 使用 setTimeout 确保在下一个事件循环中执行，避免重复触发
      setTimeout(() => {
        previewCodeDiff(changes.originalCode, changes.newCode);
      }, 0);
    }
  }, [pendingChanges, filePath, getChangesForFile, previewCodeDiff]);

  // 获取当前应该显示的内容
  const getCurrentContent = () => {
    if (!filePath) return '';
    const raw = getTabContent(filePath);
    return normalizeToString(raw, '');
  };

  // 获取当前语言
  const getCurrentLanguage = () => {
    if (!filePath) return 'javascript';
    return getLanguageFromPath(filePath);
  };

  return (
    <div
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* 编辑器容器 */}
      <div
        style={{ width: '100%', height: '100%' }}
        onClick={onActivate}
      >
        {isDiffMode ? (
          <DiffEditor
            height="100%"
            language={getCurrentLanguage()}
            original={originalCode}
            modified={modifiedCode}
            options={diffEditorConfig}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            onMount={handleDiffEditorDidMount}
          />
        ) : (
          <Editor
            height="100%"
            defaultLanguage={getCurrentLanguage()}
            value={getCurrentContent()}
            options={defaultEditorConfig}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            onMount={handleEditorDidMount}
            onChange={handleContentChange}
          />
        )}
      </div>

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
            Accept
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
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

export default MonacoEditor;