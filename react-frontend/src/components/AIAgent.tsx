import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './AIAgent.css';
import { useDrag } from '../contexts/DragContext';
import { aiAPI } from '../services/api';
import MdRederer from './MdRender';

/** 选中的文件接口，用于区分文件和文件夹 */
interface SelectedFile {
  path: string;
  type: 'file' | 'folder';
}

/** ai代理组件参数 */
interface AIAgentProps {
  editor: any;
  onClose: () => void;
  isVisible: boolean;
  fileTree?: any;
  currentWorkspace: string;
  onWidthChange?: (width: number) => void;
}

/** ai消息 */
export interface AiMessages {
  id?: string;
  role?: "user" | "assistant";
  content: string;
  tools?: { [key: string]: AiTools };
  reasoningData?: { [key: string]: any };
  timestamp?: any;
  toolsRollbackFuncs?: Array<any>;
}

/** ai工具 */
interface AiTools {
  toolCallId: string;
  toolName: string;
  input?: any;
  output?: any;
}

/** ai模型 */
interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  max_tokens: number;
  temperature: number;
  is_default: boolean;
  is_reasoner?: boolean;
}

/** 对话会话接口 */
interface AIConversation {
  sessionId: string;
  workspaceId: string;
  messages: AiMessages[];
}

const AIAgent: React.FC<AIAgentProps> = ({
  onClose,
  isVisible,
  currentWorkspace,
  onWidthChange
}) => {
  /** 对话消息 */
  const [messages, setMessages] = useState<AiMessages[]>([]);

  /** 输入框值 */
  const [input, setInput] = useState('');

  /** 提交按钮加载状态 */
  const [isLoading, setIsLoading] = useState(false);

  /** 模型列表 */
  const [models, setModels] = useState<AIModel[]>([]);

  /** 当前选中的模型 */
  const [selectedModel, setSelectedModel] = useState<string>('');

  /** 当前选中的文件 */
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  /** 侧边栏宽度 */
  const [sidebarWidth, setSidebarWidth] = useState(400);

  /** 是否正在拖拽调整侧边栏大小 */
  const [isResizing, setIsResizing] = useState(false);

  /** 是否正在拖拽 */
  const [isDragOver, setIsDragOver] = useState(false);

  /** 展示模型下拉选中内容 */
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  /** 对话会话相关状态 */
  const [conversations, setConversations] = useState<AIConversation[]>([]);

  /** 当前会话 */
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  /** 消息元素 */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** 模型弹窗元素 */
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  /** 输入框元素 */
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** 文件放置元素 */
  const fileDropRef = useRef<HTMLDivElement>(null);

  /** 大小调整元素 */
  const resizeRef = useRef<HTMLDivElement>(null);

  /** 文件输入元素 */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 是否正在拖拽 */
  const { isDragging } = useDrag();

  /** ai的ws */
  const aiWSRef = useRef<WebSocket | null>(null);

  /** 回滚参数数组 */
  const [rollbackFunc, setRollbackFunc] = useState<any>([]);

  /**
   * 滚动到底部
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * 当AI助手打开时，确保有选中的会话
   */
  useEffect(() => {
    if (isVisible) {
      loadAvailableModels();
      if (currentWorkspace) {
        loadConversations();
      }
    }
  }, []);

  /**
   * 当会话列表变化后，若未选择当前会话，则默认选择第一个
   */
  useEffect(() => {
    if (!currentSessionId && conversations && conversations.length > 0) {
      setCurrentSessionId(conversations[0].sessionId);
    }
  }, [conversations, currentSessionId]);

  /**
   * 切换会话时，加载该会话的消息到本地 messages 状态
   */
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    const conv = conversations.find(c => c.sessionId === currentSessionId);
    if (!conv) {
      setMessages([]);
      return;
    }
    setMessages(conv.messages);
  }, [currentSessionId, conversations]);

  /**
   * 拖拽调整大小
   */
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

  /**
   * 拖拽处理
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, [isDragging]);

  /**
   * 拖拽处理
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, [isDragging]);

  /**
   * 拖拽处理
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const filePath = e.dataTransfer.getData('text/plain');
    const isDirectory = e.dataTransfer.getData('application/x-directory') === 'true';

    if (filePath && !selectedFiles.some(f => f.path === filePath)) {
      const fileType: 'file' | 'folder' = isDirectory ? 'folder' : 'file';
      setSelectedFiles(prev => [...prev, { path: filePath, type: fileType }]);
    }
  }, [isDragging, selectedFiles]);

  /**
   * 加载可用模型
   */
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

  /**
   * 加载对话列表
   */
  const loadConversations = async () => {
    if (!currentWorkspace) return;
    try {
      const conversationsData = await aiAPI.getConversations(currentWorkspace);
      setConversations(conversationsData || []);
      if (!conversationsData || conversationsData.length === 0) {
        // 没有会话时，自动创建新会话
        createNewConversation();
      } else if (!currentSessionId) {
        // 有会话但没有选中时，选择第一个会话
        setCurrentSessionId(conversationsData[0].sessionId);
      }
    } catch (error) {
      setConversations([]); // 出错时设置为空数组
    }
  };

  /**
   * 创建新对话会话
   */
  const createNewConversation = async () => {
    if (!currentWorkspace) return;
    try {
      const newConversation = await aiAPI.createConversation(currentWorkspace);
      setConversations(prev => [...(prev || []), { ...newConversation, workspaceId: currentWorkspace, messages: [] }]);
      setCurrentSessionId(newConversation.sessionId);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  /**
   * 删除对话会话
   * @param sessionId 对话id
   */
  const deleteConversation = async (sessionId: string) => {
    try {
      await aiAPI.deleteConversation(currentWorkspace, sessionId);
      setConversations(prev => (prev || []).filter(conv => conv.sessionId !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId('');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  /**
   * 切换对话会话
   * @param sessionId 对话id
   */
  const switchConversation = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    loadConversations();
  };

  /**
   * 生成代码
   * @param prompt 提示词
   * @param filePaths 文件路径
   */
  const generateCode = async (prompt: string) => {
    let needInit = true;
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }
    setIsLoading(true);
    const assistantId = (Date.now() + 1).toString();
    const userMessage: AiMessages = {
      id: assistantId,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    try {
      const selectedModelObj = models.find(m => m.id === selectedModel || m.name === selectedModel);
      // 推理模型：使用WebSocket流式传输
      let sessionId = currentSessionId;
      if (!sessionId) {
        const newConv = await aiAPI.createConversation(currentWorkspace);
        setConversations(prev => [...(prev || []), newConv]);
        setCurrentSessionId(newConv.sessionId);
        sessionId = newConv.sessionId;
      }
      // 初始化助手数据
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        tools: {},
        reasoningData: {},
        timestamp: new Date(),
      }]);
      const wsUrl = aiAPI.getAIWebSocketUrl(sessionId);
      const ws = new WebSocket(wsUrl);
      aiWSRef.current = ws;
      // 连接成功
      ws.onopen = () => {
        const request = {
          workspaceId: currentWorkspace,
          modelId: selectedModelObj?.id || selectedModel,
          prompt: prompt,
          files: selectedFiles.filter(f => f.type === 'file').map(f => f.path),
          folders: selectedFiles.filter(f => f.type === 'folder').map(f => f.path)
        };
        ws.send(JSON.stringify(request));
      };
      // 收到消息
      ws.onmessage = (evt) => {
        const { type, data } = JSON.parse(evt.data);
        // 思维链
        if (type === 'reasoning') {
          needInit = true;
          let reasoningData = messages?.[messages.length - 1]?.reasoningData || {};
          !reasoningData[data.id] && (reasoningData[data.id] = { data: "", isFinish: false });
          reasoningData[data.id].data += data.data;
          setMessages(prev => prev.map((message: AiMessages, index: number) => {
            return index === prev.length - 1 ? {
              ...message,
              reasoningData
            } : message
          })
          );
        }
        // 文本内容
        else if (type === 'text') {
          let reasoningData: any = messages?.[messages.length - 1]?.reasoningData || {};
          // todo
          // if (needInit && reasoningData && reasoningData && typeof reasoningData === "object") {
          //   for (let key of reasoningData) {
          //     reasoningData[key].isFinish = true;
          //   }
          //   needInit = false;
          // }
          setMessages(prev => prev.map((message: AiMessages, index: number) => {
            return index === prev.length - 1 ? {
              ...message,
              content: message.content += data,
              reasoningData: reasoningData
            } : message
          })
          );
        }
        // 工具输入
        else if (type === 'tool-input') {
          let tools = messages?.[messages.length - 1]?.tools || {};
          !tools[data.id] && (tools[data.id] = { input: "", output: "", toolCallId: "", toolName: "" });
          tools[data.id].input += data.data;
          setMessages(prev => prev.map((message: AiMessages, index: number) => {
            return index === prev.length - 1 ? {
              ...message,
              tools
            } : message
          })
          );
        }
        // 工具执行完毕
        else if (type === 'tool-finish') {
          let tools = messages?.[messages.length - 1]?.tools || {};
          // 设置工具状态
          data && data.length && data.forEach((item: AiTools) => tools[item.toolCallId] = item)
          setMessages(prev => prev.map((message: AiMessages, index: number) => {
            return index === prev.length - 1 ? {
              ...message,
              tools
            } : message
          }));
          const needRefresh = data.some((tool: AiTools) => {
            [
              "createFile",
              "deleteFile",
              "createDirectory",
              "deleteDirectory",
              "editFileContent"
            ]
              .includes(tool.toolName)
          })
          if (needRefresh) {
            window.dispatchEvent(new CustomEvent('file-system-refresh'));
          }
        }
        // 内容完成
        else if (type === 'end') {
          setRollbackFunc(data.rollbackFuncs);
          ws.close();
        }
      };

      ws.onerror = (e) => {
        setIsLoading(false);
      };

      ws.onclose = () => {
        aiWSRef.current = null;
        setIsLoading(false);
        setTimeout(() => {
          console.log(messages);
        }, 2000)
      };

      return;

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

    try {
      let finalOriginalContent = originalContent || '';
      // 预留：可能用于后续预览
      // const finalContent = content || '';

      // 如果是编辑操作且没有原始内容，需要先读取文件
      if (operation === 'edit' && !originalContent) {
        try {
          const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          if (response.ok) {
            const text = await response.text();
            finalOriginalContent = text || '';
          }
        } catch (error) {
          console.error('Failed to read original file content:', error);
        }
      }
    } catch (error) {
      console.error('Error handling file operation preview:', error);
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
    setSelectedFiles(prev => prev.filter(f => f.path !== filePath));
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
   * 工具接受或是回滚操作
   * @param toolsRollbackFuncs 工具回滚参数
   */
  const funcCall = (toolsRollbackFuncs: any) => {
    setRollbackFunc(toolsRollbackFuncs);
  }

  if (!isVisible) return null;


  const messageRender = useMemo(() => {
    return (
      <>
        {
          messages && messages?.map((message: AiMessages, index: number) =>
            <div key={index}>
              {/* 用户消息 */}
              {
                message.role === "user" && (
                  <div className="ai-agent-message">
                    <div className='head'>
                      <span className='title'>You</span>
                      <span className='time-stamp'>
                        {message?.timestamp?.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="ai-agent-user-message-content">
                      {message?.content}
                    </div>
                  </div>
                )
              }
              {/* ai消息 */}
              {
                message.role === 'assistant' && (
                  <div className="ai-agent-message">
                    <div className='head'>
                      <span className='title'>AI</span>
                      <span className='time-stamp'>
                        {message?.timestamp?.toLocaleTimeString()}
                      </span>
                    </div>
                    <MdRederer
                      key={"asdasd" + index}
                      content={message?.content}
                      tools={message?.tools}
                      reasoningData={message?.reasoningData}
                      workspaceId={currentWorkspace}
                      sessionId={currentSessionId}
                      toolsRollbackFuncs={rollbackFunc}
                      funcCall={funcCall}
                    >
                    </MdRederer>
                  </div>
                )
              }
            </div>
          )
        }
      </>
    )
  }, [messages])

  const selectedModelData = models.find(m => m.id === selectedModel);

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
                  key={conversation.sessionId}
                  className={`ai-agent-conversation-tab ${currentSessionId === conversation.sessionId ? 'active' : ''}`}
                  onClick={() => switchConversation(conversation.sessionId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      switchConversation(conversation.sessionId);
                    } else if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      deleteConversation(conversation.sessionId);
                    }
                  }}
                  tabIndex={0}
                  role="tab"
                  aria-selected={currentSessionId === conversation.sessionId}
                  aria-label={`对话 ${conversation.sessionId.slice(-6)}`}
                >
                  <div className="ai-agent-tab-status"></div>
                  <div className="ai-agent-tab-content">
                    <div className="ai-agent-tab-info">
                      <div className="ai-agent-tab-title">
                        对话 {conversation.sessionId.slice(-6)}
                      </div>
                    </div>
                  </div>
                  <button
                    className="ai-agent-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conversation.sessionId);
                    }}
                    title="删除对话"
                    aria-label={`删除对话 ${conversation.sessionId.slice(-6)}`}
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
          {messageRender}

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
              <div className="ai-agent-files-container">
                {selectedFiles.map(file => (
                  <div key={file.path} className="ai-agent-file-item" title={file.path}>
                    <span className="ai-agent-file-name" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.type === 'folder' ? '📁' : '📄'} {file.path.split('/').pop()}
                    </span>
                    <button
                      className="ai-agent-file-remove"
                      onClick={() => removeSelectedFile(file.path)}
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