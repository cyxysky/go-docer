package main

import (
	"context"
	"fmt"
	"log"
	"time"
)

// 测试示例
func testExample() {
	// 创建容器管理器
	manager, err := NewContainerManager()
	if err != nil {
		log.Fatalf("创建容器管理器失败: %v", err)
	}

	ctx := context.Background()

	fmt.Println("=== 容器管理系统测试示例 ===")

	// 1. 创建网络
	fmt.Println("\n1. 创建网络...")
	network, err := manager.CreateNetwork(ctx, "test-network", "bridge", "172.19.0.0/16")
	if err != nil {
		log.Printf("创建网络失败: %v", err)
	} else {
		fmt.Printf("✓ 网络创建成功: %s (ID: %s)\n", network.Name, network.ID[:12])
	}

	// 2. 创建容器
	fmt.Println("\n2. 创建容器...")
	config := &ContainerConfig{
		Name:  "test-nginx",
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
				HostPath:      "/tmp/test-nginx",
				ContainerPath: "/usr/share/nginx/html",
				ReadOnly:      false,
			},
		},
		Network: "test-network",
		Environment: map[string]string{
			"NGINX_HOST": "localhost",
			"NGINX_PORT": "80",
		},
	}

	container, err := manager.CreateContainer(ctx, config)
	if err != nil {
		log.Fatalf("创建容器失败: %v", err)
	}
	fmt.Printf("✓ 容器创建成功: %s (ID: %s)\n", container.Name, container.ID[:12])

	// 3. 启动容器
	fmt.Println("\n3. 启动容器...")
	err = manager.StartContainer(ctx, container.ID)
	if err != nil {
		log.Fatalf("启动容器失败: %v", err)
	}
	fmt.Printf("✓ 容器启动成功: %s\n", container.Name)

	// 4. 等待容器启动
	fmt.Println("\n4. 等待容器启动...")
	time.Sleep(3 * time.Second)

	// 5. 执行命令
	fmt.Println("\n5. 在容器中执行命令...")
	output, err := manager.ExecuteCommand(ctx, container.ID, []string{"ls", "-la", "/usr/share/nginx/html"})
	if err != nil {
		log.Printf("执行命令失败: %v", err)
	} else {
		fmt.Printf("✓ 命令执行成功:\n%s\n", output)
	}

	// 6. 获取容器日志
	fmt.Println("\n6. 获取容器日志...")
	logs, err := manager.GetContainerLogs(ctx, container.ID, 5)
	if err != nil {
		log.Printf("获取日志失败: %v", err)
	} else {
		fmt.Printf("✓ 容器日志 (最后5行):\n")
		for _, log := range logs {
			fmt.Printf("  %s\n", log)
		}
	}

	// 7. 列出所有容器
	fmt.Println("\n7. 列出所有容器...")
	containers, err := manager.ListContainers(ctx)
	if err != nil {
		log.Printf("列出容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器列表:\n")
		for _, c := range containers {
			fmt.Printf("  - %s (%s): %s\n", c.Name, c.ID[:12], c.Status)
		}
	}

	// 8. 获取容器统计信息
	fmt.Println("\n8. 获取容器统计信息...")
	stats, err := manager.GetContainerStats(ctx, container.ID)
	if err != nil {
		log.Printf("获取统计信息失败: %v", err)
	} else {
		fmt.Printf("✓ 容器统计信息:\n")
		fmt.Printf("  CPU使用率: %v\n", stats.CPUStats.CPUUsage.TotalUsage)
		fmt.Printf("  内存使用: %v bytes\n", stats.MemoryStats.Usage)
	}

	// 9. 停止容器
	fmt.Println("\n9. 停止容器...")
	err = manager.StopContainer(ctx, container.ID, nil)
	if err != nil {
		log.Printf("停止容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器停止成功: %s\n", container.Name)
	}

	// 10. 删除容器
	fmt.Println("\n10. 删除容器...")
	err = manager.RemoveContainer(ctx, container.ID, true)
	if err != nil {
		log.Printf("删除容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器删除成功: %s\n", container.Name)
	}

	fmt.Println("\n=== 测试完成 ===")
}

// 性能测试
func performanceTest() {
	fmt.Println("\n=== 性能测试 ===")

	manager, err := NewContainerManager()
	if err != nil {
		log.Fatalf("创建容器管理器失败: %v", err)
	}

	ctx := context.Background()

	// 测试并发创建容器
	fmt.Println("测试并发创建容器...")
	start := time.Now()

	containers := make([]*Container, 0)
	for i := 0; i < 3; i++ {
		config := &ContainerConfig{
			Name:  fmt.Sprintf("perf-test-%d", i),
			Image: "alpine:latest",
			Command: []string{"sleep", "10"},
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

	// 清理测试容器
	for _, container := range containers {
		manager.RemoveContainer(ctx, container.ID, true)
	}

	fmt.Println("✓ 性能测试完成")
}

// 网络测试
func networkTest() {
	fmt.Println("\n=== 网络测试 ===")

	manager, err := NewContainerManager()
	if err != nil {
		log.Fatalf("创建容器管理器失败: %v", err)
	}

	ctx := context.Background()

	// 创建自定义网络
	network, err := manager.CreateNetwork(ctx, "test-bridge", "bridge", "172.20.0.0/16")
	if err != nil {
		log.Printf("创建网络失败: %v", err)
		return
	}
	fmt.Printf("✓ 网络创建成功: %s\n", network.Name)

	// 创建连接到自定义网络的容器
	config := &ContainerConfig{
		Name:    "network-test",
		Image:   "alpine:latest",
		Network: network.Name,
		Command: []string{"sleep", "30"},
	}

	container, err := manager.CreateContainer(ctx, config)
	if err != nil {
		log.Printf("创建容器失败: %v", err)
		return
	}
	fmt.Printf("✓ 容器创建成功: %s\n", container.Name)

	// 启动容器
	err = manager.StartContainer(ctx, container.ID)
	if err != nil {
		log.Printf("启动容器失败: %v", err)
	} else {
		fmt.Printf("✓ 容器启动成功\n")
	}

	// 等待一段时间
	time.Sleep(2 * time.Second)

	// 清理
	manager.StopContainer(ctx, container.ID, nil)
	manager.RemoveContainer(ctx, container.ID, true)
	fmt.Printf("✓ 网络测试完成\n")
}

// 主测试函数
func runTests() {
	fmt.Println("开始运行容器管理系统测试...")

	// 运行基本功能测试
	testExample()

	// 运行性能测试
	performanceTest()

	// 运行网络测试
	networkTest()

	fmt.Println("\n所有测试完成!")
} 