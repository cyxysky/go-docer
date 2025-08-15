# 流式内容渲染器

这个项目提供了两个专门用于处理流式内容的React组件，能够正确解析和渲染包含不完整标签的内容。

## 组件介绍

### 1. StreamingMarkdown 组件

基础的流式Markdown渲染器，使用 remark 系列库进行内容解析。

**特性：**
- 实时解析流式Markdown内容
- 检测不完整的标签（如 `<function>{...`）
- 优雅显示不完整标签状态
- 支持完整的Markdown语法

**安装依赖：**
```bash
npm install remark remark-parse remark-rehype rehype-stringify rehype-raw rehype-sanitize
```

**使用方法：**
```tsx
import StreamingMarkdown from './components/StreamingMarkdown';

function App() {
  const [content, setContent] = useState('');
  
  return (
    <StreamingMarkdown 
      content={content} 
      className="my-markdown"
    />
  );
}
```

### 2. AdvancedStreamingRenderer 组件

高级流式内容渲染器，专门处理各种类型的不完整标签和特殊内容。

**特性：**
- 智能识别不同类型的标签（function、tool等）
- 实时检测标签完整性
- 为不完整标签提供视觉反馈
- 支持自定义标签处理器
- 更好的用户体验和视觉效果

**使用方法：**
```tsx
import AdvancedStreamingRenderer from './components/AdvancedStreamingRenderer';

function App() {
  const [content, setContent] = useState('');
  
  // 自定义标签处理器
  const customHandlers = {
    'custom-tag': (content: string) => (
      <div className="custom-tag">{content}</div>
    )
  };
  
  return (
    <AdvancedStreamingRenderer 
      content={content}
      showIncompleteIndicators={true}
      customTagHandlers={customHandlers}
    />
  );
}
```

## 处理不完整标签的原理

### 问题描述
当模型流式输出内容时，可能会出现不完整的标签，例如：
```
<function>{"name": "search", "params": {"query": "React"}}
```

这种不完整的标签无法被标准的Markdown解析器正确处理。

### 解决方案
1. **实时检测**：在内容更新时检测是否有不完整的标签
2. **智能解析**：使用正则表达式和字符串分析识别标签类型
3. **状态管理**：区分完整和不完整的内容段
4. **视觉反馈**：为不完整标签提供明显的视觉指示

## 样式定制

所有组件都包含了完整的CSS样式，支持：
- 响应式设计
- 动画效果
- 主题定制
- 移动端适配

可以通过修改 `StreamingMarkdown.css` 文件来自定义样式。

## 使用场景

### 1. AI聊天界面
```tsx
function ChatMessage({ message, isStreaming }) {
  return (
    <div className="chat-message">
      <AdvancedStreamingRenderer 
        content={message.content}
        showIncompleteIndicators={isStreaming}
      />
    </div>
  );
}
```

### 2. 代码编辑器
```tsx
function CodeEditor({ code, isProcessing }) {
  return (
    <div className="code-editor">
      <StreamingMarkdown 
        content={code}
        className="code-content"
      />
    </div>
  );
}
```

### 3. 实时日志显示
```tsx
function LogViewer({ logs }) {
  return (
    <div className="log-viewer">
      {logs.map((log, index) => (
        <AdvancedStreamingRenderer 
          key={index}
          content={log.content}
          showIncompleteIndicators={log.isStreaming}
        />
      ))}
    </div>
  );
}
```

## 性能优化

1. **防抖处理**：避免频繁的内容解析
2. **虚拟滚动**：对于长内容列表
3. **懒加载**：按需加载样式和组件
4. **内存管理**：及时清理不需要的状态

## 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 故障排除

### 常见问题

1. **标签无法正确识别**
   - 检查正则表达式是否匹配您的标签格式
   - 确认标签的语法结构

2. **样式不生效**
   - 确保CSS文件已正确导入
   - 检查CSS选择器的优先级

3. **性能问题**
   - 对于长内容，考虑分段渲染
   - 使用 `useMemo` 优化解析逻辑

### 调试技巧

```tsx
// 启用调试模式
<AdvancedStreamingRenderer 
  content={content}
  debug={true} // 显示解析过程
/>
```

## 贡献指南

欢迎提交Issue和Pull Request来改进这些组件！

## 许可证

MIT License
