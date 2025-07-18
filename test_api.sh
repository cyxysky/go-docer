#!/bin/bash

echo "=== 在线代码编辑器 API 测试 ==="
echo "服务器地址: http://localhost:8080"
echo

# 测试工作空间列表
echo "1. 测试工作空间列表..."
curl -s http://localhost:8080/api/v1/workspaces
echo
echo

# 创建工作空间
echo "2. 创建测试工作空间..."
WORKSPACE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name":"API测试工作空间","image":"node:18-alpine","git_repo":"","git_branch":"main"}')

echo $WORKSPACE_RESPONSE
WORKSPACE_ID=$(echo $WORKSPACE_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "工作空间ID: $WORKSPACE_ID"
echo

# 等待容器启动
echo "3. 等待容器启动..."
sleep 5

# 测试文件系统
echo "4. 测试文件系统..."
echo "4.1 创建测试文件..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/files/write \
  -H "Content-Type: application/json" \
  -d '{"path":"hello.js","content":"console.log(\"Hello from API test!\");"}'
echo

echo "4.2 读取文件列表..."
curl -s http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/files
echo

echo "4.3 读取文件内容..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/files/read \
  -H "Content-Type: application/json" \
  -d '{"path":"hello.js"}'
echo
echo

# 测试命令执行
echo "5. 测试命令执行..."
echo "5.1 执行 ls 命令..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["ls","-la"]}'
echo

echo "5.2 执行 pwd 命令..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["pwd"]}'
echo

echo "5.3 执行 node 命令..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["node","hello.js"]}'
echo

# 测试Git操作
echo "6. 测试Git操作..."
echo "6.1 检查Git版本..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["git","--version"]}'
echo

echo "6.2 初始化Git仓库..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["git","init"]}'
echo

echo "6.3 查看Git状态..."
curl -s -X POST http://localhost:8080/api/v1/workspaces/$WORKSPACE_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command":["git","status"]}'
echo

echo "=== 测试完成 ==="
echo "工作空间ID: $WORKSPACE_ID"
echo "可以在浏览器中访问 http://localhost:8080 查看前端界面" 