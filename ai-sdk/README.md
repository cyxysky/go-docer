# AI SDK 工具函数

这个模块提供了一系列实用的文件系统操作和系统工具函数。

## 安装依赖

```bash
npm install
```

## 可用的工具函数

### 1. 文件阅读 (readFile)

通过文件路径阅读文件内容，支持指定行号范围。

```typescript
import { readFile } from './tools';

// 读取整个文件
const content = await readFile('./example.txt');

// 读取指定行范围 (第2行到第5行)
const partialContent = await readFile('./example.txt', 2, 5);
```

**参数:**
- `filePath`: 文件路径
- `startLine`: 开始行号（可选，从1开始）
- `endLine`: 结束行号（可选）

**返回值:** `Promise<string>` - 文件内容

### 2. 文件新建 (createFile)

在指定路径下新建文件。

```typescript
import { createFile } from './tools';

const filePath = await createFile('./docs', 'readme.md', '# 项目说明\n\n这是一个示例文件。');
console.log('文件创建成功:', filePath);
```

**参数:**
- `dirPath`: 目录路径
- `fileName`: 文件名称
- `content`: 文件内容（可选，默认为空字符串）

**返回值:** `Promise<string>` - 创建的文件完整路径

### 3. 文件删除 (deleteFile)

删除指定文件。

```typescript
import { deleteFile } from './tools';

await deleteFile('./temp.txt');
console.log('文件删除成功');
```

**参数:**
- `filePath`: 文件路径

### 4. 文件夹新建 (createDirectory)

创建新文件夹。

```typescript
import { createDirectory } from './tools';

// 创建单层目录
await createDirectory('./new-folder');

// 递归创建多层目录
await createDirectory('./deep/nested/folder', true);
```

**参数:**
- `dirPath`: 文件夹路径
- `recursive`: 是否递归创建父目录（默认: true）

### 5. 文件夹删除 (deleteDirectory)

删除指定文件夹。

```typescript
import { deleteDirectory } from './tools';

// 递归删除文件夹及其内容
await deleteDirectory('./temp-folder', true);

// 只删除空文件夹
await deleteDirectory('./empty-folder', false);
```

**参数:**
- `dirPath`: 文件夹路径
- `recursive`: 是否递归删除子目录和文件（默认: true）

### 6. 命令执行 (executeCommand)

执行系统命令。

```typescript
import { executeCommand } from './tools';

const result = await executeCommand('ls -la', './some-directory');
console.log('标准输出:', result.stdout);
console.log('标准错误:', result.stderr);
```

**参数:**
- `command`: 要执行的命令
- `cwd`: 工作目录（可选）

**返回值:** `Promise<{ stdout: string; stderr: string }>`

### 7. 全局搜索 (globalSearch)

在指定文件夹路径下搜索文字内容。

```typescript
import { globalSearch } from './tools';

// 搜索所有文件
const results = await globalSearch('./src', 'function');

// 只搜索特定扩展名的文件
const jsResults = await globalSearch('./src', 'import', ['.js', '.ts']);
```

**参数:**
- `searchPath`: 搜索路径
- `searchText`: 要搜索的文字
- `fileExtensions`: 文件扩展名过滤（可选）

**返回值:** `Promise<Array<{ file: string; line: number; content: string }>>`

### 8. 文件内容编辑 (editFileContent)

根据指定行号替换文件内容。

```typescript
import { editFileContent } from './tools';

// 替换第3行到第5行的内容
await editFileContent('./config.txt', '新的配置内容\n第二行', 3, 5);
```

**参数:**
- `filePath`: 文件路径
- `newContent`: 新的内容
- `startLine`: 开始行号（从1开始）
- `endLine`: 结束行号

## 批量导入

你也可以一次性导入所有工具函数：

```typescript
import { tools } from './tools';

// 使用工具函数
await tools.createFile('./docs', 'example.txt', 'Hello World');
await tools.readFile('./docs/example.txt');
```

## 运行测试

```bash
npm run dev test-tools.ts
```

## 注意事项

1. 所有函数都是异步的，需要使用 `await` 或 `.then()` 调用
2. 文件操作会自动跳过 `node_modules`、`.git`、`.vscode`、`dist`、`build` 等目录
3. 搜索功能会忽略无法读取的文件（如二进制文件）
4. 行号从1开始计数
5. 所有函数都包含错误处理，会抛出带有中文描述的错误信息

## 错误处理

所有函数都包含 try-catch 错误处理，错误信息使用中文描述：

```typescript
try {
  await readFile('./nonexistent.txt');
} catch (error) {
  console.error('错误:', error.message); // 例如: "读取文件失败: ENOENT: no such file or directory"
}
```
