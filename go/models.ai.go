package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// AIConfigData 定义AI配置数据
type AIConfigData struct {
	DefaultModel string              `json:"default_model"`
	Strategy     string              `json:"strategy"`
	Models       map[string]*AIModel `json:"models"`
}

// AI代码生成相关的结构体
type AICodeGenerationRequest struct {
	Prompt      string   `json:"prompt"`
	Context     string   `json:"context"`
	Workspace   string   `json:"workspace"`
	Language    string   `json:"language"`
	Model       string   `json:"model,omitempty"`
	Strategy    string   `json:"strategy,omitempty"`
	Files       []string `json:"files,omitempty"`
	FilePaths   []string `json:"file_paths,omitempty"` // 新增：文件路径数组
	Tools       []string `json:"tools,omitempty"`
	AutoApply   bool     `json:"auto_apply,omitempty"`    // 新增：自动应用模式
	MaxFileSize int64    `json:"max_file_size,omitempty"` // 新增：最大文件大小限制
}

type AICodeGenerationResponse struct {
	Success     bool             `json:"success"`
	Code        string           `json:"code,omitempty"`
	Message     string           `json:"message,omitempty"`
	CodeChanges []CodeChange     `json:"code_changes,omitempty"`
	Tools       []ToolCall       `json:"tools,omitempty"`
	Thinking    *ThinkingProcess `json:"thinking,omitempty"`
}

type ThinkingProcess struct {
	Analysis       string `json:"analysis,omitempty"`
	Planning       string `json:"planning,omitempty"`
	Considerations string `json:"considerations,omitempty"`
	Decisions      string `json:"decisions,omitempty"`
	MissingInfo    string `json:"missing_info,omitempty"`
	NextSteps      string `json:"next_steps,omitempty"`
}

type CodeChange struct {
	FilePath     string  `json:"file_path"`
	OriginalCode string  `json:"original_code"`
	NewCode      string  `json:"new_code"`
	Description  string  `json:"description"`
	ChangeType   string  `json:"change_type"`
	Confidence   float64 `json:"confidence"`
}

type ToolCall struct {
	Name        string      `json:"name"`
	Parameters  interface{} `json:"parameters"`
	Result      interface{} `json:"result,omitempty"`
	Status      string      `json:"status"` // "pending", "success", "error"
	Error       string      `json:"error,omitempty"`
	ExecutionId string      `json:"execution_id,omitempty"`
	StartTime   *time.Time  `json:"start_time,omitempty"`
	EndTime     *time.Time  `json:"end_time,omitempty"`
	Output      string      `json:"output,omitempty"` // 用于存储shell命令输出
}

// 新增：AI模型配置
type AIModel struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Provider    string  `json:"provider"`
	Description string  `json:"description"`
	Endpoint    string  `json:"endpoint"`
	APIKey      string  `json:"api_key,omitempty"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float64 `json:"temperature"`
	IsDefault   bool    `json:"is_default"`
	IsEnabled   bool    `json:"is_enabled"`
}

// 新增：AI模型请求
type AIModelRequest struct {
	Name        string  `json:"name"`
	Provider    string  `json:"provider"`
	Description string  `json:"description"`
	Endpoint    string  `json:"endpoint"`
	APIKey      string  `json:"api_key"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float64 `json:"temperature"`
	IsDefault   bool    `json:"is_default"`
}

// 新增：AI模型管理器
type AIModelManager struct {
	models map[string]*AIModel
	mutex  sync.RWMutex
}

// 新增：AI配置
type AIConfig struct {
	DefaultModel string              `json:"default_model"`
	Models       map[string]*AIModel `json:"models"`
	Strategy     string              `json:"strategy"` // "preview", "auto", "manual"
}

// 工具调用历史记录
type ToolExecutionHistory struct {
	Attempt     int                   `json:"attempt"`
	Timestamp   time.Time             `json:"timestamp"`
	Prompt      string                `json:"prompt"`
	Response    string                `json:"response"`
	Status      string                `json:"status"` // "error", "success", "retry"
	ToolsCalled []ToolExecutionRecord `json:"tools_called"`
	FilesRead   map[string]string     `json:"files_read"`
	Error       string                `json:"error,omitempty"`
}

// 单个工具执行记录
type ToolExecutionRecord struct {
	Tool      string      `json:"tool"`
	Path      string      `json:"path"`
	Content   string      `json:"content,omitempty"`
	Reason    string      `json:"reason,omitempty"`
	Status    string      `json:"status"`
	Error     string      `json:"error,omitempty"`
	Result    interface{} `json:"result,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// 自定义错误类型，用于标识需要自动重试的情况
type AutoRetryError struct {
	Message         string
	AdditionalFiles map[string]string
	NextStep        string
}

// AI模型管理方法
func (amm *AIModelManager) GetAllModels() []*AIModel {
	amm.mutex.RLock()
	defer amm.mutex.RUnlock()

	var models []*AIModel
	for _, model := range amm.models {
		models = append(models, model)
	}
	return models
}

func (amm *AIModelManager) GetModel(id string) *AIModel {
	amm.mutex.RLock()
	defer amm.mutex.RUnlock()
	return amm.models[id]
}

func (amm *AIModelManager) AddModel(req AIModelRequest) (*AIModel, error) {
	amm.mutex.Lock()
	defer amm.mutex.Unlock()

	// 生成唯一ID
	modelID := fmt.Sprintf("model_%d", time.Now().UnixNano())

	// 强制设置温度为1以获得绝对输出
	temperature := 1.0

	model := &AIModel{
		ID:          modelID,
		Name:        req.Name,
		Provider:    req.Provider,
		Description: req.Description,
		Endpoint:    req.Endpoint,
		APIKey:      req.APIKey,
		MaxTokens:   req.MaxTokens,
		Temperature: temperature, // 强制设置为1
		IsDefault:   req.IsDefault,
		IsEnabled:   true,
	}

	// 如果设置为默认模型，取消其他模型的默认状态
	if req.IsDefault {
		for _, existingModel := range amm.models {
			existingModel.IsDefault = false
		}
	}

	amm.models[modelID] = model
	return model, nil
}

func (amm *AIModelManager) UpdateModel(id string, req AIModelRequest) (*AIModel, error) {
	amm.mutex.Lock()
	defer amm.mutex.Unlock()

	model, exists := amm.models[id]
	if !exists {
		return nil, fmt.Errorf("模型不存在: %s", id)
	}

	model.Name = req.Name
	model.Provider = req.Provider
	model.Description = req.Description
	model.Endpoint = req.Endpoint
	model.APIKey = req.APIKey
	model.MaxTokens = req.MaxTokens
	model.Temperature = req.Temperature

	// 如果设置为默认模型，取消其他模型的默认状态
	if req.IsDefault {
		for _, existingModel := range amm.models {
			existingModel.IsDefault = false
		}
		model.IsDefault = true
	}

	return model, nil
}

func (amm *AIModelManager) DeleteModel(id string) error {
	amm.mutex.Lock()
	defer amm.mutex.Unlock()

	model, exists := amm.models[id]
	if !exists {
		return fmt.Errorf("模型不存在: %s", id)
	}

	// 不允许删除默认模型
	if model.IsDefault {
		return fmt.Errorf("不能删除默认模型")
	}

	delete(amm.models, id)
	return nil
}

func (amm *AIModelManager) SetDefaultModel(id string) error {
	amm.mutex.Lock()
	defer amm.mutex.Unlock()

	model, exists := amm.models[id]
	if !exists {
		return fmt.Errorf("模型不存在: %s", id)
	}

	// 取消所有模型的默认状态
	for _, existingModel := range amm.models {
		existingModel.IsDefault = false
	}

	// 设置新的默认模型
	model.IsDefault = true
	return nil
}

func (amm *AIModelManager) GetDefaultModel() *AIModel {
	amm.mutex.RLock()
	defer amm.mutex.RUnlock()

	for _, model := range amm.models {
		if model.IsDefault {
			return model
		}
	}
	return nil
}

// 添加AI代码生成方法
func (oem *OnlineEditorManager) GenerateCodeWithAI(req AICodeGenerationRequest) (*AICodeGenerationResponse, error) {
	// 确定使用的模型
	var model *AIModel
	if req.Model != "" {
		model = oem.aiModelManager.GetModel(req.Model)
		if model == nil {
			return &AICodeGenerationResponse{
				Success: false,
				Message: fmt.Sprintf("指定的AI模型不存在: %s", req.Model),
			}, nil
		}
	} else {
		model = oem.aiModelManager.GetDefaultModel()
		if model == nil {
			return &AICodeGenerationResponse{
				Success: false,
				Message: "未配置默认AI模型，请先配置AI模型",
			}, nil
		}
	}

	if !model.IsEnabled {
		return &AICodeGenerationResponse{
			Success: false,
			Message: fmt.Sprintf("AI模型已禁用: %s", model.Name),
		}, nil
	}

	// 读取相关文件内容
	fileContents := make(map[string]string)
	maxFileSize := int64(1024 * 1024 * 10) // 默认10MB限制
	if req.MaxFileSize > 0 {
		maxFileSize = req.MaxFileSize
	}

	// 处理Files字段（已有文件内容）
	if len(req.Files) > 0 {
		for _, filePath := range req.Files {
			content, err := oem.ReadFile(req.Workspace, filePath)
			if err == nil && int64(len(content)) <= maxFileSize {
				fileContents[filePath] = content
			}
		}
	}

	// 处理FilePaths字段（需要读取的文件路径）
	if len(req.FilePaths) > 0 {
		for _, filePath := range req.FilePaths {
			content, err := oem.ReadFile(req.Workspace, filePath)
			if err == nil && int64(len(content)) <= maxFileSize {
				fileContents[filePath] = content
			}
		}
	}

	// 获取文件树
	fileTree, err := oem.GetWorkspaceFileTree(req.Workspace)
	if err != nil {
		oem.logError("获取文件树", err)
		fileTree = []string{} // 如果失败，使用空数组
	}

	// 构建AI提示词
	prompt := oem.buildAIPrompt(req.Prompt, req.Context, req.Language, fileContents)

	// 替换文件树占位符
	fileTreeJSON := ""
	if len(fileTree) > 0 {
		fileTreeEntries := make([]string, len(fileTree))
		for i, file := range fileTree {
			fileTreeEntries[i] = fmt.Sprintf("    \"%s\"", file)
		}
		fileTreeJSON = strings.Join(fileTreeEntries, ",\n")
	} else {
		// 如果没有文件树，至少提供一个空的提示
		fileTreeJSON = "    \"(暂无文件)\""
	}
	prompt = strings.ReplaceAll(prompt, "    \"{{FILE_TREE_PLACEHOLDER}}\"", fileTreeJSON)

	// 调用AI API
	response, err := oem.callAIWithModel(prompt, req.Tools, model)
	if err != nil {
		return &AICodeGenerationResponse{
			Success: false,
			Message: fmt.Sprintf("AI服务调用失败: %v", err),
		}, err
	}

	// 实现循环重试机制，最多20次
	maxRetries := 20
	var executionHistory []ToolExecutionHistory

	for attempt := 1; attempt <= maxRetries; attempt++ {
		// 记录本次尝试的开始
		historyEntry := ToolExecutionHistory{
			Attempt:   attempt,
			Timestamp: time.Now(),
			Prompt:    prompt,
			FilesRead: make(map[string]string),
		}

		// 复制当前文件内容到历史记录
		for k, v := range fileContents {
			historyEntry.FilesRead[k] = v
		}

		oem.logInfo("AI代码生成尝试", map[string]interface{}{
			"attempt":     attempt,
			"max_retries": maxRetries,
			"files_count": len(fileContents),
		})

		// 解析AI响应
		codeChanges, tools, thinking, err := oem.parseAIResponse(response, req.Workspace)
		historyEntry.Response = response

		if err != nil {
			// 检查是否需要自动重试
			if autoRetryErr, ok := err.(*AutoRetryError); ok {
				historyEntry.Status = "retry"
				historyEntry.Error = autoRetryErr.Message

				oem.logInfo("AI建议自动重试", map[string]interface{}{
					"attempt":          attempt,
					"message":          autoRetryErr.Message,
					"additional_files": len(autoRetryErr.AdditionalFiles),
					"next_step":        autoRetryErr.NextStep,
				})

				// 合并新获取的文件内容
				for filePath, content := range autoRetryErr.AdditionalFiles {
					fileContents[filePath] = content
					historyEntry.FilesRead[filePath] = content
				}

				// 保存历史记录
				executionHistory = append(executionHistory, historyEntry)

				// 如果已经达到最大重试次数，返回失败
				if attempt >= maxRetries {
					return &AICodeGenerationResponse{
						Success: false,
						Message: fmt.Sprintf("达到最大重试次数(%d)，最后错误: %s", maxRetries, autoRetryErr.Message),
						Tools:   oem.buildToolHistorySummary(executionHistory),
					}, fmt.Errorf("达到最大重试次数: %d", maxRetries)
				}

				// 重新构建提示词
				prompt = oem.buildAIPrompt(req.Prompt, req.Context, req.Language, fileContents)

				// 重新替换文件树占位符
				if len(fileTree) > 0 {
					fileTreeEntries := make([]string, len(fileTree))
					for i, file := range fileTree {
						fileTreeEntries[i] = fmt.Sprintf("    \"%s\"", file)
					}
					fileTreeJSON = strings.Join(fileTreeEntries, ",\n")
				} else {
					fileTreeJSON = "    \"(暂无文件)\""
				}
				prompt = strings.ReplaceAll(prompt, "    \"{{FILE_TREE_PLACEHOLDER}}\"", fileTreeJSON)

				// 添加重试上下文信息
				prompt += fmt.Sprintf("\n\n【重试信息】\n这是第%d次尝试（共%d次）。之前的尝试失败原因：%s\n", attempt+1, maxRetries, autoRetryErr.Message)

				// 重新调用AI API
				response, err = oem.callAIWithModel(prompt, req.Tools, model)
				if err != nil {
					historyEntry.Status = "error"
					historyEntry.Error = fmt.Sprintf("AI服务调用失败: %v", err)
					executionHistory = append(executionHistory, historyEntry)

					return &AICodeGenerationResponse{
						Success: false,
						Message: fmt.Sprintf("AI服务重试调用失败: %v", err),
						Tools:   oem.buildToolHistorySummary(executionHistory),
					}, err
				}

				// 继续下一次循环
				continue
			} else {
				// 非重试错误，直接返回失败
				historyEntry.Status = "error"
				historyEntry.Error = err.Error()
				executionHistory = append(executionHistory, historyEntry)

				return &AICodeGenerationResponse{
					Success: false,
					Message: fmt.Sprintf("AI响应解析失败: %v", err),
					Tools:   oem.buildToolHistorySummary(executionHistory),
				}, err
			}
		}

		// 成功情况
		historyEntry.Status = "success"
		executionHistory = append(executionHistory, historyEntry)

		oem.logInfo("AI代码生成成功", map[string]interface{}{
			"attempt":      attempt,
			"total_files":  len(fileContents),
			"code_changes": len(codeChanges),
			"tools_used":   len(tools),
		})

		return &AICodeGenerationResponse{
			Success:     true,
			Code:        response,
			Message:     fmt.Sprintf("代码生成成功 (第%d次尝试)", attempt),
			CodeChanges: codeChanges,
			Tools:       append(tools, oem.buildToolHistorySummary(executionHistory)...),
			Thinking:    thinking,
		}, nil
	}

	// 这里不应该到达，但为了安全起见
	return &AICodeGenerationResponse{
		Success: false,
		Message: "未知错误：超出最大重试次数",
		Tools:   oem.buildToolHistorySummary(executionHistory),
	}, fmt.Errorf("未知错误：超出最大重试次数")
}

// 调用AI API（支持多模型）
func (oem *OnlineEditorManager) callAIWithModel(prompt string, tools []string, model *AIModel) (string, error) {
	// 构建工具定义
	var functions []map[string]interface{}

	for _, tool := range tools {
		switch tool {
		case "file_read":
			functions = append(functions, map[string]interface{}{
				"name":        "file_read",
				"description": "读取文件内容",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{
							"type":        "string",
							"description": "文件路径",
						},
					},
					"required": []string{"file_path"},
				},
			})
		case "file_write":
			functions = append(functions, map[string]interface{}{
				"name":        "file_write",
				"description": "写入文件内容",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{
							"type":        "string",
							"description": "文件路径",
						},
						"content": map[string]interface{}{
							"type":        "string",
							"description": "文件内容",
						},
					},
					"required": []string{"file_path", "content"},
				},
			})
		case "code_analysis":
			functions = append(functions, map[string]interface{}{
				"name":        "code_analysis",
				"description": "分析代码结构和依赖关系",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{
							"type":        "string",
							"description": "文件路径",
						},
					},
					"required": []string{"file_path"},
				},
			})
		}
	}

	requestBody := map[string]interface{}{
		"model": model.Name,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "你是一个专业的代码助手，可以分析代码并提供改进建议。",
			},
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"max_tokens":  model.MaxTokens,
		"temperature": model.Temperature,
	}

	if len(functions) > 0 {
		requestBody["functions"] = functions
		requestBody["function_call"] = "auto"
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("序列化请求失败: %v", err)
	}

	req, err := http.NewRequest("POST", model.Endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	fmt.Println("Bearer " + model.APIKey)
	req.Header.Set("Authorization", "Bearer "+model.APIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var response map[string]interface{}
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("解析响应失败: %v", err)
	}

	// 提取生成的代码
	if choices, ok := response["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					return strings.TrimSpace(content), nil
				}
			}
		}
	}

	return "", fmt.Errorf("无法从响应中提取代码")
}

// 解析代码更改
// 解析AI响应，处理新的JSON格式（包含状态验证和自动工具执行）
func (oem *OnlineEditorManager) parseAIResponse(response, workspaceID string) ([]CodeChange, []ToolCall, *ThinkingProcess, error) {
	fmt.Println(response)
	var aiResponse struct {
		Status        string   `json:"status"`
		Message       string   `json:"message,omitempty"`
		Suggestions   []string `json:"suggestions,omitempty"`
		RequiredTools []struct {
			Tool   string `json:"tool"`
			Path   string `json:"path"`
			Reason string `json:"reason,omitempty"`
		} `json:"required_tools,omitempty"`
		NextStep string `json:"next_step,omitempty"`
		Change   []struct {
			Tool    string `json:"tool"`
			Path    string `json:"path"`
			Content string `json:"content,omitempty"`
		} `json:"change,omitempty"`
		Thinking struct {
			Analysis       string `json:"analysis,omitempty"`
			Planning       string `json:"planning,omitempty"`
			Considerations string `json:"considerations,omitempty"`
			Decisions      string `json:"decisions,omitempty"`
			MissingInfo    string `json:"missing_info,omitempty"`
			NextSteps      string `json:"next_steps,omitempty"`
		} `json:"thinking,omitempty"`
	}

	// 清理响应字符串，移除可能的markdown标记
	cleanResponse := strings.TrimSpace(response)
	if strings.HasPrefix(cleanResponse, "```json") {
		cleanResponse = strings.TrimPrefix(cleanResponse, "```json")
	}
	if strings.HasPrefix(cleanResponse, "```") {
		cleanResponse = strings.TrimPrefix(cleanResponse, "```")
	}
	if strings.HasSuffix(cleanResponse, "```") {
		cleanResponse = strings.TrimSuffix(cleanResponse, "```")
	}
	cleanResponse = strings.TrimSpace(cleanResponse)

	err := json.Unmarshal([]byte(cleanResponse), &aiResponse)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("JSON解析失败: %v, 响应内容: %s", err, cleanResponse)
	}

	// 检查AI响应状态
	if aiResponse.Status == "error" {
		// 如果AI提供了具体的工具调用建议，自动执行这些工具
		if len(aiResponse.RequiredTools) > 0 {
			oem.logInfo("AI建议执行工具", map[string]interface{}{
				"message":        aiResponse.Message,
				"required_tools": len(aiResponse.RequiredTools),
			})

			// 执行AI建议的工具调用
			additionalFiles, err := oem.executeRequiredTools(workspaceID, aiResponse.RequiredTools)
			if err != nil {
				return nil, nil, nil, fmt.Errorf("执行AI建议的工具失败: %v", err)
			}

			// 返回特殊标识，表示需要重新请求
			return nil, nil, nil, &AutoRetryError{
				Message:         aiResponse.Message,
				AdditionalFiles: additionalFiles,
				NextStep:        aiResponse.NextStep,
			}
		}

		// 如果没有具体的工具建议，返回错误
		errorMsg := "AI无法完成请求"
		if aiResponse.Message != "" {
			errorMsg = aiResponse.Message
		}
		if len(aiResponse.Suggestions) > 0 {
			errorMsg += "\n建议：\n"
			for _, suggestion := range aiResponse.Suggestions {
				errorMsg += "- " + suggestion + "\n"
			}
		}
		return nil, nil, nil, fmt.Errorf("AI拒绝执行: %s", errorMsg)
	}

	// 验证成功状态下必须有change数组
	if aiResponse.Status == "success" && len(aiResponse.Change) == 0 {
		return nil, nil, nil, fmt.Errorf("AI声称成功但未提供任何操作")
	}

	// 预先验证所有操作的完整性
	if err := oem.validateAIOperations(aiResponse.Change); err != nil {
		return nil, nil, nil, fmt.Errorf("AI响应验证失败: %v", err)
	}

	var codeChanges []CodeChange
	var toolCalls []ToolCall

	for _, change := range aiResponse.Change {
		startTime := time.Now()

		toolCall := ToolCall{
			Name:        change.Tool,
			Parameters:  map[string]interface{}{"path": change.Path},
			Status:      "pending",
			ExecutionId: fmt.Sprintf("tool_%d", time.Now().UnixNano()),
			StartTime:   &startTime,
		}

		switch change.Tool {
		case "file_read":
			// 执行文件读取
			content, err := oem.ReadFile(workspaceID, change.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = content
				toolCall.Output = fmt.Sprintf("读取文件 %s 成功，长度: %d", change.Path, len(content))
			}

		case "file_write":
			if change.Content == "" {
				toolCall.Status = "error"
				toolCall.Error = "文件内容不能为空"
			} else {
				// 读取原始文件内容用于代码对比
				originalContent, _ := oem.ReadFile(workspaceID, change.Path)

				// 执行文件写入
				err := oem.WriteFile(workspaceID, change.Path, change.Content)
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					toolCall.Status = "success"
					toolCall.Result = "文件写入成功"
					toolCall.Output = fmt.Sprintf("写入文件 %s 成功，长度: %d", change.Path, len(change.Content))
					if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
						params["content"] = change.Content
					}

					// 创建代码变更记录
					codeChange := CodeChange{
						FilePath:     change.Path,
						OriginalCode: originalContent,
						NewCode:      change.Content,
						Description:  fmt.Sprintf("更新文件 %s", change.Path),
						ChangeType:   "modify",
						Confidence:   0.95,
					}
					codeChanges = append(codeChanges, codeChange)
				}
			}

		case "file_create":
			if change.Content == "" {
				toolCall.Status = "error"
				toolCall.Error = "文件内容不能为空"
			} else {
				// 执行文件创建
				err := oem.CreateFile(workspaceID, change.Path)
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					// 写入内容
					err = oem.WriteFile(workspaceID, change.Path, change.Content)
					if err != nil {
						toolCall.Status = "error"
						toolCall.Error = err.Error()
					} else {
						toolCall.Status = "success"
						toolCall.Result = "文件创建成功"
						toolCall.Output = fmt.Sprintf("创建文件 %s 成功，长度: %d", change.Path, len(change.Content))
						if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
							params["content"] = change.Content
						}

						// 创建代码变更记录
						codeChange := CodeChange{
							FilePath:     change.Path,
							OriginalCode: "",
							NewCode:      change.Content,
							Description:  fmt.Sprintf("创建文件 %s", change.Path),
							ChangeType:   "insert",
							Confidence:   0.95,
						}
						codeChanges = append(codeChanges, codeChange)
					}
				}
			}

		case "file_delete":
			// 执行文件删除
			err := oem.DeleteFile(workspaceID, change.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件删除成功"
				toolCall.Output = fmt.Sprintf("删除文件 %s 成功", change.Path)

				// 创建代码变更记录
				codeChange := CodeChange{
					FilePath:     change.Path,
					OriginalCode: "文件已删除",
					NewCode:      "",
					Description:  fmt.Sprintf("删除文件 %s", change.Path),
					ChangeType:   "delete",
					Confidence:   0.95,
				}
				codeChanges = append(codeChanges, codeChange)
			}

		case "file_create_folder":
			// 执行文件夹创建
			err := oem.CreateFolder(workspaceID, change.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件夹创建成功"
				toolCall.Output = fmt.Sprintf("创建文件夹 %s 成功", change.Path)
			}

		case "file_delete_folder":
			// 执行文件夹删除
			err := oem.DeleteFile(workspaceID, change.Path) // 使用DeleteFile也可以删除文件夹
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件夹删除成功"
				toolCall.Output = fmt.Sprintf("删除文件夹 %s 成功", change.Path)
			}

		default:
			toolCall.Status = "error"
			toolCall.Error = fmt.Sprintf("不支持的工具: %s", change.Tool)
		}

		endTime := time.Now()
		toolCall.EndTime = &endTime
		toolCalls = append(toolCalls, toolCall)
	}

	// 构建思考过程
	thinking := &ThinkingProcess{
		Analysis:       aiResponse.Thinking.Analysis,
		Planning:       aiResponse.Thinking.Planning,
		Considerations: aiResponse.Thinking.Considerations,
		Decisions:      aiResponse.Thinking.Decisions,
		MissingInfo:    aiResponse.Thinking.MissingInfo,
		NextSteps:      aiResponse.Thinking.NextSteps,
	}

	return codeChanges, toolCalls, thinking, nil
}

func (e *AutoRetryError) Error() string {
	return fmt.Sprintf("需要自动重试: %s", e.Message)
}

// 执行AI建议的必需工具（带详细记录）
func (oem *OnlineEditorManager) executeRequiredTools(workspaceID string, requiredTools []struct {
	Tool   string `json:"tool"`
	Path   string `json:"path"`
	Reason string `json:"reason,omitempty"`
}) (map[string]string, error) {
	additionalFiles := make(map[string]string)
	var executionRecords []ToolExecutionRecord

	for _, tool := range requiredTools {
		record := ToolExecutionRecord{
			Tool:      tool.Tool,
			Path:      tool.Path,
			Reason:    tool.Reason,
			Timestamp: time.Now(),
		}

		oem.logInfo("执行AI建议的工具", map[string]interface{}{
			"tool":   tool.Tool,
			"path":   tool.Path,
			"reason": tool.Reason,
		})

		switch tool.Tool {
		case "file_read":
			content, err := oem.ReadFile(workspaceID, tool.Path)
			if err != nil {
				record.Status = "error"
				record.Error = err.Error()
				oem.logError("自动文件读取失败", err)
				executionRecords = append(executionRecords, record)
				// 不要因为单个文件读取失败就终止整个流程
				continue
			}
			record.Status = "success"
			record.Result = fmt.Sprintf("成功读取 %d 字符", len(content))
			additionalFiles[tool.Path] = content

		case "file_create":
			// 创建空文件或默认模板
			err := oem.CreateFile(workspaceID, tool.Path)
			if err != nil {
				record.Status = "error"
				record.Error = err.Error()
				oem.logError("自动文件创建失败", err)
				executionRecords = append(executionRecords, record)
				continue
			}
			record.Status = "success"
			record.Result = "文件创建成功"
			additionalFiles[tool.Path] = ""

		case "file_create_folder":
			// 创建文件夹
			err := oem.CreateFolder(workspaceID, tool.Path)
			if err != nil {
				record.Status = "error"
				record.Error = err.Error()
				oem.logError("自动文件夹创建失败", err)
				executionRecords = append(executionRecords, record)
				continue
			}
			record.Status = "success"
			record.Result = "文件夹创建成功"

		default:
			record.Status = "skipped"
			record.Error = "不支持的工具类型"
			oem.logInfo("跳过不支持的自动工具", map[string]interface{}{
				"tool": tool.Tool,
			})
		}

		executionRecords = append(executionRecords, record)
	}

	// 记录执行结果
	oem.logInfo("工具执行完成", map[string]interface{}{
		"total_tools":       len(requiredTools),
		"files_read":        len(additionalFiles),
		"execution_records": len(executionRecords),
	})

	return additionalFiles, nil
}

// 构建工具历史摘要
func (oem *OnlineEditorManager) buildToolHistorySummary(history []ToolExecutionHistory) []ToolCall {
	var toolCalls []ToolCall

	for _, entry := range history {
		// 为每次尝试创建一个摘要工具调用
		startTime := entry.Timestamp
		endTime := entry.Timestamp.Add(time.Second) // 估算结束时间

		toolCall := ToolCall{
			Name: "execution_summary",
			Parameters: map[string]interface{}{
				"attempt":      entry.Attempt,
				"status":       entry.Status,
				"files_read":   len(entry.FilesRead),
				"tools_called": len(entry.ToolsCalled),
			},
			Status:      entry.Status,
			ExecutionId: fmt.Sprintf("attempt_%d", entry.Attempt),
			StartTime:   &startTime,
			EndTime:     &endTime,
			Output:      fmt.Sprintf("第%d次尝试: %s", entry.Attempt, entry.Status),
		}

		if entry.Error != "" {
			toolCall.Error = entry.Error
		}

		toolCalls = append(toolCalls, toolCall)
	}

	return toolCalls
}

// 验证AI操作的完整性
func (oem *OnlineEditorManager) validateAIOperations(operations []struct {
	Tool    string `json:"tool"`
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
}) error {
	supportedTools := map[string]bool{
		"file_read":          true,
		"file_write":         true,
		"file_create":        true,
		"file_delete":        true,
		"file_create_folder": true,
		"file_delete_folder": true,
	}

	// 移除调试输出
	fmt.Println(operations)

	for i, op := range operations {
		// 验证工具名称
		if !supportedTools[op.Tool] {
			return fmt.Errorf("操作 %d: 不支持的工具 '%s'", i+1, op.Tool)
		}

		// 验证路径
		if op.Path == "" {
			return fmt.Errorf("操作 %d: 路径不能为空", i+1)
		}

		// 验证路径格式（不能是绝对路径，不能包含危险字符）
		if strings.HasPrefix(op.Path, "/") || strings.HasPrefix(op.Path, "\\") {
			return fmt.Errorf("操作 %d: 路径不能是绝对路径: %s", i+1, op.Path)
		}

		if strings.Contains(op.Path, "..") {
			return fmt.Errorf("操作 %d: 路径不能包含 '..' : %s", i+1, op.Path)
		}

		// 验证需要内容的操作
		needsContent := map[string]bool{
			"file_write":  true,
			"file_create": true,
		}

		if needsContent[op.Tool] && op.Content == "" {
			return fmt.Errorf("操作 %d: %s 操作必须提供文件内容", i+1, op.Tool)
		}

		// 验证文件夹操作
		folderOps := map[string]bool{
			"file_create_folder": true,
			"file_delete_folder": true,
		}

		if folderOps[op.Tool] && op.Content != "" {
			return fmt.Errorf("操作 %d: 文件夹操作不应包含内容", i+1)
		}
	}

	return nil
}
