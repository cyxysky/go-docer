# 在线代码编辑器 - Docker容器化开发环境

一个基于Docker的在线代码编辑器，支持多种编程语言环境，提供完整的开发工具链。

## 功能特性

- 🐳 **Docker容器化** - 每个工作空间都是独立的Docker容器
- 📁 **文件系统管理** - 完整的文件创建、编辑、删除功能
- 💻 **集成终端** - 支持命令执行和交互式终端
- 🔧 **多语言支持** - Node.js、Python、Go、Java、PHP等
- 📦 **Git集成** - 支持Git仓库克隆、提交、推送等操作
- 🎨 **现代化UI** - 基于Bootstrap 5的响应式界面
- ⚡ **实时编辑** - 基于CodeMirror的代码编辑器

## 修复的问题

### 1. 容器挂载问题 ✅
- **问题**: 容器创建时没有正确挂载工作空间目录
- **修复**: 确保工作空间目录正确挂载到容器的`/workspace`目录

### 2. 环境变量问题 ✅
- **问题**: Git、cd等命令执行时缺少必要的环境变量
- **修复**: 在所有命令执行中添加完整的环境变量设置：
  - `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin`
  - `TERM=xterm-256color`
  - `HOME=/root`
  - `USER=root`
  - `SHELL=/bin/bash`
  - `PWD=/workspace`
  - `LANG=C.UTF-8`
  - `LC_ALL=C.UTF-8`

### 3. 文件系统API问题 ✅
- **问题**: 文件获取接口路由冲突
- **修复**: 重新设计API路由结构：
  - `GET /api/v1/workspaces/{id}/files` - 列出文件
  - `POST /api/v1/workspaces/{id}/files/read` - 读取文件
  - `POST /api/v1/workspaces/{id}/files/write` - 写入文件
  - `POST /api/v1/workspaces/{id}/files/delete` - 删除文件

### 4. 终端样式优化 ✅
- **问题**: 终端没有换行，无法交互
- **修复**: 重新设计终端界面，参照VSCode实现：
  - 添加终端头部和清空按钮
  - 改进终端样式和颜色方案
  - 支持命令历史和多行输入
  - 添加光标动画效果

## 支持的开发环境

| 环境 | 镜像 | 描述 |
|------|------|------|
| Node.js | `node:18-alpine` | Node.js 18 开发环境 |
| Python | `python:3.11-slim` | Python 3.11 开发环境 |
| Go | `golang:1.23.1` | Go 1.23 开发环境 |
| Java | `openjdk:18-jdk-slim` | Java 18 开发环境 |
| PHP | `php:8.2-apache` | PHP 8.2 + Apache 开发环境 |

## 快速开始

### 1. 编译程序
```bash
go build -o online-editor online-editor.go
```

### 2. 启动服务器
```bash
./online-editor
```

### 3. 访问应用
打开浏览器访问: http://localhost:8080

### 4. 创建工作空间
1. 在侧边栏输入工作空间名称
2. 选择开发环境镜像
3. 点击"创建工作空间"按钮

## API文档

### 工作空间管理
- `GET /api/v1/workspaces` - 列出工作空间
- `POST /api/v1/workspaces` - 创建工作空间
- `GET /api/v1/workspaces/{id}` - 获取工作空间详情
- `POST /api/v1/workspaces/{id}/start` - 启动工作空间
- `POST /api/v1/workspaces/{id}/stop` - 停止工作空间
- `DELETE /api/v1/workspaces/{id}` - 删除工作空间

### 文件系统
- `GET /api/v1/workspaces/{id}/files` - 列出文件
- `POST /api/v1/workspaces/{id}/files/read` - 读取文件
- `POST /api/v1/workspaces/{id}/files/write` - 写入文件
- `POST /api/v1/workspaces/{id}/files/delete` - 删除文件

### 命令执行
- `POST /api/v1/workspaces/{id}/exec` - 执行命令
- `POST /api/v1/workspaces/{id}/terminal` - 创建终端会话
- `GET /api/v1/workspaces/{id}/terminal/{sessionId}/ws` - 终端WebSocket

### Git操作
- `POST /api/v1/workspaces/{id}/git` - Git操作

## 测试

运行测试脚本验证所有功能：
```bash
./test_api.sh
```

## 系统要求

- Docker
- Go 1.19+
- 现代浏览器（支持WebSocket）

## 技术栈

- **后端**: Go + Docker API + Gorilla Mux + WebSocket
- **前端**: HTML5 + CSS3 + JavaScript + Bootstrap 5 + CodeMirror
- **容器**: Docker + Alpine Linux

## 许可证

MIT License 