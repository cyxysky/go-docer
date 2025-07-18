package main

import (
	"log"
	"os"
)

func main() {
	// 检查是否有测试参数
	if len(os.Args) > 1 && os.Args[1] == "test" {
		runTests()
		return
	}

	// 检查是否有简化版测试参数
	if len(os.Args) > 1 && os.Args[1] == "test-simple" {
		runSimpleTests()
		return
	}

	// 检查是否使用简化版容器
	if len(os.Args) > 1 && os.Args[1] == "simple" {
		// 使用简化版CLI
		cli, err := NewSimpleCLI()
		if err != nil {
			log.Fatalf("创建简化版CLI失败: %v", err)
		}
		// 移除 "simple" 参数
		os.Args = append(os.Args[:1], os.Args[2:]...)
		cli.Run()
		return
	}

	// 尝试创建Docker版本的CLI
	cli, err := NewCLI()
	if err != nil {
		log.Printf("Docker版本CLI创建失败: %v", err)
		log.Println("尝试使用简化版容器管理器...")
		
		// 使用简化版CLI
		simpleCLI, err := NewSimpleCLI()
		if err != nil {
			log.Fatalf("创建简化版CLI也失败: %v", err)
		}
		simpleCLI.Run()
		return
	}

	// 运行Docker版本CLI
	cli.Run()
} 