# 在线代码编辑器

一个基于Go语言开发的在线代码编辑器，支持容器化部署，提供完整的开发环境。

## 功能特性

### 🚀 核心功能
- **多语言支持**: Node.js, Python, Go, Java, PHP
- **容器化工作空间**: 每个项目独立的容器环境
- **实时文件编辑**: 基于CodeMirror的代码编辑器
- **集成终端**: 支持命令行操作
- **Git集成**: 完整的Git操作支持
- **端口转发**: 自动端口映射和访问

### 📁 文件系统
- 文件树浏览
- 文件创建、编辑、删除
- 语法高亮
- 自动保存

### 🐳 容器管理
- 预配置开发环境镜像
- 工作空间隔离
- 环境变量管理
- 卷挂载支持

### 🔧 开发工具
- 代码运行
- 终端命令执行
- Git版本控制
- 端口访问

## 快速开始

### 1. 环境要求

- Docker & Docker Compose
- Go 1.21+
- Git

### 2. 克隆项目

```bash
git clone <repository-url>
cd online-editor
```

### 3. 构建和运行

#### 方式一：使用Docker Compose（推荐）

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f online-editor
```

#### 方式二：本地开发

```bash
# 安装依赖
go mod tidy

# 运行后端服务
go run online-editor.go

# 访问前端
open http://localhost:8080
```

### 4. 访问应用

打开浏览器访问: http://localhost:8080

## 使用指南

### 创建工作空间

1. 在左侧面板输入工作空间名称
2. 选择开发环境（Node.js, Python, Go等）
3. 可选：输入Git仓库URL和分支
4. 点击"创建工作空间"

### 文件操作

1. **浏览文件**: 在左侧文件树中点击文件
2. **编辑文件**: 在代码编辑器中修改代码
3. **保存文件**: 点击"保存"按钮或使用快捷键
4. **运行代码**: 点击"运行"按钮执行当前文件

### 终端使用

1. 在右侧终端面板输入命令
2. 按Enter执行命令
3. 支持所有Linux命令

### Git操作

1. **状态检查**: 点击"状态"查看文件变更
2. **添加文件**: 点击"添加"将文件加入暂存区
3. **提交代码**: 输入提交信息后点击"提交"
4. **推送代码**: 点击"推送"上传到远程仓库

## API文档

### 工作空间管理

#### 创建工作空间
```http
POST /api/v1/workspaces
Content-Type: application/json

{
  "name": "my-project",
  "image": "node",
  "git_repo": "https://github.com/user/repo.git",
  "git_branch": "main"
}
```

#### 获取工作空间列表
```http
GET /api/v1/workspaces
```

#### 启动工作空间
```http
POST /api/v1/workspaces/{id}/start
```

#### 停止工作空间
```http
POST /api/v1/workspaces/{id}/stop
```

#### 删除工作空间
```http
DELETE /api/v1/workspaces/{id}
```

### 文件系统

#### 列出文件
```http
GET /api/v1/workspaces/{id}/files?path=src
```

#### 读取文件
```http
GET /api/v1/workspaces/{id}/files?path=src/main.js
```

#### 写入文件
```http
POST /api/v1/workspaces/{id}/files
Content-Type: application/json

{
  "path": "src/main.js",
  "content": "console.log('Hello World');"
}
```

#### 删除文件
```http
DELETE /api/v1/workspaces/{id}/files?path=src/main.js
```

### 命令执行

#### 执行命令
```http
POST /api/v1/workspaces/{id}/exec
Content-Type: application/json

{
  "command": ["npm", "install"]
}
```

### Git操作

#### Git操作
```http
POST /api/v1/workspaces/{id}/git
Content-Type: application/json

{
  "type": "commit",
  "message": "Update code"
}
```

支持的操作类型：
- `status`: 查看状态
- `add`: 添加文件
- `commit`: 提交代码
- `push`: 推送代码
- `pull`: 拉取代码
- `checkout`: 切换分支
- `branch`: 查看分支
- `log`: 查看日志

## 预配置镜像

### Node.js
- 镜像: `node:18-alpine`
- 端口: 3000, 8080
- 工作目录: `/app`

### Python
- 镜像: `python:3.11-slim`
- 端口: 5000, 8000
- 工作目录: `/app`

### Go
- 镜像: `golang:1.21-alpine`
- 端口: 8080
- 工作目录: `/app`

### Java
- 镜像: `openjdk:11-jdk-slim`
- 端口: 8080
- 工作目录: `/app`

### PHP
- 镜像: `php:8.2-apache`
- 端口: 8000
- 工作目录: `/var/www/html`

## 项目结构

```
online-editor/
├── online-editor.go      # 主程序
├── go.mod               # Go模块文件
├── go.sum               # 依赖校验文件
├── Dockerfile           # Docker构建文件
├── docker-compose.yml   # Docker Compose配置
├── static/              # 前端静态文件
│   ├── index.html       # 主页面
│   └── app.js          # 前端JavaScript
├── workspaces/          # 工作空间目录
├── images/              # 镜像目录
└── README.md           # 项目文档
```

## 配置说明

### 环境变量

- `DOCKER_HOST`: Docker守护进程地址
- `PORT`: 服务端口（默认8080）

### 目录配置

- 工作空间目录: `/tmp/online-editor/workspaces`
- 镜像目录: `/tmp/online-editor/images`

## 开发指南

### 添加新的开发环境

1. 在`preloadedImages`中添加新镜像配置
2. 在`docker-compose.yml`中添加对应的服务
3. 在前端`index.html`中添加选项

### 扩展功能

- 添加新的API端点
- 实现WebSocket实时通信
- 集成更多开发工具
- 添加用户认证和权限管理

## 故障排除

### 常见问题

1. **容器启动失败**
   - 检查Docker服务状态
   - 确认端口未被占用
   - 查看容器日志

2. **文件操作失败**
   - 检查文件权限
   - 确认工作空间状态
   - 验证文件路径

3. **Git操作失败**
   - 检查网络连接
   - 确认Git仓库URL正确
   - 验证Git凭证

### 日志查看

```bash
# 查看应用日志
docker-compose logs online-editor

# 查看特定工作空间日志
docker logs <workspace-container-id>
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 发起Pull Request

## 许可证

MIT License

## 联系方式

- 项目地址: [GitHub Repository]
- 问题反馈: [Issues]
- 邮箱: [your-email@example.com] 