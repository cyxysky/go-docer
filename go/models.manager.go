package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/gorilla/websocket"
)

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

// 导出相关的数据结构
type ExportRequest struct {
	Type          string   `json:"type"`           // "files" 或 "image"
	Path          string   `json:"path"`           // 导出文件时的路径，空则导出整个工作空间
	SelectedFiles []string `json:"selected_files"` // 选中的文件和文件夹列表
	Format        string   `json:"format"`         // "zip" 或 "tar.gz"
	ImageName     string   `json:"image_name"`     // 导出镜像时的新镜像名称
	ImageTag      string   `json:"image_tag"`      // 导出镜像时的标签
}

type ExportResponse struct {
	Success    bool   `json:"success"`
	Message    string `json:"message"`
	DownloadID string `json:"download_id"` // 用于下载的唯一标识
	FileName   string `json:"file_name"`
	FileSize   int64  `json:"file_size"`
	ExportType string `json:"export_type"`
}

type DownloadInfo struct {
	FilePath   string    `json:"file_path"`
	FileName   string    `json:"file_name"`
	FileSize   int64     `json:"file_size"`
	ExportType string    `json:"export_type"`
	CreatedAt  time.Time `json:"created_at"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// 导入任务信息
type ImportTaskInfo struct {
	ID          string     `json:"id"`
	FileName    string     `json:"file_name"`
	Status      string     `json:"status"` // "importing", "completed", "failed"
	ImageName   string     `json:"image_name,omitempty"`
	Error       string     `json:"error,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
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

	// 新增：导出下载管理
	downloadsDir   string                   // 下载文件存储目录
	downloads      map[string]*DownloadInfo // 下载信息管理
	downloadsMutex sync.RWMutex             // 下载信息锁

	// 新增：自定义镜像管理
	customImages      map[string]*ImageConfig // 自定义镜像配置
	customImagesMutex sync.RWMutex            // 自定义镜像锁

	// 新增：镜像源管理
	registryManager *RegistryManager // 镜像源管理器

	// 新增：导入任务管理
	importTasks      map[string]*ImportTaskInfo // 导入任务信息管理
	importTasksMutex sync.RWMutex               // 导入任务锁

	// 新增：AI配置
	aiConfig       *AIConfig
	aiModelManager *AIModelManager
}

// 脚本和命令管理
type ScriptManager struct {
	Scripts  map[string]string
	Commands map[string][]string
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

// 执行Shell命令
// 获取工作空间文件树
func (oem *OnlineEditorManager) GetWorkspaceFileTree(workspaceID string) ([]string, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspace.Name)
	var fileTree []string

	err := filepath.Walk(workspaceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// 跳过隐藏文件和目录
		if strings.HasPrefix(info.Name(), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// 跳过node_modules等常见的忽略目录
		skipDirs := []string{"node_modules", ".git", ".vscode", "dist", "build", "__pycache__", ".next", ".nuxt"}
		for _, skipDir := range skipDirs {
			if info.IsDir() && info.Name() == skipDir {
				return filepath.SkipDir
			}
		}

		// 只收集文件，不收集目录
		if !info.IsDir() {
			// 转换为相对路径
			relPath, err := filepath.Rel(workspaceDir, path)
			if err != nil {
				return err
			}
			// 将路径分隔符统一为 "/"
			relPath = filepath.ToSlash(relPath)
			fileTree = append(fileTree, relPath)
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("获取文件树失败: %v", err)
	}

	return fileTree, nil
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

// 获取环境变量模板
func (oem *OnlineEditorManager) GetEnvironmentTemplates() map[string]map[string]string {
	return defaultEnvironmentTemplates
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
	downloadsDir := filepath.Join(baseDir, "downloads")

	// 创建目录
	dirs := []string{baseDir, workspacesDir, imagesDir, downloadsDir}
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
		dockerClient:      dockerCli,
		networkName:       networkName,
		portPool:          make(map[int]bool),
		downloadsDir:      downloadsDir,
		downloads:         make(map[string]*DownloadInfo),
		downloadsMutex:    sync.RWMutex{},
		customImages:      make(map[string]*ImageConfig),
		customImagesMutex: sync.RWMutex{},
		registryManager:   NewRegistryManager(), // 初始化镜像源管理器
		importTasks:       make(map[string]*ImportTaskInfo),
		aiConfig:          &AIConfig{DefaultModel: "gpt-3.5-turbo", Models: make(map[string]*AIModel)},
		aiModelManager:    &AIModelManager{models: make(map[string]*AIModel)},
	}

	// 从Go配置文件加载AI配置
	aiConfigData := GetAIConfig()

	// 设置默认模型和策略
	manager.aiConfig.DefaultModel = aiConfigData.DefaultModel
	manager.aiConfig.Strategy = aiConfigData.Strategy

	// 加载模型配置
	for modelID, model := range aiConfigData.Models {
		manager.aiModelManager.models[modelID] = model
		manager.aiConfig.Models[modelID] = model
	}

	log.Printf("AI配置加载完成，默认模型: %s", manager.aiConfig.DefaultModel)

	// 启动时恢复现有工作空间
	if err := manager.recoverExistingWorkspaces(); err != nil {
		log.Printf("恢复现有工作空间失败: %v", err)
	}

	return manager, nil
}
