package main

import (
	"bufio"
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
	// 新增：工具调用历史记录
	ToolHistory []ToolExecutionRecord `json:"tool_history,omitempty"`
	// 新增：对话会话ID
	SessionID string `json:"session_id,omitempty"`
}

type AICodeGenerationResponse struct {
	Success     bool             `json:"success"`
	Message     string           `json:"message,omitempty"`
	Tools       []ToolCall       `json:"tools,omitempty"`
	Thinking    *ThinkingProcess `json:"thinking,omitempty"`
	FileChanges []CodeChange     `json:"file_changes,omitempty"` // 新增：文件变更记录
	// 新增：状态码，finish表示完成，retry表示需要重试
	Status string `json:"status"` // "finish", "retry"
	// 新增：对话会话ID
	SessionID string `json:"session_id,omitempty"`
	// 新增：推理模型的思维链内容（不回灌到提示词，仅用于展示）
	ReasoningContent string `json:"reasoning_content,omitempty"`
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
	FilePath     string `json:"file_path"`
	OriginalCode string `json:"original_code"`
	NewCode      string `json:"new_code"`
}

type ToolCall struct {
	Name        string          `json:"name"`
	Parameters  interface{}     `json:"parameters"`
	Result      interface{}     `json:"result,omitempty"`
	Status      string          `json:"status"` // "pending", "success", "error"
	Error       string          `json:"error,omitempty"`
	ExecutionId string          `json:"execution_id,omitempty"`
	StartTime   *time.Time      `json:"start_time,omitempty"`
	EndTime     *time.Time      `json:"end_time,omitempty"`
	Output      string          `json:"output,omitempty"`   // 用于存储shell命令输出
	Rollback    *RollbackAction `json:"rollback,omitempty"` // 回退操作
}

// 回退操作结构体
type RollbackAction struct {
	Type        string `json:"type"`        // 回退操作类型
	Path        string `json:"path"`        // 文件路径
	Content     string `json:"content"`     // 原始内容（用于恢复）
	Command     string `json:"command"`     // 回退命令
	Description string `json:"description"` // 回退描述
	IsVisible   bool   `json:"is_visible"`  // 是否在前端显示回退按钮
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
	IsReasoner  bool    `json:"is_reasoner"`
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

// AI对话管理器
type AIConversationManager struct {
	conversations map[string]*AIConversation // 按sessionID索引
	mutex         sync.RWMutex
}

// 创建新的对话会话
func (acm *AIConversationManager) CreateConversation(workspaceID string) *AIConversation {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	sessionID := fmt.Sprintf("session_%d", time.Now().UnixNano())
	conversation := &AIConversation{
		SessionID:   sessionID,
		WorkspaceID: workspaceID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Messages:    make([]AIConversationMessage, 0),
		ToolHistory: make(map[string]*ToolCallHistory),
	}

	acm.conversations[sessionID] = conversation
	return conversation
}

// 获取对话会话
func (acm *AIConversationManager) GetConversation(sessionID string) *AIConversation {
	acm.mutex.RLock()
	defer acm.mutex.RUnlock()
	return acm.conversations[sessionID]
}

// 获取工作空间的所有对话会话
func (acm *AIConversationManager) GetConversationsByWorkspace(workspaceID string) []*AIConversation {
	acm.mutex.RLock()
	defer acm.mutex.RUnlock()

	var conversations []*AIConversation
	for _, conv := range acm.conversations {
		if conv.WorkspaceID == workspaceID {
			conversations = append(conversations, conv)
		}
	}
	return conversations
}

// 添加用户消息
func (acm *AIConversationManager) AddUserMessage(sessionID, content string) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	message := AIConversationMessage{
		ID:        fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Type:      "user",
		Content:   content,
		Timestamp: time.Now(),
	}

	conversation.Messages = append(conversation.Messages, message)
	conversation.UpdatedAt = time.Now()
	return nil
}

// 添加AI助手消息
func (acm *AIConversationManager) AddAssistantMessage(sessionID, content string, tools []ToolCall, thinking *ThinkingProcess) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	message := AIConversationMessage{
		ID:        fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Type:      "assistant",
		Content:   content,
		Timestamp: time.Now(),
		Tools:     tools,
		Thinking:  thinking,
	}

	conversation.Messages = append(conversation.Messages, message)
	conversation.UpdatedAt = time.Now()

	// 将工具调用添加到工具历史中
	for _, tool := range tools {
		if tool.ExecutionId != "" {
			historyEntry := &ToolCallHistory{
				ExecutionID:  tool.ExecutionId,
				ToolCall:     &tool,
				Rollback:     tool.Rollback,
				IsRolledBack: false,
			}
			conversation.ToolHistory[tool.ExecutionId] = historyEntry
		}
	}

	return nil
}

// 新增：带推理内容的助手消息写入，不会在后续提示词中回灌 reasoning_content
func (acm *AIConversationManager) AddAssistantMessageWithReasoning(sessionID, content string, tools []ToolCall, thinking *ThinkingProcess, reasoning string) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	message := AIConversationMessage{
		ID:               fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Type:             "assistant",
		Content:          content,
		Timestamp:        time.Now(),
		Tools:            tools,
		Thinking:         thinking,
		ReasoningContent: reasoning,
	}

	conversation.Messages = append(conversation.Messages, message)
	conversation.UpdatedAt = time.Now()

	for _, tool := range tools {
		if tool.ExecutionId != "" {
			historyEntry := &ToolCallHistory{
				ExecutionID:  tool.ExecutionId,
				ToolCall:     &tool,
				Rollback:     tool.Rollback,
				IsRolledBack: false,
			}
			conversation.ToolHistory[tool.ExecutionId] = historyEntry
		}
	}

	return nil
}

// 获取对话历史（用于构建AI提示词）
func (acm *AIConversationManager) GetConversationHistory(sessionID string) []AIConversationMessage {
	acm.mutex.RLock()
	defer acm.mutex.RUnlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return nil
	}

	return conversation.Messages
}

// 删除对话会话
func (acm *AIConversationManager) DeleteConversation(sessionID string) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	if _, exists := acm.conversations[sessionID]; !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	delete(acm.conversations, sessionID)
	return nil
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
	// 处理对话会话
	var conversation *AIConversation
	if req.SessionID != "" {
		conversation = oem.aiConversationManager.GetConversation(req.SessionID)
		if conversation == nil {
			// 如果会话不存在，创建新会话
			conversation = oem.aiConversationManager.CreateConversation(req.Workspace)
		}
	} else {
		// 如果没有指定会话ID，创建新会话
		conversation = oem.aiConversationManager.CreateConversation(req.Workspace)
	}

	// 添加用户消息到对话历史
	if err := oem.aiConversationManager.AddUserMessage(conversation.SessionID, req.Prompt); err != nil {
		return &AICodeGenerationResponse{
			Success: false,
			Message: fmt.Sprintf("添加用户消息失败: %v", err),
		}, err
	}
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

	// 读取相关文件内容（支持文件夹路径自动展开）
	fileContents := make(map[string]string)
	maxFileSize := int64(1024 * 1024 * 10) // 默认10MB限制
	if req.MaxFileSize > 0 {
		maxFileSize = req.MaxFileSize
	}

	// 先获取文件树，便于将传入的文件夹路径展开为具体文件
	fileTree, err := oem.GetWorkspaceFileTree(req.Workspace)
	if err != nil {
		oem.logError("获取文件树", err)
		fileTree = []string{} // 如果失败，使用空数组
	}

	// 建立快速查找表
	fileSet := make(map[string]struct{}, len(fileTree))
	for _, f := range fileTree {
		fileSet[f] = struct{}{}
	}

	expandPaths := func(paths []string) []string {
		var expanded []string
		seen := make(map[string]struct{})
		for _, p := range paths {
			if p == "" {
				continue
			}
			// 归一化：去掉开头的'./'和前导'/'
			clean := strings.TrimPrefix(p, "./")
			clean = strings.TrimPrefix(clean, "/")
			// 如果是精确文件
			if _, ok := fileSet[clean]; ok {
				if _, dup := seen[clean]; !dup {
					expanded = append(expanded, clean)
					seen[clean] = struct{}{}
				}
				continue
			}
			// 作为目录前缀展开
			prefix := clean
			if !strings.HasSuffix(prefix, "/") {
				prefix += "/"
			}
			for _, f := range fileTree {
				if strings.HasPrefix(f, prefix) {
					if _, dup := seen[f]; !dup {
						expanded = append(expanded, f)
						seen[f] = struct{}{}
					}
				}
			}
		}
		return expanded
	}

	// 处理Files字段（可能包含文件或文件夹路径）
	if len(req.Files) > 0 {
		for _, filePath := range expandPaths(req.Files) {
			content, err := oem.ReadFile(req.Workspace, filePath)
			if err == nil && int64(len(content)) <= maxFileSize {
				fileContents[filePath] = content
			}
		}
	}

	// 处理FilePaths字段（可能包含文件或文件夹路径）
	// 按用户要求：如果是文件夹，直接传递路径，不展开、不读取内容（仅文件会被读取）
	if len(req.FilePaths) > 0 {
		for _, p := range req.FilePaths {
			clean := strings.TrimPrefix(p, "./")
			clean = strings.TrimPrefix(clean, "/")
			if _, ok := fileSet[clean]; ok {
				// 是具体文件，按大小限制读取
				content, err := oem.ReadFile(req.Workspace, clean)
				if err == nil && int64(len(content)) <= maxFileSize {
					fileContents[clean] = content
				}
			}
			// 如果不是具体文件（可能是目录前缀），不读取内容，仅作为路径参考传入提示词（提示词里已说明处理方式）
		}
	}

	// 实现循环重试机制，最多20次
	maxRetries := 20
	var executionHistory []ToolExecutionHistory
	var toolHistory []ToolExecutionRecord

	// 获取对话历史
	conversationHistory := oem.aiConversationManager.GetConversationHistory(conversation.SessionID)

	// 构建AI提示词 - 使用对话历史和工具历史
	prompt := oem.buildAIPromptWithHistory(req.Prompt, req.Context, fileContents, conversationHistory, toolHistory)

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
	prompt = strings.ReplaceAll(prompt, "\"{{FILE_TREE_PLACEHOLDER}}\"", fileTreeJSON)

	// 调用AI API（携带会话历史）
	response, err := oem.callAIWithModel(prompt, model, conversationHistory)
	if err != nil {
		return &AICodeGenerationResponse{
			Success: false,
			Message: fmt.Sprintf("AI服务调用失败: %v", err),
		}, err
	}

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

		// 调试输出：显示当前的工具历史状态
		fmt.Printf("============================== 第%d次尝试开始 ==============================\n", attempt)

		oem.logInfo("AI代码生成尝试", map[string]interface{}{
			"attempt":     attempt,
			"max_retries": maxRetries,
			"files_count": len(fileContents),
		})

		// 解析AI响应
		parseInput := response
		if model.IsReasoner {
			// 推理模型：从包装中取出 content 再进入业务解析
			var wrapper struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			}
			if err := json.Unmarshal([]byte(response), &wrapper); err == nil && wrapper.Content != "" {
				parseInput = wrapper.Content
			}
		}
		codeChanges, tools, thinking, err := oem.parseAIResponse(parseInput, req.Workspace)
		historyEntry.Response = response

		if err != nil {
			// 检查是否需要自动重试
			if autoRetryErr, ok := err.(*AutoRetryError); ok {
				historyEntry.Status = "retry"
				historyEntry.Error = autoRetryErr.Message

				oem.logInfo("信息补充操作", map[string]interface{}{
					"attempt":          attempt,
					"message":          autoRetryErr.Message,
					"additional_files": len(autoRetryErr.AdditionalFiles),
					"next_step":        autoRetryErr.NextStep,
				})

				// 将新获取的文件内容添加到历史记录中，但不修改原始的fileContents
				for filePath, content := range autoRetryErr.AdditionalFiles {
					historyEntry.FilesRead[filePath] = content
				}

				// 将实际执行后的工具调用结果添加到历史记录（包含命令/内容/输出等详细信息）
				for _, tool := range tools {
					// 安全地获取路径参数
					var path string
					if params, ok := tool.Parameters.(map[string]interface{}); ok {
						if pathVal, exists := params["path"]; exists {
							if pathStr, ok := pathVal.(string); ok {
								path = pathStr
							}
						}
					}

					// 只记录实际执行成功的工具调用
					// 对于file_read工具，记录读取到的文件内容
					var result interface{}
					var contentForRecord string
					if tool.Name == "file_read" {
						// 直接使用Result，这应该是文件内容
						result = tool.Result
					} else if tool.Name == "shell_exec" {
						// 命令与输出
						if params, ok := tool.Parameters.(map[string]interface{}); ok {
							if cmd, ok := params["command"].(string); ok {
								contentForRecord = cmd
							}
						}
						if tool.Output != "" {
							result = tool.Output
						} else {
							result = tool.Result
						}
					} else if tool.Name == "file_create" || tool.Name == "file_write" {
						if params, ok := tool.Parameters.(map[string]interface{}); ok {
							if c, ok := params["content"].(string); ok {
								contentForRecord = c
							}
						}
						result = tool.Result
					} else if tool.Name == "file_delete" {
						if params, ok := tool.Parameters.(map[string]interface{}); ok {
							if oc, ok := params["original_content"].(string); ok {
								contentForRecord = oc
							}
						}
						result = tool.Result
					} else {
						result = tool.Result
					}

					toolRecord := ToolExecutionRecord{
						Tool:      tool.Name,
						Path:      path,
						Content:   contentForRecord,
						Status:    tool.Status,
						Result:    result,
						Error:     tool.Error,
						Timestamp: time.Now(),
					}
					toolHistory = append(toolHistory, toolRecord)

					// 调试输出
					fmt.Printf("添加工具历史记录: %s - %s - %s\n", tool.Name, path, tool.Status)
					if tool.Name == "file_read" && result != nil {
						fmt.Printf("文件读取结果长度: %d\n", len(fmt.Sprintf("%v", result)))
					}
				}

				// 调试输出
				fmt.Printf("当前工具历史记录数量: %d\n", len(toolHistory))
				for i, record := range toolHistory {
					fmt.Printf("工具历史[%d]: %s - %s - %s\n", i, record.Tool, record.Path, record.Status)
				}

				// 将工具调用也添加到历史记录的ToolsCalled字段中
				// 注意：这里只添加实际的文件操作工具，不添加execution_summary
				for _, tool := range tools {
					if tool.Status == "success" && tool.Name != "execution_summary" {
						// 安全地获取路径参数
						var path string
						if params, ok := tool.Parameters.(map[string]interface{}); ok {
							if pathVal, exists := params["path"]; exists {
								if pathStr, ok := pathVal.(string); ok {
									path = pathStr
								}
							}
						}

						historyEntry.ToolsCalled = append(historyEntry.ToolsCalled, ToolExecutionRecord{
							Tool:      tool.Name,
							Path:      path,
							Status:    tool.Status,
							Result:    tool.Result,
							Error:     tool.Error,
							Timestamp: time.Now(),
						})
					}
				}
				// 保存历史记录（并在日志中记录尝试次数和工具数，避免未使用append警告）
				executionHistory = append(executionHistory, historyEntry)
				oem.logInfo("工具执行历史已记录", map[string]interface{}{
					"attempt_logged": attempt,
					"history_len":    len(executionHistory),
					"tools_in_entry": len(historyEntry.ToolsCalled),
				})

				// 将本次AI反馈也记录为对话消息，便于后续调用携带完整上下文
				assistantRetryMsg := fmt.Sprintf("需要更多上下文 (第%d次尝试)。原因: %s", attempt, autoRetryErr.Message)
				if err := oem.aiConversationManager.AddAssistantMessage(conversation.SessionID, assistantRetryMsg, tools, thinking); err != nil {
					oem.logError("添加AI助手重试消息失败", err)
				}

				// 重新获取会话历史，保证下一次请求携带最新的上下文
				conversationHistory = oem.aiConversationManager.GetConversationHistory(conversation.SessionID)

				// 如果已经达到最大重试次数，返回失败
				if attempt >= maxRetries {
					return &AICodeGenerationResponse{
						Success: false,
						Message: fmt.Sprintf("达到最大重试次数(%d)，最后错误: %s", maxRetries, autoRetryErr.Message),
						Tools:   []ToolCall{},
						Status:  "retry",
					}, fmt.Errorf("达到最大重试次数: %d", maxRetries)
				}

				// 重新构建提示词，包含工具调用历史记录
				prompt = oem.buildAIPrompt(req.Prompt, req.Context, fileContents, toolHistory)

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
				prompt = strings.ReplaceAll(prompt, "\"{{FILE_TREE_PLACEHOLDER}}\"", fileTreeJSON)

				// 添加重试上下文信息
				prompt += fmt.Sprintf("\n\n【前置信息】\n这是第%d次尝试（共%d次）。之前的尝试失败原因：%s\n", attempt+1, maxRetries, autoRetryErr.Message)

				// 调试输出：显示重新构建的提示词中的工具历史
				fmt.Printf("=== 重新构建提示词 ===\n")
				fmt.Printf("传递的工具历史记录数量: %d\n", len(toolHistory))
				for i, record := range toolHistory {
					fmt.Printf("传递的工具历史[%d]: %s - %s - %s\n", i, record.Tool, record.Path, record.Status)
				}

				// 重新调用AI API（携带会话历史）
				response, err = oem.callAIWithModel(prompt, model, conversationHistory)
				if err != nil {
					historyEntry.Status = "error"
					historyEntry.Error = fmt.Sprintf("AI服务调用失败: %v", err)

					return &AICodeGenerationResponse{
						Success: false,
						Message: fmt.Sprintf("AI服务重试调用失败: %v", err),
						Tools:   []ToolCall{},
					}, err
				}

				// 继续下一次循环
				continue
			} else {
				// 非重试错误，直接返回失败
				historyEntry.Status = "error"
				historyEntry.Error = err.Error()

				return &AICodeGenerationResponse{
					Success: false,
					Message: fmt.Sprintf("AI响应解析失败: %v", err),
					Tools:   []ToolCall{},
				}, err
			}
		}

		// 成功情况
		historyEntry.Status = "success"

		// 添加AI助手消息到对话历史
		// 成功消息不再写入冗余统计文本，统一由前端工具调用展示
		if err := oem.aiConversationManager.AddAssistantMessage(conversation.SessionID, "", tools, thinking); err != nil {
			oem.logError("添加AI助手消息失败", err)
		}

		oem.logInfo("AI代码生成成功", map[string]interface{}{
			"attempt":      attempt,
			"total_files":  len(fileContents),
			"code_changes": len(codeChanges),
			"tools_used":   len(tools),
			"session_id":   conversation.SessionID,
		})

		resp := &AICodeGenerationResponse{
			Success:     true,
			Message:     "",
			Tools:       tools,
			Thinking:    thinking,
			FileChanges: codeChanges,
			Status:      "finish",
			SessionID:   conversation.SessionID,
		}
		// 如果是推理模型，从 response 包装中分离 reasoning_content
		if model.IsReasoner {
			var wrapper struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			}
			if err := json.Unmarshal([]byte(response), &wrapper); err == nil {
				resp.ReasoningContent = wrapper.ReasoningContent
				// 注意：不将 ReasoningContent 回灌到提示词，仅在对话中记录与前端展示
				// 将带 reasoning 的消息写入对话历史（空 content 用工具展示）
				_ = oem.aiConversationManager.AddAssistantMessageWithReasoning(conversation.SessionID, "", tools, thinking, wrapper.ReasoningContent)
			}
		}
		return resp, nil
	}

	// 这里不应该到达，但为了安全起见
	return &AICodeGenerationResponse{
		Success: false,
		Message: "未知错误：超出最大重试次数",
		Tools:   []ToolCall{},
		Status:  "retry",
	}, fmt.Errorf("未知错误：超出最大重试次数")
}

// 调用AI API（支持多模型）
// 调用AI API（支持多模型/推理模型）。对于推理模型，返回 content 与 reasoningContent 的拼接JSON字符串，供上层解析；普通模型仅返回 content。
func (oem *OnlineEditorManager) callAIWithModel(prompt string, model *AIModel, history []AIConversationMessage) (string, error) {
	// 构建工具定义
	var functions []map[string]interface{}

	// 构建对话消息，包含会话历史
	var messages []map[string]string
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": "你是一个专业的代码助手，可以分析代码并提供改进建议。",
	})
	for _, m := range history {
		role := "assistant"
		if strings.ToLower(m.Type) == "user" {
			role = "user"
		}
		messages = append(messages, map[string]string{
			"role":    role,
			"content": m.Content,
		})
	}
	// 当前请求作为最后一条用户消息
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": prompt,
	})

	requestBody := map[string]interface{}{
		"model":       model.Name,
		"messages":    messages,
		"max_tokens":  model.MaxTokens,
		"temperature": model.Temperature,
	}
	// 仅当我们要求模型输出结构化工具规划时才强制 json_object。
	// 推理模型的 message.content 通常不是严格 JSON，这里保持默认，以便同时取 reasoning_content 与 content。

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
	req.Header.Set("Authorization", "Bearer "+model.APIKey)

	client := &http.Client{Timeout: 120 * time.Second}
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

	if choices, ok := response["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				content, _ := message["content"].(string)
				reasoning, _ := message["reasoning_content"].(string)
				// 如果是推理模型，我们同时带回 reasoning 与 content，合并为一个 JSON 包装字符串
				if model.IsReasoner {
					wrapper := map[string]string{
						"content":           strings.TrimSpace(content),
						"reasoning_content": strings.TrimSpace(reasoning),
					}
					data, _ := json.Marshal(wrapper)
					return string(data), nil
				}
				return strings.TrimSpace(content), nil
			}
		}
	}

	return "", fmt.Errorf("无法从响应中提取消息内容")
}

// 流式调用AI（SSE/增量），将推理与内容分片回调给上层
// onReasoning: 收到 reasoning_content 片段时回调
// onContent: 收到 content 片段时回调
func (oem *OnlineEditorManager) callAIStreamWithModel(prompt string, model *AIModel, history []AIConversationMessage, onReasoning func(string), onContent func(string)) error {
	// 构建对话消息
	var messages []map[string]string
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": "你是一个专业的代码助手，可以分析代码并提供改进建议。",
	})
	for _, m := range history {
		role := "assistant"
		if strings.ToLower(m.Type) == "user" {
			role = "user"
		}
		messages = append(messages, map[string]string{"role": role, "content": m.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": prompt})

	body := map[string]interface{}{
		"model":       model.Name,
		"messages":    messages,
		"max_tokens":  model.MaxTokens,
		"temperature": model.Temperature,
		"stream":      true,
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("序列化请求失败: %v", err)
	}

	req, err := http.NewRequest("POST", model.Endpoint, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("创建请求失败: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+model.APIKey)

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API流式请求失败 %d: %s", resp.StatusCode, string(b))
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("读取流失败: %v", err)
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				break
			}
			// 解析增量
			var chunk map[string]interface{}
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				continue
			}
			choices, _ := chunk["choices"].([]interface{})
			if len(choices) == 0 {
				continue
			}
			choice, _ := choices[0].(map[string]interface{})
			delta, _ := choice["delta"].(map[string]interface{})
			if delta == nil {
				// DeepSeek风格可能直接在 message 上分段
				if msg, ok := choice["message"].(map[string]interface{}); ok {
					if s, ok := msg["reasoning_content"].(string); ok && s != "" {
						onReasoning(s)
					}
					if s, ok := msg["content"].(string); ok && s != "" {
						onContent(s)
					}
				}
				continue
			}
			if s, ok := delta["reasoning_content"].(string); ok && s != "" {
				onReasoning(s)
			}
			if s, ok := delta["content"].(string); ok && s != "" {
				onContent(s)
			}
		}
	}
	return nil
}

// 解析AI响应，处理新的JSON格式（包含状态验证和自动工具执行）
func (oem *OnlineEditorManager) parseAIResponse(response, workspaceID string) ([]CodeChange, []ToolCall, *ThinkingProcess, error) {
	fmt.Println(response)
	var aiResponse AIResponse

	// 清理响应字符串，移除可能的markdown标记
	cleanResponse := strings.TrimSpace(response)
	cleanResponse = strings.TrimPrefix(cleanResponse, "```json")
	cleanResponse = strings.TrimPrefix(cleanResponse, "```")
	cleanResponse = strings.TrimSuffix(cleanResponse, "```")
	cleanResponse = strings.TrimSpace(cleanResponse)

	err := json.Unmarshal([]byte(cleanResponse), &aiResponse)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("JSON解析失败: %v, 响应内容: %s", err, cleanResponse)
	}

	// 验证状态字段
	if aiResponse.Status != "finish" && aiResponse.Status != "retry" {
		return nil, nil, nil, fmt.Errorf("无效的状态字段: %s，必须是 'finish' 或 'retry'", aiResponse.Status)
	}

	// 验证工具调用
	if len(aiResponse.Tools) == 0 {
		return nil, nil, nil, fmt.Errorf("AI响应必须包含至少一个工具调用")
	}

	var codeChanges []CodeChange
	var toolCalls []ToolCall

	// 处理工具调用
	for _, tool := range aiResponse.Tools {
		startTime := time.Now()

		// 构建参数映射
		parameters := make(map[string]interface{})
		if tool.Path != "" {
			parameters["path"] = tool.Path
		}
		if tool.Content != "" {
			parameters["content"] = tool.Content
		}
		if tool.Command != "" {
			parameters["command"] = tool.Command
		}
		if tool.Code != nil {
			parameters["code"] = tool.Code
		}

		toolCall := ToolCall{
			Name:        tool.Type,
			Parameters:  parameters,
			Status:      "pending",
			ExecutionId: fmt.Sprintf("tool_%d", time.Now().UnixNano()),
			StartTime:   &startTime,
		}

		switch tool.Type {
		case "file_read":
			// 执行文件读取
			content, err := oem.ReadFile(workspaceID, tool.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = content
				toolCall.Output = fmt.Sprintf("读取文件 %s 成功，长度: %d", tool.Path, len(content))
				// 文件读取操作不生成回退操作
			}

		case "file_write":
			if tool.Code == nil || tool.Code.NewCode == "" {
				toolCall.Status = "error"
				toolCall.Error = "文件内容不能为空"
			} else {
				// 读取原始文件内容用于代码对比和回退
				originalContent, _ := oem.ReadFile(workspaceID, tool.Path)

				// 若提供了行号，则做区间替换；否则做全量替换
				if tool.Code.LineStart > 0 && tool.Code.LineEnd >= tool.Code.LineStart {
					err = oem.ReplaceFileRegion(workspaceID, tool.Path, tool.Code.LineStart, tool.Code.LineEnd, tool.Code.NewCode)
				} else {
					err = oem.ReplaceFileContent(workspaceID, tool.Path, tool.Code.NewCode)
				}
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					toolCall.Status = "success"
					toolCall.Result = "文件内容替换成功"
					toolCall.Output = fmt.Sprintf("替换文件 %s 内容成功，长度: %d", tool.Path, len(tool.Code.NewCode))
					if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
						params["content"] = tool.Code.NewCode
					}

					// 生成回退操作
					toolCall.Rollback = oem.generateRollbackAction("file_write", tool.Path, originalContent)

					// 创建代码变更记录
					codeChange := CodeChange{
						FilePath:     tool.Path,
						OriginalCode: originalContent,
						NewCode:      tool.Code.NewCode,
					}
					codeChanges = append(codeChanges, codeChange)
				}
			}

		case "file_create":
			if tool.Content == "" {
				toolCall.Status = "error"
				toolCall.Error = "文件内容不能为空"
			} else {
				// 执行文件创建
				err := oem.CreateFile(workspaceID, tool.Path)
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					// 写入内容
					err = oem.WriteFile(workspaceID, tool.Path, tool.Content)
					if err != nil {
						toolCall.Status = "error"
						toolCall.Error = err.Error()
					} else {
						toolCall.Status = "success"
						toolCall.Result = "文件创建成功"
						toolCall.Output = fmt.Sprintf("创建文件 %s 成功，长度: %d", tool.Path, len(tool.Content))
						if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
							params["content"] = tool.Content
						}

						// 生成回退操作
						toolCall.Rollback = oem.generateRollbackAction("file_create", tool.Path, "")

						// 创建代码变更记录
						codeChange := CodeChange{
							FilePath:     tool.Path,
							OriginalCode: "",
							NewCode:      tool.Content,
						}
						codeChanges = append(codeChanges, codeChange)
					}
				}
			}

		case "file_delete":
			// 读取原始文件内容用于回退
			originalContent, _ := oem.ReadFile(workspaceID, tool.Path)

			// 执行文件删除
			err := oem.DeleteFile(workspaceID, tool.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件删除成功"
				toolCall.Output = fmt.Sprintf("删除文件 %s 成功", tool.Path)

				// 将原始内容存储到参数中，供前端拒绝操作时使用
				if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
					params["original_content"] = originalContent
				}

				// 生成回退操作
				toolCall.Rollback = oem.generateRollbackAction("file_delete", tool.Path, originalContent)

				// 创建代码变更记录
				codeChange := CodeChange{
					FilePath:     tool.Path,
					OriginalCode: originalContent,
					NewCode:      "",
				}
				codeChanges = append(codeChanges, codeChange)
			}

		case "file_create_folder":
			// 执行文件夹创建
			err := oem.CreateFolder(workspaceID, tool.Path)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件夹创建成功"
				toolCall.Output = fmt.Sprintf("创建文件夹 %s 成功", tool.Path)

				// 生成回退操作
				toolCall.Rollback = oem.generateRollbackAction("file_create_folder", tool.Path, "")

				// 创建代码变更记录
				codeChange := CodeChange{
					FilePath:     tool.Path,
					OriginalCode: "",
					NewCode:      "",
				}
				codeChanges = append(codeChanges, codeChange)
			}

		case "file_delete_folder":
			// 执行文件夹删除
			err := oem.DeleteFile(workspaceID, tool.Path) // 使用DeleteFile也可以删除文件夹
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "文件夹删除成功"
				toolCall.Output = fmt.Sprintf("删除文件夹 %s 成功", tool.Path)

				// 生成回退操作
				toolCall.Rollback = oem.generateRollbackAction("file_delete_folder", tool.Path, "")

				// 创建代码变更记录
				codeChange := CodeChange{
					FilePath:     tool.Path,
					OriginalCode: "",
					NewCode:      "",
				}
				codeChanges = append(codeChanges, codeChange)
			}

		case "shell_exec":
			// 执行shell命令
			output, err := oem.ShellExec(workspaceID, tool.Command)
			if err != nil {
				toolCall.Status = "error"
				toolCall.Error = err.Error()
			} else {
				toolCall.Status = "success"
				toolCall.Result = "命令执行成功"
				toolCall.Output = output

				// 生成回退操作
				toolCall.Rollback = oem.generateRollbackAction("shell_exec", "", tool.Command)
			}

		default:
			toolCall.Status = "error"
			toolCall.Error = fmt.Sprintf("不支持的工具: %s", tool.Type)
		}
		endTime := time.Now()
		toolCall.EndTime = &endTime

		// 存储工具调用到对话历史中（如果有会话ID）
		// 这里暂时不存储，因为我们需要先实现对话管理

		toolCalls = append(toolCalls, toolCall)
	}

	// 构建思考过程
	thinking := aiResponse.Thinking

	// 如果状态是retry，返回特殊标识
	if aiResponse.Status == "retry" {
		// 收集新获取的文件内容
		additionalFiles := make(map[string]string)
		for _, toolCall := range toolCalls {
			if toolCall.Name == "file_read" && toolCall.Status == "success" {
				if content, ok := toolCall.Result.(string); ok {
					// 安全地获取路径参数
					if params, ok := toolCall.Parameters.(map[string]interface{}); ok {
						if pathVal, exists := params["path"]; exists {
							if pathStr, ok := pathVal.(string); ok {
								additionalFiles[pathStr] = content
							}
						}
					}
				}
			}
		}

		return codeChanges, toolCalls, thinking, &AutoRetryError{
			Message:         aiResponse.Message,
			AdditionalFiles: additionalFiles,
			NextStep:        "继续处理工具调用结果",
		}
	}

	return codeChanges, toolCalls, thinking, nil
}

func (e *AutoRetryError) Error() string {
	return fmt.Sprintf("需要自动重试: %s", e.Message)
}

// 执行回退操作（已废弃，使用拒绝操作替代）
func (oem *OnlineEditorManager) ExecuteRollback(workspaceID, executionID string) (*RollbackResponse, error) {
	return &RollbackResponse{
		Success: false,
		Error:   "回退操作已废弃，请使用拒绝操作",
	}, nil
}

// 执行拒绝操作
func (oem *OnlineEditorManager) ExecuteRejectOperation(req RejectOperationRequest) (*RejectOperationResponse, error) {
	// 执行拒绝操作
	switch req.Operation {
	case "edit":
		// 编辑拒绝：将新代码替换为旧代码
		err := oem.ReplaceFileContent(req.WorkspaceID, req.FilePath, req.OriginalContent)
		if err != nil {
			return &RejectOperationResponse{
				Success: false,
				Error:   fmt.Sprintf("恢复文件内容失败: %v", err),
			}, nil
		}

		return &RejectOperationResponse{
			Success: true,
			Message: fmt.Sprintf("成功拒绝编辑操作，已恢复文件 %s 的原始内容", req.FilePath),
		}, nil

	case "create":
		// 创建拒绝：删除文件
		err := oem.DeleteFile(req.WorkspaceID, req.FilePath)
		if err != nil {
			return &RejectOperationResponse{
				Success: false,
				Error:   fmt.Sprintf("删除文件失败: %v", err),
			}, nil
		}

		return &RejectOperationResponse{
			Success: true,
			Message: fmt.Sprintf("成功拒绝创建操作，已删除文件 %s", req.FilePath),
		}, nil

	case "delete":
		// 删除拒绝：创建文件并填充原内容
		err := oem.CreateFile(req.WorkspaceID, req.FilePath)
		if err != nil {
			return &RejectOperationResponse{
				Success: false,
				Error:   fmt.Sprintf("创建文件失败: %v", err),
			}, nil
		}

		if req.Content != "" {
			err = oem.WriteFile(req.WorkspaceID, req.FilePath, req.Content)
			if err != nil {
				return &RejectOperationResponse{
					Success: false,
					Error:   fmt.Sprintf("写入文件内容失败: %v", err),
				}, nil
			}
		}

		return &RejectOperationResponse{
			Success: true,
			Message: fmt.Sprintf("成功拒绝删除操作，已恢复文件 %s", req.FilePath),
		}, nil

	default:
		return &RejectOperationResponse{
			Success: false,
			Error:   fmt.Sprintf("不支持的操作类型: %s", req.Operation),
		}, nil
	}
}

// 获取工具调用状态（已废弃，使用对话管理替代）
func (oem *OnlineEditorManager) GetToolCallStatus(workspaceID string) *ToolCallStatusResponse {
	return &ToolCallStatusResponse{
		Success: false,
		Error:   "工具调用状态已废弃，请使用对话管理",
	}
}

// 生成回退操作
func (oem *OnlineEditorManager) generateRollbackAction(toolType, path, originalContent string) *RollbackAction {
	switch toolType {
	case "file_write":
		return &RollbackAction{
			Type:        "file_write",
			Path:        path,
			Content:     originalContent,
			Description: fmt.Sprintf("恢复文件 %s 的原始内容", path),
			IsVisible:   true,
		}
	case "file_create":
		return &RollbackAction{
			Type:        "file_delete",
			Path:        path,
			Description: fmt.Sprintf("删除创建的文件 %s", path),
			IsVisible:   true,
		}
	case "file_delete":
		return &RollbackAction{
			Type:        "file_create",
			Path:        path,
			Content:     originalContent,
			Description: fmt.Sprintf("恢复删除的文件 %s", path),
			IsVisible:   true,
		}
	case "file_create_folder":
		return &RollbackAction{
			Type:        "file_delete_folder",
			Path:        path,
			Description: fmt.Sprintf("删除创建的文件夹 %s", path),
			IsVisible:   true,
		}
	case "file_delete_folder":
		return &RollbackAction{
			Type:        "file_create_folder",
			Path:        path,
			Description: fmt.Sprintf("恢复删除的文件夹 %s", path),
			IsVisible:   true,
		}
	case "shell_exec":
		return &RollbackAction{
			Type:        "shell_exec",
			Command:     fmt.Sprintf("echo '回退shell命令: %s'", originalContent), // 这里originalContent实际上是command
			Description: fmt.Sprintf("回退shell命令: %s", originalContent),
			IsVisible:   true,
		}
	case "file_read":
		// 文件读取操作不生成回退操作
		return nil
	default:
		return nil
	}
}

// 新增：AI工具调用结构体，按照xxx.md的格式
type AIToolCall struct {
	Type    string    `json:"type"`
	Path    string    `json:"path,omitempty"`
	Content string    `json:"content,omitempty"`
	Code    *CodeDiff `json:"code,omitempty"`
	Command string    `json:"command,omitempty"`
	Summary string    `json:"summary"`
}

// 新增：代码差异结构体
type CodeDiff struct {
	OriginalCode string `json:"originalCode"`
	NewCode      string `json:"newCode"`
	LineStart    int    `json:"lineStart,omitempty"` // 1-based inclusive
	LineEnd      int    `json:"lineEnd,omitempty"`   // 1-based inclusive
}

// ReplaceFileRegion 按行号替换文件内容（1-based，包含两端）
func (oem *OnlineEditorManager) ReplaceFileRegion(workspaceID, path string, lineStart, lineEnd int, newCode string) error {
	content, err := oem.ReadFile(workspaceID, path)
	if err != nil {
		return err
	}
	lines := strings.Split(content, "\n")
	if lineStart < 1 || lineEnd < lineStart || lineEnd > len(lines) {
		return fmt.Errorf("无效的行区间: %d-%d", lineStart, lineEnd)
	}
	// Go slice index: start-1 .. end-1 inclusive
	before := lines[:lineStart-1]
	after := lines[lineEnd:]
	newLines := strings.Split(newCode, "\n")
	merged := append(append(before, newLines...), after...)
	final := strings.Join(merged, "\n")
	return oem.ReplaceFileContent(workspaceID, path, final)
}

// 新增：AI响应结构体，按照xxx.md的格式
type AIResponse struct {
	Status   string           `json:"status"` // "finish", "retry"
	Message  string           `json:"message,omitempty"`
	Tools    []AIToolCall     `json:"tools,omitempty"`
	Thinking *ThinkingProcess `json:"thinking,omitempty"`
}

// 回退操作请求
type RollbackRequest struct {
	WorkspaceID string `json:"workspace_id"`
	ExecutionID string `json:"execution_id"` // 工具调用的执行ID
}

// 回退操作响应
type RollbackResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// 拒绝操作请求
type RejectOperationRequest struct {
	WorkspaceID     string `json:"workspace_id"`
	Operation       string `json:"operation"`        // 操作类型：edit, create, delete
	FilePath        string `json:"file_path"`        // 文件路径
	Content         string `json:"content"`          // 文件内容（用于编辑和创建）
	OriginalContent string `json:"original_content"` // 原始内容（用于编辑）
}

// 拒绝操作响应
type RejectOperationResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// 工具调用状态响应
type ToolCallStatusResponse struct {
	Success bool               `json:"success"`
	Tools   []*ToolCallHistory `json:"tools,omitempty"`
	Error   string             `json:"error,omitempty"`
}

// 工具调用历史记录（用于管理回退操作）
type ToolCallHistory struct {
	ExecutionID  string          `json:"execution_id"`
	ToolCall     *ToolCall       `json:"tool_call"`
	Rollback     *RollbackAction `json:"rollback,omitempty"`
	IsRolledBack bool            `json:"is_rolled_back"`          // 是否已经回退
	RollbackTime *time.Time      `json:"rollback_time,omitempty"` // 回退时间
}

// AI对话会话
type AIConversation struct {
	SessionID   string                      `json:"session_id"`
	WorkspaceID string                      `json:"workspace_id"`
	CreatedAt   time.Time                   `json:"created_at"`
	UpdatedAt   time.Time                   `json:"updated_at"`
	Messages    []AIConversationMessage     `json:"messages"`
	ToolHistory map[string]*ToolCallHistory `json:"tool_history"` // 按执行ID索引
}

// AI对话消息
type AIConversationMessage struct {
	ID        string           `json:"id"`
	Type      string           `json:"type"` // "user", "assistant"
	Content   string           `json:"content"`
	Timestamp time.Time        `json:"timestamp"`
	Tools     []ToolCall       `json:"tools,omitempty"`
	Thinking  *ThinkingProcess `json:"thinking,omitempty"`
	// 新增：推理模型的思维链内容，供前端展示
	ReasoningContent string `json:"reasoning_content,omitempty"`
}
