import React, { useState, useRef, useEffect } from 'react';
import * as monaco from 'monaco-editor';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { fileAPI } from '../services/api';
import CodeComparison from './CodeComparison';
import ToolCallComponent from './ToolCall';

interface AIAgentProps {
  editor: any;
  onClose: () => void;
  isVisible: boolean;
}

interface AIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeChanges?: CodeChange[];
  tools?: ToolCall[];
}

interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
}

interface ToolCall {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
}

const AIAgent: React.FC<AIAgentProps> = ({ editor, onClose, isVisible }) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentWorkspace } = useWorkspace();
  const { openTabs } = useFile();

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 获取工作空间文件列表
  const loadWorkspaceFiles = async () => {
    if (!currentWorkspace) return;
    
    try {
      const files = await fileAPI.getFileTree(currentWorkspace, '');
      setWorkspaceFiles(files);
    } catch (error) {
      console.error('加载文件列表失败:', error);
    }
  };

  useEffect(() => {
    if (isVisible) {
      loadWorkspaceFiles();
    }
  }, [isVisible, currentWorkspace]);

  // AI代码生成函数
  const generateCode = async (prompt: string, context: string, files: string[] = []) => {
    try {
      const response = await fetch('/api/v1/ai/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          context,
          workspace: currentWorkspace,
          language: getCurrentLanguage(),
          files,
          tools: ['file_read', 'file_write', 'code_analysis', 'git_operations']
        }),
      });

      if (!response.ok) {
        throw new Error('AI服务请求失败');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('AI代码生成失败:', error);
      throw error;
    }
  };

  // 获取当前编辑器语言
  const getCurrentLanguage = () => {
    if (!editor) return 'javascript';
    const model = editor.getModel();
    return model ? model.getLanguageId() : 'javascript';
  };

  // 获取当前代码上下文
  const getCurrentContext = () => {
    if (!editor) return '';
    return editor.getValue();
  };

  // 应用代码更改
  const applyCodeChange = (change: CodeChange) => {
    if (!editor) return;

    // 如果是当前文件，直接应用更改
    const currentTab = Object.values(openTabs).find(tab => tab.path === change.filePath);
    if (currentTab) {
      editor.setValue(change.newCode);
      return;
    }

    // 如果是其他文件，创建新标签页
    const newTabId = `ai-generated-${Date.now()}`;
    // 这里需要调用文件系统的API来创建或更新文件
    console.log('需要更新文件:', change.filePath, change.newCode);
  };

  // 拒绝代码更改
  const rejectCodeChange = (change: CodeChange) => {
    console.log('拒绝代码更改:', change.filePath);
  };

  // 处理用户输入
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const context = getCurrentContext();
      const files = selectedFiles.length > 0 ? selectedFiles : [];
      const data = await generateCode(inputValue, context, files);
      
      const assistantMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.message || data.code,
        timestamp: new Date(),
        codeChanges: data.codeChanges,
        tools: data.tools,
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // 如果有代码更改，显示对比界面
      if (data.codeChanges && data.codeChanges.length > 0) {
        // 这里会触发代码对比UI的显示
      }
    } catch (error) {
      const errorMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: '抱歉，代码生成失败。请重试。',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 快速操作按钮
  const quickActions = [
    { label: '添加注释', prompt: '为当前代码添加详细的注释' },
    { label: '优化代码', prompt: '优化当前代码的性能和可读性' },
    { label: '添加测试', prompt: '为当前代码生成单元测试' },
    { label: '修复错误', prompt: '检查并修复代码中的潜在错误' },
    { label: '重构代码', prompt: '重构当前代码，提高代码质量' },
    { label: '分析依赖', prompt: '分析当前代码的依赖关系' },
  ];

  const handleQuickAction = async (prompt: string) => {
    setInputValue(prompt);
    // 自动提交
    const event = new Event('submit') as any;
    await handleSubmit(event);
  };

  // 渲染代码对比界面
  const renderCodeComparison = (message: AIMessage) => {
    if (!message.codeChanges || message.codeChanges.length === 0) return null;

    return (
      <div style={{ marginTop: '12px' }}>
        {message.codeChanges.map((change, index) => (
          <CodeComparison
            key={index}
            originalCode={change.originalCode}
            newCode={change.newCode}
            filePath={change.filePath}
            description={change.description}
            onAccept={() => applyCodeChange(change)}
            onReject={() => rejectCodeChange(change)}
          />
        ))}
      </div>
    );
  };

  // 渲染工具调用
  const renderToolCalls = (message: AIMessage) => {
    if (!message.tools || message.tools.length === 0) return null;

    return (
      <div style={{ marginTop: '8px' }}>
        {message.tools.map((tool, index) => (
          <ToolCallComponent
            key={index}
            name={tool.name}
            parameters={tool.parameters}
            result={tool.result}
            status={tool.status as 'pending' | 'success' | 'error'}
          />
        ))}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div className="ai-agent" style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      width: '500px',
      height: '600px',
      backgroundColor: '#1e1e1e',
      border: '1px solid #333',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    }}>
      {/* 头部 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fas fa-robot" style={{ color: '#4CAF50' }}></i>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>AI 代码助手</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* 文件选择器 */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #333',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <span style={{ color: '#fff', fontSize: '14px' }}>相关文件</span>
          <button
            onClick={() => setShowFileSelector(!showFileSelector)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showFileSelector ? '隐藏' : '选择文件'}
          </button>
        </div>
        
        {showFileSelector && (
          <div style={{
            maxHeight: '150px',
            overflowY: 'auto',
            backgroundColor: '#2a2a2a',
            borderRadius: '4px',
            padding: '8px',
          }}>
            {workspaceFiles.map((file) => (
              <label key={file.path} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 0',
                cursor: 'pointer',
                color: '#ccc',
                fontSize: '12px',
              }}>
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file.path)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedFiles(prev => [...prev, file.path]);
                    } else {
                      setSelectedFiles(prev => prev.filter(f => f !== file.path));
                    }
                  }}
                  style={{ margin: 0 }}
                />
                {file.name}
              </label>
            ))}
          </div>
        )}
        
        {selectedFiles.length > 0 && (
          <div style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#4CAF50',
          }}>
            已选择 {selectedFiles.length} 个文件
          </div>
        )}
      </div>

      {/* 快速操作 */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
      }}>
        {quickActions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleQuickAction(action.prompt)}
            disabled={isLoading}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* 消息列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.type === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: message.type === 'user' ? '#4CAF50' : '#333',
              color: '#fff',
              fontSize: '14px',
              whiteSpace: 'pre-wrap',
            }}>
              {message.content}
            </div>
            
            {/* 渲染代码对比 */}
            {renderCodeComparison(message)}
            
            {/* 渲染工具调用 */}
            {renderToolCalls(message)}
            
            <div style={{
              fontSize: '12px',
              color: '#999',
              marginTop: '4px',
            }}>
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#999',
            fontSize: '14px',
          }}>
            <i className="fas fa-spinner fa-spin"></i>
            AI正在思考中...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} style={{
        padding: '16px',
        borderTop: '1px solid #333',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
        }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="描述你想要的代码功能..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: (isLoading || !inputValue.trim()) ? 0.5 : 1,
            }}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </form>
    </div>
  );
};

export default AIAgent; 