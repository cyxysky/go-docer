import React, { useState, useEffect, useRef, useCallback } from 'react';
import ToolCall from './ToolCall';
import './AIAgent.css';
import { useDrag } from '../contexts/DragContext';
import { aiAPI } from '../services/api';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';



// 移除CodeChange接口，现在使用tools中的工具调用

interface AIAgentProps {
  editor: any;
  onClose: () => void;
  isVisible: boolean;
  fileTree?: any;
  currentWorkspace?: string;
  onWidthChange?: (width: number) => void;
}

interface AIMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tools?: ToolCall[];
  model?: string;
  status?: 'pending' | 'completed' | 'error';
  thinking?: ThinkingProcess;
}

interface ThinkingProcess {
  analysis?: string;
  planning?: string;
  considerations?: string;
  decisions?: string;
  missing_info?: string;
  next_steps?: string;
}

interface ToolCall {
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
  output?: string;
  executionId?: string;
  actionTaken?: 'accept' | 'reject' | null;
  rollback?: {
    type: string;
    path: string;
    content: string;
    command: string;
    description: string;
    is_visible: boolean;
  };
  isRolledBack?: boolean;
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

interface AICodeGenerationResponse {
  success: boolean;
  code?: string;
  message?: string;
  tools?: Array<{
    name: string;
    parameters: any;
    result?: any;
    status: string;
  }>;
  thinking?: ThinkingProcess;
  fileChanges?: CodeChange[];
  status?: string; // "finish", "retry"
  session_id?: string; // 新增：对话会话ID
}

interface CodeChange {
  file_path: string;
  original_code: string;
  new_code: string;
}



// 对话会话接口
interface AIConversation {
  session_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  messages: AIConversationMessage[];
  tool_history: any;
}

// 对话消息接口
interface AIConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: ToolCall[];
  thinking?: ThinkingProcess;
}



const AIAgent: React.FC<AIAgentProps> = ({
  onClose,
  isVisible,
  currentWorkspace,
  onWidthChange
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [strategy, setStrategy] = useState<'auto' | 'manual'>('auto');
  // const [processedTools, setProcessedTools] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);

  // 对话会话相关状态
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  const { addPendingChanges } = useAICodeChanges();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const strategyDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileDropRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDragging } = useDrag();

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
      if (currentWorkspace) {
        loadConversations();
      }
    }
  }, [isVisible, currentWorkspace]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
      if (strategyDropdownRef.current && !strategyDropdownRef.current.contains(event.target as Node)) {
        setShowStrategyDropdown(false);
      }
    };

    if (showModelDropdown || showStrategyDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModelDropdown, showStrategyDropdown]);

  // 拖拽调整大小
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const container = document.querySelector('.split-editor');
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const newWidth = containerRect.right - e.clientX;
          if (newWidth > 300 && newWidth < 600) {
            setSidebarWidth(newWidth);
            // 通知父组件宽度变化
            onWidthChange?.(newWidth);
          }
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
  }, [isResizing, onWidthChange]);

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, [isDragging]);

  // 拖拽处理
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    console.log('handleDragLeave');
    setIsDragOver(false);
  }, [isDragging]);

  // 拖拽处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath && !selectedFiles.includes(filePath)) {
      setSelectedFiles(prev => [...prev, filePath]);
    }
  }, [isDragging, selectedFiles]);

  // 加载可用模型
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

  // 加载对话会话列表
  const loadConversations = async () => {
    if (!currentWorkspace) return;

    try {
      const conversationsData = await aiAPI.getConversations(currentWorkspace);
      setConversations(conversationsData || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setConversations([]); // 出错时设置为空数组
    }
  };

  // 创建新对话会话
  const createNewConversation = async () => {
    if (!currentWorkspace) return;

    try {
      const newConversation = await aiAPI.createConversation(currentWorkspace);
      setConversations(prev => [...(prev || []), newConversation]);
      setCurrentSessionId(newConversation.session_id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  // 删除对话会话
  const deleteConversation = async (sessionId: string) => {
    try {
      await aiAPI.deleteConversation(sessionId);
      setConversations(prev => (prev || []).filter(conv => conv.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId('');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  // 切换对话会话
  const switchConversation = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  /**
   * 生成代码
   * @param prompt 提示词
   * @param filePaths 文件路径
   */
  const generateCode = async (prompt: string) => {
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
      // 构建增强的提示词
      let enhancedPrompt = prompt;
      // 如果有选中的文件，在提示词中突出显示
      if (selectedFiles.length > 0) {
        enhancedPrompt = `用户重点关注以下文件，请优先考虑这些文件的修改：

${selectedFiles.map(file => `📁 ${file}`).join('\n')}

用户需求：${prompt}

请特别注意：
1. 优先修改上述文件中的代码
2. 如果需要在其他文件中进行修改，请确保与上述文件的修改保持一致
3. 在修改前请仔细分析这些文件的内容和结构`;
      }

      // 使用aiAPI调用后端
      let data: AICodeGenerationResponse;
      try {
        data = await aiAPI.generateCode({
          prompt: enhancedPrompt,
          context: '', // 提供默认值
          workspace: currentWorkspace,
          language: 'javascript', // 提供默认值
          session_id: currentSessionId,
        });
      } catch (error) {
        console.error('AI代码生成失败:', error);
        throw error;
      }

      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      // 更新会话ID（如果返回了新的会话ID）
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
      }

      // 构建消息内容 - 只显示简要信息，详细内容通过工具调用展示
      let messageContent = '';

      const assistantMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        tools: (data.tools || []).map(tool => ({
          ...tool,
          actionTaken: null,
          status: tool.status as 'pending' | 'success' | 'error'
        })),
        model: selectedModel,
        status: data.status === 'finish' ? 'completed' : data.status === 'retry' ? 'pending' : 'error',
        thinking: data.thinking
      };

      setMessages(prev => [...prev, assistantMessage]);

      // 处理文件变更，在编辑器中打开差异视图
      if (data.fileChanges && data.fileChanges.length > 0) {
        // 遍历所有文件变更
        data.fileChanges.forEach(async (fileChange) => {
          try {
            // 触发文件打开事件，确保文件在编辑器中打开
            addPendingChanges([{
              filePath: fileChange.file_path,
              newCode: fileChange.new_code,
              originalCode: fileChange.original_code
            }]);
            window.dispatchEvent(new CustomEvent('file-click', {
              detail: { filePath: fileChange.file_path }
            }));
          } catch (error) {
            console.error('处理文件变更失败:', error);
          }
        });
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

  /**
   * 处理文件操作预览（显示差异）
   * @param operation 操作类型
   * @param filePath 文件路径
   * @param content 文件内容
   * @param originalContent 原始内容
   */
  const handleFileOperation = async (operation: 'create' | 'edit' | 'delete', filePath: string, content?: string, originalContent?: string) => {
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }

    console.log('AIAgent处理文件操作:', { operation, filePath, contentLength: content?.length, originalContentLength: originalContent?.length });

    try {
      let finalOriginalContent = originalContent || '';
      let finalContent = content || '';

      // 如果是编辑操作且没有原始内容，需要先读取文件
      if (operation === 'edit' && !originalContent) {
        try {
          console.log('读取原始文件内容:', filePath);
          const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/read?path=${encodeURIComponent(filePath)}`);
          if (response.ok) {
            const fileData = await response.json();
            finalOriginalContent = fileData.content || '';
            console.log('读取到原始内容长度:', finalOriginalContent.length);
          }
        } catch (error) {
          console.error('Failed to read original file content:', error);
        }
      }
    } catch (error) {
      console.error('Error handling file operation preview:', error);
      alert(`文件操作预览失败: ${error}`);
    }
  };

  /**
   * 执行实际的文件操作（在用户确认后调用）
   * @param operation 操作类型
   * @param filePath 文件路径
   * @param content 文件内容
   */
  const executeFileOperation = async (operation: 'create' | 'edit' | 'delete', filePath: string, content?: string) => {
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }

    try {
      switch (operation) {
        case 'create':
          if (content) {
            const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/write`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                path: filePath,
                content: content,
              }),
            });

            if (response.ok) {
              console.log('✅ 文件已创建:', filePath);
              // 通知文件系统刷新
              window.dispatchEvent(new CustomEvent('file-system-refresh'));
            } else {
              throw new Error(`Failed to create file: ${response.statusText}`);
            }
          }
          break;

        case 'edit':
          if (content) {
            const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/write`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                path: filePath,
                content: content,
              }),
            });

            if (response.ok) {
              console.log('✅ 文件已更新:', filePath);
              // 通知文件系统刷新
              window.dispatchEvent(new CustomEvent('file-system-refresh'));
            } else {
              throw new Error(`Failed to update file: ${response.statusText}`);
            }
          }
          break;

        case 'delete':
          const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/delete`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: filePath,
            }),
          });

          if (response.ok) {
            console.log('✅ 文件已删除:', filePath);
            // 通知文件系统刷新
            window.dispatchEvent(new CustomEvent('file-system-refresh'));
          } else {
            throw new Error(`Failed to delete file: ${response.statusText}`);
          }
          break;
      }
    } catch (error) {
      console.error('Error executing file operation:', error);
      alert(`文件操作执行失败: ${error}`);
    }
  };

  /**
   * 处理工具操作完成
   * @param messageId 消息ID
   * @param toolIndex 工具索引
   * @param action 操作类型
   */
  const handleToolActionTaken = (messageId: string, toolIndex: number, action: 'accept' | 'reject') => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.tools) {
        const updatedTools = [...msg.tools];
        if (updatedTools[toolIndex]) {
          // 如果是自动模式且是拒绝操作，标记为已回退
          if (autoMode && action === 'reject') {
            updatedTools[toolIndex] = {
              ...updatedTools[toolIndex],
              actionTaken: action,
              isRolledBack: true
            };
          } else {
            updatedTools[toolIndex] = { ...updatedTools[toolIndex], actionTaken: action };
          }
        }
        return { ...msg, tools: updatedTools };
      }
      return msg;
    }));
  };

  /**
   * 处理回退操作
   * @param executionId 执行ID
   */
  const handleRollback = async (executionId: string) => {
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }

    try {
      const response = await fetch('/api/v1/ai/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspace_id: currentWorkspace,
          execution_id: executionId
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('回退成功:', result.message);

        // 更新消息中的工具调用状态
        setMessages(prev => prev.map(msg => ({
          ...msg,
          tools: msg.tools?.map(tool =>
            tool.executionId === executionId
              ? { ...tool, isRolledBack: true, actionTaken: 'reject' }
              : tool
          )
        })));

        // 显示成功消息
        alert(`回退成功: ${result.message}`);

        // 刷新文件系统
        window.dispatchEvent(new CustomEvent('file-system-refresh'));
      } else {
        console.error('回退失败:', result.error);
        alert(`回退失败: ${result.error}`);
      }
    } catch (error) {
      console.error('回退操作请求失败:', error);
      alert(`回退操作失败: ${error}`);
    }
  };

  /**
   * 处理提交
   * @param e 事件
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const prompt = input.trim();
    setInput('');

    await generateCode(prompt);
  };

  /**
   * 移除选中的文件
   * @param filePath 文件路径
   */
  const removeSelectedFile = (filePath: string) => {
    setSelectedFiles(prev => prev.filter(f => f !== filePath));
  };

  /**
   * 处理图片上传
   * @param e 事件
   */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // 处理图片上传逻辑
      console.log('上传图片:', files[0]);
    }
  };

  /**
   * 渲染代码差异
   * @param message 消息
   */
  const renderCodeComparison = (message: AIMessage) => {
    // 现在代码差异通过工具调用显示，不在侧边栏显示
    return null;
  };

  /**
   * 渲染思考过程
   * @param message 消息
   */
  const renderThinkingProcess = (message: AIMessage) => {
    if (!message.thinking || message.type !== 'assistant') return null;

    const thinking = message.thinking;
    const hasContent = thinking.analysis || thinking.planning || thinking.considerations ||
      thinking.decisions || thinking.missing_info || thinking.next_steps;

    if (!hasContent) return null;

    return (
      <div>
        <p className='ai-agent-thinking-title'>{thinking.analysis}</p>
        <p className='ai-agent-thinking-title'>{thinking.planning}</p>
        <p className='ai-agent-thinking-title'>{thinking.considerations}</p>
        <p className='ai-agent-thinking-title'>{thinking.decisions}</p>
        <p className='ai-agent-thinking-title'>{thinking.missing_info}</p>
        <p className='ai-agent-thinking-title'>{thinking.next_steps}</p>
      </div>
    );
  };

  /**
   * 渲染工具调用
   * @param message 消息
   */
  const renderToolCalls = (message: AIMessage) => {
    if (!message.tools || message.tools.length === 0) return null;

    // 修改：显示所有工具调用，不过滤已处理的
    const visibleTools = message.tools;

    if (visibleTools.length === 0) return null;

    return (
      <div style={{ marginTop: '8px' }} className="tool-call-enter">
        {visibleTools.map((tool, index) => {
          return (
            <ToolCall
              key={`${message.id}-${index}`}
              name={tool.name}
              parameters={tool.parameters}
              result={tool.result}
              status={tool.status}
              output={tool.output}
              executionId={tool.executionId}
              rollback={tool.rollback}
              onFileOperation={handleFileOperation}
              onActionTaken={(action) => handleToolActionTaken(message.id, index, action)}
              onRollback={handleRollback}
              actionTaken={tool.actionTaken}
              isRolledBack={tool.isRolledBack}
              currentWorkspace={currentWorkspace}
              isAutoMode={autoMode}
            />
          );
        })}
      </div>
    );
  };

  // 监听文件操作执行事件
  useEffect(() => {
    const handleExecuteFileOperation = (event: CustomEvent) => {
      const { operation, filePath, content } = event.detail;
      console.log('Executing file operation:', { operation, filePath, content });
      executeFileOperation(operation, filePath, content);
    };

    window.addEventListener('execute-file-operation', handleExecuteFileOperation as EventListener);
    return () => {
      window.removeEventListener('execute-file-operation', handleExecuteFileOperation as EventListener);
    };
  }, [executeFileOperation]);



  if (!isVisible) {
    return null;
  }

  const selectedModelData = models.find(m => m.id === selectedModel);

  // 获取策略显示名称
  const getStrategyDisplayName = (strategyKey: string) => {
    const strategyMap = {
      'auto': '自动',
      'manual': '手动'
    };
    return strategyMap[strategyKey as keyof typeof strategyMap] || strategyKey;
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* 拖拽调整大小的分隔条 */}
      <div
        ref={resizeRef}
        className="ai-agent-resize-handle"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* 主侧边栏 */}
      <div className="ai-agent-sidebar" style={{ width: `${sidebarWidth}px`, height: '100%' }}>

        {/* 顶部导航栏 */}
        <div className="ai-agent-top-nav">

          {/* 对话会话列表 */}
          <div className="ai-agent-conversations-panel">
            <div 
              className="ai-agent-conversations-tabs"
              role="tablist"
              aria-label="AI对话列表"
            >
              {conversations.map(conversation => (
                <div
                  key={conversation.session_id}
                  className={`ai-agent-conversation-tab ${currentSessionId === conversation.session_id ? 'active' : ''}`}
                  onClick={() => switchConversation(conversation.session_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      switchConversation(conversation.session_id);
                    } else if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      deleteConversation(conversation.session_id);
                    }
                  }}
                  data-tooltip={`对话 ${conversation.session_id.slice(-6)} - ${new Date(conversation.updated_at).toLocaleString()}`}
                  tabIndex={0}
                  role="tab"
                  aria-selected={currentSessionId === conversation.session_id}
                  aria-label={`对话 ${conversation.session_id.slice(-6)}`}
                >
                  <div className="ai-agent-tab-status"></div>
                  <div className="ai-agent-tab-content">
                    <div className="ai-agent-tab-info">
                      <div className="ai-agent-tab-title">
                        对话 {conversation.session_id.slice(-6)}
                      </div>
                      {/* <div className="ai-agent-tab-meta">
                        <span className="ai-agent-tab-time">
                          {new Date(conversation.updated_at).toLocaleDateString()}
                        </span>
                      </div> */}
                    </div>
                  </div>
                  <button
                    className="ai-agent-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conversation.session_id);
                    }}
                    title="删除对话"
                    aria-label={`删除对话 ${conversation.session_id.slice(-6)}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}

            </div>
          </div>

          {/* 右侧操作按钮 */}
          <div className="ai-agent-nav-actions">
            <button
              className="ai-agent-nav-btn"
              onClick={createNewConversation}
              title="新建对话"
            >
              <span className="ai-agent-nav-icon">+</span>
            </button>
            <button
              className="ai-agent-nav-btn"
              onClick={loadConversations}
              title="刷新会话"
            >
              <span className="ai-agent-nav-icon">↻</span>
            </button>
            <button
              className="ai-agent-nav-btn ai-agent-close-btn"
              onClick={onClose}
              title="关闭"
            >
              <span className="ai-agent-nav-icon">✕</span>
            </button>
          </div>
        </div>



        {/* 消息列表 */}
        <div className="ai-agent-messages">
          {messages.map((message) => (
            <div key={message.id} className={`ai-agent-message ${message.type}`}>
              <div className="ai-agent-message-header">
                <span className="ai-agent-message-sender">
                  {message.type === 'user' ? 'You' : 'AI'}
                </span>
                <span className="ai-agent-message-time">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="ai-agent-message-content">
                {message.content}
              </div>
              {renderThinkingProcess(message)}
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
        >
          {/* 拖拽提示 */}
          <div
            style={{ opacity: isDragOver ? 1 : 0, pointerEvents: isDragOver ? 'auto' : 'none' }}
            className="ai-agent-drag-overlay"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            📁 拖拽文件到此处添加上下文
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
            <div className="ai-agent-controls">
              {/* 左侧：模型选择 */}
              <div className="ai-agent-model-selector" ref={modelDropdownRef}>
                <button
                  type="button"
                  className="ai-agent-model-button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                >
                  <span>{selectedModelData?.name?.split(' ')[0] || '模型'}</span>
                </button>

                {showModelDropdown && (
                  <div className="ai-agent-model-dropdown">
                    {models.map(model => (
                      <div
                        key={model.id}
                        className={`ai-agent-model-option ${selectedModel === model.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setShowModelDropdown(false);
                        }}
                      >
                        <div className="ai-agent-model-name">{model.name}</div>
                        <div className="ai-agent-model-provider">{model.provider}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 策略选择 */}
              {/* <div className="ai-agent-strategy-selector" ref={strategyDropdownRef}>
                <button
                  type="button"
                  className="ai-agent-strategy-button"
                  onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {getStrategyDisplayName(strategy)}
                  </span>
                </button>

                {showStrategyDropdown && (
                  <div className="ai-agent-strategy-dropdown">
                    {[
                      { key: 'auto', label: '自动' },
                      // { key: 'manual', label: '手动' }
                    ].map(mode => (
                      <div
                        key={mode.key}
                        className={`ai-agent-strategy-option ${strategy === mode.key ? 'selected' : ''}`}
                        onClick={() => {
                          setStrategy(mode.key as any);
                          if (mode.key === 'auto') {
                            setAutoMode(true);
                          } else {
                            setAutoMode(false);
                          }
                          setShowStrategyDropdown(false);
                        }}
                      >
                        {mode.label}
                      </div>
                    ))}
                  </div>
                )}
              </div> */}

              {/* 右侧：发送按钮和图片上传 */}
              <div className="ai-agent-action-buttons">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`ai-agent-action-button ai-agent-send-button ${(!input.trim() || isLoading) ? 'disabled' : ''}`}
                  title={isLoading ? '生成中...' : '发送'}
                >
                  {isLoading ? '⏳' : '➤'}
                </button>

                <button
                  type="button"
                  className="ai-agent-action-button"
                  onClick={() => fileInputRef.current?.click()}
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
    </div>
  );
};

export default AIAgent; 