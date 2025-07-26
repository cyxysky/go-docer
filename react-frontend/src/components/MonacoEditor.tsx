import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useFile } from '../contexts/FileContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkspace } from '../contexts/WorkspaceContext'; // 添加工作空间状态
import { fileAPI } from '../services/api'; // 导入API

// 配置Monaco编辑器的主题
monaco.editor.defineTheme('vs-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {}
});

// 配置TypeScript语言服务 - 启用基础功能但避免错误
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});

// 配置TypeScript编译器选项
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  allowJs: true,
  target: monaco.languages.typescript.ScriptTarget.Latest,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.CommonJS,
  noEmit: true,
  typeRoots: [],
  lib: ['es2020', 'dom']
});

// 配置JavaScript语言服务
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});

monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  allowNonTsExtensions: true,
  allowJs: true,
  target: monaco.languages.typescript.ScriptTarget.Latest,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.CommonJS,
  noEmit: true,
  typeRoots: [],
  lib: ['es2020', 'dom']
});

interface MonacoEditorProps {
  className?: string;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({ className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { openTabs, activeTab, updateTabContent } = useFile();
  const { theme } = useTheme();
  const { currentWorkspace } = useWorkspace(); // 直接使用工作空间状态
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
  
  // 创建新的保存方法，直接在MonacoEditor中处理
  const saveFileDirectly = async (tabId: string) => {
    const workspace = currentWorkspaceRef.current;
    if (!workspace) {
      throw new Error('请先选择工作空间。在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间。');
    }
    
    // 使用ref获取最新的openTabs状态
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

  // 只在组件挂载时创建编辑器实例
  useEffect(() => {
    if (!editorRef.current) {
      console.error('DOM元素不存在！');
      return;
    }
    
    if (monacoEditorRef.current) {
      console.log('编辑器已存在，跳过创建');
      return;
    }

    // 检查容器高度
    const containerHeight = editorRef.current.offsetHeight;
    
    if (containerHeight === 0) {
      // 如果容器高度为0，等待下一帧再尝试
      requestAnimationFrame(() => {
        if (editorRef.current && !monacoEditorRef.current) {
          createEditor();
        }
      });
      return;
    }

    createEditor();

    function createEditor() {
      try {
        
        // 创建Monaco编辑器实例
        const editor = monaco.editor.create(editorRef.current!, {
          value: '// 欢迎使用代码编辑器\nconsole.log("Hello, World!");\n\n// 开始编写你的代码吧！',
          language: 'javascript',
          theme: theme === 'dark' ? 'vs-dark' : 'vs',
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

        monacoEditorRef.current = editor;

        // 监听内容变化
        editor.onDidChangeModelContent(() => {
          const currentActiveTab = activeTabRef.current; // 使用ref获取最新值
          
          if (currentActiveTab) {
            const content = editor.getValue();
            updateTabContent(currentActiveTab, content);
            
            // 自动保存：延迟2秒后保存
            if (saveTimeoutRef.current) {
              clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
              const latestActiveTab = activeTabRef.current; // 再次获取最新值
              if (latestActiveTab) {
                try {
                  saveFileDirectly(latestActiveTab); // 使用新的保存方法
                } catch (error) {
                  console.error('❌ 自动保存失败:', error);
                }
              } else {
                console.log('⚠️ 没有活动标签页，跳过保存');
              }
            }, 2000);
          } else {
            console.log('⚠️ 没有活动标签页，跳过保存');
          }
        });

        // 添加保存快捷键
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
          try {
            const currentActiveTab = activeTabRef.current; // 使用ref获取最新值
            if (currentActiveTab) {
              saveFileDirectly(currentActiveTab); // 使用新的保存方法
            }
          } catch (error) {
            console.error('❌ 快捷键保存失败:', error);
          }
        });


        return () => {
          if (editor) {
            editor.dispose();
          }
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
        };
      } catch (error) {
        console.error('❌ Monaco编辑器初始化失败:', error);
      }
    }
  }, []); // 空依赖数组，只在挂载时执行一次

  // 当主题改变时，更新编辑器主题
  useEffect(() => {
    if (monacoEditorRef.current) {
      try {
        monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
        console.log('🎨 主题已切换为:', theme);
      } catch (error) {
        console.error('❌ 主题切换失败:', error);
      }
    }
  }, [theme]);

  // 当活动标签页改变时，更新编辑器内容
  useEffect(() => {
    if (!monacoEditorRef.current || !activeTab) return;

    try {
      const tab = openTabs.get(activeTab);
      if (!tab) return;

      const editor = monacoEditorRef.current;
      const currentValue = editor.getValue();
      
      // 只有当内容不同时才更新，避免光标位置重置
      if (currentValue !== tab.content) {
        try {
          editor.setValue(tab.content);
        } catch (error) {
          console.warn('设置编辑器内容时出现警告，尝试替代方法:', error);
          // 使用替代方法设置内容
          editor.setValue(JSON.stringify(tab.content));
        }
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

  return (
    <div 
      ref={editorRef} 
      className={className}
      style={{ width: '100%', height: '100%' }}
    >
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
          <i className="fas fa-cube" style={{fontSize: '3rem', marginBottom: '16px', display: 'block'}}></i>
          <div style={{fontSize: '16px', marginBottom: '8px'}}>请先选择工作空间</div>
          <div style={{fontSize: '12px', color: '#666'}}>
            在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间
          </div>
        </div>
      )}
    </div>
  );
};

export default MonacoEditor; 