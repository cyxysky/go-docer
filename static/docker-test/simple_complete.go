package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// 类型定义
type PortMapping struct {
	HostPort      string `json:"host_port"`
	ContainerPort string `json:"container_port"`
	Protocol      string `json:"protocol"`
}

type VolumeMount struct {
	HostPath      string `json:"host_path"`
	ContainerPath string `json:"container_path"`
	ReadOnly      bool   `json:"read_only"`
}

type ContainerConfig struct {
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	Command     []string          `json:"command"`
	WorkingDir  string            `json:"working_dir"`
	Environment map[string]string `json:"environment"`
	Ports       []PortMapping     `json:"ports"`
	Volumes     []VolumeMount     `json:"volumes"`
	Network     string            `json:"network"`
}

// SimpleContainer 简化版容器信息
type SimpleContainer struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	Status      string            `json:"status"`
	Command     []string          `json:"command"`
	WorkingDir  string            `json:"working_dir"`
	Environment map[string]string `json:"environment"`
	Ports       []PortMapping     `json:"ports"`
	Volumes     []VolumeMount     `json:"volumes"`
	Created     time.Time         `json:"created"`
	Started     *time.Time        `json:"started,omitempty"`
	Process     *os.Process       `json:"-"`
}

// Image 镜像信息
type Image struct {
	Name       string            `json:"name"`
	Tag        string            `json:"tag"`
	Path       string            `json:"path"`
	Config     *ImageConfig      `json:"config"`
	Created    time.Time         `json:"created"`
}

// ImageConfig 镜像配置
type ImageConfig struct {
	Entrypoint []string          `json:"entrypoint"`
	Cmd        []string          `json:"cmd"`
	WorkingDir string            `json:"working_dir"`
	Env        map[string]string `json:"env"`
	Ports      []PortMapping     `json:"ports"`
	Volumes    []VolumeMount     `json:"volumes"`
}

// SimpleContainerManager 简化版容器管理器
type SimpleContainerManager struct {
	containers map[string]*SimpleContainer
	images     map[string]*Image
	mutex      sync.RWMutex
	baseDir    string
	imagesDir  string
}

// NewSimpleContainerManager 创建简化版容器管理器
func NewSimpleContainerManager() (*SimpleContainerManager, error) {
	baseDir := "/tmp/containers"
	imagesDir := "/tmp/images"
	
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("创建容器目录失败: %v", err)
	}
	
	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		return nil, fmt.Errorf("创建镜像目录失败: %v", err)
	}

	manager := &SimpleContainerManager{
		containers: make(map[string]*SimpleContainer),
		images:     make(map[string]*Image),
		baseDir:    baseDir,
		imagesDir:  imagesDir,
	}

	// 初始化默认镜像
	manager.initDefaultImages()

	return manager, nil
}

// CreateContainer 创建容器
func (scm *SimpleContainerManager) CreateContainer(ctx context.Context, config *ContainerConfig) (*SimpleContainer, error) {
	scm.mutex.Lock()
	defer scm.mutex.Unlock()

	// 生成容器ID
	containerID := generateContainerID()
	
	// 创建容器目录
	containerDir := filepath.Join(scm.baseDir, containerID)
	if err := os.MkdirAll(containerDir, 0755); err != nil {
		return nil, fmt.Errorf("创建容器目录失败: %v", err)
	}

	// 获取镜像配置
	var imageConfig *ImageConfig
	if config.Image != "" {
		image, exists := scm.images[config.Image]
		if exists && image.Config != nil {
			imageConfig = image.Config
		}
	}

	// 创建容器对象
	container := &SimpleContainer{
		ID:          containerID,
		Name:        config.Name,
		Image:       config.Image,
		Status:      "created",
		Command:     config.Command,
		WorkingDir:  config.WorkingDir,
		Environment: config.Environment,
		Ports:       config.Ports,
		Volumes:     config.Volumes,
		Created:     time.Now(),
	}

	// 如果指定了镜像，使用镜像配置
	if imageConfig != nil {
		// 合并命令
		if len(container.Command) == 0 {
			if len(imageConfig.Entrypoint) > 0 {
				container.Command = append(imageConfig.Entrypoint, imageConfig.Cmd...)
			} else {
				container.Command = imageConfig.Cmd
			}
		}

		// 合并工作目录
		if container.WorkingDir == "" {
			container.WorkingDir = imageConfig.WorkingDir
		}

		// 合并环境变量
		if container.Environment == nil {
			container.Environment = make(map[string]string)
		}
		for key, value := range imageConfig.Env {
			if _, exists := container.Environment[key]; !exists {
				container.Environment[key] = value
			}
		}

		// 合并端口映射
		if len(container.Ports) == 0 {
			container.Ports = imageConfig.Ports
		}

		// 合并卷挂载
		if len(container.Volumes) == 0 {
			container.Volumes = imageConfig.Volumes
		}
	}

	scm.containers[containerID] = container

	return container, nil
}

// StartContainer 启动容器
func (scm *SimpleContainerManager) StartContainer(ctx context.Context, containerID string) error {
	scm.mutex.Lock()
	defer scm.mutex.Unlock()

	container, exists := scm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status == "running" {
		return fmt.Errorf("容器已在运行: %s", containerID)
	}

	// 准备命令
	var cmd *exec.Cmd
	if len(container.Command) > 0 {
		cmd = exec.CommandContext(ctx, container.Command[0], container.Command[1:]...)
	} else {
		// 默认命令
		cmd = exec.CommandContext(ctx, "sh", "-c", "echo 'Container started' && sleep infinity")
	}

	// 设置工作目录 - 修复：使用容器的工作目录
	if container.WorkingDir != "" {
		cmd.Dir = container.WorkingDir
	} else {
		// 默认使用容器目录
		cmd.Dir = filepath.Join(scm.baseDir, containerID)
	}

	// 设置环境变量
	if container.Environment != nil {
		for key, value := range container.Environment {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
		}
	}

	// 设置进程属性（简化版，不使用命名空间）
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true, // 创建新的进程组
	}

	// 启动进程
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动容器失败: %v", err)
	}

	container.Process = cmd.Process
	container.Status = "running"
	now := time.Now()
	container.Started = &now

	// 在后台等待进程结束
	go func() {
		cmd.Wait()
		scm.mutex.Lock()
		defer scm.mutex.Unlock()
		if container.Status == "running" {
			container.Status = "stopped"
			container.Process = nil
		}
	}()

	return nil
}

// StopContainer 停止容器
func (scm *SimpleContainerManager) StopContainer(ctx context.Context, containerID string, timeout *time.Duration) error {
	scm.mutex.Lock()
	defer scm.mutex.Unlock()

	container, exists := scm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status != "running" {
		return fmt.Errorf("容器未运行: %s", containerID)
	}

	if container.Process != nil {
		// 发送SIGTERM信号
		if err := container.Process.Signal(syscall.SIGTERM); err != nil {
			return fmt.Errorf("发送停止信号失败: %v", err)
		}

		// 等待进程结束
		if timeout != nil {
			done := make(chan error, 1)
			go func() {
				_, err := container.Process.Wait()
				done <- err
			}()

			select {
			case <-time.After(*timeout):
				// 超时，强制杀死进程
				container.Process.Kill()
			case <-done:
				// 进程正常结束
			}
		}
	}

	container.Status = "stopped"
	container.Process = nil
	container.Started = nil

	return nil
}

// RemoveContainer 删除容器
func (scm *SimpleContainerManager) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	scm.mutex.Lock()
	defer scm.mutex.Unlock()

	container, exists := scm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status == "running" && !force {
		return fmt.Errorf("无法删除运行中的容器，请先停止或使用-force参数")
	}

	// 如果容器正在运行，强制停止
	if container.Status == "running" {
		if container.Process != nil {
			container.Process.Kill()
		}
	}

	// 删除容器目录
	containerDir := filepath.Join(scm.baseDir, containerID)
	if err := os.RemoveAll(containerDir); err != nil {
		return fmt.Errorf("删除容器目录失败: %v", err)
	}

	delete(scm.containers, containerID)

	return nil
}

// ExecuteCommand 在容器中执行命令
func (scm *SimpleContainerManager) ExecuteCommand(ctx context.Context, containerID string, command []string) (string, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	container, exists := scm.containers[containerID]
	if !exists {
		return "", fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status != "running" {
		return "", fmt.Errorf("容器未运行: %s", containerID)
	}

	// 创建命令
	cmd := exec.CommandContext(ctx, command[0], command[1:]...)

	// 设置环境变量
	if container.Environment != nil {
		for key, value := range container.Environment {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
		}
	}

	// 设置工作目录 - 修复：使用容器的工作目录
	if container.WorkingDir != "" {
		cmd.Dir = container.WorkingDir
	} else {
		// 默认使用容器目录
		cmd.Dir = filepath.Join(scm.baseDir, containerID)
	}

	// 捕获输出
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("执行命令失败: %v", err)
	}

	return string(output), nil
}

// GetContainerLogs 获取容器日志
func (scm *SimpleContainerManager) GetContainerLogs(ctx context.Context, containerID string, tail int) ([]string, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	_, exists := scm.containers[containerID]
	if !exists {
		return nil, fmt.Errorf("容器不存在: %s", containerID)
	}

	// 读取日志文件
	logFile := filepath.Join(scm.baseDir, containerID, "container.log")
	
	file, err := os.Open(logFile)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{"日志文件不存在"}, nil
		}
		return nil, fmt.Errorf("打开日志文件失败: %v", err)
	}
	defer file.Close()

	var logs []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		logs = append(logs, scanner.Text())
	}

	// 返回最后N行
	if len(logs) > tail {
		logs = logs[len(logs)-tail:]
	}

	return logs, nil
}

// ListContainers 列出所有容器
func (scm *SimpleContainerManager) ListContainers(ctx context.Context) ([]*SimpleContainer, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	var result []*SimpleContainer
	for _, container := range scm.containers {
		result = append(result, container)
	}

	return result, nil
}

// GetContainerStats 获取容器统计信息
func (scm *SimpleContainerManager) GetContainerStats(ctx context.Context, containerID string) (map[string]interface{}, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	container, exists := scm.containers[containerID]
	if !exists {
		return nil, fmt.Errorf("容器不存在: %s", containerID)
	}

	stats := map[string]interface{}{
		"id":        container.ID,
		"name":      container.Name,
		"status":    container.Status,
		"created":   container.Created,
		"started":   container.Started,
		"uptime":    nil,
		"memory":    "N/A",
		"cpu":       "N/A",
	}

	if container.Started != nil {
		stats["uptime"] = time.Since(*container.Started).String()
	}

	return stats, nil
}

// 辅助函数

// generateContainerID 生成容器ID
func generateContainerID() string {
	return fmt.Sprintf("cont_%d", time.Now().UnixNano())
}

// initDefaultImages 初始化默认镜像
func (scm *SimpleContainerManager) initDefaultImages() {
	// 创建nginx镜像
	nginxImage := &Image{
		Name:    "nginx",
		Tag:     "latest",
		Path:    filepath.Join(scm.imagesDir, "nginx"),
		Created: time.Now(),
		Config: &ImageConfig{
			Entrypoint: []string{"nginx"},
			Cmd:        []string{"-g", "daemon off;"},
			WorkingDir: "/usr/share/nginx/html",
			Env: map[string]string{
				"NGINX_VERSION": "1.21.0",
				"NGINX_HOST":    "localhost",
				"NGINX_PORT":    "80",
			},
			Ports: []PortMapping{
				{
					HostPort:      "80",
					ContainerPort: "80",
					Protocol:      "tcp",
				},
			},
			Volumes: []VolumeMount{
				{
					HostPath:      "/tmp/nginx/html",
					ContainerPath: "/usr/share/nginx/html",
					ReadOnly:      false,
				},
				{
					HostPath:      "/tmp/nginx/logs",
					ContainerPath: "/var/log/nginx",
					ReadOnly:      false,
				},
			},
		},
	}

	// 创建alpine镜像
	alpineImage := &Image{
		Name:    "alpine",
		Tag:     "latest",
		Path:    filepath.Join(scm.imagesDir, "alpine"),
		Created: time.Now(),
		Config: &ImageConfig{
			Entrypoint: []string{"sh"},
			Cmd:        []string{"-c", "echo 'Alpine container started' && sleep infinity"},
			WorkingDir: "/",
			Env: map[string]string{
				"ALPINE_VERSION": "3.15",
			},
		},
	}

	// 创建ubuntu镜像
	ubuntuImage := &Image{
		Name:    "ubuntu",
		Tag:     "latest",
		Path:    filepath.Join(scm.imagesDir, "ubuntu"),
		Created: time.Now(),
		Config: &ImageConfig{
			Entrypoint: []string{"bash"},
			Cmd:        []string{"-c", "echo 'Ubuntu container started' && sleep infinity"},
			WorkingDir: "/",
			Env: map[string]string{
				"UBUNTU_VERSION": "20.04",
			},
		},
	}

	// 注册镜像
	scm.images["nginx:latest"] = nginxImage
	scm.images["alpine:latest"] = alpineImage
	scm.images["ubuntu:latest"] = ubuntuImage

	// 创建镜像目录
	os.MkdirAll(nginxImage.Path, 0755)
	os.MkdirAll(alpineImage.Path, 0755)
	os.MkdirAll(ubuntuImage.Path, 0755)
}

// GetImage 获取镜像
func (scm *SimpleContainerManager) GetImage(imageName string) (*Image, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	image, exists := scm.images[imageName]
	if !exists {
		return nil, fmt.Errorf("镜像不存在: %s", imageName)
	}

	return image, nil
}

// ListImages 列出所有镜像
func (scm *SimpleContainerManager) ListImages() ([]*Image, error) {
	scm.mutex.RLock()
	defer scm.mutex.RUnlock()

	var result []*Image
	for _, image := range scm.images {
		result = append(result, image)
	}

	return result, nil
}

// CreateImage 创建镜像
func (scm *SimpleContainerManager) CreateImage(name, tag string, config *ImageConfig) (*Image, error) {
	scm.mutex.Lock()
	defer scm.mutex.Unlock()

	imageID := fmt.Sprintf("%s:%s", name, tag)
	if _, exists := scm.images[imageID]; exists {
		return nil, fmt.Errorf("镜像已存在: %s", imageID)
	}

	image := &Image{
		Name:    name,
		Tag:     tag,
		Path:    filepath.Join(scm.imagesDir, name),
		Config:  config,
		Created: time.Now(),
	}

	scm.images[imageID] = image

	// 创建镜像目录
	if err := os.MkdirAll(image.Path, 0755); err != nil {
		return nil, fmt.Errorf("创建镜像目录失败: %v", err)
	}

	return image, nil
}

// SimpleCLI 简化版命令行接口
type SimpleCLI struct {
	manager *SimpleContainerManager
}

// NewSimpleCLI 创建简化版CLI实例
func NewSimpleCLI() (*SimpleCLI, error) {
	manager, err := NewSimpleContainerManager()
	if err != nil {
		return nil, err
	}
	return &SimpleCLI{manager: manager}, nil
}

// Run 运行CLI
func (cli *SimpleCLI) Run() {
	if len(os.Args) < 2 {
		cli.printUsage()
		return
	}

	command := os.Args[1]
	ctx := context.Background()

	switch command {
	case "create":
		cli.createContainer(ctx)
	case "start":
		cli.startContainer(ctx)
	case "stop":
		cli.stopContainer(ctx)
	case "remove":
		cli.removeContainer(ctx)
	case "list":
		cli.listContainers(ctx)
	case "logs":
		cli.getLogs(ctx)
	case "exec":
		cli.executeCommand(ctx)
	case "stats":
		cli.getStats(ctx)
	case "images":
		cli.listImages(ctx)
	case "interactive":
		cli.interactiveMode(ctx)
	default:
		fmt.Printf("未知命令: %s\n", command)
		cli.printUsage()
	}
}

// printUsage 打印使用说明
func (cli *SimpleCLI) printUsage() {
	fmt.Println("简化版容器管理工具")
	fmt.Println("用法:")
	fmt.Println("  create     - 创建容器")
	fmt.Println("  start      - 启动容器")
	fmt.Println("  stop       - 停止容器")
	fmt.Println("  remove     - 删除容器")
	fmt.Println("  list       - 列出所有容器")
	fmt.Println("  logs       - 查看容器日志")
	fmt.Println("  exec       - 在容器中执行命令")
	fmt.Println("  stats      - 查看容器统计信息")
	fmt.Println("  images     - 列出所有镜像")
	fmt.Println("  interactive - 交互模式")
}

// createContainer 创建容器
func (cli *SimpleCLI) createContainer(ctx context.Context) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	name := fs.String("name", "", "容器名称")
	image := fs.String("image", "", "镜像名称")
	cmd := fs.String("cmd", "", "启动命令")
	workdir := fs.String("workdir", "", "工作目录")
	env := fs.String("env", "", "环境变量 (key=value,key=value)")
	port := fs.String("port", "", "端口映射 (host:container)")
	volume := fs.String("volume", "", "卷挂载 (host:container)")

	fs.Parse(os.Args[2:])

	if *name == "" {
		fmt.Println("必须指定容器名称")
		return
	}

	config := &ContainerConfig{
		Name:       *name,
		Image:      *image,
		WorkingDir: *workdir,
	}

	// 解析命令
	if *cmd != "" {
		config.Command = strings.Split(*cmd, " ")
	}

	// 解析环境变量
	if *env != "" {
		config.Environment = make(map[string]string)
		pairs := strings.Split(*env, ",")
		for _, pair := range pairs {
			kv := strings.Split(pair, "=")
			if len(kv) == 2 {
				config.Environment[kv[0]] = kv[1]
			}
		}
	}

	// 解析端口映射
	if *port != "" {
		parts := strings.Split(*port, ":")
		if len(parts) == 2 {
			config.Ports = []PortMapping{
				{
					HostPort:      parts[0],
					ContainerPort: parts[1],
					Protocol:      "tcp",
				},
			}
		}
	}

	// 解析卷挂载
	if *volume != "" {
		parts := strings.Split(*volume, ":")
		if len(parts) == 2 {
			config.Volumes = []VolumeMount{
				{
					HostPath:      parts[0],
					ContainerPath: parts[1],
					ReadOnly:      false,
				},
			}
		}
	}

	container, err := cli.manager.CreateContainer(ctx, config)
	if err != nil {
		log.Printf("创建容器失败: %v", err)
		return
	}

	fmt.Printf("容器创建成功: %s (ID: %s)\n", container.Name, container.ID)
	
	// 显示端口映射信息
	if len(container.Ports) > 0 {
		fmt.Printf("端口映射:\n")
		for _, port := range container.Ports {
			fmt.Printf("  %s -> %s (%s)\n", port.HostPort, port.ContainerPort, port.Protocol)
		}
	}
}

// startContainer 启动容器
func (cli *SimpleCLI) startContainer(ctx context.Context) {
	fs := flag.NewFlagSet("start", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	err := cli.manager.StartContainer(ctx, *containerID)
	if err != nil {
		log.Printf("启动容器失败: %v", err)
		return
	}

	fmt.Printf("容器启动成功: %s\n", *containerID)
}

// stopContainer 停止容器
func (cli *SimpleCLI) stopContainer(ctx context.Context) {
	fs := flag.NewFlagSet("stop", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	timeout := fs.Int("timeout", 10, "停止超时时间(秒)")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	t := time.Duration(*timeout) * time.Second
	err := cli.manager.StopContainer(ctx, *containerID, &t)
	if err != nil {
		log.Printf("停止容器失败: %v", err)
		return
	}

	fmt.Printf("容器停止成功: %s\n", *containerID)
}

// removeContainer 删除容器
func (cli *SimpleCLI) removeContainer(ctx context.Context) {
	fs := flag.NewFlagSet("remove", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	force := fs.Bool("force", false, "强制删除")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	err := cli.manager.RemoveContainer(ctx, *containerID, *force)
	if err != nil {
		log.Printf("删除容器失败: %v", err)
		return
	}

	fmt.Printf("容器删除成功: %s\n", *containerID)
}

// listContainers 列出容器
func (cli *SimpleCLI) listContainers(ctx context.Context) {
	containers, err := cli.manager.ListContainers(ctx)
	if err != nil {
		log.Printf("获取容器列表失败: %v", err)
		return
	}

	if len(containers) == 0 {
		fmt.Println("没有找到容器")
		return
	}

	fmt.Printf("%-20s %-20s %-15s %-10s %-20s\n", "ID", "名称", "镜像", "状态", "创建时间")
	fmt.Println(strings.Repeat("-", 90))

	for _, container := range containers {
		fmt.Printf("%-20s %-20s %-15s %-10s %-20s\n",
			container.ID,
			container.Name,
			container.Image,
			container.Status,
			container.Created.Format("2006-01-02 15:04:05"))
	}
}

// getLogs 获取日志
func (cli *SimpleCLI) getLogs(ctx context.Context) {
	fs := flag.NewFlagSet("logs", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	tail := fs.Int("tail", 100, "显示最后N行日志")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	logs, err := cli.manager.GetContainerLogs(ctx, *containerID, *tail)
	if err != nil {
		log.Printf("获取日志失败: %v", err)
		return
	}

	for _, log := range logs {
		fmt.Println(log)
	}
}

// executeCommand 执行命令
func (cli *SimpleCLI) executeCommand(ctx context.Context) {
	fs := flag.NewFlagSet("exec", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	command := fs.String("cmd", "", "要执行的命令")

	fs.Parse(os.Args[2:])

	if *containerID == "" || *command == "" {
		fmt.Println("必须指定容器ID和命令")
		return
	}

	cmdParts := strings.Split(*command, " ")
	output, err := cli.manager.ExecuteCommand(ctx, *containerID, cmdParts)
	if err != nil {
		log.Printf("执行命令失败: %v", err)
		return
	}

	fmt.Println(output)
}

// getStats 获取统计信息
func (cli *SimpleCLI) getStats(ctx context.Context) {
	fs := flag.NewFlagSet("stats", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	stats, err := cli.manager.GetContainerStats(ctx, *containerID)
	if err != nil {
		log.Printf("获取统计信息失败: %v", err)
		return
	}

	fmt.Printf("容器统计信息:\n")
	for key, value := range stats {
		fmt.Printf("  %s: %v\n", key, value)
	}
}

// listImages 列出镜像
func (cli *SimpleCLI) listImages(ctx context.Context) {
	images, err := cli.manager.ListImages()
	if err != nil {
		log.Printf("获取镜像列表失败: %v", err)
		return
	}

	if len(images) == 0 {
		fmt.Println("没有找到镜像")
		return
	}

	fmt.Printf("%-20s %-10s %-20s %-20s\n", "镜像名称", "标签", "大小", "创建时间")
	fmt.Println(strings.Repeat("-", 75))

	for _, image := range images {
		fmt.Printf("%-20s %-10s %-20s %-20s\n",
			image.Name,
			image.Tag,
			"N/A",
			image.Created.Format("2006-01-02 15:04:05"))
	}
}

// interactiveMode 交互模式
func (cli *SimpleCLI) interactiveMode(ctx context.Context) {
	fmt.Println("进入交互模式 (输入 'help' 查看命令, 'exit' 退出)")
	
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("simple-container> ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		if input == "exit" || input == "quit" {
			break
		}

		if input == "help" {
			cli.printInteractiveHelp()
			continue
		}

		// 解析并执行命令
		args := strings.Fields(input)
		if len(args) == 0 {
			continue
		}

		// 临时修改 os.Args 来复用现有的命令处理逻辑
		originalArgs := os.Args
		os.Args = append([]string{"simple-container"}, args...)
		
		// 执行命令
		cli.executeInteractiveCommand(ctx, args[0], args[1:])
		
		// 恢复原始参数
		os.Args = originalArgs
	}
}

// executeInteractiveCommand 执行交互式命令
func (cli *SimpleCLI) executeInteractiveCommand(ctx context.Context, command string, args []string) {
	switch command {
	case "list":
		cli.listContainers(ctx)
	case "images":
		cli.listImages(ctx)
	case "create":
		// 简化版创建命令
		if len(args) >= 2 {
			config := &ContainerConfig{
				Name:  args[0],
				Image: args[1],
			}
			if len(args) >= 3 {
				config.Command = args[2:]
			}
			container, err := cli.manager.CreateContainer(ctx, config)
			if err != nil {
				fmt.Printf("创建失败: %v\n", err)
			} else {
				fmt.Printf("创建成功: %s (ID: %s)\n", container.Name, container.ID)
			}
		} else {
			fmt.Println("用法: create <name> <image> [command...]")
		}
	case "start":
		if len(args) >= 1 {
			err := cli.manager.StartContainer(ctx, args[0])
			if err != nil {
				fmt.Printf("启动失败: %v\n", err)
			} else {
				fmt.Printf("启动成功: %s\n", args[0])
			}
		} else {
			fmt.Println("用法: start <container-id>")
		}
	case "stop":
		if len(args) >= 1 {
			err := cli.manager.StopContainer(ctx, args[0], nil)
			if err != nil {
				fmt.Printf("停止失败: %v\n", err)
			} else {
				fmt.Printf("停止成功: %s\n", args[0])
			}
		} else {
			fmt.Println("用法: stop <container-id>")
		}
	case "remove":
		if len(args) >= 1 {
			force := false
			if len(args) >= 2 && args[1] == "-force" {
				force = true
			}
			err := cli.manager.RemoveContainer(ctx, args[0], force)
			if err != nil {
				fmt.Printf("删除失败: %v\n", err)
			} else {
				fmt.Printf("删除成功: %s\n", args[0])
			}
		} else {
			fmt.Println("用法: remove <container-id> [-force]")
		}
	case "logs":
		if len(args) >= 1 {
			tail := 50
			if len(args) >= 2 {
				if t, err := strconv.Atoi(args[1]); err == nil {
					tail = t
				}
			}
			logs, err := cli.manager.GetContainerLogs(ctx, args[0], tail)
			if err != nil {
				fmt.Printf("获取日志失败: %v\n", err)
			} else {
				for _, log := range logs {
					fmt.Println(log)
				}
			}
		} else {
			fmt.Println("用法: logs <container-id> [tail-lines]")
		}
	case "exec":
		if len(args) >= 2 {
			output, err := cli.manager.ExecuteCommand(ctx, args[0], args[1:])
			if err != nil {
				fmt.Printf("执行失败: %v\n", err)
			} else {
				fmt.Println(output)
			}
		} else {
			fmt.Println("用法: exec <container-id> <command...>")
		}
	case "stats":
		if len(args) >= 1 {
			stats, err := cli.manager.GetContainerStats(ctx, args[0])
			if err != nil {
				fmt.Printf("获取统计信息失败: %v\n", err)
			} else {
				for key, value := range stats {
					fmt.Printf("  %s: %v\n", key, value)
				}
			}
		} else {
			fmt.Println("用法: stats <container-id>")
		}
	default:
		fmt.Printf("未知命令: %s\n", command)
	}
}

// printInteractiveHelp 打印交互式帮助
func (cli *SimpleCLI) printInteractiveHelp() {
	fmt.Println("可用命令:")
	fmt.Println("  list                           - 列出所有容器")
	fmt.Println("  images                         - 列出所有镜像")
	fmt.Println("  create <name> <image> [cmd...] - 创建容器")
	fmt.Println("  start <container-id>           - 启动容器")
	fmt.Println("  stop <container-id>            - 停止容器")
	fmt.Println("  remove <container-id> [-force] - 删除容器")
	fmt.Println("  logs <container-id> [n]        - 查看容器日志")
	fmt.Println("  exec <container-id> <cmd...>   - 在容器中执行命令")
	fmt.Println("  stats <container-id>           - 查看容器统计信息")
	fmt.Println("  help                           - 显示此帮助")
	fmt.Println("  exit                           - 退出")
}

// 测试函数
func testSimpleContainer() {
	fmt.Println("=== 简化版容器管理系统测试 ===")

	// 创建简化版容器管理器
	manager, err := NewSimpleContainerManager()
	if err != nil {
		log.Fatalf("创建简化版容器管理器失败: %v", err)
	}

	ctx := context.Background()

	// 1. 创建容器
	fmt.Println("\n1. 创建容器...")
	config := &ContainerConfig{
		Name:  "test-simple",
		Image: "alpine:latest",
		Command: []string{"sh", "-c", "echo 'Hello from simple container' && sleep 10"},
		Environment: map[string]string{
			"TEST_VAR": "test_value",
		},
	}

	container, err := manager.CreateContainer(ctx, config)
	if err != nil {
		log.Fatalf("创建容器失败: %v", err)
	}
	fmt.Printf("✓ 容器创建成功: %s (ID: %s)\n", container.Name, container.ID)

	// 2. 启动容器
	fmt.Println("\n2. 启动容器...")
	err = manager.StartContainer(ctx, container.ID)
	if err != nil {
		log.Fatalf("启动容器失败: %v", err)
	}
	fmt.Printf("✓ 容器启动成功: %s\n", container.Name)

	// 3. 等待容器启动
	fmt.Println("\n3. 等待容器启动...")
	time.Sleep(2 * time.Second)

	// 4. 执行命令
	fmt.Println("\n4. 在容器中执行命令...")
	output, err := manager.ExecuteCommand(ctx, container.ID, []string{"echo", "Command executed in container"})
	if err != nil {
		log.Printf("执行命令失败: %v", err)
	} else {
		fmt.Printf("✓ 命令执行成功:\n%s\n", output)
	}

	// 5. 获取容器日志
	fmt.Println("\n5. 获取容器日志...")
	logs, err := manager.GetContainerLogs(ctx, container.ID, 5)
	if err != nil {
		log.Printf("获取日志失败: %v", err)
	} else {
		fmt.Printf("✓ 容器日志 (最后5行):\n")
		for _, log := range logs {
			fmt.Printf("  %s\n", log)
		}
	}

	// 6. 列出所有容器
	fmt.Println("\n6. 列出所有容器...")
	containers, err := manager.ListContainers(ctx)
	if err != nil {
		log.Printf("列出容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器列表:\n")
		for _, c := range containers {
			fmt.Printf("  - %s (%s): %s\n", c.Name, c.ID, c.Status)
		}
	}

	// 7. 获取容器统计信息
	fmt.Println("\n7. 获取容器统计信息...")
	stats, err := manager.GetContainerStats(ctx, container.ID)
	if err != nil {
		log.Printf("获取统计信息失败: %v", err)
	} else {
		fmt.Printf("✓ 容器统计信息:\n")
		for key, value := range stats {
			fmt.Printf("  %s: %v\n", key, value)
		}
	}

	// 8. 停止容器
	fmt.Println("\n8. 停止容器...")
	err = manager.StopContainer(ctx, container.ID, nil)
	if err != nil {
		log.Printf("停止容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器停止成功: %s\n", container.Name)
	}

	// 9. 删除容器
	fmt.Println("\n9. 删除容器...")
	err = manager.RemoveContainer(ctx, container.ID, true)
	if err != nil {
		log.Printf("删除容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器删除成功: %s\n", container.Name)
	}

	fmt.Println("\n=== 简化版容器测试完成 ===")
}

// 性能测试
func testSimplePerformance() {
	fmt.Println("\n=== 简化版容器性能测试 ===")

	manager, err := NewSimpleContainerManager()
	if err != nil {
		log.Fatalf("创建简化版容器管理器失败: %v", err)
	}

	ctx := context.Background()

	// 测试并发创建容器
	fmt.Println("测试并发创建容器...")
	start := time.Now()

	containers := make([]*SimpleContainer, 0)
	for i := 0; i < 5; i++ {
		config := &ContainerConfig{
			Name:  fmt.Sprintf("perf-simple-%d", i),
			Image: "alpine:latest",
			Command: []string{"sleep", "5"},
		}

		container, err := manager.CreateContainer(ctx, config)
		if err != nil {
			log.Printf("创建容器失败: %v", err)
			continue
		}
		containers = append(containers, container)
	}

	elapsed := time.Since(start)
	fmt.Printf("✓ 创建 %d 个容器耗时: %v\n", len(containers), elapsed)

	// 启动所有容器
	fmt.Println("启动所有容器...")
	start = time.Now()
	for _, container := range containers {
		manager.StartContainer(ctx, container.ID)
	}
	elapsed = time.Since(start)
	fmt.Printf("✓ 启动 %d 个容器耗时: %v\n", len(containers), elapsed)

	// 等待一段时间
	time.Sleep(3 * time.Second)

	// 清理测试容器
	fmt.Println("清理测试容器...")
	for _, container := range containers {
		manager.StopContainer(ctx, container.ID, nil)
		manager.RemoveContainer(ctx, container.ID, true)
	}

	fmt.Println("✓ 简化版容器性能测试完成")
}

// 运行简化版测试
func runSimpleTests() {
	fmt.Println("开始运行简化版容器管理系统测试...")

	// 运行基本功能测试
	testSimpleContainer()

	// 运行性能测试
	testSimplePerformance()

	fmt.Println("\n所有简化版测试完成!")
}

// 主函数
func main() {
	// 检查是否有简化版测试参数
	if len(os.Args) > 1 && os.Args[1] == "test-simple" {
		runSimpleTests()
		return
	}

	// 使用简化版CLI
	cli, err := NewSimpleCLI()
	if err != nil {
		log.Fatalf("创建简化版CLI失败: %v", err)
	}

	// 运行简化版CLI
	cli.Run()
} 