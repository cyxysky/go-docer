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