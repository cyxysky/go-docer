import React, { useState, useEffect, useRef, useCallback } from 'react';
import ToolCall from './ToolCall';
import './AIAgent.css';
import { useDrag } from '../contexts/DragContext';
import { useAICodeChanges } from '../contexts/AICodeChangesContext';

// 从AICodeChangesContext导入CodeChange类型
interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
  changeType: 'insert' | 'replace' | 'delete' | 'modify';
  confidence: number;
  applied?: boolean;
}

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
  codeChanges?: CodeChange[];
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
  code_changes?: CodeChange[];
  tools?: ToolCall[];
  thinking?: ThinkingProcess;
  status?: string; // "finish", "retry"
}

interface AICodeGenerationRequest {
  prompt: string;
  context?: string;
  workspace: string;
  language?: string;
  model?: string;
  strategy?: string;
  file_paths?: string[];
  auto_apply?: boolean;
  max_file_size?: number;
  tool_history?: ToolExecutionRecord[];
}

interface ToolExecutionRecord {
  tool: string;
  path: string;
  content?: string;
  reason?: string;
  status: string;
  error?: string;
  result?: any;
  timestamp: string;
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
  const [strategy, setStrategy] = useState<'preview' | 'auto' | 'manual'>('preview');
  const [processedTools, setProcessedTools] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);

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
    }
  }, [isVisible]);

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

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    console.log('handleDragLeave');
    setIsDragOver(false);
  }, [isDragging]);

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
   * 生成代码
   * @param prompt 提示词
   * @param filePaths 文件路径
   */
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

    // 初始化工具历史记录和重试计数
    let toolHistory: ToolExecutionRecord[] = [];
    let retryCount = 0;
    const maxRetries = 20;

    // 收集现有的工具调用历史记录
    messages.forEach(msg => {
      if (msg.tools) {
        msg.tools.forEach(tool => {
          toolHistory.push({
            tool: tool.name,
            path: tool.parameters?.path || '',
            status: tool.status,
            error: tool.status === 'error' ? tool.output : undefined,
            result: tool.result,
            timestamp: new Date().toISOString()
          });
        });
      }
    });

    try {
      while (retryCount < maxRetries) {
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

        const requestBody: AICodeGenerationRequest = {
          prompt: enhancedPrompt,
          workspace: currentWorkspace,
          model: selectedModel,
          strategy: strategy,
          file_paths: filePaths,
          auto_apply: autoMode,
          max_file_size: 1024 * 1024,
          tool_history: toolHistory
        };

        const response = await fetch('/api/v1/ai/generate-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          // 设置超时时间为120秒
          signal: AbortSignal.timeout(120000),
        });

        let data: AICodeGenerationResponse = await response.json();
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }

        // 构建消息内容 - 只显示简要信息，详细内容通过工具调用展示
        let messageContent = '';
        
        // 如果有工具调用，显示简要摘要
        if (data.tools && data.tools.length > 0) {
          const fileOperations = data.tools.filter(tool => 
            ['file_write', 'file_create', 'file_delete'].includes(tool.name)
          );
          const otherOperations = data.tools.filter(tool => 
            !['file_write', 'file_create', 'file_delete'].includes(tool.name)
          );
          
          if (fileOperations.length > 0) {
            messageContent += `📁 文件操作: ${fileOperations.length} 个\n`;
          }
          if (otherOperations.length > 0) {
            messageContent += `⚡ 其他操作: ${otherOperations.length} 个\n`;
          }
        }

        // 添加状态信息
        if (data.status) {
          if (data.status === 'retry') {
            messageContent += `🔄 正在获取更多信息... (${retryCount + 1}/${maxRetries})`;
          } else if (data.status === 'finish') {
            messageContent += `✅ 任务完成`;
          }
        }

        const assistantMessage: AIMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: messageContent,
          timestamp: new Date(),
          codeChanges: data.code_changes || [],
          tools: (data.tools || []).map(tool => ({ ...tool, actionTaken: null })),
          model: selectedModel,
          status: data.status === 'finish' ? 'completed' : data.status === 'retry' ? 'pending' : 'error',
          thinking: data.thinking
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        // 将代码修改添加到全局状态
        if (data.code_changes && data.code_changes.length > 0) {
          addPendingChanges(data.code_changes);
          
          // 为每个代码修改触发文件操作预览
          data.code_changes.forEach(change => {
            const operation = change.changeType === 'insert' ? 'create' : 
                            change.changeType === 'delete' ? 'delete' : 'edit';
            
            // 触发文件操作预览事件
            window.dispatchEvent(new CustomEvent('file-operation', {
              detail: {
                operation,
                filePath: change.filePath,
                content: change.newCode,
                originalContent: change.originalCode
              }
            }));

            // 确保文件在tab中打开
            window.dispatchEvent(new CustomEvent('open-file-in-tab', {
              detail: { filePath: change.filePath }
            }));
          });
          
          // 发送代码差异到编辑器（保持向后兼容）
          const event = new CustomEvent('ai-code-changes', {
            detail: { codeChanges: data.code_changes }
          });
          window.dispatchEvent(event);
        }

        // 处理工具调用结果，添加到历史记录
        if (data.tools && data.tools.length > 0) {
          console.log('AI工具调用:', data.tools);
          
          const newToolRecords: ToolExecutionRecord[] = data.tools.map(tool => ({
            tool: tool.name,
            path: tool.parameters?.path || '',
            content: tool.parameters?.content || '',
            reason: tool.parameters?.summary || '执行工具',
            status: tool.status,
            error: tool.status === 'error' ? tool.output : undefined,
            result: tool.result,
            timestamp: new Date().toISOString(),
          }));
          
          toolHistory = [...toolHistory, ...newToolRecords];
        }

        // 处理思考过程
        if (data.thinking) {
          console.log('AI思考过程:', data.thinking);
        }

        // 检查状态
        if (data.status === 'finish') {
          console.log('AI任务完成');
          
          // 自动应用代码更改（如果启用）
          if (autoMode && data.code_changes && data.code_changes.length > 0) {
            await applyAllCodeChanges(data.code_changes);
          }
          
          break;
        } else if (data.status === 'retry') {
          console.log(`AI需要更多信息，重试次数: ${retryCount + 1}`);
          retryCount++;
          
          // 如果达到最大重试次数，显示错误
          if (retryCount >= maxRetries) {
            const errorMessage: AIMessage = {
              id: (Date.now() + 1).toString(),
              type: 'system',
              content: `错误: 达到最大重试次数 (${maxRetries})，任务未完成`,
              timestamp: new Date(),
              status: 'error'
            };
            setMessages(prev => [...prev, errorMessage]);
            break;
          }
          
          continue;
        } else {
          // 默认状态，假设完成
          
          // 自动应用代码更改（如果启用）
          if (autoMode && data.code_changes && data.code_changes.length > 0) {
            await applyAllCodeChanges(data.code_changes);
          }
          
          break;
        }
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

      // 确保文件在tab中打开
      console.log('触发文件打开事件:', filePath);
      window.dispatchEvent(new CustomEvent('open-file-in-tab', {
        detail: { filePath }
      }));

      // 延迟一点时间确保文件已打开，然后触发编辑器预览事件，显示差异
      setTimeout(() => {
        console.log('触发文件操作预览事件:', { operation, filePath });
        window.dispatchEvent(new CustomEvent('file-operation', {
          detail: {
            operation,
            filePath,
            content: finalContent,
            originalContent: finalOriginalContent || ''
          }
        }));
      }, 300); // 给文件打开更多时间

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
          updatedTools[toolIndex] = { ...updatedTools[toolIndex], actionTaken: action };
        }
        return { ...msg, tools: updatedTools };
      }
      return msg;
    }));

    // 记录已处理的工具
    const toolKey = `${messageId}-${toolIndex}`;
    setProcessedTools(prev => new Set([...prev, toolKey]));
  };

  /**
   * 应用代码更改
   * @param change 代码更改
   */
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

  /**
   * 应用所有代码更改
   * @param changes 代码更改列表
   */
  const applyAllCodeChanges = async (changes: CodeChange[]) => {
    for (const change of changes) {
      await applyCodeChange(change);
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

    await generateCode(prompt, selectedFiles);
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
    if (!message.codeChanges || message.codeChanges.length === 0) return null;

    // 不在侧边栏显示代码差异，将其移动到编辑器中
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
      <div className="ai-agent-thinking-container thinking-fade-in">
        <div className="ai-agent-thinking-header">
          <span className="ai-agent-thinking-icon">🧠</span>
          <span className="ai-agent-thinking-title">AI 思考过程</span>
        </div>
        <div className="ai-agent-thinking-content">
          {thinking.analysis && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">分析</div>
              <div className="ai-agent-thinking-text">{thinking.analysis}</div>
            </div>
          )}
          {thinking.planning && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">规划</div>
              <div className="ai-agent-thinking-text">{thinking.planning}</div>
            </div>
          )}
          {thinking.considerations && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">考虑因素</div>
              <div className="ai-agent-thinking-text">{thinking.considerations}</div>
            </div>
          )}
          {thinking.decisions && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">决策</div>
              <div className="ai-agent-thinking-text">{thinking.decisions}</div>
            </div>
          )}
          {thinking.missing_info && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">缺失信息</div>
              <div className="ai-agent-thinking-text">{thinking.missing_info}</div>
            </div>
          )}
          {thinking.next_steps && (
            <div className="ai-agent-thinking-section">
              <div className="ai-agent-thinking-label">下一步</div>
              <div className="ai-agent-thinking-text">{thinking.next_steps}</div>
            </div>
          )}
        </div>
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
              onFileOperation={handleFileOperation}
              onActionTaken={(action) => handleToolActionTaken(message.id, index, action)}
              actionTaken={tool.actionTaken}
            />
          );
        })}
        {/* 显示工具执行结果摘要 */}
        <div className="ai-agent-tools-summary">
          <div className="ai-agent-tools-summary-header">
            <span className="ai-agent-tools-summary-icon">⚡</span>
            <span className="ai-agent-tools-summary-title">执行摘要</span>
          </div>
          <div className="ai-agent-tools-summary-stats">
            <span className="ai-agent-tools-summary-total">
              共 {message.tools.length} 个操作
            </span>
            {message.tools.filter(t => t.status === 'success').length > 0 && (
              <span className="ai-agent-tools-summary-success">
                ✓ {message.tools.filter(t => t.status === 'success').length} 成功
              </span>
            )}
            {message.tools.filter(t => t.status === 'error').length > 0 && (
              <span className="ai-agent-tools-summary-error">
                ✗ {message.tools.filter(t => t.status === 'error').length} 失败
              </span>
            )}
            {message.tools.filter(t => t.actionTaken).length > 0 && (
              <span className="ai-agent-tools-summary-processed">
                🔄 {message.tools.filter(t => t.actionTaken).length} 已处理
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * 打开文件
   * @param filePath 文件路径
   */
  const openFile = async (filePath: string) => {
    console.log('Opening file:', filePath);
    // 触发文件打开事件
    window.dispatchEvent(new CustomEvent('open-file-in-tab', {
      detail: { filePath }
    }));
  };

  // 监听文件打开事件
  useEffect(() => {
    const handleOpenFile = (event: CustomEvent) => {
      const { filePath } = event.detail;
      console.log('Received open file event:', filePath);
    };

    window.addEventListener('open-file-in-tab', handleOpenFile as EventListener);
    return () => {
      window.removeEventListener('open-file-in-tab', handleOpenFile as EventListener);
    };
  }, []);

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
      'preview': '预览',
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

        {/* 标题栏 */}
        <div className="ai-agent-header">
          <div className="ai-agent-title">
            <span className="ai-agent-title-icon">🤖</span>
            <span>AI助手</span>
          </div>
          <button className="ai-agent-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

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
                  <span className={`dropdown-arrow ${showModelDropdown ? 'open' : ''}`}>
                    ▼
                  </span>
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
              <div className="ai-agent-strategy-selector" ref={strategyDropdownRef}>
                <button
                  type="button"
                  className="ai-agent-strategy-button"
                  onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {getStrategyDisplayName(strategy)}
                  </span>
                  <span className={`dropdown-arrow ${showStrategyDropdown ? 'open' : ''}`}>
                    ▼
                  </span>
                </button>

                {showStrategyDropdown && (
                  <div className="ai-agent-strategy-dropdown">
                    {[
                      { key: 'preview', label: '预览' },
                      { key: 'auto', label: '自动' },
                      { key: 'manual', label: '手动' }
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