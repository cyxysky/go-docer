package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
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

// SimpleContainerManager 简化版容器管理器
type SimpleContainerManager struct {
	containers map[string]*SimpleContainer
	mutex      sync.RWMutex
	baseDir    string
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

// NewSimpleContainerManager 创建简化版容器管理器
func NewSimpleContainerManager() (*SimpleContainerManager, error) {
	baseDir := "/tmp/containers"
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("创建容器目录失败: %v", err)
	}

	return &SimpleContainerManager{
		containers: make(map[string]*SimpleContainer),
		baseDir:    baseDir,
	}, nil
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

	// 设置工作目录
	if container.WorkingDir != "" {
		cmd.Dir = container.WorkingDir
	}

	// 设置环境变量
	if container.Environment != nil {
		for key, value := range container.Environment {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, value))
		}
	}

	// 设置进程属性
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Cloneflags: syscall.CLONE_NEWUTS | syscall.CLONE_NEWPID | syscall.CLONE_NEWNS,
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

	// 设置工作目录
	if container.WorkingDir != "" {
		cmd.Dir = container.WorkingDir
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

	container, exists := scm.containers[containerID]
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

// 端口转发功能（简化版）
func (scm *SimpleContainerManager) setupPortForwarding(container *SimpleContainer) error {
	for _, port := range container.Ports {
		// 这里可以实现端口转发逻辑
		// 由于需要root权限和复杂的网络配置，这里只是占位
		log.Printf("设置端口转发: %s -> %s", port.HostPort, port.ContainerPort)
	}
	return nil
}

// 卷挂载功能（简化版）
func (scm *SimpleContainerManager) setupVolumeMounts(container *SimpleContainer) error {
	for _, volume := range container.Volumes {
		// 创建挂载点
		if err := os.MkdirAll(volume.HostPath, 0755); err != nil {
			return fmt.Errorf("创建挂载点失败: %v", err)
		}
		log.Printf("设置卷挂载: %s -> %s", volume.HostPath, volume.ContainerPath)
	}
	return nil
} 