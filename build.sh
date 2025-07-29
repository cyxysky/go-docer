#!/bin/bash
#安装docker，配置镜像源
apt update
apt install docker.io
tee /etc/docker/daemon.json <<-'EOF'
{
    "registry-mirrors": [
    	"https://docker.m.daocloud.io",
    	"https://docker.imgdb.de",
    	"https://docker-0.unsee.tech",
    	"https://docker.hlmirror.com",
    	"https://docker.1ms.run",
    	"https://func.ink",
    	"https://lispy.org",
    	"https://docker.xiaogenban1993.com"
    ]
}
EOF
systemctl restart docker
#安装nginx，配置代理
apt install nginx

cp goDocker.conf /etc/nginx/sites-available/go-docker

ln -sf /etc/nginx/sites-available/go-docker/goDocker.conf /etc/nginx/conf.d/goDocker.conf

echo "检查nginx配置..."
nginx -t

if [ $? -eq 0 ]; then
    echo "配置检查通过！"
    echo "正在重载nginx..."
    nginx -s reload
    echo "nginx配置已成功应用！"
    echo "你的应用现在可以通过 http://localhost 访问"
else
    echo "nginx配置检查失败，请检查配置文件"
    exit 1
fi 

chmod +x online-editor
./online-editor
# 在线代码编辑器构建脚本

echo "🚀 开始构建在线代码编辑器..."

#配置docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
    "registry-mirrors": [
        "https://docker.xuanyuan.me",
        "https://registry.docker-cn.com",
        "https://docker.mirrors.ustc.edu.cn",
        "https://hub-mirror.c.163.com",
        "https://mirror.baidubce.com",
        "https://ccr.ccs.tencentyun.com"
    ]
}
EOF

sudo systemctl daemon-reload		#重启daemon进程
sudo systemctl restart docker		#重启docker
docker info


# 配置GOPROXY
go env -w GOPROXY=https://mirrors.aliyun.com/goproxy/,direct

# 检查Go环境
if ! command -v go &> /dev/null; then
    echo "❌ Go未安装，请先安装Go 1.21+"
    exit 1
fi

# 检查Docker环境
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

# 检查Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose未安装，请先安装Docker Compose"
    exit 1
fi

echo "✅ 环境检查通过"

# 创建必要的目录
echo "📁 创建目录..."
mkdir -p static workspaces images

# 下载Go依赖
echo "📦 下载Go依赖..."
go mod tidy

if [ $? -ne 0 ]; then
    echo "❌ 依赖下载失败"
    exit 1
fi

# 构建Go程序
echo "🔨 构建Go程序..."
go build -o online-editor online-editor.go

if [ $? -ne 0 ]; then
    echo "❌ Go程序构建失败"
    exit 1
fi

echo "✅ Go程序构建成功"

# 构建Docker镜像
echo "🐳 构建Docker镜像..."
docker build -t online-editor .

if [ $? -ne 0 ]; then
    echo "❌ Docker镜像构建失败"
    exit 1
fi

echo "✅ Docker镜像构建成功"

# 启动服务
echo "🚀 启动服务..."
docker-compose up -d

if [ $? -ne 0 ]; then
    echo "❌ 服务启动失败"
    exit 1
fi

echo "✅ 服务启动成功"

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
echo "📊 检查服务状态..."
docker-compose ps

echo ""
echo "🎉 构建完成！"
echo "🌐 访问地址: http://localhost:8080"
echo ""
echo "📋 常用命令:"
echo "  查看日志: docker-compose logs -f online-editor"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "  查看状态: docker-compose ps"