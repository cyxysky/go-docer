import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { fileAPI } from '../services/api';
import AIAgent from './AIAgent';
import EditorDiffOverlay from './EditorDiffOverlay';

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
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<CodeChange[]>([]);
  const [showDiffOverlay, setShowDiffOverlay] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const { openTabs, activeTab, updateTabContent } = useFile();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
  const createEditor = () => {
    if (!editorRef.current) {
      console.error('❌ editorRef.current 不存在');
      return;
    }

    try {
      console.log('🚀 开始创建Monaco编辑器');
      const editor = monaco.editor.create(editorRef.current, {
        value: '// 欢迎使用代码编辑器\nconsole.log("Hello, World!");\n\n// 开始编写你的代码吧！\n// 按 Ctrl+Shift+A 打开AI助手',
        language: 'javascript',
        theme: 'vs-dark',
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
      });

      monacoRef.current = editor;
      console.log('✅ Monaco编辑器创建成功');

      // 强制布局更新
      setTimeout(() => {
        editor.layout();
      }, 100);

      // 监听内容变化并自动保存
      editor.onDidChangeModelContent(() => {
        const currentActiveTab = activeTabRef.current;
        
        if (currentActiveTab) {
          const content = editor.getValue();
          updateTabContent(currentActiveTab, content);

          // 自动保存：延迟2秒后保存
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveTimeoutRef.current = setTimeout(() => {
            const latestActiveTab = activeTabRef.current;
            if (latestActiveTab) {
              try {
                saveFileDirectly(latestActiveTab);
              } catch (error) {
                console.error('❌ 自动保存失败:', error);
              }
            }
          }, 2000);
        }
      });

      // 添加保存快捷键
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
        try {
          const currentActiveTab = activeTabRef.current;
          if (currentActiveTab) {
            saveFileDirectly(currentActiveTab);
          }
        } catch (error) {
          console.error('❌ 快捷键保存失败:', error);
        }
      });

      // 添加AI助手快捷键
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, function () {
        setIsAIVisible(prev => !prev);
      });

    } catch (error) {
      console.error('❌ Monaco编辑器初始化失败:', error);
    }
  };

  // 创建编辑器实例
  useEffect(() => {
    if (!editorRef.current) {
      console.error('❌ editorRef.current 不存在');
      return;
    }
    
    if (monacoRef.current) {
      console.log('✅ 编辑器已存在，跳过创建');
      return;
    }

    // 检查容器高度
    const containerHeight = editorRef.current.offsetHeight;
    console.log('📏 容器高度:', containerHeight);
    
    if (containerHeight === 0) {
      console.warn('⚠️ 容器高度为0，等待下一帧再尝试');
      requestAnimationFrame(() => {
        if (editorRef.current && !monacoRef.current) {
          console.log('🔄 重新尝试创建编辑器');
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
        setShowDiffOverlay(true);
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
    if (!monacoRef.current || !activeTab) return;

    try {
      const tab = openTabs.get(activeTab);
      if (!tab) return;

      const editor = monacoRef.current;
      const currentValue = editor.getValue();
    
      // 只有当内容不同时才更新，避免光标位置重置
      if (currentValue !== tab.content) {
        editor.setValue(tab.content || '');
      }

      // 根据文件扩展名设置语言
      const fileExtension = tab.path.split('.').pop()?.toLowerCase();
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

      const language = languageMap[fileExtension || ''] || 'plaintext';
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    } catch (error) {
      console.error('❌ 更新编辑器内容失败:', error);
    }
  }, [activeTab, openTabs]);

  const handleApplyChange = async (change: CodeChange) => {
    if (currentWorkspace && change.filePath && change.newCode) {
      try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/write`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: change.filePath,
            content: change.newCode,
          }),
        });

        if (response.ok) {
          // 更新编辑器内容
          if (monacoRef.current && change.newCode) {
            monacoRef.current.setValue(change.newCode);
          }
          
          // 标记为已应用
          setPendingChanges(prev => 
            prev.map(c => 
              c === change ? { ...c, applied: true } : c
            )
          );
          
          console.log('✅ 代码更改已应用到文件:', change.filePath);
        } else {
          throw new Error(`Failed to write file: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error applying code change:', error);
        alert(`应用代码更改失败: ${error}`);
      }
    }
  };

  const handleRejectChange = (change: CodeChange) => {
    setPendingChanges(prev => prev.filter(c => c !== change));
    
    // 如果没有更多更改，关闭覆盖层
    if (pendingChanges.length === 1) {
      setShowDiffOverlay(false);
    }
  };

  const handleApplyAllChanges = async () => {
    for (const change of pendingChanges) {
      if (!change.applied) {
        await handleApplyChange(change);
      }
    }
  };

  const handleRejectAllChanges = () => {
    setPendingChanges([]);
    setShowDiffOverlay(false);
  };

  const handleCloseDiffOverlay = () => {
    setShowDiffOverlay(false);
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
          <div style={{fontSize: '3rem', marginBottom: '16px', display: 'block'}}>📁</div>
          <div style={{fontSize: '16px', marginBottom: '8px'}}>请先选择工作空间</div>
          <div style={{fontSize: '12px', color: '#666'}}>
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

      {/* 代码差异覆盖层 */}
      {showDiffOverlay && pendingChanges.length > 0 && (
        <EditorDiffOverlay
          changes={pendingChanges}
          onApply={handleApplyChange}
          onReject={handleRejectChange}
          onApplyAll={handleApplyAllChanges}
          onRejectAll={handleRejectAllChanges}
          onClose={handleCloseDiffOverlay}
          strategy="preview"
        />
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