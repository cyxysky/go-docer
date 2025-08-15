import React, { useEffect, useState, useRef } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface StreamingMarkdownProps {
  content: string;
  className?: string;
}

interface ParsedContent {
  html: string;
  hasIncompleteTags: boolean;
  incompleteTagInfo?: {
    type: string;
    content: string;
    isComplete: boolean;
  };
}

const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({ 
  content, 
  className = '' 
}) => {
  const [parsedContent, setParsedContent] = useState<ParsedContent>({
    html: '',
    hasIncompleteTags: false
  });
  const contentRef = useRef<HTMLDivElement>(null);

  // 检测不完整的标签
  const detectIncompleteTags = (text: string): ParsedContent => {
    // 检测不完整的 function 标签
    const functionTagRegex = /<function>\s*\{([^}]*)$/;
    const functionMatch = text.match(functionTagRegex);
    
    if (functionMatch) {
      return {
        html: '',
        hasIncompleteTags: true,
        incompleteTagInfo: {
          type: 'function',
          content: functionMatch[1] || '',
          isComplete: false
        }
      };
    }

    // 检测其他不完整的标签
    const incompleteTagRegex = /<(\w+)[^>]*$/;
    const match = text.match(incompleteTagRegex);
    
    if (match) {
      return {
        html: '',
        hasIncompleteTags: true,
        incompleteTagInfo: {
          type: match[1],
          content: '',
          isComplete: false
        }
      };
    }

    // 没有不完整标签，正常解析
    return {
      html: '',
      hasIncompleteTags: false
    };
  };

  // 解析Markdown内容
  const parseMarkdown = async (text: string): Promise<ParsedContent> => {
    try {
      // 首先检测是否有不完整的标签
      const incompleteCheck = detectIncompleteTags(text);
      if (incompleteCheck.hasIncompleteTags) {
        return incompleteCheck;
      }

      // 正常解析Markdown
      const result = await unified()
        .use(remarkParse)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
        .use(rehypeSanitize)
        .use(rehypeStringify)
        .process(text);

      return {
        html: String(result),
        hasIncompleteTags: false
      };
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return {
        html: text,
        hasIncompleteTags: false
      };
    }
  };

  useEffect(() => {
    const processContent = async () => {
      const parsed = await parseMarkdown(content);
      setParsedContent(parsed);
    };

    processContent();
  }, [content]);

  // 解析function参数，提取data字段
  const parseFunctionParams = (content: string) => {
    try {
      if (content.trim()) {
        // 如果内容以{开头，尝试补全JSON
        const jsonContent = content.trim().startsWith('{') ? content : `{${content}`;
        const parsed = JSON.parse(jsonContent);
        // 只返回data字段，如果没有data字段则返回整个对象
        return { data: parsed.data || parsed, isComplete: true };
      }
      return { data: {}, isComplete: false };
    } catch (error) {
      // JSON不完整，返回原始内容
      return { data: content, isComplete: false };
    }
  };

  // 渲染function参数
  const renderFunctionParams = (content: string) => {
    const { data, isComplete } = parseFunctionParams(content);
    
    if (!isComplete) {
      // 不完整的function，显示原始内容
      return (
        <div className="function-params">
          <h4>正在构建参数...</h4>
          <pre className="code-block streaming-json">{content}</pre>
        </div>
      );
    }

    return (
      <div className="function-params">
        <h4>参数:</h4>
        <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  };

  // 渲染不完整标签的UI
  const renderIncompleteTag = () => {
    if (!parsedContent.hasIncompleteTags || !parsedContent.incompleteTagInfo) {
      return null;
    }

    const { type, content } = parsedContent.incompleteTagInfo;
    
    if (type === 'function') {
      // 解析function参数
      const params = parseFunctionParams(content);

      return (
        <div className="incomplete-function-tag">
          <div className="function-header">
            <span className="tag-type">Function</span>
            <span className="tag-indicator">...</span>
          </div>
          {renderFunctionParams(content)}
        </div>
      );
    }
    
    return (
      <div className="incomplete-tag">
        <span className="tag-type">{type}</span>
        <span className="tag-content">{content}</span>
        <span className="tag-indicator">...</span>
      </div>
    );
  };

  return (
    <div className={`streaming-markdown ${className}`}>
      {parsedContent.hasIncompleteTags ? (
        <div className="incomplete-content">
          <div 
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: parsedContent.html }}
          />
          {renderIncompleteTag()}
        </div>
      ) : (
        <div 
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: parsedContent.html }}
          ref={contentRef}
        />
      )}
    </div>
  );
};

export default StreamingMarkdown;
