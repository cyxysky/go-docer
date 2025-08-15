import React, { useEffect, useState, useMemo } from 'react';
import './StreamingMarkdown.css';

interface StreamingContent {
  text: string;
  type: 'text' | 'function' | 'tool' | 'error' | 'warning' | 'info';
  isComplete: boolean;
  metadata?: any;
}

interface AdvancedStreamingRendererProps {
  content: string;
  className?: string;
  showIncompleteIndicators?: boolean;
}

const AdvancedStreamingRenderer: React.FC<AdvancedStreamingRendererProps> = ({
  content,
  className = '',
  showIncompleteIndicators = true
}) => {
  const [processedContent, setProcessedContent] = useState<StreamingContent[]>([]);

  // 解析内容并识别各种模式
  const parseContent = useMemo(() => {
    const segments: StreamingContent[] = [];
    let currentText = '';
    let i = 0;

    while (i < content.length) {
      const char = content[i];
      
      // 检测开始标签
      if (char === '<' && i + 1 < content.length) {
        // 保存之前的文本
        if (currentText.trim()) {
          segments.push({
            text: currentText.trim(),
            type: 'text',
            isComplete: true
          });
          currentText = '';
        }

        // 尝试找到标签结束
        let tagEnd = content.indexOf('>', i);
        let tagContent = '';
        
        if (tagEnd === -1) {
          // 不完整的标签
          tagContent = content.substring(i);
          segments.push({
            text: tagContent,
            type: 'text',
            isComplete: false
          });
          break;
        } else {
          tagContent = content.substring(i, tagEnd + 1);
          
          // 检测特殊标签类型
          if (tagContent.startsWith('<function')) {
            // 处理function标签
            let functionEnd = content.indexOf('</function>', tagEnd);
            if (functionEnd === -1) {
              // 不完整的function标签
              let functionContent = content.substring(tagEnd + 1);
              segments.push({
                text: functionContent,
                type: 'function',
                isComplete: false,
                metadata: { tagType: 'function' }
              });
              break;
            } else {
              // 完整的function标签
              let functionContent = content.substring(tagEnd + 1, functionEnd);
              segments.push({
                text: functionContent,
                type: 'function',
                isComplete: true,
                metadata: { tagType: 'function' }
              });
              i = functionEnd + 11; // </function> 的长度
              continue;
            }
          } else if (tagContent.startsWith('<tool')) {
            // 处理tool标签
            let toolEnd = content.indexOf('</tool>', tagEnd);
            if (toolEnd === -1) {
              let toolContent = content.substring(tagEnd + 1);
              segments.push({
                text: toolContent,
                type: 'tool',
                isComplete: false,
                metadata: { tagType: 'tool' }
              });
              break;
            } else {
              let toolContent = content.substring(tagEnd + 1, toolEnd);
              segments.push({
                text: toolContent,
                type: 'tool',
                isComplete: true,
                metadata: { tagType: 'tool' }
              });
              i = toolEnd + 6; // </tool> 的长度
              continue;
            }
          } else {
            // 其他HTML标签，作为普通文本处理
            segments.push({
              text: tagContent,
              type: 'text',
              isComplete: true
            });
            i = tagEnd + 1;
            continue;
          }
        }
      } else {
        currentText += char;
        i++;
      }
    }

    // 添加剩余的文本
    if (currentText.trim()) {
      segments.push({
        text: currentText.trim(),
        type: 'text',
        isComplete: true
      });
    }

    return segments;
  }, [content]);

  useEffect(() => {
    setProcessedContent(parseContent);
  }, [parseContent]);



  // 渲染function参数
  const renderFunctionParams = (text: string, isComplete: boolean) => {
    if (!isComplete) {
      // 不完整的function，显示原始内容
      return (
        <div className="function-params">
          <h4>正在构建参数...</h4>
          <pre className="code-block streaming-json">{text}</pre>
        </div>
      );
    }

    try {
      // 尝试解析完整的JSON
      const parsed = JSON.parse(text);
      const data = parsed.data || parsed;
      
      return (
        <div className="function-params">
          <h4>参数:</h4>
          <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
    } catch (error) {
      // 即使标记为完整，但JSON仍然无效，显示原始内容
      return (
        <div className="function-params">
          <h4>参数 (原始内容):</h4>
          <pre className="code-block streaming-json">{text}</pre>
        </div>
      );
    }
  };

  // 渲染Markdown内容
  const renderMarkdown = (text: string) => {
    // 简单的Markdown解析
    const lines = text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('# ')) {
        return <h1 key={index}>{line.substring(2)}</h1>;
      } else if (line.startsWith('## ')) {
        return <h2 key={index}>{line.substring(3)}</h2>;
      } else if (line.startsWith('### ')) {
        return <h3 key={index}>{line.substring(4)}</h3>;
      } else if (line.startsWith('1. ') || line.startsWith('- ')) {
        return <li key={index}>{line.substring(line.indexOf(' ') + 1)}</li>;
      } else if (line.trim() === '') {
        return <br key={index} />;
      } else if (line.includes('```')) {
        // 代码块处理
        const codeMatch = line.match(/```(\w+)?\n([\s\S]*?)```/);
        if (codeMatch) {
          return (
            <pre key={index} className="code-block">
              <code>{codeMatch[2]}</code>
            </pre>
          );
        }
      } else if (line.includes('`')) {
        // 行内代码处理
        const parts = line.split('`');
        return (
          <span key={index}>
            {parts.map((part, partIndex) => 
              partIndex % 2 === 0 ? part : <code key={partIndex}>{part}</code>
            )}
          </span>
        );
      }
      return <p key={index}>{line}</p>;
    });
  };

  // 渲染不同类型的段
  const renderSegment = (segment: StreamingContent, index: number) => {
    const { text, type, isComplete } = segment;

    switch (type) {
      case 'function':
        // 参数解析已移到renderFunctionParams中
        return (
          <div key={index} className={`function-segment ${!isComplete ? 'incomplete' : ''}`}>
            <div className="function-header">
              <span className="function-icon">⚙️</span>
              <span className="function-label">Function Call</span>
              {!isComplete && <span className="loading-indicator">...</span>}
            </div>
            <div className="function-content">
              {renderFunctionParams(text, isComplete)}
            </div>
          </div>
        );

      case 'tool':
        return (
          <div key={index} className={`tool-segment ${!isComplete ? 'incomplete' : ''}`}>
            <div className="tool-header">
              <span className="tool-icon">🔧</span>
              <span className="tool-label">Tool Execution</span>
              {!isComplete && <span className="loading-indicator">...</span>}
            </div>
            <div className="tool-content">
              <pre className="code-block">{text}</pre>
            </div>
          </div>
        );

      case 'text':
      default:
        if (!isComplete) {
          // 不完整的文本，可能是标签的一部分
          return (
            <span key={index} className="incomplete-text">
              {text}
              {showIncompleteIndicators && <span className="cursor-blink">|</span>}
            </span>
          );
        }
        
        // 渲染Markdown内容
        return (
          <div key={index} className="markdown-content">
            {renderMarkdown(text)}
          </div>
        );
    }
  };

  return (
    <div className={`advanced-streaming-renderer ${className}`}>
      {processedContent.map((segment, index) => renderSegment(segment, index))}
    </div>
  );
};

export default AdvancedStreamingRenderer;
