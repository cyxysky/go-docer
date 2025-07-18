#!/bin/bash

# 容器管理系统快速启动脚本

echo "=== 容器管理系统快速启动 ==="

# 检查Docker是否运行
echo "检查Docker服务状态..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker服务未运行，请先启动Docker"
    echo "   sudo systemctl start docker"
    exit 1
fi
echo "✅ Docker服务正在运行"

# 检查可执行文件是否存在
if [ ! -f "./container-manager" ]; then
    echo "❌ 可执行文件不存在，正在构建..."
    ./build.sh
fi

# 显示帮助信息
echo ""
echo "可用命令:"
echo "  ./container-manager test          - 运行测试"
echo "  ./container-manager interactive   - 交互模式"
echo "  ./container-manager list          - 列出容器"
echo "  ./container-manager create -name my-app -image nginx:alpine -port 8080:80"
echo ""

# 如果提供了参数，直接执行
if [ $# -gt 0 ]; then
    echo "执行命令: ./container-manager $@"
    ./container-manager "$@"
else
    echo "启动交互模式..."
    ./container-manager interactive
fi 