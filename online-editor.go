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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	imageTypes "github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/go-connections/nat"
	"github.com/docker/docker/client"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// 在线代码编辑器后端系统
// 支持容器化、文件系统、终端、端口转发、镜像管理、Git操作

// 类型定义
type Workspace struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
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
	Type    string `json:"type"`    // clone, pull, push, commit, checkout
	Repo    string `json:"repo"`
	Branch  string `json:"branch"`
	Message string `json:"message"`
	Files   []string `json:"files"`
}

// 在线编辑器管理器
type OnlineEditorManager struct {
	workspaces      map[string]*Workspace
	terminalSessions map[string]*TerminalSession
	mutex           sync.RWMutex
	baseDir         string
	workspacesDir   string
	imagesDir       string
	upgrader        websocket.Upgrader

	dockerClient    *client.Client // 新增 Docker 客户端
	networkName     string         // 工作空间网络名称
	nextIP          int            // 下一个可用IP
	portPool        map[int]bool   // 端口池管理
}

// 预加载的镜像配置 - 仅提供基础开发环境
var preloadedImages = map[string]map[string]interface{}{
	"node:18-alpine": {
		"description": "Node.js 18 开发环境",
		"env": map[string]string{
			"NODE_ENV": "development",
		},
	},
	"python:3.11-slim": {
		"description": "Python 3.11 开发环境",
		"env": map[string]string{
			"PYTHONPATH": "/workspace",
		},
	},
	"golang:1.23.1": {
		"description": "Go 1.23 开发环境",
		"env": map[string]string{
			"GOPATH": "/go",
			"GOROOT": "/usr/local/go",
		},
	},
	"openjdk:18-jdk-slim": {
		"description": "Java 18 开发环境",
		"env": map[string]string{
			"JAVA_HOME": "/usr/lib/jvm/java-18-openjdk",
		},
	},
	"php:8.2-apache": {
		"description": "PHP 8.2 + Apache 开发环境",
		"env": map[string]string{
			"PHP_INI_DIR": "/usr/local/etc/php",
		},
	},
}

// 创建在线编辑器管理器
func NewOnlineEditorManager() (*OnlineEditorManager, error) {
	baseDir := "/tmp/online-editor"
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

	// 创建或获取工作空间网络
	networkName := "workspace-network"
	ctx := context.Background()
	
	// 检查网络是否存在
	networks, err := dockerCli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("获取网络列表失败: %v", err)
	}

	networkExists := false
	for _, net := range networks {
		if net.Name == networkName {
			networkExists = true
			break
		}
	}

	// 如果网络不存在，创建它
	if !networkExists {
		_, err = dockerCli.NetworkCreate(ctx, networkName, network.CreateOptions{
			Driver: "bridge",
			IPAM: &network.IPAM{
				Config: []network.IPAMConfig{
					{
						Subnet:  "172.20.0.0/16",
						Gateway: "172.20.0.1",
					},
				},
			},
		})
		if err != nil {
			return nil, fmt.Errorf("创建工作空间网络失败: %v", err)
		}
		log.Printf("创建工作空间网络: %s", networkName)
	} else {
		log.Printf("使用现有工作空间网络: %s", networkName)
	}

	return &OnlineEditorManager{
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
		nextIP:       10, // 从 172.20.0.10 开始分配
		portPool: make(map[int]bool),
	}, nil
}

// 生成工作空间ID
func generateWorkspaceID() string {
	return fmt.Sprintf("ws_%d", time.Now().UnixNano())
}

// 生成终端会话ID
func generateTerminalID() string {
	return fmt.Sprintf("term_%d", time.Now().UnixNano())
}

// 分配下一个可用IP
func (oem *OnlineEditorManager) allocateIP() string {
	// 调用者必须持有锁
	ip := "172.20.0." +  strconv.Itoa(oem.nextIP);
	oem.nextIP++
	log.Printf("分配IP地址: %s", ip)
	return ip
}

// 检查端口是否可用
func (oem *OnlineEditorManager) isPortAvailable(port int) bool {
	// 调用者必须持有锁
	return !oem.portPool[port]
}

// 分配端口
func (oem *OnlineEditorManager) allocatePort(port int) bool {
	// 调用者必须持有锁
	if oem.portPool[port] {
		return false
	}
	oem.portPool[port] = true
	return true
}

// 释放端口
func (oem *OnlineEditorManager) releasePort(port int) {
	// 调用者必须持有锁
	delete(oem.portPool, port)
}

// 创建工作空间
func (oem *OnlineEditorManager) CreateWorkspace(name, images, gitRepo, gitBranch string, customPorts []PortMapping) (*Workspace, error) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspaceID := generateWorkspaceID()
	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)

	// 创建工作空间目录
	if err := os.MkdirAll(workspaceDir, 0755); err != nil {
		return nil, fmt.Errorf("创建工作空间目录失败: %v", err)
	}

	// 获取镜像配置
	log.Printf("请求的镜像: '%s'", images)
	log.Printf("支持的镜像列表:")
	for k := range preloadedImages {
		log.Printf("  - '%s'", k)
	}
	imageConfig, exists := preloadedImages[images]
	if !exists {
		return nil, fmt.Errorf("不支持的镜像: %s", images)
	}
	log.Printf("镜像配置: %v", imageConfig)
	
	// 拉取镜像（如果本地没有）
	ctx := context.Background()
	_, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, images)
	if err != nil {
		// 镜像不存在则拉取
		log.Printf("拉取镜像: %s", images)
		out, err := oem.dockerClient.ImagePull(ctx, images, imageTypes.PullOptions{})
		if err != nil {
			return nil, fmt.Errorf("拉取镜像失败: %v", err)
		}
		defer out.Close()
		io.Copy(io.Discard, out) // 拉取完毕
	}
	log.Printf("镜像拉取完成: %s", images)
	
	// 设置环境变量
	envs := []string{}
	if env, ok := imageConfig["env"].(map[string]string); ok {
		for k, v := range env {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}
	
	// 添加基础环境变量
	baseEnvs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
	}
	envs = append(envs, baseEnvs...)
	
	log.Printf("环境变量: %v", envs)
	
	// 容器挂载卷 - 确保工作空间目录正确挂载
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
	log.Printf("挂载卷: %v", mounts)
	
	// 清理可能冲突的容器
	if err := oem.cleanupConflictingContainers(); err != nil {
		log.Printf("清理冲突容器失败: %v", err)
	}
	
	// 创建容器
	containerConfig := &container.Config{
		Image:        images,
		Env:          envs,
		Tty:          true,
		OpenStdin:    true,
		ExposedPorts: nat.PortSet{},
		WorkingDir:   "/workspace",
		// 使用tail命令保持容器运行
		Cmd: []string{"tail", "-f", "/dev/null"},
	}
	
	hostConfig := &container.HostConfig{
		Mounts: mounts,
		// 确保容器有足够的权限
		Privileged: false,
	}
	
	networkingConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			oem.networkName: {
				// 让Docker自动分配IP，避免冲突
			},
		},
	}
	
	log.Printf("创建容器: %v", containerConfig)
	resp, err := oem.dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("创建容器失败: %v", err)
	}
	log.Printf("容器创建完成: %v", resp)
	
	// 启动容器
	if err := oem.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		// 如果启动失败，清理容器
		log.Printf("容器启动失败，清理容器: %v", err)
		oem.dockerClient.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return nil, fmt.Errorf("启动容器失败: %v", err)
	}
	log.Printf("容器启动成功: %s", resp.ID)
	
	// 等待容器真正运行
	time.Sleep(2 * time.Second)
	
	// 检查容器状态
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, resp.ID)
	if err != nil {
		log.Printf("检查容器状态失败: %v", err)
	} else {
		log.Printf("容器状态: %s", containerInfo.State.Status)
		if containerInfo.State.Status != "running" {
			return nil, fmt.Errorf("容器启动后状态异常: %s", containerInfo.State.Status)
		}
	}
	
	// 检查并安装必要的工具
	go func() {
		time.Sleep(5 * time.Second) // 等待容器完全启动
		if err := oem.installTools(workspaceID); err != nil {
			log.Printf("安装工具失败: %v", err)
		}
	}()
	
	// 创建工作空间对象
	workspace := &Workspace{
		ID:          workspaceID,
		Name:        name,
		Image:       images,
		Status:      "running", // 容器已启动，状态设为running
		Created:     time.Now(),
		Started:     &[]time.Time{time.Now()}[0], // 设置启动时间
		GitRepo:     gitRepo,
		GitBranch:   gitBranch,
		Environment: make(map[string]string),
		ContainerID: resp.ID,
		NetworkName: oem.networkName,
	}

	// 设置端口映射 - 完全由用户自定义
	workspace.Ports = customPorts

	// 设置默认卷挂载 - 工作空间目录
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

	oem.workspaces[workspaceID] = workspace

	// 保存Git仓库信息到工作空间，供用户手动克隆
	if gitRepo != "" {
		workspace.GitRepo = gitRepo
		workspace.GitBranch = gitBranch
		log.Printf("Git仓库信息已保存，用户可手动克隆: %s", gitRepo)
	}

	return workspace, nil
}

// 启动工作空间
func (oem *OnlineEditorManager) StartWorkspace(workspaceID string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
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

	// 检查并安装必要的工具
	go func() {
		time.Sleep(5 * time.Second) // 等待容器完全启动
		if err := oem.installTools(workspaceID); err != nil {
			log.Printf("安装工具失败: %v", err)
		}
	}()

	workspace.Status = "running"
	now := time.Now()
	workspace.Started = &now

	return nil
}

// 停止工作空间
func (oem *OnlineEditorManager) StopWorkspace(workspaceID string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
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

	workspace.Status = "stopped"
	workspace.Started = nil

	return nil
}

// 删除工作空间
func (oem *OnlineEditorManager) DeleteWorkspace(workspaceID string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()
	
	// 释放端口
	for _, p := range workspace.Ports {
		if p.HostPort != "" {
			if hostPort, err := strconv.Atoi(p.HostPort); err == nil {
				oem.releasePort(hostPort)
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

	delete(oem.workspaces, workspaceID)

	return nil
}

// 列出工作空间
func (oem *OnlineEditorManager) ListWorkspaces() ([]*Workspace, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	var workspaces []*Workspace
	for _, workspace := range oem.workspaces {
		workspaces = append(workspaces, workspace)
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

	return workspace, nil
}

// 文件系统操作

// 列出文件
func (oem *OnlineEditorManager) ListFiles(workspaceID, path string) ([]FileInfo, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	_, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, path)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return nil, fmt.Errorf("访问路径超出工作空间范围")
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

		fileInfo := FileInfo{
			Name:         entry.Name(),
			Path:         filepath.Join(path, entry.Name()),
			IsDir:        entry.IsDir(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime(),
			Permissions:  info.Mode().String(),
		}
		files = append(files, fileInfo)
	}

	return files, nil
}

// 读取文件
func (oem *OnlineEditorManager) ReadFile(workspaceID, filePath string) (string, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	_, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
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

// 写入文件
func (oem *OnlineEditorManager) WriteFile(workspaceID, filePath, content string) error {
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

// 终端操作

// 创建终端会话
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
		return "", fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	ctx := context.Background()
	
	// 检查容器状态
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return "", fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		return "", fmt.Errorf("容器未运行，当前状态: %s", containerInfo.State.Status)
	}

	log.Printf("执行命令: %v", command)
	
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
	
	execConfig := container.ExecOptions{
		Cmd:          command,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建命令失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("执行命令失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return "", fmt.Errorf("读取命令输出失败: %v", err)
	}

	log.Printf("命令执行完成，输出长度: %d", len(output))
	return string(output), nil
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
		Cmd:         []string{"git", "clone", "-b", branch, repo, "."},
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

// 安装必要的工具
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
		return fmt.Errorf("容器未运行，无法安装工具，当前状态: %s", containerInfo.State.Status)
	}
	
	log.Printf("开始为工作空间 %s 安装工具...", workspaceID)
	
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
	
	// 检查是否已经安装了git
	checkCmd := []string{"which", "git"}
	execConfig := container.ExecOptions{
		Cmd:          checkCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return fmt.Errorf("创建检查命令失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("执行检查命令失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return fmt.Errorf("读取检查输出失败: %v", err)
	}

	// 如果git不存在，尝试安装
	if len(output) == 0 {
		log.Printf("容器中未找到git，尝试安装...")
		
		// 尝试不同的包管理器
		installCommands := []string{
			"apt-get update && apt-get install -y git curl wget vim nano tree htop",
			"yum install -y git curl wget vim nano tree htop",
			"apk add --no-cache git curl wget vim nano tree htop",
			"dnf install -y git curl wget vim nano tree htop",
			"zypper install -y git curl wget vim nano tree htop",
			"pacman -S --noconfirm git curl wget vim nano tree htop",
		}

		success := false
		for i, cmd := range installCommands {
			log.Printf("尝试安装命令 %d: %s", i+1, cmd)
			
			installExecConfig := container.ExecOptions{
				Cmd:          []string{"/bin/sh", "-c", cmd},
				AttachStdout: true,
				AttachStderr: true,
				WorkingDir:   "/workspace",
				Env:          envs,
			}

			installExecResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
			if err != nil {
				log.Printf("创建安装命令失败: %v", err)
				continue
			}

			installExecAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, installExecResp.ID, container.ExecStartOptions{})
			if err != nil {
				log.Printf("执行安装命令失败: %v", err)
				continue
			}

			installOutput, err := io.ReadAll(installExecAttachResp.Reader)
			installExecAttachResp.Close()

			if err == nil {
				log.Printf("工具安装命令执行完成: %s", string(installOutput))
				
				// 再次检查git是否安装成功
				checkCmd := []string{"which", "git"}
				checkExecConfig := container.ExecOptions{
					Cmd:          checkCmd,
					AttachStdout: true,
					AttachStderr: true,
					WorkingDir:   "/workspace",
					Env:          envs,
				}

				checkExecResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, checkExecConfig)
				if err == nil {
					checkExecAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, checkExecResp.ID, container.ExecStartOptions{})
					if err == nil {
						checkOutput, _ := io.ReadAll(checkExecAttachResp.Reader)
						checkExecAttachResp.Close()
						if len(checkOutput) > 0 {
							log.Printf("Git安装成功: %s", string(checkOutput))
							success = true
							break
						}
					}
				}
			}
		}
		
		if !success {
			log.Printf("警告: 无法安装Git，但容器将继续运行")
		}
	} else {
		log.Printf("容器中已存在git: %s", string(output))
	}

	// 检查并安装其他基本工具
	basicTools := []string{"cd", "ls", "pwd", "mkdir", "rm", "cp", "mv"}
	for _, tool := range basicTools {
		checkCmd := []string{"which", tool}
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
					log.Printf("警告: 工具 %s 未找到", tool)
				}
			}
		}
	}

	log.Printf("工具安装检查完成")
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
		Name     string        `json:"name"`
		Image    string        `json:"image"`
		GitRepo  string        `json:"git_repo"`
		GitBranch string       `json:"git_branch"`
		Ports    []PortMapping `json:"ports"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	workspace, err := oem.CreateWorkspace(req.Name, req.Image, req.GitRepo, req.GitBranch, req.Ports)
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

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
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

func (oem *OnlineEditorManager) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	sessionID := vars["sessionId"]

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
	oem.mutex.RUnlock()

	if !exists || session.WorkspaceID != workspaceID {
		conn.WriteMessage(websocket.TextMessage, []byte("终端会话不存在"))
		return
	}

	// 获取工作空间
	workspace, exists := oem.workspaces[workspaceID]
	if !exists || workspace.Status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("工作空间未运行"))
		return
	}

	session.WebSocket = conn

	// 创建交互式终端
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
	}
	
	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}
	
	execConfig := container.ExecOptions{
		Cmd:          []string{"/bin/bash"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("创建终端失败: %v", err)))
		return
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("附加到终端失败: %v", err)))
		return
	}
	defer execAttachResp.Close()

	// 转发输出到WebSocket
	go func() {
		buffer := make([]byte, 124)
		for {
			n, err := execAttachResp.Reader.Read(buffer)
			if err != nil {
				break
			}
			if n > 0 {
				conn.WriteMessage(websocket.BinaryMessage, buffer[:n])
			}
		}
	}()

	// 处理WebSocket输入
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// 写入到容器终端
		execAttachResp.Conn.Write(message)
	}
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
			"id":          image.ID,
			"tags":        tags,
			"size":        image.Size,
			"created":     image.Created,
			"architecture": imageInfo.Architecture,
			"os":          imageInfo.Os,
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
	log.Println("  GET  /api/v1/workspaces - 列出工作空间")
	log.Println("  POST /api/v1/workspaces - 创建工作空间")
	log.Println("  GET  /api/v1/workspaces/{id} - 获取工作空间详情")
	log.Println("  POST /api/v1kspaces/{id}/start - 启动工作空间")
	log.Println("  POST /api/v1rkspaces/{id}/stop - 停止工作空间")
	log.Println("  DELETE /api/v1/workspaces/{id} - 删除工作空间")
	log.Println("  GET  /api/v1kspaces/{id}/files - 列出文件")
	log.Println("  GET  /api/v1kspaces/{id}/files?path=xxx - 读取文件")
	log.Println("  POST /api/v1kspaces/{id}/files - 写入文件")
	log.Println("  DELETE /api/v1kspaces/{id}/files?path=xxx - 删除文件")
	log.Println("  POST /api/v1aces/{id}/terminal - 创建终端")
	log.Println("  GET  /api/v1aces/{id}/terminal/{sessionId}/ws - 终端WebSocket")
	log.Println("  POST /api/v1rkspaces/{id}/exec - 执行命令")
	log.Println("  POST /api/v1orkspaces/{id}/git - Git操作")
	log.Println("  GET  /api/v1ages - 列出镜像")
	log.Println("  POST /api/v1/images/{imageName} - 拉取镜像")
	log.Println("  DELETE /api/v1images/{imageId} - 删除镜像")
	log.Println("  GET  /api/v1/containers/{containerId}/status - 获取容器状态")
	log.Println("  GET  /api/v1/containers/{containerId}/stats - 获取容器统计")

	if err := manager.StartServer(port); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
} 