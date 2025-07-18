package main

import (
	"context"
	"fmt"
	"log"
	"time"
)

// 简化版容器测试
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