import React, { useState } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import AdvancedStreamingRenderer from './AdvancedStreamingRenderer';
import './StreamingMarkdown.css';

const StreamingExample: React.FC = () => {
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 模拟流式输出
  const simulateStreaming = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const content = [
      '这是一个流式输出的示例。',
      '模型正在处理您的请求...',
      '<function>{"name": "search_code", "params": {"query": "React组件"}}',
      '正在搜索代码库...',
      '找到了相关代码：',
      '```jsx\nconst MyComponent = () => {\n  return <div>Hello World</div>;\n};\n```',
      '搜索完成！'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < content.length) {
        setStreamingContent(prev => prev + content[currentIndex] + '\n');
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 1000);
  };

  // 模拟不完整的标签
  const simulateIncompleteTag = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const incompleteContent = [
      '正在调用工具...',
      '<function>{',
      '正在准备参数...',
      '{"name": "read_file", "path": "/path/to/file"}',
      '工具调用完成！'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < incompleteContent.length) {
        setStreamingContent(prev => prev + incompleteContent[currentIndex] + '\n');
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 800);
  };

  // 模拟复杂的function调用
  const simulateComplexFunction = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const complexContent = [
      '正在执行复杂的代码分析...',
      '<function>{"name": "analyze_code", ',
      '"params": {',
      '  "file_path": "/src/components/App.tsx",',
      '  "analysis_type": "complexity",',
      '  "metrics": ["cyclomatic", "cognitive"]',
      '},',
      '"options": {',
      '  "include_comments": true,',
      '  "max_depth": 5',
      '}}',
      '分析完成！'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < complexContent.length) {
        setStreamingContent(prev => prev + complexContent[currentIndex] + '\n');
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 600);
  };

  // 模拟混合内容（Markdown + Function）
  const simulateMixedContent = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const mixedContent = [
      '# 代码分析报告\n\n',
      '## 概述\n',
      '正在分析项目中的代码质量...\n\n',
      '## 执行步骤\n',
      '1. 扫描项目文件\n',
      '2. 分析代码结构\n',
      '3. 生成报告\n\n',
      '<function>{"name": "generate_report", "format": "markdown", "data": "',
      '这是data的内容',
      '这是data的内容',
      '这是data的内容',
      '这是data的内容',
      '这是data的内容',
      '"}</function>',
      '<function>{"name": "generate_report", "format": "markdown", "data": "这是data的内容"}</function>',
      '\n\n报告生成完成！'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < mixedContent.length) {
        setStreamingContent(prev => prev + mixedContent[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 500);
  };

  // 模拟真实的流式data构建
  const simulateStreamingData = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const streamingData = [
      '正在构建数据分析请求...\n\n',
      '<function>{"name": "analyze_user_data", ',
      '"data": {',
      '  "user_id": "12345",',
      '  "time_range": "',
      '  "metrics": [',
      '    "page_views",',
      '    "session_duration",',
      '    "conversion_rate"',
      '  ],',
      '  "filters": {',
      '    "country": "CN",',
      '    "device_type": "mobile"',
      '  }',
      '}}</function>\n\n',
      '请求构建完成！'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < streamingData.length) {
        setStreamingContent(prev => prev + streamingData[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 400);
  };

  // 模拟包含data字段的function
  const simulateDataFunction = () => {
    setIsStreaming(true);
    setStreamingContent('');
    
    const dataContent = [
      '正在执行数据分析...\n\n',
      '<function>{"name": "analyze_data", "data": {"dataset": "user_behavior", "metrics": ["engagement", "retention"], "timeframe": "30d"}}</function>\n\n',
      '分析结果：\n',
      '- 用户参与度: 85%\n',
      '- 留存率: 72%\n',
      '- 转化率: 23%'
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < dataContent.length) {
        setStreamingContent(prev => prev + dataContent[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 700);
  };

  return (
    <div className="streaming-example">
      <h2>流式内容渲染示例</h2>
      
      <div className="controls">
        <button 
          onClick={simulateStreaming}
          disabled={isStreaming}
          className="btn btn-primary"
        >
          基础流式输出
        </button>
        
        <button 
          onClick={simulateIncompleteTag}
          disabled={isStreaming}
          className="btn btn-secondary"
        >
          不完整标签
        </button>

        <button 
          onClick={simulateComplexFunction}
          disabled={isStreaming}
          className="btn btn-tertiary"
        >
          复杂Function
        </button>

        <button 
          onClick={simulateMixedContent}
          disabled={isStreaming}
          className="btn btn-quaternary"
        >
          混合内容
        </button>

        <button 
          onClick={simulateStreamingData}
          disabled={isStreaming}
          className="btn btn-data"
        >
          Data Function
        </button>
        
        <button 
          onClick={() => {
            setStreamingContent('');
            setIsStreaming(false);
          }}
          className="btn btn-clear"
        >
          清除内容
        </button>
      </div>

      <div className="renderers-container">
        <div className="renderer-section">
          <h3>基础流式Markdown渲染器</h3>
          <div className="renderer-content">
            <StreamingMarkdown 
              content={streamingContent} 
              className="example-renderer"
            />
          </div>
        </div>

        <div className="renderer-section">
          <h3>高级流式渲染器</h3>
          <div className="renderer-content">
            <AdvancedStreamingRenderer 
              content={streamingContent}
              className="example-renderer"
              showIncompleteIndicators={true}
            />
          </div>
        </div>
      </div>

      <div className="raw-content">
        <h3>原始内容</h3>
        <pre>{streamingContent || '暂无内容'}</pre>
      </div>
    </div>
  );
};

export default StreamingExample;
