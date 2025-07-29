import React, { useState, useEffect, useRef, useCallback } from 'react';
import CodeComparison from './CodeComparison';
import ToolCall from './ToolCall';
import './AIAgent.css';

interface AIAgentProps {
  editor: any;
  onClose: () => void;
  isVisible: boolean;
  fileTree?: any;
  currentWorkspace?: string;
}

interface AIMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  codeChanges?: CodeChange[];
  tools?: ToolCall[];
  model?: string;
  status?: 'pending' | 'completed' | 'error';
}

interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
  changeType: 'insert' | 'replace' | 'delete' | 'modify';
  lineNumbers?: { start: number; end: number };
  confidence: number;
  applied?: boolean;
}

interface ToolCall {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
  output?: string;
  executionId?: string;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  max_tokens: number;
  temperature: number;
  is_default: boolean;
}

const AIAgent: React.FC<AIAgentProps> = ({ 
  editor, 
  onClose, 
  isVisible, 
  fileTree,
  currentWorkspace 
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [strategy, setStrategy] = useState<'preview' | 'auto' | 'manual'>('preview');
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileDropRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isVisible) {
      loadAvailableModels();
    }
  }, [isVisible]);

  // 拖拽调整大小
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < 800) {
          setSidebarWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath && !selectedFiles.includes(filePath)) {
      setSelectedFiles(prev => [...prev, filePath]);
    }
  }, [selectedFiles]);

  const loadAvailableModels = async () => {
    try {
      const response = await fetch('/api/v1/ai/models');
      if (response.ok) {
        const modelsData = await response.json();
        setModels(modelsData);
        
        const defaultModel = modelsData.find((m: AIModel) => m.is_default);
        if (defaultModel) {
          setSelectedModel(defaultModel.id);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const generateCode = async (prompt: string, filePaths: string[] = []) => {
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }

    setIsLoading(true);
    
    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: prompt,
      timestamp: new Date(),
      status: 'completed'
    };
    
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/v1/ai/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          workspace: currentWorkspace,
          model: selectedModel,
          strategy: strategy,
          file_paths: filePaths,
          auto_apply: autoMode,
          tools: ['file_read', 'file_write', 'execute_shell'],
          max_file_size: 1024 * 1024
        }),
      });

      const data = await response.json();
      
      const assistantMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.code || data.message,
        timestamp: new Date(),
        codeChanges: data.code_changes || [],
        tools: data.tools || [],
        model: selectedModel,
        status: data.success ? 'completed' : 'error'
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      // 发送代码差异到编辑器
      if (data.code_changes && data.code_changes.length > 0) {
        const event = new CustomEvent('ai-code-changes', {
          detail: { codeChanges: data.code_changes }
        });
        window.dispatchEvent(event);
      }

      if (autoMode && data.code_changes && data.code_changes.length > 0) {
        await applyAllCodeChanges(data.code_changes);
      }
    } catch (error) {
      console.error('Error generating code:', error);
      const errorMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'system',
        content: `Error: ${error}`,
        timestamp: new Date(),
        status: 'error'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const applyCodeChange = async (change: CodeChange) => {
    try {
      if (change.filePath && change.newCode && currentWorkspace) {
        // 实际写入文件
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
          // 标记为已应用
          setMessages(prev => 
            prev.map(msg => ({
              ...msg,
              codeChanges: msg.codeChanges?.map(c => 
                c === change ? { ...c, applied: true } : c
              )
            }))
          );
          
          // 如果是当前打开的文件，通知编辑器刷新
          await openFile(change.filePath);
          
          console.log('✅ 代码更改已应用到文件:', change.filePath);
        } else {
          throw new Error(`Failed to write file: ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error('Error applying code change:', error);
      alert(`应用代码更改失败: ${error}`);
    }
  };

  const rejectCodeChange = (change: CodeChange) => {
    setMessages(prev => 
      prev.map(msg => ({
        ...msg,
        codeChanges: msg.codeChanges?.filter(c => c !== change)
      }))
    );
  };

  const applyAllCodeChanges = async (changes: CodeChange[]) => {
    for (const change of changes) {
      await applyCodeChange(change);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const prompt = input.trim();
    setInput('');
    
    await generateCode(prompt, selectedFiles);
  };

  const removeSelectedFile = (filePath: string) => {
    setSelectedFiles(prev => prev.filter(f => f !== filePath));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // 处理图片上传逻辑
      console.log('上传图片:', files[0]);
    }
  };

  const renderCodeComparison = (message: AIMessage) => {
    if (!message.codeChanges || message.codeChanges.length === 0) return null;

    // 不在侧边栏显示代码差异，将其移动到编辑器中
    return null;
  };

  const renderToolCalls = (message: AIMessage) => {
    if (!message.tools || message.tools.length === 0) return null;

    return (
      <div style={{ marginTop: '8px' }}>
        {message.tools.map((tool, index) => (
          <ToolCall
            key={index}
            name={tool.name}
            parameters={tool.parameters}
            result={tool.result}
            status={tool.status}
            output={tool.output}
            executionId={tool.executionId}
          />
        ))}
      </div>
    );
  };

  const openFile = async (filePath: string) => {
    console.log('Opening file:', filePath);
  };

  if (!isVisible) return null;

  const selectedModelData = models.find(m => m.id === selectedModel);

  return (
    <>
      {/* 拖拽调整大小的分隔条 */}
      <div
        ref={resizeRef}
        className="ai-agent-resize-handle"
        style={{ right: sidebarWidth }}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* 主侧边栏 */}
      <div className="ai-agent-sidebar" style={{ width: `${sidebarWidth}px` }}>
        
        {/* 标题栏 */}
        <div className="ai-agent-header">
          <div className="ai-agent-title">
            <span className="ai-agent-title-icon">🤖</span>
            Cursor AI
          </div>
          <button className="ai-agent-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 选中的文件 */}
        {selectedFiles.length > 0 && (
          <div className="ai-agent-files-section">
            <label className="ai-agent-label">
              上下文文件 ({selectedFiles.length})
            </label>
            <div className="ai-agent-files-container">
              {selectedFiles.map(file => (
                <div key={file} className="ai-agent-file-item">
                  <span className="ai-agent-file-name">
                    📄 {file.split('/').pop()}
                  </span>
                  <button
                    className="ai-agent-file-remove"
                    onClick={() => removeSelectedFile(file)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 消息列表 */}
        <div className="ai-agent-messages">
          {messages.map((message) => (
            <div key={message.id} className={`ai-agent-message ${message.type}`}>
              <div className="ai-agent-message-header">
                <span className="ai-agent-message-sender">
                  {message.type === 'user' ? 'You' : 'Cursor AI'}
                </span>
                <span className="ai-agent-message-time">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="ai-agent-message-content">
                {message.content}
              </div>
              {renderToolCalls(message)}
              {renderCodeComparison(message)}
            </div>
          ))}
          
          {isLoading && (
            <div className="ai-agent-loading">
              <div className="ai-agent-loading-spinner"></div>
              <span className="ai-agent-loading-text">
                AI 正在生成代码...
              </span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div 
          ref={fileDropRef}
          className="ai-agent-input-area"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 拖拽提示 */}
          {isDragOver && (
            <div className="ai-agent-drag-overlay">
              📁 拖拽文件到此处添加上下文
            </div>
          )}

          <form onSubmit={handleSubmit} className="ai-agent-input-form">
            {/* 输入框 */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="描述你需要的代码功能..."
              className="ai-agent-textarea"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />

            {/* 下方控制栏 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
              {/* 左侧：模型选择 */}
              <div style={{ position: 'relative', minWidth: '120px' }}>
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#3c3c3c',
                    border: '1px solid #464647',
                    borderRadius: '3px',
                    color: '#cccccc',
                    cursor: 'pointer',
                    fontSize: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minWidth: '120px',
                  }}
                >
                  <span>{selectedModelData?.name?.split(' ')[0] || '模型'}</span>
                  <span style={{ transform: showModelDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '8px' }}>
                    ▼
                  </span>
                </button>
                
                {showModelDropdown && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    backgroundColor: '#3c3c3c',
                    border: '1px solid #464647',
                    borderRadius: '4px',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginBottom: '2px',
                    minWidth: '200px',
                  }}>
                    {models.map(model => (
                      <div
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setShowModelDropdown(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          backgroundColor: selectedModel === model.id ? '#007acc' : 'transparent',
                          color: selectedModel === model.id ? '#ffffff' : '#cccccc',
                          fontSize: '11px',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedModel !== model.id) {
                            e.currentTarget.style.backgroundColor = '#464647';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedModel !== model.id) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div style={{ fontWeight: '500' }}>{model.name}</div>
                        <div style={{ opacity: 0.7, fontSize: '10px' }}>{model.provider}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 模式切换 */}
              <div style={{ display: 'flex', backgroundColor: '#3c3c3c', borderRadius: '3px', padding: '1px', gap: '1px' }}>
                {[
                  { key: 'preview', label: '预览', icon: '👁' },
                  { key: 'auto', label: '自动', icon: '⚡' },
                  { key: 'manual', label: '手动', icon: '🖐' }
                ].map(mode => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => {
                      setStrategy(mode.key as any);
                      if (mode.key === 'auto') {
                        setAutoMode(true);
                      } else {
                        setAutoMode(false);
                      }
                    }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '9px',
                      backgroundColor: strategy === mode.key ? '#007acc' : 'transparent',
                      color: strategy === mode.key ? '#ffffff' : '#cccccc',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '7px' }}>{mode.icon}</span>
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* 右侧：发送按钮和图片上传 */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: input.trim() && !isLoading ? '#007acc' : '#464647',
                    color: input.trim() && !isLoading ? '#ffffff' : '#8c8c8c',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '32px',
                    height: '28px',
                  }}
                  title={isLoading ? '生成中...' : '发送'}
                >
                  {isLoading ? '⏳' : '➤'}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#3c3c3c',
                    border: '1px solid #464647',
                    borderRadius: '4px',
                    color: '#cccccc',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '32px',
                    height: '28px',
                  }}
                  title="上传图片"
                >
                  📷
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default AIAgent; 