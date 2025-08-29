import React, { useCallback, useEffect, useState } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { compileSync, runSync } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { aiAPI } from '../services/api';

import { parseIncompleteJson } from '../utils/index';
import * as refractor from 'refractor';
import { diffLines, formatLines } from 'unidiff';
import { tokenize, parseDiff, Diff, Hunk } from 'react-diff-view';

import './MdRender.css';
import "react-diff-view/style/index.css";
import 'prismjs/themes/prism.css';

/**
 * AI消息接口
 */
interface AiMessages {
  content: string;
  tools?: Record<string, any>;
  reasoningData?: Record<string, any>;
  workspaceId?: string,
  sessionId?: string;
  toolsRollbackFuncs?: Array<any>;
  funcCall?: any
}

/**
 * 代码参数
 */
interface Props {
  children?: string; // 子级字符串
  [key: string]: any;
}

/**
 * 代码样式
 */
const codeStyle = {
  margin: 0,
  fontSize: '14px',
  fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Monaco"',
  backgroundColor: 'var(--dark-bg)',
  textShadow: "none"
}

/**
 * 代码差异对比组件
 */
const CodeDiff: React.FC<Props> = ({ oldVal, newVal }) => {
  const diffText = formatLines(diffLines(oldVal, newVal), {
    context: 3,
  });
  const files = parseDiff(diffText, { nearbySequences: "zip" });

  const renderFile = ({
    oldRevision,
    newRevision,
    type,
    hunks,
  }: any) => {
    const options: any = {
      refractor: refractor,
      highlight: true,
      language: "javascript"
    };

    const token = tokenize(hunks, options);
    return (
      <div key={oldRevision + "-" + newRevision} className="md-render-file-diff">
        <Diff viewType="unified" diffType={type} hunks={hunks} tokens={token} gutterType={"none"}>
          {(hunks: any) =>
            hunks.map((hunk: any) => [
              <Hunk key={hunk.content} hunk={hunk} />,
            ])
          }
        </Diff>
      </div>
    );
  };
  return <div>{files.map(renderFile)}</div>;
};

/**
 * 复制到剪贴板功能
 * @param text 要复制的文本
 */
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
};

/**
 * 语法高亮代码块组件
 */
const SyntaxHighlightedCode: React.FC<Props> = ({ children, className, acTionname }) => {
  const [copied, setCopied] = useState(false);
  const [expand, setExpand] = useState(false);
  const language = className ? className.replace('language-', '') : 'text';

  const handleCopy = async () => {
    if (children) {
      await copyToClipboard(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className='md-render-code-card'>
      {/* 代码块头部 */}
      <div className='md-render-code-card-head'>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "4px"
        }}>
          <i className="fa-solid fa-code" style={{
            height: "10px",
            fontSize: "12px",
            color: "#06b6d4"
          }}></i>
          <div className="md-render-language-tag">
            {acTionname || language}
          </div>
        </div>
        <div className='md-render-code-card-button-box'>
          {/* 复制按钮 */}
          <button onClick={handleCopy} className='md-render-code-card-button' title="复制代码">
            {copied ? <i className="fa-solid fa-check"></i> : <i className="fa-solid fa-copy"></i>}
          </button>
          {/* 接受按钮 */}
          {/* <button className='md-render-code-card-button' title="接受">
            <i className="fa-solid fa-check"></i>
          </button> */}
          {/* 拒绝按钮 */}
          {/* <button className='md-render-code-card-button' title="拒绝">
            <i className="fa-solid fa-xmark"></i>
          </button> */}
        </div>
      </div>

      {/* 代码内容 */}
      <div className="md-render-code-content" style={{
        // height: expand ? 'auto' : '100px',
      }}>
        <SyntaxHighlighter
          language={language}
          style={tomorrow}
          customStyle={codeStyle}
          wrapLines={true}
        >
          {children}
        </SyntaxHighlighter>
      </div>

      {/* 底部操作区域 */}
      {/* <div className='md-render-code-card-bottom' onClick={() => setExpand(prev => !prev)}>
        <i className="fa-solid fa-chevron-down md-render-expand-icon" style={{
          transition: 'transform 0.3s ease',
          transform: expand ? 'rotate(180deg)' : 'rotate(0deg)'
        }}></i>
      </div> */}
    </div>
  );
};

/**
 * 统一的工具组件 - 根据name判断工具类型
 */
const FunctionComponent: React.FC<Props> = ({ children, id, name, tools, workspaceId, sessionId, toolsRollbackFuncs, funcCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState<any>({});
  const [output, setOuput] = useState<any>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isJudge, setIsJudge] = useState<boolean>(false);
  const toolData = tools?.[id];

  useEffect(() => {
    toolData?.output && setIsLoading(false);
    setInput(parseIncompleteJson(String(toolData?.input)));
    setOuput(parseIncompleteJson(String(toolData?.output)));
  }, [tools, id])

  useEffect(() => {
    setIsJudge(prev => toolsRollbackFuncs?.some((item: any) => item.uuid === toolData?.uuid));
  }, [tools, workspaceId, sessionId, toolsRollbackFuncs])

  const acceptById = useCallback(async () => {
    let data = await aiAPI.rollback("acceptSome", workspaceId, sessionId, toolData?.uuid);
    const index = toolsRollbackFuncs?.findIndex((o: any) => o.uuid === toolData?.uuid);
    funcCall && funcCall(toolsRollbackFuncs?.slice(index, toolsRollbackFuncs?.length || 0));
  }, [output, toolsRollbackFuncs, funcCall, workspaceId, sessionId])

  const rollbackById = useCallback(async () => {
    let data = await aiAPI.rollback("rejectSome", workspaceId, sessionId, toolData?.uuid);
    const index = toolsRollbackFuncs?.findIndex((o: any) => o.uuid === toolData?.uuid);
    funcCall && funcCall(toolsRollbackFuncs?.slice(0, index))
  }, [output, toolsRollbackFuncs, funcCall, workspaceId, sessionId])

  // 根据工具名称获取图标和标题
  const getToolInfo = (toolName: string) => {
    const toolMap: Record<string, { icon: string; title: string; color: string }> = {
      'createFile': { icon: 'fa-plus', title: '创建文件', color: '#10b981' },
      'deleteFile': { icon: 'fa-ban', title: '删除文件', color: '#ef4444' },
      'createDirectory': { icon: 'fa-folder', title: '创建目录', color: '#f59e0b' },
      'deleteDirectory': { icon: 'fa-ban', title: '删除目录', color: '#dc2626' },
      'executeCommand': { icon: 'fa-gear', title: '执行命令', color: '#8b5cf6' },
      'editFileContent': { icon: 'fa-pen-to-square', title: '编辑文件', color: '#007acc' },
    };

    return toolMap[toolName] || toolMap['default'];
  };

  const toolInfo = getToolInfo(name);

  const renderLoading = () => {
    return (
      <div style={{
        height: "8px"
      }}>
        {
          isLoading && (
            <span className="md-render-loading-indicator">
              <i className="fas fa-spinner"></i>
            </span>
          )
        }
      </div>
    )
  }

  // 渲染工具特定内容
  const renderToolContent = () => {
    if (!toolData) return null;
    switch (name) {
      // 创建文件
      case 'createFile':
        return (
          <div className="md-render-tool-content">
            <SyntaxHighlighter
              language={input?.fileName?.split(".").pop() || 'text'}
              style={tomorrow}
              customStyle={codeStyle}
              wrapLines={true}
            >
              {input?.content || ''}
            </SyntaxHighlighter>
          </div>
        );

      case 'executeCommand':
        return (
          <div className="md-render-tool-content">
            <SyntaxHighlighter
              language="shell"
              style={tomorrow}
              customStyle={codeStyle}
              wrapLines={false}
            >
              {output?.stdout || '命令执行完成'}
            </SyntaxHighlighter>
          </div>
        );

      case 'editFileContent':
        return (
          <CodeDiff oldVal={output?.originData || ''} newVal={output?.newContent || ''} />
        );
    }
  };

  // 文件读取
  if (name === 'readFile') {
    return (
      <div data-function-id={id}>
        {/* 卡片头部 */}
        <div className="md-render-read-function" onClick={() => {
          setIsExpanded(!isExpanded)
        }}>
          <i className="fa-brands fa-readme" style={{
            height: "10px",
            color: "var(--success-hover)"
          }}>
          </i>
          {renderLoading()}
          <div>
            {input?.filePath?.split("/")?.pop() || ""}
          </div>
          <div>
            {input?.startLine} ~ {input?.endLine}
          </div>
        </div>
        <div className="md-render-reading-content">
          {isExpanded && (
            <SyntaxHighlighter
              language={input?.filePath?.split(".").pop() || 'text'}
              style={tomorrow}
              customStyle={codeStyle}
              wrapLines={true}
            >
              {toolData?.output?.content || output?.content || ""}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    )
  }

  // 全局搜索
  if (name === 'globalSearch') {
    return (
      <div data-function-id={id} style={{
        cursor: "pointer",
      }}>
        {/* 卡片头部 */}
        <div className="md-render-read-function">
          <i className="fa-solid fa-magnifying-glass" style={{
            color: "var(--primary-dark)"
          }}></i>
          {renderLoading()}
          {input?.searchPath && (
            <div>
              {input?.searchPath}
            </div>
          )}
          {input?.searchText && (
            <div>
              {input?.searchText}
            </div>
          )}
          {input?.fileExtensions && (
            <div>
              {input?.fileExtensions}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 默认内容
  return (
    <div className="md-render-function-tag" data-function-id={id}>
      {/* 卡片头部 */}
      <div className="md-render-function-header">
        <div className="md-render-function-info">
          <div className="md-render-function-icon">
            <i className={"fa-solid " + toolInfo.icon} style={{
              color: toolInfo.color,
              height: "9px"
            }}></i>
          </div>
          <div className="md-render-function-details">
            {/* <div className="md-render-function-name">
              {toolInfo.title}
            </div> */}
            {[
              'readFile',
              'createFile',
              'deleteFile',
              'createDirectory',
              'deleteDirectory',
              'editFileContent'
            ].includes(name) && (
                <div className="md-render-target-name">
                  {input?.filePath?.split("/")?.pop() || ""}
                </div>
              )}

            {[
              'createDirectory',
              'deleteDirectory',
            ].includes(name) && (
                <div className="md-render-target-name">
                  {input?.dirPath?.split("/")?.pop() || ""}
                </div>
              )}

            {[
              'createFile',
            ].includes(name) && (
                <div className="md-render-target-name">
                  {input?.fileName || ""}
                </div>
              )}

            {[
              "executeCommand"
            ].includes(name) && (
                <div className="md-render-target-name">
                  {input?.command || ""}
                </div>
              )}
          </div>
          {renderLoading()}
        </div>

        <div className="md-render-function-actions">
          <button
            onClick={() => rollbackById()}
            className="md-render-action-btn"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <button
            onClick={() => acceptById()}
            className="md-render-action-btn"
          >
            <i className="fa-solid fa-check"></i>
          </button>
        </div>
      </div>

      {/* 参数区域 */}
      {/* {hasParams && isParamsExpanded && (
        <div className="md-render-params-section">
          <div className="md-render-params-content">
            <SyntaxHighlighter
              language="json"
              style={tomorrow}
              customStyle={codeStyle}
              showLineNumbers={false}
              wrapLines={true}
            >
              {toolData.input || '未找到匹配结果'}
            </SyntaxHighlighter>
          </div>
        </div>
      )} */}

      {/* 工具内容区域 */}

      {![
        'deleteFile',
        'createDirectory',
        'deleteDirectory',
      ].includes(name) && renderToolContent()}
    </div>
  );
};

/**
 * 思维链组件
 */
const ReasonerComponent: React.FC<Props> = ({ children, id, reasoningData }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const reasoningContent = reasoningData?.[id]?.data || children;

  return (
    <div className="md-render-reasoner-card">
      {/* 思维链头部 */}
      <div className="md-render-reasoner-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="md-render-reasoner-icon">🧠</div>
      </div>

      {/* 思维链内容 */}
      {isExpanded && (
        <div className="md-render-reasoner-content">
          {reasoningContent}
        </div>
      )}
    </div>
  );
};

/**
 * 动态MDX渲染器组件
 */
const DynamicMDXRenderer: React.FC<AiMessages> = ({ content, tools, reasoningData, workspaceId, sessionId, toolsRollbackFuncs, funcCall }) => {

  const components = {
    // 工具组件
    FunctionCall: (prop: any) => FunctionComponent({ ...prop, tools, workspaceId, sessionId, toolsRollbackFuncs, funcCall }),
    ReasoningCall: (prop: any) => ReasonerComponent({ ...prop, reasoningData }),
    // 基础MDX组件
    h1: (props: any) => (
      <h1
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontSize: '2.5rem',
          fontWeight: '700',
          margin: '20px 0 12px 0',
          paddingBottom: '12px',
          // borderBottom: '3px solid #3b82f6',
          position: 'relative',
          lineHeight: '1.2'
        }}
      />
    ),
    h2: (props: any) => (
      <h2
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontSize: '1.875rem',
          fontWeight: '600',
          margin: '16px 0 10px 0',
          // borderLeft: '4px solid #3b82f6',
          lineHeight: '1.3'
        }}
      />
    ),
    h3: (props: any) => (
      <h3
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontSize: '1.5rem',
          fontWeight: '600',
          margin: '14px 0 8px 0',
          lineHeight: '1.4'
        }}
      />
    ),
    p: (props: any) => (
      <p
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontSize: '16px',
          lineHeight: '1.7',
          margin: '8px 0',
          textAlign: 'justify'
        }}
      />
    ),
    ul: (props: any) => (
      <ul
        {...props}
        style={{
          margin: '8px 0',
        }}
      />
    ),
    li: (props: any) => (
      <li
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontSize: '16px',
          lineHeight: '1.6',
          margin: '8px 0',
        }}
      />
    ),
    strong: (props: any) => (
      <strong
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontWeight: '600'
        }}
      />
    ),
    em: (props: any) => (
      <em
        {...props}
        style={{
          color: 'var(--text-primary)',
          fontStyle: 'italic'
        }}
      />
    ),
    code: SyntaxHighlightedCode,
    blockquote: (props: any) => (
      <blockquote
        {...props}
        style={{
          borderLeft: '4px solid #3b82f6',
          backgroundColor: '#f8fafc',
          padding: '16px 20px',
          margin: '20px 0',
          borderRadius: '0 8px 8px 0',
          fontStyle: 'italic',
          color: '#475569'
        }}
      />
    ),
    a: (props: any) => (
      <a
        {...props}
        style={{
          color: '#3b82f6',
          textDecoration: 'none',
          borderBottom: '1px solid transparent',
          transition: 'all 0.2s ease',
          fontWeight: '500'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderBottomColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderBottomColor = 'transparent';
        }}
      />
    )
  }

  /** 编译的代码内容 */
  const compiled = compileSync(content, {
    outputFormat: 'function-body',
  });

  /** 编译后的md的html内容 */
  const { default: Content } = runSync(compiled, { ...runtime, baseUrl: import.meta.url });

  return (
    <MDXProvider components={components}>
      <div className="md-render-mdx-content">
        <Content components={components} />
      </div>
    </MDXProvider>
  );
};

/**
 * 主渲染器组件
 */
const MdRederer: React.FC<any> = ({ content, tools, reasoningData, workspaceId, sessionId, toolsRollbackFuncs, funcCall }) => {
  return (
    <div className="md-render-container">
      <DynamicMDXRenderer
        content={content}
        tools={tools}
        reasoningData={reasoningData}
        workspaceId={workspaceId}
        sessionId={sessionId}
        toolsRollbackFuncs={toolsRollbackFuncs}
        funcCall={funcCall}
      />
    </div>
  );
};

export default MdRederer;

