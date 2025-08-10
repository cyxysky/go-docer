import React, { useState, useEffect, useRef, useCallback } from 'react';
import ToolCall from './ToolCall';
import './AIAgent.css';
import { useDrag } from '../contexts/DragContext';
import { aiAPI } from '../services/api';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';
// 仅保留WS模式后暂时不需要将后端 file_changes 映射到编辑器

// 新增：选中的文件接口，用于区分文件和文件夹
interface SelectedFile {
  path: string;
  type: 'file' | 'folder';
}

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
  model?: string;
  status?: 'pending' | 'completed' | 'error';
  data?: Array<{
    tools?: ToolCall[];
    thinking?: ThinkingProcess;
    reasoning?: string;
    toolsRunning?: boolean;
  }>

}

interface ThinkingProcess {
  content?: string; // 思维链内容
}

interface ToolCall {
  name: string;
  type?: string; // 新增：支持工具类型
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
  // 新增：支持结束工具
  isSummaryTool?: boolean;
}

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
  reasoning?: string;
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
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  // 预留的自动模式与策略，目前未启用
  const [autoMode] = useState(false);
  // const [processedTools, setProcessedTools] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);

  // 对话会话相关状态
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  // 推理过程展开状态管理 - 默认展开，完成后收起
  const [collapsedReasonings, setCollapsedReasonings] = useState<Set<string>>(new Set());

  const { } = useAICodeChanges();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动收起已完成的推理过程
  // useEffect(() => {
  //   const completedMessages = messages.filter(
  //     msg => msg.type === 'assistant' &&
  //       msg.status === 'completed' &&
  //       msg.reasoning &&
  //       !collapsedReasonings.has(msg.id)
  //   );

  //   if (completedMessages.length > 0) {
  //     const timer = setTimeout(() => {
  //       setCollapsedReasonings(prev => {
  //         const newSet = new Set(prev);
  //         completedMessages.forEach(msg => newSet.add(msg.id));
  //         return newSet;
  //       });
  //     }, 2000); // 2秒后自动收起

  //     return () => clearTimeout(timer);
  //   }
  // }, [messages, collapsedReasonings]);

  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const strategyDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileDropRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDragging } = useDrag();
  const aiWSRef = useRef<WebSocket | null>(null);

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

  // 当会话列表变化后，若未选择当前会话，则默认选择第一个
  useEffect(() => {
    if (!currentSessionId && conversations && conversations.length > 0) {
      setCurrentSessionId(conversations[0].session_id);
    }
  }, [conversations, currentSessionId]);

  // 当AI助手打开时，确保有选中的会话
  useEffect(() => {
    if (isVisible && currentWorkspace) {
      if (!conversations || conversations.length === 0) {
        // 没有会话时，自动创建新会话
        console.log('AI助手打开且无会话，自动创建新会话');
        createNewConversation();
      } else if (!currentSessionId) {
        // 有会话但没有选中时，选择第一个会话
        console.log('AI助手打开，自动选择第一个会话');
        setCurrentSessionId(conversations[0].session_id);
      }
    }
  }, [isVisible, currentWorkspace, conversations, currentSessionId]);

  // 切换会话时，加载该会话的消息到本地 messages 状态
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    const conv = conversations.find(c => c.session_id === currentSessionId);
    if (!conv) {
      setMessages([]);
      return;
    }

    const mapTool = (tool: any): ToolCall => ({
      name: tool.name || tool.type,
      parameters: tool.parameters || {
        path: tool.path,
        content: tool.content,
        command: tool.command,
        code: tool.code,
      },
      result: tool.result,
      status: (tool.status || 'pending') as 'pending' | 'success' | 'error',
      output: tool.output,
      executionId: tool.executionId || tool.execution_id,
      rollback: tool.rollback,
      actionTaken: null,
    });

    const transformed: AIMessage[] = (conv.messages || []).map((m) => ({
      id: m.id,
      type: m.type === 'user' ? 'user' : 'assistant',
      content: m.content,
      timestamp: new Date(m.timestamp as any),
      status: 'completed',
      data: [{
        thinking: m.thinking,
        reasoning: m.reasoning || '',
        tools: (m.tools || []).map(mapTool)
      }]
    }));
    setMessages(transformed);
  }, [currentSessionId, conversations]);

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
    const isDirectory = e.dataTransfer.getData('application/x-directory') === 'true';

    if (filePath && !selectedFiles.some(f => f.path === filePath)) {
      const fileType: 'file' | 'folder' = isDirectory ? 'folder' : 'file';
      setSelectedFiles(prev => [...prev, { path: filePath, type: fileType }]);
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
      const selectedModelObj = models.find(m => m.id === selectedModel || m.name === selectedModel);
      // 推理模型：使用WebSocket流式传输
      let sessionId = currentSessionId;
      if (!sessionId) {
        const newConv = await aiAPI.createConversation(currentWorkspace);
        setConversations(prev => [...(prev || []), newConv]);
        setCurrentSessionId(newConv.session_id);
        sessionId = newConv.session_id;
      }

      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        model: selectedModel,
        status: 'pending',
        data: [{
          thinking: { content: '' },
          reasoning: '',
          tools: [],
          toolsRunning: false,
        }]
      }]);

      const wsUrl = aiAPI.getAIWebSocketUrl(sessionId);
      console.log('Connecting to AI WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      aiWSRef.current = ws;

      // 连接成功
      ws.onopen = () => {
        const request = {
          workspace_id: currentWorkspace,
          model_id: selectedModelObj?.id || selectedModel,
          prompt: prompt,
          files: selectedFiles.map(f => f.path),
          file_paths: selectedFiles.map(f => f.path)
        };
        ws.send(JSON.stringify(request));
      };

      // 收到消息
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // 思维链
          if (msg.type === 'reasoning') {
            setMessages(prev => prev.map(m => {
              if (m.id === assistantId) {
                return {
                  ...m, data: m.data?.map((d, index) =>
                    index === (m.data?.length || 0) - 1 ? { ...d, reasoning: (d.reasoning || '') + msg.data } : d
                  ) || []
                }
              }
              return m;
            }));
          }
          else if (msg.type === 'thinking') {
            // 处理思考过程
            setMessages(prev => prev.map(m => {
              if (m.id === assistantId) {
                return {
                  ...m, data: m.data?.map((d, index) =>
                    index === (m.data?.length || 0) - 1 ? { ...d, thinking: { content: msg.data } } : d
                  ) || []
                }
              }
              return m;
            }));
          }
          else if (msg.type === 'retry') {
            // 处理重试状态，创建新的消息
            setMessages(prev =>
              prev.map(m => {
                if (m.id === assistantId) {
                  return {
                    ...m,
                    data: [
                      ...(m.data || []),
                      {
                        thinking: { content: '' },
                        reasoning: '',
                        tools: [],
                        toolsRunning: false,
                      }
                    ]
                  }
                }
                return m;
              })
            );
          }
          else if (msg.type === 'status') {
            // 工具执行中/结束 的loading状态
            const running = !!(msg.data && msg.data.tools_running);
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? {
                ...(m as any), data: m.data?.map((d, index) =>
                  index === (m.data?.length || 0) - 1 ? { ...d, toolsRunning: running } : d
                ) || []
              } : m
            ));
          }
          else if (msg.type === 'tools') {
            // 修复：根据当前尝试次数，将工具添加到对应的尝试中
            setMessages(prev => prev.map(m => {
              if (m.id === assistantId) {
                const tools = Array.isArray(msg.data) ? msg.data : [];

                // 检查是否有结束工具
                const hasSummaryTool = tools.some((tool: any) =>
                  tool.name === 'conversation_summary' || (tool as any).type === 'conversation_summary'
                );

                if (hasSummaryTool) {
                  // 如果有结束工具，将状态设为completed
                  return {
                    ...m,
                    tools: tools,
                    status: 'completed' as const
                  };
                }

                return { ...m, tools: tools };
              }
              return m;
            }));

            // 根据工具类型判断是否需要刷新文件树
            try {
              const tools = Array.isArray(msg.data) ? msg.data : [];
              const needRefresh = tools.some((t: any) =>
                [
                  'file_create',
                  'file_write',
                  'file_delete',
                  'file_create_folder',
                  'file_delete_folder'
                ].includes(t?.name || t?.type)
              );
              if (needRefresh) {
                window.dispatchEvent(new CustomEvent('file-system-refresh'));
              }
            } catch (_e) { }
          }
          // 错误
          else if (msg.type === 'error') {
            setMessages(prev => [...prev, {
              id: (Date.now() + 2).toString(),
              type: 'system',
              content: `Error: ${msg.message}`,
              timestamp: new Date(),
              status: 'error'
            }]);
            setIsLoading(false);
          }
          // 完成
          else if (msg.type === 'done') {
            console.log('AI WebSocket done');
            // 对话完成后刷新会话列表，保证历史对话可见
            // loadConversations();
            // ws.close();
          }
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('AI WebSocket error:', e);
        setMessages(prev => [...prev, {
          id: (Date.now() + 3).toString(),
          type: 'system',
          content: 'WebSocket连接错误',
          timestamp: new Date(),
          status: 'error'
        }]);
        setIsLoading(false);
      };

      ws.onclose = () => {
        console.log('AI WebSocket closed');
        aiWSRef.current = null;
        setIsLoading(false);
        setTimeout(() => {
          console.log(messages);
        }, 2000)
      };

      return;

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
      // 预留：可能用于后续预览
      // const finalContent = content || '';

      // 如果是编辑操作且没有原始内容，需要先读取文件
      if (operation === 'edit' && !originalContent) {
        try {
          console.log('读取原始文件内容:', filePath);
          const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          if (response.ok) {
            const text = await response.text();
            finalOriginalContent = text || '';
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
      if (msg.id === messageId && msg.data) {
        const updatedData = [...msg.data];
        if (updatedData[toolIndex] && updatedData[toolIndex].tools) {
          const updatedTools = [...updatedData[toolIndex].tools!];
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
          updatedData[toolIndex] = { ...updatedData[toolIndex], tools: updatedTools };
        }
        return { ...msg, data: updatedData };
      }
      return msg;
    }));
  };

  // 回退按钮由自动模式在后端执行，手动模式下不再在这里提供直接回退函数

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
   * 渲染代码差异
   * @param message 消息
   */
  const renderCodeComparison = (_message: AIMessage) => {
    // 现在代码差异通过工具调用显示，不在侧边栏显示
    return null;
  };

  /**
   * 渲染思考过程
   * @param message 消息
   */
  const renderThinkingProcess = (message: AIMessage) => {
    if (!message.data || message.type !== 'assistant') return null;

    // 查找包含 thinking 的 data 项
    const thinkingData = message.data.find(d => d.thinking);
    if (!thinkingData?.thinking?.content) return null;

    const thinking = thinkingData.thinking;
    const isCollapsed = collapsedReasonings.has(`thinking-${message.id}`);
    const toggleCollapsed = () => {
      setCollapsedReasonings(prev => {
        const newSet = new Set(prev);
        if (isCollapsed) {
          newSet.delete(`thinking-${message.id}`);
        } else {
          newSet.add(`thinking-${message.id}`);
        }
        return newSet;
      });
    };

    return (
      <div className="ai-agent-thinking" style={{ marginTop: '8px' }}>
        <div
          className="ai-agent-thinking-header"
          onClick={toggleCollapsed}
          style={{
            cursor: 'pointer',
            padding: '8px 12px',
            backgroundColor: 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          <span className="ai-agent-thinking-title">🧠 思维链</span>
          <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
            {isCollapsed ? '展开' : '收起'}
          </span>
        </div>
        {!isCollapsed && (
          <div className="ai-agent-thinking-content" style={{ marginTop: '4px' }}>
            <div style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
              {thinking.content}
            </div>
          </div>
        )}
      </div>
    );
  };

  /**
   * 将消息分组为对话
   */
  const groupMessagesIntoConversations = (messages: AIMessage[]) => {
    const conversations: Array<{
      userMessage: AIMessage;
      assistantMessage: AIMessage | null;
    }> = [];

    let currentUserMessage: AIMessage | null = null;
    let currentAssistantMessage: AIMessage | null = null;

    for (const message of messages) {
      if (message.type === 'user') {
        // 保存之前的对话
        if (currentUserMessage) {
          conversations.push({
            userMessage: currentUserMessage,
            assistantMessage: currentAssistantMessage
          });
        }
        // 开始新的对话
        currentUserMessage = message;
        currentAssistantMessage = null;
      } else if (message.type === 'assistant' && currentUserMessage) {
        // 直接替换AI消息
        currentAssistantMessage = message;
      }
    }

    // 保存最后一个对话
    if (currentUserMessage) {
      conversations.push({
        userMessage: currentUserMessage,
        assistantMessage: currentAssistantMessage
      });
    }

    return conversations;
  };

  /**
   * 渲染推理过程（实时思维链）
   * @param message 消息
   */
  const renderReasoning = (message: AIMessage) => {
    if (!message.data || message.type !== 'assistant') return null;

    // 查找包含 reasoning 的 data 项
    const reasoningData = message.data.find(d => d.reasoning);
    if (!reasoningData?.reasoning) return null;

    const isCollapsed = collapsedReasonings.has(message.id);
    // const isCompleted = message.status === 'completed';

    const toggleCollapsed = () => {
      setCollapsedReasonings(prev => {
        const newSet = new Set(prev);
        if (isCollapsed) {
          newSet.delete(message.id);
        } else {
          newSet.add(message.id);
        }
        return newSet;
      });
    };

    return (
      <div className="ai-agent-reasoning" style={{ marginTop: '8px' }}>
        <div
          className="ai-agent-reasoning-header"
          onClick={toggleCollapsed}
          style={{
            cursor: 'pointer',
            padding: '8px 12px',
            backgroundColor: 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          <span className="ai-agent-reasoning-title">🤔 推理过程</span>
          <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
            {isCollapsed ? '展开' : '收起'}
          </span>
        </div>
        {!isCollapsed && (
          <div className="ai-agent-reasoning-content" style={{ marginTop: '4px' }}>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
              margin: 0,
              padding: '8px',
              backgroundColor: 'rgba(0,0,0,0.03)',
              borderRadius: '4px',
              fontSize: '13px',
              lineHeight: '1.4',
              border: '1px solid rgba(0,0,0,0.05)'
            }}>
              {reasoningData.reasoning}
            </pre>
          </div>
        )}
      </div>
    );
  };

  /**
   * 渲染工具调用
   * @param message 消息
   */
  const renderToolCalls = (message: AIMessage) => {
    if (!message.data || message.data.length === 0) return null;

    // 查找包含工具的 data 项
    const toolsData = message.data.find(d => d.tools && d.tools.length > 0);
    if (!toolsData?.tools) return null;

    return (
      <div style={{ marginTop: '8px' }} className="tool-call-enter">
        {toolsData.tools.map((tool, index) => {
          // 检查是否是结束工具
          const isSummaryTool = tool.name === 'conversation_summary' ||
            tool.type === 'conversation_summary' ||
            tool.isSummaryTool;

          return (
            <ToolCall
              key={`${message.id}-${index}`}
              name={tool.name}
              parameters={tool.parameters}
              result={tool.result}
              status={tool.status}
              output={tool.output}
              executionId={tool.executionId}
              onFileOperation={handleFileOperation}
              onActionTaken={(action) => handleToolActionTaken(message.id, index, action)}
              actionTaken={tool.actionTaken}
              isSummaryTool={isSummaryTool}
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
          {groupMessagesIntoConversations(messages).map((conversation) => (
            <div key={conversation.userMessage.id} className="ai-agent-conversation-card" style={{
              margin: '16px 0',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '8px',
              backgroundColor: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {/* 用户消息 */}
              <div className="ai-agent-user-message" style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                backgroundColor: 'rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '500', color: '#333' }}>You</span>
                  <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
                    {conversation.userMessage.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: '#333', lineHeight: '1.5' }}>
                  {conversation.userMessage.content}
                </div>
              </div>

              {/* AI回复 */}
              <div className="ai-agent-assistant-replies" style={{ padding: '16px' }}>
                {conversation.assistantMessage ? (
                  <div className="ai-agent-assistant-message" style={{
                    padding: '12px',
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', color: '#333' }}>AI</span>
                      <span style={{ fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
                        {conversation.assistantMessage.timestamp.toLocaleTimeString()}
                      </span>
                    </div>

                    {/* AI内容 */}
                    {conversation.assistantMessage.content && (
                      <div style={{ color: '#333', lineHeight: '1.5', marginBottom: '12px' }}>
                        {conversation.assistantMessage.content}
                      </div>
                    )}

                    {/* 推理过程 */}
                    {renderReasoning(conversation.assistantMessage)}

                    {/* 思考过程 */}
                    {renderThinkingProcess(conversation.assistantMessage)}

                    {/* 工具调用 */}
                    {renderToolCalls(conversation.assistantMessage)}

                    {/* 代码对比 */}
                    {renderCodeComparison(conversation.assistantMessage)}
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.05)',
                    color: 'rgba(0,0,0,0.6)',
                    fontStyle: 'italic'
                  }}>
                    AI 正在思考中...
                  </div>
                )}
              </div>
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
              {/* <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="ai-agent-label">
                  上下文文件 ({selectedFiles.length})
                </label>
                <button
                  className="ai-agent-file-remove"
                  onClick={() => setSelectedFiles([])}
                  title="清空全部"
                  aria-label="清空上下文文件"
                >
                  清空
                </button>
              </div> */}
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