package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// ContainerManager 容器管理器
type ContainerManager struct {
	client     *client.Client
	containers map[string]*Container
	networks   map[string]*Network
	mutex      sync.RWMutex
}

// Container 容器信息
type Container struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	Status      string            `json:"status"`
	Ports       []PortMapping     `json:"ports"`
	Networks    []string          `json:"networks"`
	Volumes     []VolumeMount     `json:"volumes"`
	Environment map[string]string `json:"environment"`
	Command     []string          `json:"command"`
	WorkingDir  string            `json:"working_dir"`
	Created     time.Time         `json:"created"`
	Started     *time.Time        `json:"started,omitempty"`
}

// PortMapping 端口映射
type PortMapping struct {
	HostPort   string `json:"host_port"`
	ContainerPort string `json:"container_port"`
	Protocol   string `json:"protocol"`
}

// VolumeMount 卷挂载
type VolumeMount struct {
	HostPath      string `json:"host_path"`
	ContainerPath string `json:"container_path"`
	ReadOnly      bool   `json:"read_only"`
}

// Network 网络信息
type Network struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Driver      string            `json:"driver"`
	Subnet      string            `json:"subnet"`
	Gateway     string            `json:"gateway"`
	Containers  map[string]string `json:"containers"`
}

// NewContainerManager 创建容器管理器
func NewContainerManager() (*ContainerManager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("创建Docker客户端失败: %v", err)
	}

	return &ContainerManager{
		client:     cli,
		containers: make(map[string]*Container),
		networks:   make(map[string]*Network),
	}, nil
}

// CreateContainer 创建容器
func (cm *ContainerManager) CreateContainer(ctx context.Context, config *ContainerConfig) (*Container, error) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// 构建容器配置
	containerConfig := &container.Config{
		Image:        config.Image,
		Cmd:          config.Command,
		WorkingDir:   config.WorkingDir,
		Env:          config.Environment,
		ExposedPorts: make(nat.PortSet),
		Volumes:      make(map[string]struct{}),
	}

	// 设置端口映射
	for _, port := range config.Ports {
		portStr := fmt.Sprintf("%s/%s", port.ContainerPort, port.Protocol)
		containerConfig.ExposedPorts[nat.Port(portStr)] = struct{}{}
	}

	// 设置卷挂载
	for _, volume := range config.Volumes {
		containerConfig.Volumes[volume.ContainerPath] = struct{}{}
	}

	// 构建主机配置
	hostConfig := &container.HostConfig{
		PortBindings: make(nat.PortMap),
		Binds:        make([]string, 0),
		NetworkMode:  container.NetworkMode(config.Network),
	}

	// 设置端口绑定
	for _, port := range config.Ports {
		portStr := fmt.Sprintf("%s/%s", port.ContainerPort, port.Protocol)
		hostConfig.PortBindings[nat.Port(portStr)] = []nat.PortBinding{
			{
				HostIP:   "0.0.0.0",
				HostPort: port.HostPort,
			},
		}
	}

	// 设置卷绑定
	for _, volume := range config.Volumes {
		bindStr := fmt.Sprintf("%s:%s", volume.HostPath, volume.ContainerPath)
		if volume.ReadOnly {
			bindStr += ":ro"
		}
		hostConfig.Binds = append(hostConfig.Binds, bindStr)
	}

	// 创建容器
	resp, err := cm.client.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, config.Name)
	if err != nil {
		return nil, fmt.Errorf("创建容器失败: %v", err)
	}

	// 创建容器对象
	container := &Container{
		ID:          resp.ID,
		Name:        config.Name,
		Image:       config.Image,
		Status:      "created",
		Ports:       config.Ports,
		Networks:    []string{config.Network},
		Volumes:     config.Volumes,
		Environment: config.Environment,
		Command:     config.Command,
		WorkingDir:  config.WorkingDir,
		Created:     time.Now(),
	}

	cm.containers[resp.ID] = container

	return container, nil
}

// StartContainer 启动容器
func (cm *ContainerManager) StartContainer(ctx context.Context, containerID string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	err := cm.client.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
	if err != nil {
		return fmt.Errorf("启动容器失败: %v", err)
	}

	container.Status = "running"
	now := time.Now()
	container.Started = &now

	return nil
}

// StopContainer 停止容器
func (cm *ContainerManager) StopContainer(ctx context.Context, containerID string, timeout *time.Duration) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	if timeout == nil {
		defaultTimeout := 10 * time.Second
		timeout = &defaultTimeout
	}

	err := cm.client.ContainerStop(ctx, containerID, timeout)
	if err != nil {
		return fmt.Errorf("停止容器失败: %v", err)
	}

	container.Status = "stopped"
	container.Started = nil

	return nil
}

// RemoveContainer 删除容器
func (cm *ContainerManager) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	options := types.ContainerRemoveOptions{
		Force: force,
	}

	err := cm.client.ContainerRemove(ctx, containerID, options)
	if err != nil {
		return fmt.Errorf("删除容器失败: %v", err)
	}

	delete(cm.containers, containerID)

	return nil
}

// ExecuteCommand 在容器中执行命令
func (cm *ContainerManager) ExecuteCommand(ctx context.Context, containerID string, command []string) (string, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return "", fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status != "running" {
		return "", fmt.Errorf("容器未运行: %s", containerID)
	}

	// 创建执行配置
	execConfig := types.ExecConfig{
		Cmd:          command,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          false,
	}

	// 创建执行实例
	execResp, err := cm.client.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建执行实例失败: %v", err)
	}

	// 开始执行
	resp, err := cm.client.ContainerExecAttach(ctx, execResp.ID, types.ExecStartCheck{})
	if err != nil {
		return "", fmt.Errorf("执行命令失败: %v", err)
	}
	defer resp.Close()

	// 读取输出
	output, err := io.ReadAll(resp.Reader)
	if err != nil {
		return "", fmt.Errorf("读取输出失败: %v", err)
	}

	return string(output), nil
}

// GetContainerLogs 获取容器日志
func (cm *ContainerManager) GetContainerLogs(ctx context.Context, containerID string, tail int) ([]string, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return nil, fmt.Errorf("容器不存在: %s", containerID)
	}

	options := types.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       strconv.Itoa(tail),
	}

	reader, err := cm.client.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return nil, fmt.Errorf("获取日志失败: %v", err)
	}
	defer reader.Close()

	var logs []string
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		logs = append(logs, scanner.Text())
	}

	return logs, nil
}

// ListContainers 列出所有容器
func (cm *ContainerManager) ListContainers(ctx context.Context) ([]*Container, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	containers, err := cm.client.ContainerList(ctx, types.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("获取容器列表失败: %v", err)
	}

	var result []*Container
	for _, c := range containers {
		container := &Container{
			ID:     c.ID,
			Name:   strings.TrimPrefix(c.Names[0], "/"),
			Image:  c.Image,
			Status: c.State,
			Created: time.Unix(c.Created, 0),
		}

		// 解析端口映射
		for _, port := range c.Ports {
			container.Ports = append(container.Ports, PortMapping{
				HostPort:      strconv.Itoa(int(port.PublicPort)),
				ContainerPort: strconv.Itoa(int(port.PrivatePort)),
				Protocol:      port.Type,
			})
		}

		result = append(result, container)
	}

	return result, nil
}

// CreateNetwork 创建网络
func (cm *ContainerManager) CreateNetwork(ctx context.Context, name, driver, subnet string) (*Network, error) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	networkConfig := types.NetworkCreate{
		Driver: driver,
		IPAM: &network.IPAM{
			Config: []network.IPAMConfig{
				{
					Subnet: subnet,
				},
			},
		},
	}

	resp, err := cm.client.NetworkCreate(ctx, name, networkConfig)
	if err != nil {
		return nil, fmt.Errorf("创建网络失败: %v", err)
	}

	network := &Network{
		ID:         resp.ID,
		Name:       name,
		Driver:     driver,
		Subnet:     subnet,
		Containers: make(map[string]string),
	}

	cm.networks[resp.ID] = network

	return network, nil
}

// ConnectContainerToNetwork 将容器连接到网络
func (cm *ContainerManager) ConnectContainerToNetwork(ctx context.Context, containerID, networkName string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return fmt.Errorf("容器不存在: %s", containerID)
	}

	// 查找网络
	var networkID string
	for id, network := range cm.networks {
		if network.Name == networkName {
			networkID = id
			break
		}
	}

	if networkID == "" {
		return fmt.Errorf("网络不存在: %s", networkName)
	}

	err := cm.client.NetworkConnect(ctx, networkID, containerID, &network.EndpointSettings{})
	if err != nil {
		return fmt.Errorf("连接容器到网络失败: %v", err)
	}

	container.Networks = append(container.Networks, networkName)
	cm.networks[networkID].Containers[containerID] = container.Name

	return nil
}

// GetContainerStats 获取容器统计信息
func (cm *ContainerManager) GetContainerStats(ctx context.Context, containerID string) (*types.Stats, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	container, exists := cm.containers[containerID]
	if !exists {
		return nil, fmt.Errorf("容器不存在: %s", containerID)
	}

	if container.Status != "running" {
		return nil, fmt.Errorf("容器未运行: %s", containerID)
	}

	stats, err := cm.client.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, fmt.Errorf("获取容器统计信息失败: %v", err)
	}
	defer stats.Body.Close()

	var containerStats types.Stats
	err = json.NewDecoder(stats.Body).Decode(&containerStats)
	if err != nil {
		return nil, fmt.Errorf("解析统计信息失败: %v", err)
	}

	return &containerStats, nil
}

// ContainerConfig 容器配置
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

// 示例使用
func main() {
	// 创建容器管理器
	manager, err := NewContainerManager()
	if err != nil {
		log.Fatalf("创建容器管理器失败: %v", err)
	}

	ctx := context.Background()

	// 创建网络
	network, err := manager.CreateNetwork(ctx, "my-network", "bridge", "172.18.0.0/16")
	if err != nil {
		log.Printf("创建网络失败: %v", err)
	} else {
		fmt.Printf("创建网络成功: %s\n", network.Name)
	}

	// 创建容器配置
	config := &ContainerConfig{
		Name:  "my-container",
		Image: "nginx:alpine",
		Ports: []PortMapping{
			{
				HostPort:      "8080",
				ContainerPort: "80",
				Protocol:      "tcp",
			},
		},
		Volumes: []VolumeMount{
			{
				HostPath:      "/tmp/nginx",
				ContainerPath: "/usr/share/nginx/html",
				ReadOnly:      false,
			},
		},
		Network: "my-network",
	}

	// 创建容器
	container, err := manager.CreateContainer(ctx, config)
	if err != nil {
		log.Fatalf("创建容器失败: %v", err)
	}
	fmt.Printf("创建容器成功: %s\n", container.Name)

	// 启动容器
	err = manager.StartContainer(ctx, container.ID)
	if err != nil {
		log.Fatalf("启动容器失败: %v", err)
	}
	fmt.Printf("启动容器成功: %s\n", container.Name)

	// 等待容器启动
	time.Sleep(2 * time.Second)

	// 执行命令
	output, err := manager.ExecuteCommand(ctx, container.ID, []string{"ls", "-la"})
	if err != nil {
		log.Printf("执行命令失败: %v", err)
	} else {
		fmt.Printf("命令输出:\n%s\n", output)
	}

	// 获取容器日志
	logs, err := manager.GetContainerLogs(ctx, container.ID, 10)
	if err != nil {
		log.Printf("获取日志失败: %v", err)
	} else {
		fmt.Printf("容器日志:\n")
		for _, log := range logs {
			fmt.Println(log)
		}
	}

	// 列出所有容器
	containers, err := manager.ListContainers(ctx)
	if err != nil {
		log.Printf("列出容器失败: %v", err)
	} else {
		fmt.Printf("容器列表:\n")
		for _, c := range containers {
			fmt.Printf("- %s (%s): %s\n", c.Name, c.ID[:12], c.Status)
		}
	}

	// 获取容器统计信息
	stats, err := manager.GetContainerStats(ctx, container.ID)
	if err != nil {
		log.Printf("获取统计信息失败: %v", err)
	} else {
		fmt.Printf("容器统计信息: CPU使用率=%v, 内存使用=%v\n", 
			stats.CPUStats.CPUUsage.TotalUsage, 
			stats.MemoryStats.Usage)
	}

	// 停止容器
	err = manager.StopContainer(ctx, container.ID, nil)
	if err != nil {
		log.Printf("停止容器失败: %v", err)
	} else {
		fmt.Printf("停止容器成功: %s\n", container.Name)
	}

	// 删除容器
	err = manager.RemoveContainer(ctx, container.ID, true)
	if err != nil {
		log.Printf("删除容器失败: %v", err)
	} else {
		fmt.Printf("删除容器成功: %s\n", container.Name)
	}
}
