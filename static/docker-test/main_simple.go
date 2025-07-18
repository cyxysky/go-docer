package main

import (
	"log"
	"os"
)

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