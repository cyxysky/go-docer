package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/docker/docker/api/types/container"
	imageTypes "github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// 在线代码编辑器后端系统
// 支持容器化、文件系统、终端、端口转发、镜像管理、Git操作

// 类型定义
type Workspace struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name"` // 用户输入的显示名称
	Image       string            `json:"image"`
	Status      string            `json:"status"`
	Ports       []PortMapping     `json:"ports"`
	Volumes     []VolumeMount     `json:"volumes"`
	Environment map[string]string `json:"environment"`
	Created     time.Time         `json:"created"`
	Started     *time.Time        `json:"started,omitempty"`
	ContainerID string            `json:"container_id"`
	GitRepo     string            `json:"git_repo"`
	GitBranch   string            `json:"git_branch"`
	NetworkIP   string            `json:"network_ip,omitempty"`
	NetworkName string            `json:"network_name,omitempty"`
	AccessURLs  []AccessURL       `json:"access_urls,omitempty"`
	Tools       []string          `json:"tools,omitempty"` // 用户选择的工具
	IsFavorite  bool              `json:"is_favorite"`     // 是否收藏
}

type AccessURL struct {
	Port        string `json:"port"`
	Protocol    string `json:"protocol"`
	InternalURL string `json:"internal_url"`
	ExternalURL string `json:"external_url,omitempty"`
	Status      string `json:"status"` // "available", "unavailable", "checking"
}

type PortMapping struct {
	HostPort      string `json:"host_port"`
	ContainerPort string `json:"container_port"`
	Protocol      string `json:"protocol"`
	PublicAccess  bool   `json:"public_access,omitempty"`
}

type VolumeMount struct {
	HostPath      string `json:"host_path"`
	ContainerPath string `json:"container_path"`
	ReadOnly      bool   `json:"read_only"`
}

type FileInfo struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	IsDir        bool      `json:"is_dir"`
	Size         int64     `json:"size"`
	ModifiedTime time.Time `json:"modified_time"`
	Permissions  string    `json:"permissions"`
}

type TerminalSession struct {
	ID           string          `json:"id"`
	WorkspaceID  string          `json:"workspace_id"`
	Process      *exec.Cmd       `json:"-"`
	WebSocket    *websocket.Conn `json:"-"`
	Created      time.Time       `json:"created"`
	LastActivity time.Time       `json:"last_activity"`
}

type GitOperation struct {
	Type    string   `json:"type"` // clone, pull, push, commit, checkout
	Repo    string   `json:"repo"`
	Branch  string   `json:"branch"`
	Message string   `json:"message"`
	Files   []string `json:"files"`
}

// 简化网络管理，移除IP池，直接使用端口绑定

// 在线编辑器管理器
type OnlineEditorManager struct {
	workspaces       map[string]*Workspace
	terminalSessions map[string]*TerminalSession
	mutex            sync.RWMutex
	baseDir          string
	workspacesDir    string
	imagesDir        string
	upgrader         websocket.Upgrader

	dockerClient *client.Client // Docker 客户端
	networkName  string         // 工作空间网络名称
	portPool     map[int]bool   // 端口池管理
}

// 脚本和命令管理
type ScriptManager struct {
	Scripts  map[string]string
	Commands map[string][]string
}

// 全局脚本管理器
var scriptManager = &ScriptManager{
	Scripts: map[string]string{
		// 终端初始化脚本
		"terminal_init": `#!/bin/bash
# 进入工作目录
cd /workspace 2>/dev/null || cd /

# 禁用历史扩展，避免！号展开
set +H

stty -echo

# 禁用括号粘贴模式，避免终端控制字符
printf '\033[?2004l'

# 设置标准的bash提示符，会自动跟随当前目录变化
export PS1='root@online-editor:\w $ '

# 清空屏幕并显示欢迎信息
clear
echo "🚀 在线代码编辑器终端"
echo "当前目录: $(pwd)"
echo "==============================================="

# 直接启动交互式bash，让它处理所有的提示符逻辑
exec /bin/bash --login -i`,

		// 环境初始化脚本 - 基础版本
		"env_init_basic": `#!/bin/bash
# 确保工作目录存在并设置权限
mkdir -p /workspace
chmod 755 /workspace
cd /workspace

# 创建常用目录
mkdir -p /workspace/tmp
mkdir -p /workspace/logs

# 设置git安全目录（如果git存在）
if command -v git >/dev/null 2>&1; then
	git config --global --add safe.directory /workspace
	git config --global init.defaultBranch main
fi

echo "工作目录初始化完成"`,

		// .bashrc配置内容 - 环境初始化版本
		"bashrc_env_init": `#!/bin/bash
# Online Code Editor Enhanced Shell Configuration

# 设置别名
alias ll='ls -alF'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# 开发相关别名
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'
alias gd='git diff'

# 设置历史记录
export HISTSIZE=2000
export HISTFILESIZE=4000
export HISTCONTROL=ignoredups:erasedups
shopt -s histappend

# 设置编辑器
export EDITOR=nano
export VISUAL=nano

# 自动完成功能
if [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
fi

# 函数：快速创建项目结构
mkproject() {
    if [ -z "$1" ]; then
        echo "用法: mkproject <项目名>"
        return 1
    fi
    mkdir -p "$1"/{src,docs,tests,config}
    cd "$1"
    echo "# $1" > README.md
    echo "项目 $1 创建完成"
}

# 函数：快速Git初始化
gitinit() {
    git init
    echo -e "node_modules/\n.env\n*.log\n.DS_Store" > .gitignore
    git add .
    git commit -m "Initial commit"
    echo "Git仓库初始化完成"
}

# 切换到工作目录
cd /workspace 2>/dev/null || cd /`,

		// .bashrc配置内容 - 安装工具版本
		"bashrc_tool_install": `#!/bin/bash
# 设置别名

# 设置历史记录
export HISTSIZE=1000
export HISTFILESIZE=2000
export HISTCONTROL=ignoredups:erasedups

# 设置工作目录
cd /workspace 2>/dev/null || cd /

echo "Welcome to Online Code Editor!"
echo "Current directory: $(pwd)"
echo "Available commands: ls, cd, pwd, git, etc."`,

		// 端口测试服务器脚本模板
		"port_test_server": `
		echo "启动端口 %s 测试服务器..."
		nohup python3 -c "
import http.server
import socketserver
import sys

PORT = %s
try:
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'测试服务器已启动在端口 {PORT}')
        print('访问 http://localhost:%s 进行测试')
        httpd.serve_forever()
except Exception as e:
    print(f'启动服务器失败: {e}')
    sys.exit(1)
" > /tmp/test_server_%s.log 2>&1 &
		echo "测试服务器已在后台启动，日志文件: /tmp/test_server_%s.log"
		echo "请等待几秒钟，然后访问 http://localhost:%s"`,
	},

	Commands: map[string][]string{
		// 检查工具是否存在
		"check_tool": {"which"},

		// 端口检查命令模板
		"port_check_template": {"sh", "-c", "netstat -tlnp 2>/dev/null | grep ':%s ' || ss -tlnp 2>/dev/null | grep ':%s ' || lsof -i :%s 2>/dev/null"},

		// 包管理器安装命令
		"install_apt": {"/bin/bash", "-c", "apt-get update && apt-get install -y %s"},
		"install_apk": {"/bin/bash", "-c", "apk add --no-cache %s"},
		"install_yum": {"/bin/bash", "-c", "yum install -y %s"},
		"install_dnf": {"/bin/bash", "-c", "dnf install -y %s"},
	},
}

// 获取脚本内容
func (sm *ScriptManager) GetScript(name string) (string, error) {
	if script, exists := sm.Scripts[name]; exists {
		return script, nil
	}
	return "", fmt.Errorf("脚本不存在: %s", name)
}

// 获取命令模板
func (sm *ScriptManager) GetCommand(name string, args ...interface{}) ([]string, error) {
	if cmdTemplate, exists := sm.Commands[name]; exists {
		cmd := make([]string, len(cmdTemplate))
		copy(cmd, cmdTemplate)

		// 格式化命令中的占位符
		for i, part := range cmd {
			if strings.Contains(part, "%s") || strings.Contains(part, "%d") {
				cmd[i] = fmt.Sprintf(part, args...)
			}
		}
		return cmd, nil
	}
	return nil, fmt.Errorf("命令模板不存在: %s", name)
}

// 格式化脚本内容
func (sm *ScriptManager) FormatScript(name string, args ...interface{}) (string, error) {
	script, err := sm.GetScript(name)
	if err != nil {
		return "", err
	}

	if len(args) > 0 {
		return fmt.Sprintf(script, args...), nil
	}
	return script, nil
}

// filterTerminalOutput 过滤终端输出中的控制序列 - 增强版
func filterTerminalOutput(text string) string {
	// 如果文本为空或只包含控制字符，直接返回空
	if len(text) == 0 {
		return ""
	}

	// 过滤括号粘贴模式控制序列
	if strings.Contains(text, "\x1b[?2004l") || strings.Contains(text, "\033[?2004l") ||
		strings.Contains(text, "\x1b[?2004h") || strings.Contains(text, "\033[?2004h") {
		return ""
	}

	// 更全面的控制序列过滤
	patterns := []string{
		// 基本控制字符
		`\x00+`,        // NULL字符
		`[\x01-\x08]+`, // 控制字符 1-8
		`\x0B+`,        // 垂直制表符
		`\x0C+`,        // 换页符
		`[\x0E-\x1F]+`, // 其他控制字符
		`\x7F+`,        // DEL字符

		// ANSI转义序列 - 更精确的匹配
		`\x1b\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]`, // 标准ANSI转义序列
		`\033\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]`, // 八进制格式
		`\x1b\[[?][0-9;]*[hl]`,                   // 私有模式设置
		`\033\[[?][0-9;]*[hl]`,                   // 私有模式设置 (八进制)

		// 特定的终端控制序列
		`\x1b\]0;.*?\x07`,         // 设置窗口标题 (OSC序列)
		`\x1b\]0;.*?\x1b\\`,       // 设置窗口标题 (替代结束符)
		`\x1b\[[0-9]*[ABCD]`,      // 光标移动
		`\x1b\[[0-9]*;[0-9]*[Hf]`, // 光标定位
		`\x1b\[[0-9]*[JK]`,        // 清除屏幕/行
		`\x1b\[s`,                 // 保存光标位置
		`\x1b\[u`,                 // 恢复光标位置
		`\x1b\[2J`,                // 清屏
		`\x1b\[H`,                 // 光标回到首位

		// 颜色控制序列
		`\x1b\[[0-9;]*m`, // 颜色和样式设置
		`\033\[[0-9;]*m`, // 颜色和样式设置 (八进制)

		// 键盘模式设置
		`\x1b\[>[0-9;]*c`, // 设备属性查询响应
		`\x1b\[[0-9;]*n`,  // 状态报告

		// 特殊字符组合
		`\r\n\r\n+`, // 多余的换行组合
		`\n\r+`,     // 混乱的换行
		`\r+\n`,     // 回车换行组合
		`\x08+`,     // 连续退格符

		// Shell特定的控制序列
		`\x1b\[201~`, // 括号粘贴开始
		`\x1b\[200~`, // 括号粘贴结束
	}

	// 逐个应用过滤规则
	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		text = re.ReplaceAllString(text, "")
	}

	// 清理连续的空白字符和换行
	text = regexp.MustCompile(`\s{3,}`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`\n{3,}`).ReplaceAllString(text, "\n\n")

	// 移除行首行尾的多余空白
	lines := strings.Split(text, "\n")
	var cleanLines []string
	for _, line := range lines {
		cleanLine := strings.TrimSpace(line)
		if cleanLine != "" {
			cleanLines = append(cleanLines, cleanLine)
		}
	}

	return strings.Join(cleanLines, "\n")
}

// 预加载的镜像配置 - 使用Slim镜像提供更好的兼容性
var preloadedImages = map[string]map[string]interface{}{
	"node:18-slim": {
		"description": "Node.js 18 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"NODE_ENV":          "development",
			"NPM_CONFIG_PREFIX": "/usr/local",
		},
	},
	"python:3.11-slim": {
		"description": "Python 3.11 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"PYTHONPATH":       "/workspace",
			"PYTHONUNBUFFERED": "1",
			"PIP_NO_CACHE_DIR": "1",
		},
	},
	"golang:1.24-slim": {
		"description": "Go 1.24 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"GOPATH":      "/go",
			"GOROOT":      "/usr/local/go",
			"CGO_ENABLED": "0",
		},
	},
	"openjdk:17-slim": {
		"description": "Java 17 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"JAVA_HOME":  "/usr/local/openjdk-17",
			"MAVEN_HOME": "/usr/share/maven",
		},
	},
	"php:8.2-cli-slim": {
		"description": "PHP 8.2 CLI 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"PHP_INI_DIR": "/usr/local/etc/php",
			"PHP_CFLAGS":  "-fstack-protector-strong -fpic -fpie -O2",
		},
	},
	"ruby:3.2-slim": {
		"description": "Ruby 3.2 开发环境 (Debian Slim)",
		"shell":       "/bin/bash",
		"env": map[string]string{
			"RUBY_VERSION": "3.2",
			"GEM_HOME":     "/usr/local/bundle",
		},
	},
}

// 创建在线编辑器管理器
func NewOnlineEditorManager() (*OnlineEditorManager, error) {
	// 使用当前目录下的workspace作为工作空间根目录，确保用户能看到文件
	currentDir, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("获取当前目录失败: %v", err)
	}

	baseDir := filepath.Join(currentDir, "workspace")
	workspacesDir := filepath.Join(baseDir, "workspaces")
	imagesDir := filepath.Join(baseDir, "images")

	// 创建目录
	dirs := []string{baseDir, workspacesDir, imagesDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("创建目录失败 %s: %v", dir, err)
		}
	}

	// 初始化 Docker 客户端
	dockerCli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("初始化 Docker 客户端失败: %v", err)
	}

	// 使用默认Docker网络，简化网络配置
	networkName := "bridge" // 使用默认bridge网络

	manager := &OnlineEditorManager{
		workspaces:       make(map[string]*Workspace),
		terminalSessions: make(map[string]*TerminalSession),
		baseDir:          baseDir,
		workspacesDir:    workspacesDir,
		imagesDir:        imagesDir,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // 允许所有来源
			},
		},
		dockerClient: dockerCli,
		networkName:  networkName,
		portPool:     make(map[int]bool),
	}

	// 启动时恢复现有工作空间
	if err := manager.recoverExistingWorkspaces(); err != nil {
		log.Printf("恢复现有工作空间失败: %v", err)
	}

	return manager, nil
}

// 生成工作空间ID
func generateWorkspaceID() string {
	return fmt.Sprintf("ws_%d", time.Now().UnixNano())
}

// 生成终端会话ID
func generateTerminalID() string {
	return fmt.Sprintf("term_%d", time.Now().UnixNano())
}

// 恢复现有工作空间
func (oem *OnlineEditorManager) recoverExistingWorkspaces() error {
	ctx := context.Background()

	// 获取所有容器（包括已停止的）
	containers, err := oem.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return fmt.Errorf("获取容器列表失败: %v", err)
	}

	// 只基于容器名称恢复工作空间，不依赖目录
	for _, cont := range containers {
		if len(cont.Names) == 0 {
			continue
		}

		containerName := strings.TrimPrefix(cont.Names[0], "/")

		// 检查是否是我们的工作空间容器
		if !strings.HasPrefix(containerName, "ws_") {
			continue
		}

		workspaceID := containerName

		// 检查是否已经在管理列表中
		if _, exists := oem.workspaces[workspaceID]; exists {
			continue
		}

		// 获取容器详细信息
		containerInfo, err := oem.dockerClient.ContainerInspect(ctx, cont.ID)
		if err != nil {
			log.Printf("获取容器详细信息失败 %s: %v", cont.ID, err)
			continue
		}

		// 创建工作空间目录（如果不存在）
		workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
		if err := os.MkdirAll(workspaceDir, 0755); err != nil {
			log.Printf("创建工作空间目录失败 %s: %v", workspaceID, err)
			continue
		}

		// 恢复工作空间对象
		workspace := &Workspace{
			ID:          workspaceID,
			Name:        workspaceID, // 临时使用ID作为名称
			DisplayName: workspaceID, // 临时使用ID作为显示名称
			ContainerID: cont.ID,
			Status:      cont.State,
			Created:     time.Unix(cont.Created, 0),
			NetworkName: oem.networkName,
			Environment: make(map[string]string),
		}

		// 恢复镜像信息
		workspace.Image = containerInfo.Config.Image

		// 恢复网络IP
		if containerInfo.NetworkSettings != nil {
			if endpointSettings, exists := containerInfo.NetworkSettings.Networks[oem.networkName]; exists {
				workspace.NetworkIP = endpointSettings.IPAddress
			}
		}

		// 恢复端口映射
		if containerInfo.NetworkSettings.Ports != nil {
			workspace.Ports = []PortMapping{}
			for containerPort, bindings := range containerInfo.NetworkSettings.Ports {
				if len(bindings) > 0 {
					portMapping := PortMapping{
						ContainerPort: containerPort.Port(),
						Protocol:      containerPort.Proto(),
						HostPort:      bindings[0].HostPort,
						PublicAccess:  bindings[0].HostPort != "",
					}
					workspace.Ports = append(workspace.Ports, portMapping)
				}
			}
		}

		// 设置工作空间目录挂载
		workspace.Volumes = []VolumeMount{
			{
				HostPath:      workspaceDir,
				ContainerPath: "/workspace",
				ReadOnly:      false,
			},
		}

		// 如果容器正在运行，生成访问URL
		if workspace.Status == "running" {
			oem.generateAccessURLs(workspace)
		}

		// 添加到工作空间列表
		oem.workspaces[workspaceID] = workspace
		log.Printf("恢复工作空间: %s (状态: %s)", workspaceID, workspace.Status)
	}

	log.Printf("成功恢复 %d 个工作空间", len(oem.workspaces))
	return nil
}

// IP池相关功能已移除，简化为端口绑定模式

// 生成工作空间访问URL
func (oem *OnlineEditorManager) generateAccessURLs(workspace *Workspace) {
	if workspace.NetworkIP == "" {
		return
	}

	var accessURLs []AccessURL

	// 常见的开发服务器端口
	commonPorts := []string{"3000", "8000", "8080", "8081", "4200", "5000", "5173", "5174"}

	// 处理配置的端口映射
	portMap := make(map[string]bool)
	for _, port := range workspace.Ports {
		accessURL := AccessURL{
			Port:        port.ContainerPort,
			Protocol:    "http",
			InternalURL: fmt.Sprintf("http://%s:%s", workspace.NetworkIP, port.ContainerPort),
			Status:      "checking",
		}

		// 如果有公共访问配置，添加外部URL
		if port.PublicAccess && port.HostPort != "" {
			accessURL.ExternalURL = fmt.Sprintf("http://localhost:%s", port.HostPort)
		}

		accessURLs = append(accessURLs, accessURL)
		portMap[port.ContainerPort] = true
	}

	// 添加常见端口（如果没有在配置中）
	for _, port := range commonPorts {
		if !portMap[port] {
			accessURL := AccessURL{
				Port:        port,
				Protocol:    "http",
				InternalURL: fmt.Sprintf("http://%s:%s", workspace.NetworkIP, port),
				Status:      "checking",
			}
			accessURLs = append(accessURLs, accessURL)
		}
	}

	workspace.AccessURLs = accessURLs
	log.Printf("[%s] 生成访问URL: %d个端口", workspace.ID, len(accessURLs))
}

// 检查端口可用性
func (oem *OnlineEditorManager) checkPortAvailability(workspace *Workspace) {
	if workspace.NetworkIP == "" || workspace.Status != "running" {
		return
	}

	ctx := context.Background()

	for i := range workspace.AccessURLs {
		accessURL := &workspace.AccessURLs[i]

		// 在容器内检查端口是否有服务监听
		checkCmd, err := scriptManager.GetCommand("port_check_template", accessURL.Port, accessURL.Port, accessURL.Port)
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		output, err := io.ReadAll(execAttachResp.Reader)
		execAttachResp.Close()

		if err == nil && len(output) > 0 {
			accessURL.Status = "available"
		} else {
			accessURL.Status = "unavailable"
		}
	}
}

// 释放端口
func (oem *OnlineEditorManager) releasePort(port int) {
	// 调用者必须持有锁
	delete(oem.portPool, port)
}

// 创建工作空间
func (oem *OnlineEditorManager) CreateWorkspace(name, images, gitRepo, gitBranch string, customPorts []PortMapping, selectedTools []string) (*Workspace, error) {
	// 先进行基本验证，不持有锁
	imageConfig, exists := preloadedImages[images]
	if !exists {
		return nil, fmt.Errorf("不支持的镜像: %s", images)
	}

	workspaceID := generateWorkspaceID()
	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)

	// 创建工作空间目录
	if err := os.MkdirAll(workspaceDir, 0755); err != nil {
		return nil, fmt.Errorf("创建工作空间目录失败: %v", err)
	}

	log.Printf("请求的镜像: '%s'", images)
	log.Printf("镜像配置: %v", imageConfig)

	// 创建工作空间对象 - 初始状态为pending
	workspace := &Workspace{
		ID:          workspaceID, // 内部使用ID作为名称
		DisplayName: name,        // 用户输入的显示名称
		Image:       images,
		Status:      "pending", // 初始状态：等待资源分配
		Created:     time.Now(),
		GitRepo:     gitRepo,
		GitBranch:   gitBranch,
		Environment: make(map[string]string),
		NetworkName: oem.networkName,
	}

	// 设置端口映射
	workspace.Ports = customPorts

	// 设置用户选择的工具
	workspace.Tools = selectedTools

	// 设置默认卷挂载
	workspace.Volumes = []VolumeMount{
		{
			HostPath:      workspaceDir,
			ContainerPath: "/workspace",
			ReadOnly:      false,
		},
	}

	// 设置环境变量
	if env, ok := imageConfig["env"].(map[string]string); ok {
		workspace.Environment = env
	}

	// 短暂持有锁，只用于添加到map
	oem.mutex.Lock()
	oem.workspaces[workspaceID] = workspace
	oem.mutex.Unlock()

	// 异步初始化容器，不阻塞响应
	go func() {
		if err := oem.initializeContainer(workspace, images, workspaceDir, imageConfig); err != nil {
			log.Printf("容器初始化失败: %v", err)
			// 更新状态时使用短锁
			oem.mutex.Lock()
			workspace.Status = "failed"
			oem.mutex.Unlock()
		}
	}()

	return workspace, nil
}

// 初始化容器 - 分阶段进行，增加超时和错误处理
func (oem *OnlineEditorManager) initializeContainer(workspace *Workspace, images, workspaceDir string, imageConfig map[string]interface{}) error {
	workspaceID := workspace.ID

	// 设置总超时时间（5分钟）
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 阶段1：更新状态为拉取镜像中
	oem.updateWorkspaceStatus(workspaceID, "pulling")

	// 拉取镜像（如果本地没有）
	_, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, images)
	if err != nil {
		log.Printf("[%s] 拉取镜像: %s", workspaceID, images)

		// 设置拉取镜像的超时（2分钟）
		pullCtx, pullCancel := context.WithTimeout(ctx, 2*time.Minute)
		defer pullCancel()

		out, err := oem.dockerClient.ImagePull(pullCtx, images, imageTypes.PullOptions{})
		if err != nil {
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("拉取镜像失败: %v", err)
		}
		defer out.Close()

		// 读取拉取进度（非阻塞）
		go func() {
			io.Copy(io.Discard, out)
		}()

		// 等待拉取完成或超时
		select {
		case <-pullCtx.Done():
			if pullCtx.Err() == context.DeadlineExceeded {
				oem.updateWorkspaceStatus(workspaceID, "failed")
				return fmt.Errorf("拉取镜像超时")
			}
		default:
			// 继续执行
		}
	}
	log.Printf("[%s] 镜像准备完成: %s", workspaceID, images)

	// 阶段2：更新状态为创建容器中
	oem.updateWorkspaceStatus(workspaceID, "creating")

	// 简化网络配置，不使用固定IP分配
	log.Printf("[%s] 使用默认网络配置", workspaceID)

	// 设置环境变量
	envs := []string{}
	if env, ok := imageConfig["env"].(map[string]string); ok {
		for k, v := range env {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 获取镜像配置中的Shell信息
	defaultShell := "/bin/bash"
	if shell, ok := imageConfig["shell"].(string); ok {
		defaultShell = shell
	}

	// 添加基础环境变量 - 优化Slim镜像兼容性
	baseEnvs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		fmt.Sprintf("SHELL=%s", defaultShell),
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"TZ=Asia/Shanghai",
		"CONTAINER_NAME=" + workspaceID, // 添加容器名称环境变量
	}
	envs = append(envs, baseEnvs...)

	// 容器挂载卷 - 确保工作空间目录正确挂载到/workspace
	mounts := []mount.Mount{
		{
			Type:   mount.TypeBind,
			Source: workspaceDir,
			Target: "/workspace",
			BindOptions: &mount.BindOptions{
				Propagation: mount.PropagationRPrivate,
			},
		},
	}

	// 清理可能冲突的容器
	if err := oem.cleanupConflictingContainers(); err != nil {
		log.Printf("[%s] 清理冲突容器失败: %v", workspaceID, err)
	}

	// 处理端口映射 - 修复版本
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	log.Printf("[%s] 配置端口映射，共%d个端口", workspaceID, len(workspace.Ports))

	// 处理配置的端口映射
	for _, portMapping := range workspace.Ports {
		containerPortStr := portMapping.ContainerPort
		hostPortStr := portMapping.HostPort
		protocol := portMapping.Protocol

		if containerPortStr == "" {
			continue
		}

		// 创建容器端口标识
		containerPort := nat.Port(fmt.Sprintf("%s/%s", containerPortStr, protocol))
		exposedPorts[containerPort] = struct{}{}

		log.Printf("[%s] 配置端口: 容器%s -> 宿主机%s (协议:%s, 公共访问:%v)",
			workspaceID, containerPortStr, hostPortStr, protocol, portMapping.PublicAccess)

		// 如果有宿主机端口配置，设置端口绑定
		if hostPortStr != "" && portMapping.PublicAccess {
			portBindings[containerPort] = []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: hostPortStr,
				},
			}
			log.Printf("[%s] 端口绑定已设置: %s:%s -> %s", workspaceID, "0.0.0.0", hostPortStr, containerPortStr)
		}
	}

	// 常用开发端口默认暴露（不绑定到宿主机）
	commonPorts := []string{"3000", "8000", "8080", "8081", "4200", "5000", "5173", "5174", "9000"}
	configuredPorts := make(map[string]bool)
	for _, portMapping := range workspace.Ports {
		configuredPorts[portMapping.ContainerPort] = true
	}

	for _, port := range commonPorts {
		if !configuredPorts[port] {
			containerPort := nat.Port(fmt.Sprintf("%s/tcp", port))
			exposedPorts[containerPort] = struct{}{}
		}
	}

	log.Printf("[%s] 总计暴露端口: %d, 绑定端口: %d", workspaceID, len(exposedPorts), len(portBindings))

	// 创建容器配置
	containerConfig := &container.Config{
		Image:        images,
		Env:          envs,
		Tty:          true,
		OpenStdin:    true,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/workspace",
		// 使用tail命令保持容器运行
		Cmd: []string{"tail", "-f", "/dev/null"},
	}

	hostConfig := &container.HostConfig{
		Mounts:       mounts,
		Privileged:   false,
		PortBindings: portBindings,
		// 添加资源限制
		Resources: container.Resources{
			Memory:    512 * 1024 * 1024, // 512MB
			CPUShares: 1024,
		},
	}

	// 使用默认网络配置
	networkingConfig := &network.NetworkingConfig{}

	log.Printf("[%s] 创建容器配置", workspaceID)

	// 设置创建容器的超时（1分钟）
	createCtx, createCancel := context.WithTimeout(ctx, 1*time.Minute)
	defer createCancel()

	resp, err := oem.dockerClient.ContainerCreate(createCtx, containerConfig, hostConfig, networkingConfig, nil, workspaceID)
	if err != nil {
		oem.updateWorkspaceStatus(workspaceID, "failed")
		return fmt.Errorf("创建容器失败: %v", err)
	}
	log.Printf("[%s] 容器创建完成: %s", workspaceID, resp.ID)

	// 更新容器ID
	oem.mutex.Lock()
	workspace.ContainerID = resp.ID
	oem.mutex.Unlock()

	// 阶段3：更新状态为启动中
	oem.updateWorkspaceStatus(workspaceID, "starting")

	// 启动容器
	startCtx, startCancel := context.WithTimeout(ctx, 30*time.Second)
	defer startCancel()

	if err := oem.dockerClient.ContainerStart(startCtx, resp.ID, container.StartOptions{}); err != nil {
		// 如果启动失败，清理容器
		log.Printf("[%s] 容器启动失败，清理容器: %v", workspaceID, err)
		oem.dockerClient.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		oem.updateWorkspaceStatus(workspaceID, "failed")
		return fmt.Errorf("启动容器失败: %v", err)
	}
	log.Printf("[%s] 容器启动成功", workspaceID)

	// 等待容器稳定运行，使用轮询而不是阻塞等待
	for attempts := 0; attempts < 10; attempts++ {
		select {
		case <-ctx.Done():
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("容器启动检查超时")
		default:
			time.Sleep(2 * time.Second)
		}

		containerInfo, err := oem.dockerClient.ContainerInspect(ctx, resp.ID)
		if err != nil {
			log.Printf("[%s] 检查容器状态失败: %v", workspaceID, err)
			continue
		}

		if containerInfo.State.Status == "running" {
			log.Printf("[%s] 容器运行状态确认", workspaceID)
			break
		}

		if attempts == 9 {
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("容器启动后状态异常: %s", containerInfo.State.Status)
		}
	}

	// 阶段4：更新状态为初始化中
	oem.updateWorkspaceStatus(workspaceID, "initializing")

	// 等待容器完全启动并初始化环境
	time.Sleep(3 * time.Second)

	// 异步初始化环境，不阻塞主流程
	go func() {
		if err := oem.initializeEnvironment(workspaceID); err != nil {
			log.Printf("[%s] 环境初始化失败: %v", workspaceID, err)
		}
	}()

	// 阶段5：所有初始化完成，状态设为运行中
	oem.updateWorkspaceStatus(workspaceID, "running")

	// 设置启动时间
	oem.mutex.Lock()
	now := time.Now()
	workspace.Started = &now

	// 生成访问URL
	oem.generateAccessURLs(workspace)
	oem.mutex.Unlock()

	// 验证端口绑定
	if err := oem.verifyPortBindings(workspaceID); err != nil {
		log.Printf("[%s] 初始化后端口绑定验证失败: %v", workspaceID, err)
	}

	log.Printf("[%s] 工作空间初始化完成，状态：运行中", workspaceID)
	return nil
}

// 更新工作空间状态
func (oem *OnlineEditorManager) updateWorkspaceStatus(workspaceID, status string) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	if workspace, exists := oem.workspaces[workspaceID]; exists {
		workspace.Status = status
		log.Printf("[%s] 状态更新: %s", workspaceID, status)
	}
}

// 初始化环境
func (oem *OnlineEditorManager) initializeEnvironment(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	log.Printf("[%s] 开始环境初始化...", workspaceID)

	// 1. 创建工作目录并设置权限
	envInitScript, err := scriptManager.GetScript("env_init_basic")
	if err != nil {
		log.Printf("[%s] 获取环境初始化脚本失败: %v", workspaceID, err)
		return err
	}
	setupCmd := []string{"/bin/bash", "-c", envInitScript}

	execConfig := container.ExecOptions{
		Cmd:          setupCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("[%s] 创建初始化命令失败: %v", workspaceID, err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			output, _ := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()
			log.Printf("[%s] 工作目录初始化: %s", workspaceID, string(output))
		}
	}

	// 2. 创建增强的.bashrc文件
	bashrcContent, err := scriptManager.GetScript("bashrc_env_init")
	if err != nil {
		log.Printf("[%s] 获取bashrc脚本失败: %v", workspaceID, err)
		return err
	}

	// 写入.bashrc文件
	createBashrcCmd := []string{"/bin/bash", "-c", fmt.Sprintf("cat > /root/.bashrc << 'EOF'\n%s\nEOF", bashrcContent)}
	execConfig = container.ExecOptions{
		Cmd:          createBashrcCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err = oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("[%s] 创建.bashrc失败: %v", workspaceID, err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			execAttachResp.Close()
			log.Printf("[%s] .bashrc配置文件已创建", workspaceID)
		}
	}

	// 3. 安装基础开发工具
	return oem.installDevelopmentTools(workspaceID, envs)
}

// 安装开发工具
func (oem *OnlineEditorManager) installDevelopmentTools(workspaceID string, envs []string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 检查并安装用户选择的工具
	var requiredTools []string
	if workspace.Tools != nil && len(workspace.Tools) > 0 {
		requiredTools = workspace.Tools
	} else {
		// 默认工具列表
		requiredTools = []string{"git", "curl", "wget", "vim"}
	}
	missingTools := []string{}

	// 检查工具是否存在
	for _, tool := range requiredTools {
		checkCmd, _ := scriptManager.GetCommand("check_tool", tool)
		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
			Env:          envs,
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err == nil {
			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err == nil {
				output, _ := io.ReadAll(execAttachResp.Reader)
				execAttachResp.Close()
				if len(output) == 0 {
					missingTools = append(missingTools, tool)
				} else {
					log.Printf("[%s] 工具 %s 已存在", workspaceID, tool)
				}
			}
		}
	}

	// 如果有缺失的工具，尝试安装
	if len(missingTools) > 0 {
		log.Printf("[%s] 缺失工具: %v，尝试安装...", workspaceID, missingTools)

		// 尝试不同的包管理器（按常见程度排序）
		installCommands := [][]string{
			// Debian/Ubuntu
			{"/bin/bash", "-c", "apt-get update && apt-get install -y " + strings.Join(missingTools, " ")},
			// Alpine
			{"/bin/bash", "-c", "apk add --no-cache " + strings.Join(missingTools, " ")},
			// CentOS/RHEL/Rocky
			{"/bin/bash", "-c", "yum install -y " + strings.Join(missingTools, " ")},
			// Fedora
			{"/bin/bash", "-c", "dnf install -y " + strings.Join(missingTools, " ")},
		}

		for i, cmd := range installCommands {
			log.Printf("[%s] 尝试安装方式 %d", workspaceID, i+1)

			installExecConfig := container.ExecOptions{
				Cmd:          cmd,
				AttachStdout: true,
				AttachStderr: true,
				WorkingDir:   "/workspace",
				Env:          envs,
			}

			execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
			if err != nil {
				continue
			}

			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err != nil {
				continue
			}

			// 读取安装输出
			output, _ := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()

			// 检查安装是否成功
			if strings.Contains(string(output), "installed") ||
				strings.Contains(string(output), "upgraded") ||
				strings.Contains(string(output), "OK:") {
				log.Printf("[%s] 工具安装成功", workspaceID)
				break
			}
		}
	}

	log.Printf("[%s] 开发环境初始化完成", workspaceID)
	return nil
}

// 重新创建容器
func (oem *OnlineEditorManager) recreateContainer(workspace *Workspace) error {
	ctx := context.Background()
	workspaceID := workspace.ID

	// 获取镜像配置
	imageConfig, exists := preloadedImages[workspace.Image]
	if !exists {
		return fmt.Errorf("不支持的镜像: %s", workspace.Image)
	}

	// 设置环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"TZ=Asia/Shanghai",
		"CONTAINER_NAME=" + workspaceID,
	}

	// 添加镜像特定的环境变量
	if env, ok := imageConfig["env"].(map[string]string); ok {
		for k, v := range env {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 处理端口映射 - 与创建时保持一致
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	log.Printf("[%s] 重建容器时配置端口映射，共%d个端口", workspaceID, len(workspace.Ports))

	for _, portMapping := range workspace.Ports {
		containerPortStr := portMapping.ContainerPort
		hostPortStr := portMapping.HostPort
		protocol := portMapping.Protocol

		if containerPortStr == "" {
			continue
		}

		containerPort := nat.Port(fmt.Sprintf("%s/%s", containerPortStr, protocol))
		exposedPorts[containerPort] = struct{}{}

		log.Printf("[%s] 重建端口配置: 容器%s -> 宿主机%s (协议:%s, 公共访问:%v)",
			workspaceID, containerPortStr, hostPortStr, protocol, portMapping.PublicAccess)

		if hostPortStr != "" && portMapping.PublicAccess {
			portBindings[containerPort] = []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: hostPortStr,
				},
			}
			log.Printf("[%s] 重建端口绑定: %s:%s -> %s", workspaceID, "0.0.0.0", hostPortStr, containerPortStr)
		}
	}

	log.Printf("[%s] 重建容器端口配置完成: 暴露%d个，绑定%d个", workspaceID, len(exposedPorts), len(portBindings))

	// 容器挂载卷
	mounts := []mount.Mount{
		{
			Type:   mount.TypeBind,
			Source: filepath.Join(oem.workspacesDir, workspaceID),
			Target: "/workspace",
			BindOptions: &mount.BindOptions{
				Propagation: mount.PropagationRPrivate,
			},
		},
	}

	// 创建容器配置
	containerConfig := &container.Config{
		Image:        workspace.Image,
		Env:          envs,
		Tty:          true,
		OpenStdin:    true,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/workspace",
		Cmd:          []string{"tail", "-f", "/dev/null"},
	}

	hostConfig := &container.HostConfig{
		Mounts:       mounts,
		Privileged:   false,
		PortBindings: portBindings,
		Resources: container.Resources{
			Memory:    512 * 1024 * 1024,
			CPUShares: 1024,
		},
	}

	networkingConfig := &network.NetworkingConfig{}

	log.Printf("[%s] 重新创建容器配置", workspaceID)
	resp, err := oem.dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, workspaceID)
	if err != nil {
		return fmt.Errorf("创建容器失败: %v", err)
	}

	// 更新容器ID
	oem.mutex.Lock()
	workspace.ContainerID = resp.ID
	workspace.Status = "created"
	oem.mutex.Unlock()

	log.Printf("[%s] 容器重新创建完成: %s", workspaceID, resp.ID)
	return nil
}

// 验证端口绑定是否生效
func (oem *OnlineEditorManager) verifyPortBindings(workspaceID string) error {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("检查容器信息失败: %v", err)
	}

	log.Printf("[%s] 验证端口绑定:", workspaceID)
	log.Printf("[%s] 容器状态: %s", workspaceID, containerInfo.State.Status)

	// 检查端口绑定
	if containerInfo.NetworkSettings != nil && containerInfo.NetworkSettings.Ports != nil {
		for containerPort, bindings := range containerInfo.NetworkSettings.Ports {
			log.Printf("[%s] 容器端口 %s:", workspaceID, containerPort)
			if len(bindings) > 0 {
				for _, binding := range bindings {
					log.Printf("[%s]   -> 宿主机 %s:%s", workspaceID, binding.HostIP, binding.HostPort)
				}
			} else {
				log.Printf("[%s]   -> 无宿主机绑定", workspaceID)
			}
		}
	} else {
		log.Printf("[%s] 无端口配置", workspaceID)
	}

	return nil
}

// 启动工作空间
func (oem *OnlineEditorManager) StartWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status == "running" {
		return fmt.Errorf("工作空间已在运行: %s", workspaceID)
	}

	ctx := context.Background()
	if err := oem.dockerClient.ContainerStart(ctx, workspace.ContainerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("启动容器失败: %v", err)
	}

	// 启动容器后更新端口映射信息
	if err := oem.updateWorkspacePorts(workspace); err != nil {
		log.Printf("更新端口映射失败: %v", err)
	}

	// 如果容器处于其他阶段，就不进行安装工具的处理
	if workspace.Status != "initializing" && workspace.Status != "pulling" && workspace.Status != "creating" && workspace.Status != "starting" {
		// 检查并安装必要的工具
		go func() {
			time.Sleep(5 * time.Second) // 等待容器完全启动
			if err := oem.installTools(workspaceID); err != nil {
				log.Printf("安装工具失败: %v", err)
			}
		}()
	}

	// 使用短锁更新状态
	oem.mutex.Lock()
	workspace.Status = "running"
	now := time.Now()
	workspace.Started = &now
	oem.mutex.Unlock()

	// 验证端口绑定
	if err := oem.verifyPortBindings(workspaceID); err != nil {
		log.Printf("[%s] 端口绑定验证失败: %v", workspaceID, err)
	}

	return nil
}

// 停止工作空间
func (oem *OnlineEditorManager) StopWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	ctx := context.Background()
	if err := oem.dockerClient.ContainerStop(ctx, workspace.ContainerID, container.StopOptions{}); err != nil {
		return fmt.Errorf("停止容器失败: %v", err)
	}

	// 使用短锁更新状态
	oem.mutex.Lock()
	workspace.Status = "stopped"
	workspace.Started = nil
	oem.mutex.Unlock()

	return nil
}

// 删除工作空间
func (oem *OnlineEditorManager) DeleteWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 释放端口
	for _, p := range workspace.Ports {
		if p.HostPort != "" {
			if hostPort, err := strconv.Atoi(p.HostPort); err == nil {
				oem.mutex.Lock()
				oem.releasePort(hostPort)
				oem.mutex.Unlock()
			}
		}
	}

	// 强制删除容器
	if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("删除容器失败: %v", err)
	}

	// 删除工作空间目录
	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	if err := os.RemoveAll(workspaceDir); err != nil {
		return fmt.Errorf("删除工作空间目录失败: %v", err)
	}

	// 最后从map中删除
	oem.mutex.Lock()
	delete(oem.workspaces, workspaceID)
	oem.mutex.Unlock()

	return nil
}

// 列出工作空间
func (oem *OnlineEditorManager) ListWorkspaces() ([]*Workspace, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	var workspaces []*Workspace
	for _, workspace := range oem.workspaces {
		// 创建工作空间的副本，避免并发访问问题
		workspaceCopy := *workspace
		workspaces = append(workspaces, &workspaceCopy)
	}

	return workspaces, nil
}

// 获取工作空间
func (oem *OnlineEditorManager) GetWorkspace(workspaceID string) (*Workspace, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 返回工作空间的副本，避免并发访问问题
	workspaceCopy := *workspace
	return &workspaceCopy, nil
}

// 文件系统操作

// 列出文件 - 使用主机文件系统
func (oem *OnlineEditorManager) ListFiles(workspaceID, path string) ([]FileInfo, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	// 允许在pending、creating、starting、initializing、running状态下访问
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return nil, fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)

	// 如果路径为空，使用根路径
	if path == "" {
		path = "."
	}

	fullPath := filepath.Join(workspaceDir, path)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return nil, fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查目录是否存在，如果不存在则创建
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// 尝试创建目录
		if err := os.MkdirAll(fullPath, 0755); err != nil {
			return nil, fmt.Errorf("目录不存在且创建失败: %s, 错误: %v", path, err)
		}
		// 创建成功后返回空文件列表
		return []FileInfo{}, nil
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, fmt.Errorf("读取目录失败: %v", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// 构建相对路径
		relativePath := entry.Name()
		if path != "." {
			relativePath = filepath.Join(path, entry.Name())
		}

		fileInfo := FileInfo{
			Name:         entry.Name(),
			Path:         relativePath,
			IsDir:        entry.IsDir(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime(),
			Permissions:  info.Mode().String(),
		}
		files = append(files, fileInfo)
	}

	return files, nil
}

// 读取文件 - 使用主机文件系统
func (oem *OnlineEditorManager) ReadFile(workspaceID, filePath string) (string, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return "", fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return "", fmt.Errorf("访问路径超出工作空间范围")
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %v", err)
	}

	return string(content), nil
}

// 写入文件 - 使用主机文件系统
func (oem *OnlineEditorManager) WriteFile(workspaceID, filePath, content string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 创建目录
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %v", err)
	}

	// 写入文件
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("写入文件失败: %v", err)
	}

	return nil
}

// 删除文件
func (oem *OnlineEditorManager) DeleteFile(workspaceID, filePath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	_, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	if err := os.RemoveAll(fullPath); err != nil {
		return fmt.Errorf("删除文件失败: %v", err)
	}

	return nil
}

// 创建文件
func (oem *OnlineEditorManager) CreateFile(workspaceID, filePath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查文件是否已存在
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("文件已存在: %s", filePath)
	}

	// 创建目录
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %v", err)
	}

	// 创建空文件
	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("创建文件失败: %v", err)
	}
	defer file.Close()

	return nil
}

// 创建文件夹
func (oem *OnlineEditorManager) CreateFolder(workspaceID, folderPath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, folderPath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查文件夹是否已存在
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("文件夹已存在: %s", folderPath)
	}

	// 创建文件夹
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return fmt.Errorf("创建文件夹失败: %v", err)
	}

	return nil
}

// 移动文件或文件夹
func (oem *OnlineEditorManager) MoveFile(workspaceID, sourcePath, targetPath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 如果工作空间未运行，返回错误
	if workspace.Status != "running" {
		return fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	sourceFullPath := filepath.Join(workspaceDir, sourcePath)
	targetFullPath := filepath.Join(workspaceDir, targetPath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(sourceFullPath, workspaceDir) || !strings.HasPrefix(targetFullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查源文件是否存在
	if _, err := os.Stat(sourceFullPath); os.IsNotExist(err) {
		return fmt.Errorf("源文件不存在: %s", sourcePath)
	}

	// 检查目标路径是否已存在
	if _, err := os.Stat(targetFullPath); err == nil {
		return fmt.Errorf("目标路径已存在: %s", targetPath)
	}

	// 创建目标目录
	targetDir := filepath.Dir(targetFullPath)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("创建目标目录失败: %v", err)
	}

	// 移动文件或文件夹
	if err := os.Rename(sourceFullPath, targetFullPath); err != nil {
		return fmt.Errorf("移动文件失败: %v", err)
	}

	return nil
}

// 终端操作

// 创建终端会话 - 优化版本，支持真正的交互式终端
func (oem *OnlineEditorManager) CreateTerminalSession(workspaceID string) (*TerminalSession, error) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return nil, fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	sessionID := generateTerminalID()

	session := &TerminalSession{
		ID:           sessionID,
		WorkspaceID:  workspaceID,
		Created:      time.Now(),
		LastActivity: time.Now(),
	}

	oem.terminalSessions[sessionID] = session

	return session, nil
}

// 执行命令
func (oem *OnlineEditorManager) ExecuteCommand(workspaceID string, command []string) (string, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return "", fmt.Errorf("工作空间未运行，当前状态: %s", workspace.Status)
	}

	ctx := context.Background()

	// 检查容器状态
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return "", fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		return "", fmt.Errorf("容器状态异常: %s", containerInfo.State.Status)
	}

	// 处理特殊命令，如cd等内置命令
	if len(command) > 0 {
		switch command[0] {
		case "cd":
			// cd命令需要特殊处理，因为它是shell内置命令
			if len(command) > 1 {
				// 使用shell来执行cd命令并获取新的工作目录
				shellCmd := fmt.Sprintf("cd %s && pwd", command[1])
				command = []string{"/bin/bash", "-c", shellCmd}
			} else {
				// cd without arguments - go to home directory
				command = []string{"/bin/bash", "-c", "cd ~ && pwd"}
			}
		case "pwd":
			// 确保pwd命令在正确的工作目录执行
			command = []string{"/bin/bash", "-c", "pwd"}
		case "ls", "ll":
			// 使用shell来执行ls命令以支持别名
			if len(command) == 1 {
				command = []string{"/bin/bash", "-c", command[0]}
			} else {
				shellCmd := fmt.Sprintf("%s %s", command[0], strings.Join(command[1:], " "))
				command = []string{"/bin/bash", "-c", shellCmd}
			}
		default:
			// 对于其他命令，如果只有一个参数且可能是复合命令，使用shell执行
			if len(command) == 1 && (strings.Contains(command[0], "&&") ||
				strings.Contains(command[0], "||") ||
				strings.Contains(command[0], "|") ||
				strings.Contains(command[0], ">") ||
				strings.Contains(command[0], "<")) {
				command = []string{"/bin/bash", "-c", command[0]}
			}
		}
	}

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	log.Printf("执行命令: %v in workspace %s", command, workspaceID)

	// 创建执行配置
	execConfig := container.ExecOptions{
		Cmd:          command,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  false,
		Tty:          false,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("执行命令失败: %v", err)
	}
	defer execAttachResp.Close()

	// 设置超时
	timeout := 30 * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 读取输出
	outputChan := make(chan []byte, 1)
	errorChan := make(chan error, 1)

	go func() {
		output, err := io.ReadAll(execAttachResp.Reader)
		if err != nil {
			errorChan <- err
		} else {
			outputChan <- output
		}
	}()

	select {
	case output := <-outputChan:
		// 过滤ASCII控制符
		cleanOutput := filterTerminalOutput(string(output))
		return cleanOutput, nil
	case err := <-errorChan:
		return "", fmt.Errorf("读取命令输出失败: %v", err)
	case <-ctx.Done():
		return "", fmt.Errorf("命令执行超时")
	}
}

// Git操作

// 克隆Git仓库
func (oem *OnlineEditorManager) cloneGitRepo(workspaceID, repo, branch string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()
	// 在容器内执行git clone
	execConfig := container.ExecOptions{
		Cmd:          []string{"git", "clone", "-b", branch, repo, "."},
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return fmt.Errorf("创建git clone执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("附加到git clone执行失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return fmt.Errorf("读取git clone输出失败: %v", err)
	}

	// 检查执行结果
	if len(output) > 0 {
		log.Printf("Git clone output: %s", string(output))
	}

	return nil
}

// Git操作
func (oem *OnlineEditorManager) GitOperation(workspaceID string, operation GitOperation) (string, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return "", fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	// 检查容器实际状态
	ctx := context.Background()
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return "", fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		return "", fmt.Errorf("容器未运行，当前状态: %s", containerInfo.State.Status)
	}

	var cmd []string
	switch operation.Type {
	case "clone":
		// 使用工作空间中保存的Git仓库信息进行克隆
		if workspace.GitRepo == "" {
			return "", fmt.Errorf("工作空间未配置Git仓库")
		}
		repo := operation.Repo
		branch := operation.Branch
		if repo == "" {
			repo = workspace.GitRepo
		}
		if branch == "" {
			branch = workspace.GitBranch
		}

		// 先清空工作空间目录，然后克隆
		cmd = []string{"/bin/sh", "-c", fmt.Sprintf("rm -rf /workspace/* /workspace/.* 2>/dev/null || true && git clone -b %s %s .", branch, repo)}
	case "status":
		cmd = []string{"git", "status"}
	case "add":
		if len(operation.Files) > 0 {
			cmd = append([]string{"git", "add"}, operation.Files...)
		} else {
			cmd = []string{"git", "add", "."}
		}
	case "commit":
		cmd = []string{"git", "commit", "-m", operation.Message}
	case "push":
		cmd = []string{"git", "push"}
	case "pull":
		cmd = []string{"git", "pull"}
	case "checkout":
		cmd = []string{"git", "checkout", operation.Branch}
	case "branch":
		cmd = []string{"git", "branch"}
	case "log":
		cmd = []string{"git", "log", "--oneline", "-10"}
	default:
		return "", fmt.Errorf("不支持的Git操作: %s", operation.Type)
	}

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 在容器内执行Git命令
	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建Git执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("附加到Git执行失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return "", fmt.Errorf("读取Git输出失败: %v", err)
	}

	return string(output), nil
}

// 安装必要的工具 - 优化版本
func (oem *OnlineEditorManager) installTools(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 检查容器是否在运行
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		log.Printf("容器未运行，跳过工具安装，当前状态: %s", containerInfo.State.Status)
		return nil
	}

	log.Printf("开始为工作空间 %s 初始化环境...", workspaceID)

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"set +H",
		"BASH_ENV=/dev/null",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 创建.bashrc文件以改善shell体验
	bashrcContent, err := scriptManager.GetScript("bashrc_tool_install")
	if err != nil {
		log.Printf("获取bashrc脚本失败: %v", err)
		return err
	}

	// 写入.bashrc文件
	createBashrcCmd := []string{"/bin/bash", "-c", fmt.Sprintf("echo '%s' > /root/.bashrc", bashrcContent)}
	execConfig := container.ExecOptions{
		Cmd:          createBashrcCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("创建.bashrc失败: %v", err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			execAttachResp.Close()
			log.Printf("已创建.bashrc配置文件")
		}
	}

	// 检查并安装必要的工具
	requiredTools := []string{"git", "curl", "wget", "vim", "nano"}
	missingTools := []string{}

	for _, tool := range requiredTools {
		checkCmd, _ := scriptManager.GetCommand("check_tool", tool)
		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
			Env:          envs,
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err == nil {
			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err == nil {
				output, _ := io.ReadAll(execAttachResp.Reader)
				execAttachResp.Close()
				if len(output) == 0 {
					missingTools = append(missingTools, tool)
				} else {
					log.Printf("工具 %s 已存在: %s", tool, strings.TrimSpace(string(output)))
				}
			}
		}
	}

	// 如果有缺失的工具，尝试安装
	if len(missingTools) > 0 {
		log.Printf("缺失工具: %v，尝试安装...", missingTools)

		// 尝试不同的包管理器
		tools := strings.Join(missingTools, " ")
		aptCmd, _ := scriptManager.GetCommand("install_apt", tools)
		yumCmd, _ := scriptManager.GetCommand("install_yum", tools)
		apkCmd, _ := scriptManager.GetCommand("install_apk", tools)
		dnfCmd, _ := scriptManager.GetCommand("install_dnf", tools)

		installCommands := [][]string{
			aptCmd,
			yumCmd,
			apkCmd,
			dnfCmd,
		}

		success := false
		for i, cmd := range installCommands {
			log.Printf("尝试安装命令 %d: %s", i+1, strings.Join(cmd, " "))

			installExecConfig := container.ExecOptions{
				Cmd:          cmd,
				AttachStdout: true,
				AttachStderr: true,
				WorkingDir:   "/workspace",
				Env:          envs,
			}

			execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
			if err != nil {
				log.Printf("创建安装命令失败: %v", err)
				continue
			}

			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err != nil {
				log.Printf("执行安装命令失败: %v", err)
				continue
			}

			// 读取安装输出
			output, err := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()

			if err == nil {
				log.Printf("安装输出: %s", string(output))
				success = true
				break
			}
		}

		if !success {
			log.Printf("警告: 无法安装工具，容器可能使用了不支持的包管理器")
		}
	}

	// 设置工作空间状态为完全初始化
	oem.mutex.Lock()
	if workspace.Status == "running" {
		// 工具安装完成，状态保持为running
		log.Printf("工作空间 %s 环境初始化完成", workspaceID)
	}
	oem.mutex.Unlock()

	return nil
}

// 清理冲突的容器
func (oem *OnlineEditorManager) cleanupConflictingContainers() error {
	ctx := context.Background()
	containers, err := oem.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return fmt.Errorf("获取容器列表失败: %v", err)
	}

	for _, cont := range containers {
		// 检查是否是我们的工作空间容器
		if strings.HasPrefix(cont.Names[0], "/ws_") {
			// 检查容器状态
			if cont.State == "exited" || cont.State == "dead" {
				log.Printf("清理已停止的工作空间容器: %s", cont.ID)
				oem.dockerClient.ContainerRemove(ctx, cont.ID, container.RemoveOptions{Force: true})
			}
		}
	}

	return nil
}

// HTTP服务器

// 启动HTTP服务器
func (oem *OnlineEditorManager) StartServer(port int) error {
	router := mux.NewRouter()

	// CORS中间件
	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 设置CORS头
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			// 处理预检请求
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// 应用CORS中间件
	router.Use(corsMiddleware)

	// API路由
	api := router.PathPrefix("/api/v1").Subrouter()

	// 工作空间管理
	api.HandleFunc("/workspaces", oem.handleListWorkspaces).Methods("GET")
	api.HandleFunc("/workspaces", oem.handleCreateWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}", oem.handleGetWorkspace).Methods("GET")
	api.HandleFunc("/workspaces/{id}/start", oem.handleStartWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}/stop", oem.handleStopWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}", oem.handleDeleteWorkspace).Methods("DELETE")

	// 文件系统
	api.HandleFunc("/workspaces/{id}/files", oem.handleListFiles).Methods("GET")
	api.HandleFunc("/workspaces/{id}/files/read", oem.handleReadFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/write", oem.handleWriteFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/create", oem.handleCreateFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/mkdir", oem.handleCreateFolder).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/move", oem.handleMoveFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/delete", oem.handleDeleteFile).Methods("POST")

	// 终端
	api.HandleFunc("/workspaces/{id}/terminal", oem.handleCreateTerminal).Methods("POST")
	api.HandleFunc("/workspaces/{id}/terminal/{sessionId}/ws", oem.handleTerminalWebSocket).Methods("GET")

	// 命令执行
	api.HandleFunc("/workspaces/{id}/exec", oem.handleExecuteCommand).Methods("POST")

	// Git操作
	api.HandleFunc("/workspaces/{id}/git", oem.handleGitOperation).Methods("POST")

	// 镜像管理
	api.HandleFunc("/images", oem.handleListImages).Methods("GET")
	api.HandleFunc("/images/{imageName}", oem.handlePullImage).Methods("POST")
	api.HandleFunc("/images/{imageId}", oem.handleDeleteImage).Methods("DELETE")

	// 容器状态监控
	api.HandleFunc("/containers/{containerId}/status", oem.handleGetContainerStatus).Methods("GET")
	api.HandleFunc("/containers/{containerId}/stats", oem.handleGetContainerStats).Methods("GET")

	// IP池管理
	api.HandleFunc("/network/ip-pool/stats", oem.handleGetIPPoolStats).Methods("GET")
	api.HandleFunc("/network/ip-pool/allocations", oem.handleGetIPAllocations).Methods("GET")

	// 端口访问管理
	api.HandleFunc("/workspaces/{id}/ports/check", oem.handleCheckPorts).Methods("POST")
	api.HandleFunc("/workspaces/{id}/ports/status", oem.handleGetPortStatus).Methods("GET")
	api.HandleFunc("/workspaces/{id}/ports", oem.handleUpdatePortBindings).Methods("PUT")

	// 工作空间收藏
	api.HandleFunc("/workspaces/{id}/favorite", oem.handleToggleFavorite).Methods("POST")

	// 端口测试
	api.HandleFunc("/workspaces/{id}/test-port/{port}", oem.handleTestPort).Methods("POST")

	// 静态文件服务
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))

	log.Printf("在线代码编辑器服务器启动在端口 %d", port)
	return http.ListenAndServe(fmt.Sprintf(":%d", port), router)
}

// HTTP处理器

func (oem *OnlineEditorManager) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := oem.ListWorkspaces()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(workspaces)
}

func (oem *OnlineEditorManager) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string        `json:"name"`
		Image     string        `json:"image"`
		GitRepo   string        `json:"git_repo"`
		GitBranch string        `json:"git_branch"`
		Ports     []PortMapping `json:"ports"`
		Tools     []string      `json:"tools"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	workspace, err := oem.CreateWorkspace(req.Name, req.Image, req.GitRepo, req.GitBranch, req.Ports, req.Tools)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(workspace)
}

func (oem *OnlineEditorManager) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	workspace, err := oem.GetWorkspace(workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(workspace)
}

func (oem *OnlineEditorManager) handleStartWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.StartWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleStopWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.StopWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.DeleteWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleListFiles(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	path := r.URL.Query().Get("path")

	files, err := oem.ListFiles(workspaceID, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if files == nil {
		files = []FileInfo{}
	}
	json.NewEncoder(w).Encode(files)
}

func (oem *OnlineEditorManager) handleReadFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	content, err := oem.ReadFile(workspaceID, req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 确保返回纯字符串格式，而不是JSON格式
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// 直接写入内容，不使用任何JSON编码
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(content))
}

func (oem *OnlineEditorManager) handleWriteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.WriteFile(workspaceID, req.Path, req.Content); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.DeleteFile(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.CreateFile(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件夹路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.CreateFolder(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleMoveFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		SourcePath string `json:"source_path"`
		TargetPath string `json:"target_path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.SourcePath == "" || req.TargetPath == "" {
		http.Error(w, "缺少源路径或目标路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.MoveFile(workspaceID, req.SourcePath, req.TargetPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateTerminal(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	session, err := oem.CreateTerminalSession(workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(session)
}

// 优化的终端WebSocket处理器 - 支持真正的交互式终端
func (oem *OnlineEditorManager) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	sessionID := vars["sessionId"]

	log.Printf("[Terminal] 创建终端会话: %s for workspace: %s", sessionID, workspaceID)

	// 升级到WebSocket
	conn, err := oem.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket升级失败: %v", err)
		return
	}
	defer conn.Close()

	// 获取终端会话
	oem.mutex.RLock()
	session, exists := oem.terminalSessions[sessionID]
	workspace, workspaceExists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists || session.WorkspaceID != workspaceID {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\n❌ 终端会话不存在\r\n"))
		return
	}

	if !workspaceExists || workspace.Status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\n❌ 工作空间未运行\r\n"))
		return
	}

	session.WebSocket = conn
	session.LastActivity = time.Now()

	// 创建交互式终端
	ctx := context.Background()

	// 获取镜像配置中的Shell信息
	defaultShell := "/bin/bash"
	if imageConfig, exists := preloadedImages[workspace.Image]; exists {
		if shell, ok := imageConfig["shell"].(string); ok {
			defaultShell = shell
		}
	}

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		fmt.Sprintf("SHELL=%s", defaultShell),
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"TZ=Asia/Shanghai",
		// 重要：禁用历史扩展以避免提示符重复
		"set +H",
		// 禁用括号粘贴模式
		"BASH_ENV=/dev/null",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 获取终端初始化脚本
	initScript, err := scriptManager.GetScript("terminal_init")
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 获取终端脚本失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}

	// 创建Exec配置
	execConfig := container.ExecOptions{
		Cmd:          []string{"/bin/bash", "-c", initScript},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	log.Printf("[Terminal] 创建容器Exec配置")
	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 创建终端失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}

	log.Printf("[Terminal] 附加到容器Exec")
	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 附加到终端失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}
	defer execAttachResp.Close()

	// 设置WebSocket超时
	conn.SetReadDeadline(time.Now().Add(60 * time.Minute))
	conn.SetWriteDeadline(time.Now().Add(30 * time.Second))

	// 用于同步关闭
	done := make(chan struct{})

	// 从容器读取输出并转发到WebSocket
	go func() {
		defer close(done)
		buffer := make([]byte, 1024)

		for {
			n, err := execAttachResp.Reader.Read(buffer)
			if err != nil {
				if err == io.EOF {
					log.Printf("[Terminal] 容器输出流结束")
				} else if strings.Contains(err.Error(), "use of closed network connection") {
					log.Printf("[Terminal] Docker连接已关闭")
				} else {
					log.Printf("[Terminal] 读取容器输出失败: %v", err)
				}
				break
			}

			if n > 0 {
				// 重置写入超时
				conn.SetWriteDeadline(time.Now().Add(30 * time.Second))

				// 获取实际数据
				actualData := buffer[:n]

				// 基本UTF-8验证，确保数据有效
				text := string(actualData)
				if !utf8.ValidString(text) {
					text = strings.ToValidUTF8(text, "")
					if len(text) == 0 {
						continue // 跳过无效数据
					}
				}

				// 极简过滤：只移除明确有害的控制序列，保留所有bash输出
				// 移除括号粘贴模式控制序列（这些会干扰终端显示）
				filtered := strings.ReplaceAll(text, "\x1b[?2004h", "")
				filtered = strings.ReplaceAll(filtered, "\x1b[?2004l", "")

				// 直接发送到WebSocket，让前端完全按照后端的输出显示
				if err := conn.WriteMessage(websocket.TextMessage, []byte(filtered)); err != nil {
					log.Printf("[Terminal] 发送数据到WebSocket失败: %v", err)
					break
				}

				// 更新活动时间
				session.LastActivity = time.Now()
			}
		}
	}()

	// 从WebSocket读取输入并转发到容器
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				// 重置读取超时
				conn.SetReadDeadline(time.Now().Add(60 * time.Minute))

				_, message, err := conn.ReadMessage()
				if err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
						log.Printf("[Terminal] WebSocket读取失败: %v", err)
					} else if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						log.Printf("[Terminal] WebSocket正常关闭: %v", err)
					} else {
						log.Printf("[Terminal] WebSocket读取错误: %v", err)
					}
					log.Printf("退出循环")
					return
				}

				// 处理特殊键序列
				if len(message) > 0 {
					// 完整的ASCII码分析和转换

					// 写入到容器终端
					if _, err := execAttachResp.Conn.Write(message); err != nil {
						log.Printf("[Terminal] 写入容器失败: %v", err)
						return
					}

					// 更新活动时间
					session.LastActivity = time.Now()
				}
			}
		}
	}()

	// 等待任一协程结束
	<-done

	log.Printf("[Terminal] 终端会话结束: %s", sessionID)

	// 清理会话
	oem.mutex.Lock()
	delete(oem.terminalSessions, sessionID)
	oem.mutex.Unlock()
}

func (oem *OnlineEditorManager) handleExecuteCommand(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Command []string `json:"command"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	output, err := oem.ExecuteCommand(workspaceID, req.Command)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"output": output})
}

func (oem *OnlineEditorManager) handleGitOperation(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var operation GitOperation
	if err := json.NewDecoder(r.Body).Decode(&operation); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	output, err := oem.GitOperation(workspaceID, operation)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"output": output})
}

func (oem *OnlineEditorManager) handleListImages(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	images, err := oem.dockerClient.ImageList(ctx, imageTypes.ListOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("获取镜像列表失败: %v", err), http.StatusInternalServerError)
		return
	}

	var imageList []map[string]interface{}
	for _, image := range images {
		// 获取镜像详细信息
		imageInfo, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, image.ID)
		if err != nil {
			continue
		}

		// 获取镜像标签
		var tags []string
		if len(image.RepoTags) > 0 {
			tags = image.RepoTags
		} else {
			tags = []string{image.ID[:12]} // 使用短ID作为标签
		}

		imageList = append(imageList, map[string]interface{}{
			"id":           image.ID,
			"tags":         tags,
			"size":         image.Size,
			"created":      image.Created,
			"architecture": imageInfo.Architecture,
			"os":           imageInfo.Os,
		})
	}

	json.NewEncoder(w).Encode(imageList)
}

func (oem *OnlineEditorManager) handlePullImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageName := vars["imageName"]

	if err := oem.PullImage(imageName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageID := vars["imageId"]

	if err := oem.DeleteImage(imageID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleGetContainerStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	containerID := vars["containerId"]

	status, err := oem.GetContainerStatus(containerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": status})
}

func (oem *OnlineEditorManager) handleGetContainerStats(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	containerID := vars["containerId"]

	stats, err := oem.GetContainerStats(containerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(stats)
}

func (oem *OnlineEditorManager) handleGetIPPoolStats(w http.ResponseWriter, r *http.Request) {
	// IP池功能已移除，返回简化的网络统计
	stats := map[string]interface{}{
		"message": "IP池功能已移除，现在使用简化的端口绑定模式",
		"mode":    "port_binding",
	}
	json.NewEncoder(w).Encode(stats)
}

func (oem *OnlineEditorManager) handleGetIPAllocations(w http.ResponseWriter, r *http.Request) {
	// IP分配功能已移除
	allocations := []map[string]interface{}{
		{
			"message": "IP分配功能已移除，现在使用默认Docker网络",
			"mode":    "port_binding",
		},
	}
	json.NewEncoder(w).Encode(allocations)
}

func (oem *OnlineEditorManager) handleToggleFavorite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.Lock()
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		oem.mutex.Unlock()
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	// 切换收藏状态
	workspace.IsFavorite = !workspace.IsFavorite
	oem.mutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":          workspaceID,
		"is_favorite": workspace.IsFavorite,
		"message":     fmt.Sprintf("工作空间已%s", map[bool]string{true: "收藏", false: "取消收藏"}[workspace.IsFavorite]),
	})
}

func (oem *OnlineEditorManager) handleTestPort(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	port := vars["port"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	if workspace.Status != "running" {
		http.Error(w, "工作空间未运行", http.StatusBadRequest)
		return
	}

	// 在容器内启动一个简单的HTTP服务器进行测试
	testCmd, err := scriptManager.FormatScript("port_test_server", port, port, port, port, port, port)
	if err != nil {
		http.Error(w, fmt.Sprintf("获取测试脚本失败: %v", err), http.StatusInternalServerError)
		return
	}

	output, err := oem.ExecuteCommand(workspaceID, []string{"/bin/bash", "-c", testCmd})
	if err != nil {
		http.Error(w, fmt.Sprintf("启动测试服务器失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  fmt.Sprintf("端口 %s 测试服务器启动命令已执行", port),
		"output":   output,
		"test_url": fmt.Sprintf("http://localhost:%s", port),
		"note":     "请等待几秒钟让服务器完全启动，然后访问测试URL",
	})
}

func (oem *OnlineEditorManager) handleCheckPorts(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	if workspace.Status != "running" {
		http.Error(w, "工作空间未运行", http.StatusBadRequest)
		return
	}

	// 异步检查端口状态
	go func() {
		oem.checkPortAvailability(workspace)
	}()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "checking"})
}

func (oem *OnlineEditorManager) handleGetPortStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"workspace_ip": workspace.NetworkIP,
		"access_urls":  workspace.AccessURLs,
		"ports":        workspace.Ports,
	})
}

func (oem *OnlineEditorManager) handleUpdatePortBindings(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Ports []PortMapping `json:"ports"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	oem.mutex.Lock()
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		oem.mutex.Unlock()
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	// 更新端口配置
	workspace.Ports = req.Ports
	wasRunning := workspace.Status == "running"
	oem.mutex.Unlock()

	// 如果工作空间正在运行，重启容器以应用新的端口配置
	if wasRunning {
		log.Printf("[%s] 端口配置已更新，重启容器以应用新配置", workspaceID)

		// 停止容器
		if err := oem.StopWorkspace(workspaceID); err != nil {
			log.Printf("[%s] 停止容器失败: %v", workspaceID, err)
			http.Error(w, "停止容器失败: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// 删除旧容器
		ctx := context.Background()
		if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
			log.Printf("[%s] 删除旧容器失败: %v", workspaceID, err)
		}

		// 重新创建并启动容器
		go func() {
			time.Sleep(2 * time.Second) // 等待容器完全停止

			// 重新初始化容器
			if err := oem.recreateContainer(workspace); err != nil {
				log.Printf("[%s] 重新创建容器失败: %v", workspaceID, err)
				oem.mutex.Lock()
				workspace.Status = "failed"
				oem.mutex.Unlock()
				return
			}

			// 启动容器
			if err := oem.StartWorkspace(workspaceID); err != nil {
				log.Printf("[%s] 启动容器失败: %v", workspaceID, err)
				oem.mutex.Lock()
				workspace.Status = "failed"
				oem.mutex.Unlock()
			} else {
				log.Printf("[%s] 容器重启完成，端口配置已应用", workspaceID)
			}
		}()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "端口配置已更新",
		"ports":      workspace.Ports,
		"restarting": wasRunning,
		"note":       "容器正在重启以应用新的端口配置",
	})
}

// 镜像管理相关方法
func (oem *OnlineEditorManager) PullImage(imageName string) error {
	ctx := context.Background()
	out, err := oem.dockerClient.ImagePull(ctx, imageName, imageTypes.PullOptions{})
	if err != nil {
		return fmt.Errorf("拉取镜像失败: %v", err)
	}
	defer out.Close()
	io.Copy(io.Discard, out)
	return nil
}

func (oem *OnlineEditorManager) DeleteImage(imageID string) error {
	ctx := context.Background()
	_, err := oem.dockerClient.ImageRemove(ctx, imageID, imageTypes.RemoveOptions{})
	if err != nil {
		return fmt.Errorf("删除镜像失败: %v", err)
	}
	return nil
}

// 容器状态监控
func (oem *OnlineEditorManager) GetContainerStatus(containerID string) (string, error) {
	ctx := context.Background()
	container, err := oem.dockerClient.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", fmt.Errorf("获取容器状态失败: %v", err)
	}
	return container.State.Status, nil
}

// 更新工作空间的端口映射信息
func (oem *OnlineEditorManager) updateWorkspacePorts(workspace *Workspace) error {
	ctx := context.Background()
	container, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("获取容器信息失败: %v", err)
	}

	// 更新端口映射信息
	for i := range workspace.Ports {
		containerPort := nat.Port(fmt.Sprintf("%s/%s", workspace.Ports[i].ContainerPort, workspace.Ports[i].Protocol))
		if bindings, exists := container.NetworkSettings.Ports[containerPort]; exists && len(bindings) > 0 {
			workspace.Ports[i].HostPort = bindings[0].HostPort
		}
	}

	return nil
}

func (oem *OnlineEditorManager) UpdateWorkspaceStatus(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	status, err := oem.GetContainerStatus(workspace.ContainerID)
	if err != nil {
		return err
	}

	workspace.Status = status
	return nil
}

// 获取容器资源使用情况
func (oem *OnlineEditorManager) GetContainerStats(containerID string) (map[string]interface{}, error) {
	ctx := context.Background()
	stats, err := oem.dockerClient.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, fmt.Errorf("获取容器统计信息失败: %v", err)
	}
	defer stats.Body.Close()

	var containerStats container.Stats
	if err := json.NewDecoder(stats.Body).Decode(&containerStats); err != nil {
		return nil, fmt.Errorf("解析容器统计信息失败: %v", err)
	}

	// 计算CPU使用率
	cpuDelta := containerStats.CPUStats.CPUUsage.TotalUsage - containerStats.PreCPUStats.CPUUsage.TotalUsage
	systemDelta := containerStats.CPUStats.SystemUsage - containerStats.PreCPUStats.SystemUsage
	cpuUsage := float64(cpuDelta) / float64(systemDelta) * 100
	// 计算内存使用率
	memoryUsage := float64(containerStats.MemoryStats.Usage) / float64(containerStats.MemoryStats.Limit) * 100

	return map[string]interface{}{
		"cpu_usage":    cpuUsage,
		"memory_usage": memoryUsage,
		"memory_limit": containerStats.MemoryStats.Limit,
		"memory_used":  containerStats.MemoryStats.Usage,
	}, nil
}

// 优化错误处理和日志记录
func (oem *OnlineEditorManager) logError(operation string, err error) {
	log.Printf("[ERROR] %s 失败: %v", operation, err)
}

func (oem *OnlineEditorManager) logInfo(operation string, details ...interface{}) {
	log.Printf("[INFO] %s: %v", operation, details)
}

// 添加健康检查
func (oem *OnlineEditorManager) HealthCheck() error {
	ctx := context.Background()
	_, err := oem.dockerClient.Ping(ctx)
	if err != nil {
		return fmt.Errorf("Docker 连接失败: %v", err)
	}
	return nil
}

// 清理过期的工作空间
func (oem *OnlineEditorManager) CleanupExpiredWorkspaces(maxAge time.Duration) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	now := time.Now()
	for workspaceID, workspace := range oem.workspaces {
		if now.Sub(workspace.Created) > maxAge {
			oem.logInfo("清理过期工作空间", workspaceID)
			// 删除容器
			ctx := context.Background()
			if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
				oem.logError("删除过期容器", err)
			}
			// 删除本地目录
			workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
			if err := os.RemoveAll(workspaceDir); err != nil {
				oem.logError("删除过期工作空间目录", err)
			}
			delete(oem.workspaces, workspaceID)
		}
	}
}

// 启动定期清理任务
func (oem *OnlineEditorManager) StartCleanupTask() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour) // 每小时清理一次
		defer ticker.Stop()

		for range ticker.C {
			oem.CleanupExpiredWorkspaces(24 * time.Hour) // 清理超过24的工作空间
		}
	}()
}

// 检查工作空间状态（线程安全）
func (oem *OnlineEditorManager) GetWorkspaceStatus(workspaceID string) (string, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	return workspace.Status, nil
}

// 检查工作空间是否存在（线程安全）
func (oem *OnlineEditorManager) WorkspaceExists(workspaceID string) bool {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	_, exists := oem.workspaces[workspaceID]
	return exists
}

// 主函数
func main() {
	// 创建在线编辑器管理器
	manager, err := NewOnlineEditorManager()
	if err != nil {
		log.Fatalf("创建在线编辑器管理器失败: %v", err)
	}

	// 健康检查
	if err := manager.HealthCheck(); err != nil {
		log.Fatalf("Docker 健康检查失败: %v", err)
	}
	log.Println("Docker 连接正常")

	// 启动定期清理任务
	manager.StartCleanupTask()
	log.Println("定期清理任务已启动")

	// 启动HTTP服务器
	port := 8080
	log.Printf("在线代码编辑器服务器启动在端口 %d", port)
	log.Println("API 文档:")
	log.Println("  工作空间管理:")
	log.Println("    GET    /api/v1/workspaces - 列出工作空间")
	log.Println("    POST   /api/v1/workspaces - 创建工作空间")
	log.Println("    GET    /api/v1/workspaces/{id} - 获取工作空间详情")
	log.Println("    POST   /api/v1/workspaces/{id}/start - 启动工作空间")
	log.Println("    POST   /api/v1/workspaces/{id}/stop - 停止工作空间")
	log.Println("    DELETE /api/v1/workspaces/{id} - 删除工作空间")
	log.Println("  文件系统:")
	log.Println("    GET    /api/v1/workspaces/{id}/files - 列出文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/read - 读取文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/write - 写入文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/delete - 删除文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/create - 创建文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/mkdir - 创建文件夹")
	log.Println("    POST   /api/v1/workspaces/{id}/files/move - 移动文件")
	log.Println("  终端和命令:")
	log.Println("    POST   /api/v1/workspaces/{id}/terminal - 创建终端")
	log.Println("    GET    /api/v1/workspaces/{id}/terminal/{sessionId}/ws - 终端WebSocket")
	log.Println("    POST   /api/v1/workspaces/{id}/exec - 执行命令")
	log.Println("  Git操作:")
	log.Println("    POST   /api/v1/workspaces/{id}/git - Git操作")
	log.Println("  镜像管理:")
	log.Println("    GET    /api/v1/images - 列出镜像")
	log.Println("    POST   /api/v1/images/{imageName} - 拉取镜像")
	log.Println("    DELETE /api/v1/images/{imageId} - 删除镜像")
	log.Println("  容器监控:")
	log.Println("    GET    /api/v1/containers/{containerId}/status - 获取容器状态")
	log.Println("    GET    /api/v1/containers/{containerId}/stats - 获取容器统计")
	log.Println("  网络管理:")
	log.Println("    GET    /api/v1/network/ip-pool/stats - 获取IP池统计")
	log.Println("    GET    /api/v1/network/ip-pool/allocations - 获取IP分配信息")

	if err := manager.StartServer(port); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}
