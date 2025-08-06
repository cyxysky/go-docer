package main

import (
	"encoding/json"
	"fmt"
	"log"
)

// 模拟AI响应数据
func main() {
	// 模拟一个AI代码生成响应
	response := AICodeGenerationResponse{
		Success: true,
		Message: "代码生成成功 (第1次尝试)",
		Status:  "finish",
		FileChanges: []CodeChange{
			{
				FilePath:     "test.js",
				OriginalCode: "console.log('aaa');",
				NewCode:      "console.log('hello world');",
			},
			{
				FilePath:     "newfile.js",
				OriginalCode: "",
				NewCode:      "console.log('new file');",
			},
			{
				FilePath:     "oldfile.js",
				OriginalCode: "console.log('old file');",
				NewCode:      "",
			},
		},
		Tools: []ToolCall{
			{
				Name: "file_write",
				Parameters: map[string]interface{}{
					"path": "test.js",
					"code": map[string]string{
						"originalCode": "console.log('aaa');",
						"newCode":      "console.log('hello world');",
					},
				},
				Status:      "success",
				ExecutionId: "tool_123",
				Result:      "文件内容替换成功",
			},
			{
				Name: "file_create",
				Parameters: map[string]interface{}{
					"path":    "newfile.js",
					"content": "console.log('new file');",
				},
				Status:      "success",
				ExecutionId: "tool_124",
				Result:      "文件创建成功",
			},
			{
				Name: "file_delete",
				Parameters: map[string]interface{}{
					"path": "oldfile.js",
				},
				Status:      "success",
				ExecutionId: "tool_125",
				Result:      "文件删除成功",
			},
		},
	}

	// 序列化为JSON
	jsonData, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("AI代码生成响应示例:")
	fmt.Println(string(jsonData))

	// 验证FileChanges字段
	fmt.Println("\n文件变更详情:")
	for i, change := range response.FileChanges {
		fmt.Printf("变更 %d:\n", i+1)
		fmt.Printf("  文件路径: %s\n", change.FilePath)
		fmt.Printf("  原始代码长度: %d\n", len(change.OriginalCode))
		fmt.Printf("  新代码长度: %d\n", len(change.NewCode))
		
		// 判断操作类型
		operation := "edit"
		if change.OriginalCode == "" && change.NewCode != "" {
			operation = "create"
		} else if change.OriginalCode != "" && change.NewCode == "" {
			operation = "delete"
		}
		fmt.Printf("  操作类型: %s\n", operation)
		fmt.Println()
	}
} 