package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// 新增：NDJSON格式的流式输出结构体
type NDJSONMessage struct {
	Type    string                 `json:"type"`
	ID      string                 `json:"id,omitempty"`
	Tool    string                 `json:"tool,omitempty"`
	Data    map[string]interface{} `json:"data,omitempty"`
	DataB64 string                 `json:"data_b64,omitempty"`
	Bs64ID  string                 `json:"bs64_id,omitempty"`
	Seq     int                    `json:"seq,omitempty"`
	Hash    string                 `json:"hash,omitempty"`
}

// 新增：Base64数据块管理
type Base64Chunk struct {
	ID       string
	Data     []byte
	Seq      int
	Complete bool
	Hash     string
}

// 新增：工具调用状态管理
type ToolCallState struct {
	ID       string
	Tool     string
	Data     map[string]interface{}
	Thinking string
	Status   string // "pending", "ready", "executed"
}

type ThinkingState struct {
	ID       string
	Base64ID string
}

// 新增：AI配置
type AIConfig struct {
	DefaultModel string              `json:"default_model"`
	Models       map[string]*AIModel `json:"models"`
	Strategy     string              `json:"strategy"` // "preview", "auto", "manual"
}

// 自定义错误类型，用于标识需要自动重试的情况
type AutoRetryError struct {
	Message         string
	AdditionalFiles map[string]string
	NextStep        string
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

// 新增：AI响应结构体，按照xxx.md的格式
type AIResponse struct {
	Status   string           `json:"status"` // "finish", "retry"
	Message  string           `json:"message,omitempty"`
	Tools    []AIToolCall     `json:"tools,omitempty"`
	Thinking *ThinkingProcess `json:"thinking,omitempty"`
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
	SessionID   string                  `json:"session_id"`
	WorkspaceID string                  `json:"workspace_id"`
	CreatedAt   time.Time               `json:"created_at"`
	UpdatedAt   time.Time               `json:"updated_at"`
	Messages    []AIConversationMessage `json:"messages"`
}

// AI对话消息
type AIConversationMessage struct {
	ID        string                      `json:"id"`
	Type      string                      `json:"type"` // "user", "assistant"
	Content   string                      `json:"content"`
	Timestamp time.Time                   `json:"timestamp"`
	Model     string                      `json:"model,omitempty"`
	Data      []AIConversationMessageData `json:"data,omitempty"`
}

type AIConversationMessageData struct {
	Tools    []ToolCall       `json:"tools,omitempty"`
	Thinking *ThinkingProcess `json:"thinking,omitempty"`
	// 新增：推理模型的思维链内容，供前端展示
	ReasoningContent string `json:"reasoning,omitempty"`
}

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
	Content string `json:"content,omitempty"` // 思维链内容
}

type CodeChange struct {
	FilePath     string `json:"file_path"`
	OriginalCode string `json:"original_code"`
	NewCode      string `json:"new_code"`
}

type ToolCall struct {
	Name        string          `json:"name"`
	Result      interface{}     `json:"result,omitempty"`
	Status      string          `json:"status"` // "pending", "success", "error"
	Error       string          `json:"error,omitempty"`
	ExecutionId string          `json:"execution_id,omitempty"`
	StartTime   *time.Time      `json:"start_time,omitempty"`
	EndTime     *time.Time      `json:"end_time,omitempty"`
	Output      string          `json:"output,omitempty"`   // 用于存储shell命令输出
	Rollback    *RollbackAction `json:"rollback,omitempty"` // 回退操作
	Path        string          `json:"path,omitempty"`
	Content     string          `json:"content,omitempty"`
	Command     string          `json:"command,omitempty"`
	Summary     string          `json:"summary,omitempty"`
	Code        *CodeDiff       `json:"code,omitempty"`
	Thinking    string          `json:"thinking,omitempty"`
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
		Messages:    make([]AIConversationMessage, 0, 1000),
	}

	acm.conversations[sessionID] = conversation
	return conversation
}

// 使用指定的 sessionID 创建对话会话（用于WS路径携带固定会话ID的场景）
func (acm *AIConversationManager) CreateConversationWithID(sessionID, workspaceID string) *AIConversation {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	if sessionID == "" {
		sessionID = fmt.Sprintf("session_%d", time.Now().UnixNano())
	}

	if conv, exists := acm.conversations[sessionID]; exists {
		// 已存在则直接返回，确保幂等
		return conv
	}

	conversation := &AIConversation{
		SessionID:   sessionID,
		WorkspaceID: workspaceID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Messages:    make([]AIConversationMessage, 0, 1000),
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
func (acm *AIConversationManager) AddUserMessage(sessionID, messageID, content string) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	message := AIConversationMessage{
		ID:        messageID,
		Type:      "user",
		Content:   content,
		Timestamp: time.Now(),
	}

	// 向消息新增用户内容
	conversation.Messages = append(conversation.Messages, message)
	conversation.UpdatedAt = time.Now()
	return nil
}

// 添加AI助手消息
func (acm *AIConversationManager) AddAssistantMessage(sessionID, messageID string) error {
	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	message := AIConversationMessage{
		ID:        messageID,
		Type:      "assistant",
		Content:   "",
		Timestamp: time.Now(),
		Data:      make([]AIConversationMessageData, 0, 1000),
	}

	conversation.Messages = append(conversation.Messages, message)
	conversation.UpdatedAt = time.Now()
	return nil
}

// 新增：带推理内容的助手消息写入，不会在后续提示词中回灌 reasoning_content
func (acm *AIConversationManager) updateAssistantMessageWithReasoning(sessionID string, tools []ToolCall, thinking *ThinkingProcess, reasoning string, messageID string, userPrompt string) error {

	acm.mutex.Lock()
	defer acm.mutex.Unlock()

	conversation, exists := acm.conversations[sessionID]
	if !exists {
		return fmt.Errorf("对话会话不存在: %s", sessionID)
	}

	if len(conversation.Messages) == 0 {
		return fmt.Errorf("对话中没有消息")
	}
	if conversation.Messages[len(conversation.Messages)-1].Type != "assistant" || conversation.Messages[len(conversation.Messages)-1].Data == nil {
		return fmt.Errorf("最后一条消息不是助手消息")
	}

	message := &conversation.Messages[len(conversation.Messages)-1]

	if message.ID != messageID {
		return fmt.Errorf("消息ID不匹配: %s", messageID)
	}

	message.Data = append(message.Data,
		AIConversationMessageData{
			Tools:            tools,
			Thinking:         thinking,
			ReasoningContent: reasoning,
		},
	)
	var prompt strings.Builder

	prompt.WriteString("用户需求\n")
	prompt.WriteString(fmt.Sprintf("- 用户需求: %s\n", userPrompt))
	prompt.WriteString("\n")

	prompt.WriteString("上一轮对话你的思考\n")
	prompt.WriteString(fmt.Sprintf("- 思考: %s\n", thinking.Content))
	prompt.WriteString("\n")

	if len(tools) > 0 {
		prompt.WriteString("工具调用情况\n")
		prompt.WriteString("以下是之前执行过的工具调用及其结果：\n\n")

		for i, record := range tools {
			prompt.WriteString(fmt.Sprintf("工具调用 #%d:\n", i+1))
			prompt.WriteString(fmt.Sprintf("- 工具类型: %s\n", record.Name))
			prompt.WriteString(fmt.Sprintf("- 文件路径: %s\n", record.Path))
			prompt.WriteString(fmt.Sprintf("- 执行状态: %s\n", record.Status))
			// 详细信息：命令/内容/输出
			if record.Name == "shell_exec" {
				if record.Command != "" {
					prompt.WriteString(fmt.Sprintf("- 命令: %s\n", record.Command))
				}
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 输出: %v\n", record.Result))
				}
			} else if record.Name == "file_create" || record.Name == "file_write" {
				if record.Code != nil {
					prompt.WriteString("- 写入内容:\n")
					prompt.WriteString(record.Code.NewCode)
					prompt.WriteString("\n")
				}
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 执行结果: %v\n", record.Result))
				}
			} else if record.Name == "file_delete" {
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 执行结果: %v\n", record.Result))
				}
			} else if record.Name == "file_read" {
				if record.Result != nil {
					resultStr := fmt.Sprintf("%v", record.Result)
					if resultStr == "" || resultStr == "<nil>" || resultStr == "null" {
						prompt.WriteString("- 读取内容: 【文件存在但内容为空】\n")
					} else {
						prompt.WriteString("- 读取内容:\n")
						prompt.WriteString(resultStr)
						prompt.WriteString("\n")
					}
				}
			} else if record.Result != nil {
				prompt.WriteString(fmt.Sprintf("- 执行结果: %v\n", record.Result))
			}
			if record.Error != "" {
				prompt.WriteString(fmt.Sprintf("- 错误信息: %s\n", record.Error))
			}
			prompt.WriteString("\n")
		}

		prompt.WriteString("【重要说明】\n")
		prompt.WriteString("1. 如果file_read工具的执行状态为\"success\"但结果显示【文件存在但内容为空】，说明该文件确实存在但没有内容\n")
		prompt.WriteString("2. 如果file_read工具的执行状态为\"failed\"或有错误信息，说明该文件不存在或无法访问\n")
		prompt.WriteString("3. 对于存在但为空的文件，可以直接使用file_write工具写入内容\n")
		prompt.WriteString("4. 对于不存在的文件，使用file_create工具创建新文件并写入内容\n")
		prompt.WriteString("5. 避免重复读取同一个文件，除非确实需要获取最新的文件内容\n\n")

		prompt.WriteString("请基于以上工具调用历史记录，了解已经执行的操作和获取的信息，然后继续执行下一步操作。\n\n")
	}

	message.Content = prompt.String()

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

// 流式调用AI（NDJSON格式），将推理与内容分片回调给上层
// onReasoning: 收到 thinking 片段时回调
// onContent: 收到 content 片段时回调
// onToolCall: 收到工具调用时回调
// onBase64Chunk: 收到base64数据块时回调
func (oem *OnlineEditorManager) callAIStreamWithModel(prompt string, model *AIModel, history []AIConversationMessage, onReasoning func(string), onThinking func(*ThinkingState), onToolCall func(*ToolCallState), onBase64Chunk func(*Base64Chunk)) error {
	// 构建对话消息
	var messages []map[string]string
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": "你是一个专业的代码助手，可以分析代码并提供改进建议。",
	})
	// 历史数据
	for _, m := range history {
		role := "assistant"
		if strings.ToLower(m.Type) == "user" {
			role = "user"
		}
		messages = append(messages, map[string]string{"role": role, "content": m.Content})
	}
	// 当前用户提问
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

	// NDJSON状态机处理
	var buffer strings.Builder
	base64Chunks := make(map[string]*Base64Chunk)
	toolCalls := make(map[string]*ToolCallState)

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

		// 调试输出
		if strings.HasPrefix(line, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				fmt.Printf("[STREAM] 收到DONE信号\n")
				break
			}

			// 解析增量
			var chunk map[string]interface{}
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				fmt.Printf("[STREAM] JSON解析失败: %v, payload: %s\n", err, payload)
				continue
			}

			choices, _ := chunk["choices"].([]interface{})
			if len(choices) == 0 {
				continue
			}

			choice, _ := choices[0].(map[string]interface{})
			delta, _ := choice["delta"].(map[string]interface{})

			// 标准OpenAI格式
			if s, ok := delta["reasoning_content"].(string); ok && s != "" {
				onReasoning(s)
			}
			if s, ok := delta["content"].(string); ok && s != "" {
				// 累积到缓冲区
				buffer.WriteString(s)

				// 尝试解析NDJSON
				oem.processNDJSONBuffer(buffer.String(), base64Chunks, toolCalls, onThinking, onToolCall, onBase64Chunk)
			}
		}
	}
	return nil
}

// 处理NDJSON缓冲区，解析完整的JSON行
func (oem *OnlineEditorManager) processNDJSONBuffer(buffer string, base64Chunks map[string]*Base64Chunk, toolCalls map[string]*ToolCallState, onThinking func(*ThinkingState), onToolCall func(*ToolCallState), onBase64Chunk func(*Base64Chunk)) {
	lines := strings.Split(buffer, "\n")

	// 处理完整的行（除了最后一行可能不完整）
	for i := 0; i < len(lines)-1; i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		var msg NDJSONMessage
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			fmt.Printf("[NDJSON] 解析失败: %v, line: %s\n", err, line)
			continue
		}

		oem.processNDJSONMessage(msg, base64Chunks, toolCalls, onThinking, onToolCall, onBase64Chunk)
	}
}

// 处理单个NDJSON消息
func (oem *OnlineEditorManager) processNDJSONMessage(msg NDJSONMessage, base64Chunks map[string]*Base64Chunk, toolCalls map[string]*ToolCallState, onThinking func(*ThinkingState), onToolCall func(*ToolCallState), onBase64Chunk func(*Base64Chunk)) {
	switch msg.Type {
	case "thinking":
		// 处理thinking消息
		if msg.DataB64 != "" {
			// 创建或更新base64块
			if _, exists := base64Chunks[msg.DataB64]; !exists {
				base64Chunks[msg.DataB64] = &Base64Chunk{
					ID:       msg.DataB64,
					Data:     []byte{},
					Seq:      0,
					Complete: false,
				}
			}
			onThinking(&ThinkingState{
				ID:       msg.ID,
				Base64ID: msg.DataB64,
			})
		}

	case "bs64_start":
		// 开始新的base64块
		if _, exists := base64Chunks[msg.Bs64ID]; !exists {
			base64Chunks[msg.Bs64ID] = &Base64Chunk{
				ID:       msg.Bs64ID,
				Data:     []byte{},
				Seq:      0,
				Complete: false,
			}
		}

	case "bs64_chunk":
		// 处理base64数据块
		if chunk, exists := base64Chunks[msg.Bs64ID]; exists {
			if msg.Seq == chunk.Seq {
				// 解码base64数据
				if data, err := base64.StdEncoding.DecodeString(msg.DataB64); err == nil {
					chunk.Data = append(chunk.Data, data...)
					chunk.Seq++

					// 通知上层有新数据块
					if onBase64Chunk != nil {
						onBase64Chunk(chunk)
					}
				}
			}
		}

	case "bs64_end":
		// 完成base64块
		if chunk, exists := base64Chunks[msg.Bs64ID]; exists {
			chunk.Complete = true
			chunk.Hash = msg.Hash

			// 验证hash
			if oem.verifyBase64Hash(chunk.Data, msg.Hash) {
				// 通知上层块完成
				if onBase64Chunk != nil {
					onBase64Chunk(chunk)
				}
			} else {
				fmt.Printf("[NDJSON] Base64块hash验证失败: %s\n", msg.Bs64ID)
			}
		}

	case "tool":
		// 处理工具调用
		if msg.ID != "" {
			toolCall := &ToolCallState{
				ID:     msg.ID,
				Tool:   msg.Tool,
				Data:   msg.Data,
				Status: "pending",
			}

			// 查找对应的thinking
			if msg.Data != nil {
				if dataB64, ok := msg.Data["data_b64"].(string); ok {
					if chunk, exists := base64Chunks[dataB64]; exists && chunk.Complete {
						toolCall.Thinking = string(chunk.Data)
					}
				}
			}

			toolCalls[msg.ID] = toolCall

			// 通知上层有新的工具调用
			if onToolCall != nil {
				onToolCall(toolCall)
			}
		}
	case "done":
		// 处理完成信号 - 该工具输出完毕，立即执行
		fmt.Printf("[NDJSON] 收到工具完成信号，工具ID: %s\n", msg.ID)

		// 查找对应的工具调用
		if toolCall, exists := toolCalls[msg.ID]; exists {
			// 标记工具为完成状态
			toolCall.Status = "completed"

			// 通知上层工具已完成，可以执行
			if onToolCall != nil {
				onToolCall(toolCall)
			}
		}
	}
}

// 验证base64块的hash
func (oem *OnlineEditorManager) verifyBase64Hash(data []byte, expectedHash string) bool {
	if !strings.HasPrefix(expectedHash, "sha256:") {
		return false
	}

	hash := sha256.Sum256(data)
	actualHash := fmt.Sprintf("sha256:%x", hash)
	return actualHash == expectedHash
}

// 检查工具是否准备好执行
func (oem *OnlineEditorManager) isToolReady(toolCall *ToolCallState) bool {
	if toolCall.Data == nil {
		return false
	}

	switch toolCall.Tool {
	case "file_write":
		// 需要路径、原始代码和新代码
		// 路径直接从base64字段检查
		_, hasPathB64 := toolCall.Data["path_b64"]
		_, hasOriginalCode := toolCall.Data["originalCode"]
		_, hasNewCode := toolCall.Data["newCode"]
		return hasPathB64 && hasOriginalCode && hasNewCode

	case "file_create":
		// 需要路径和内容
		// 路径直接从base64字段检查
		_, hasPathB64 := toolCall.Data["path_b64"]
		_, hasContent := toolCall.Data["content"]
		return hasPathB64 && hasContent

	case "file_delete":
		// 只需要路径
		// 路径直接从base64字段检查
		_, hasPathB64 := toolCall.Data["path_b64"]
		return hasPathB64

	case "file_create_folder":
		// 只需要路径
		// 路径直接从base64字段检查
		_, hasPathB64 := toolCall.Data["path_b64"]
		return hasPathB64

	case "shell_exec":
		// 需要命令
		_, hasCommand := toolCall.Data["command"]
		return hasCommand

	case "file_read":
		// 只需要路径
		// 路径直接从base64字段检查
		_, hasPathB64 := toolCall.Data["path_b64"]
		return hasPathB64

	case "conversation_summary":
		// 需要总结内容
		_, hasSummary := toolCall.Data["summary"]
		return hasSummary

	default:
		return false
	}
}

// 解析AI响应，处理新的NDJSON格式（包含状态验证和自动工具执行）
// 返回 status: "finish" 或 "retry"
func (oem *OnlineEditorManager) parseAIResponseFromToolStates(toolStates map[string]*ToolCallState, base64Chunks map[string]*Base64Chunk, workspaceID string) ([]ToolCall, *ThinkingProcess, string, error) {
	var toolCalls []ToolCall
	var thinkingContent strings.Builder
	status := "retry"

	// 处理所有工具调用
	for _, toolState := range toolStates {
		if toolState.Status != "ready" {
			continue
		}

		startTime := time.Now()
		toolCall := ToolCall{
			Name:        toolState.Tool,
			Path:        "",
			Content:     "",
			Command:     "",
			Status:      "pending",
			ExecutionId: fmt.Sprintf("tool_%d", time.Now().UnixNano()),
			StartTime:   &startTime,
			Thinking:    toolState.Thinking,
		}

		// 根据工具类型处理数据
		switch toolState.Tool {
		case "file_write":
			// 处理file_write工具
			if toolState.Data != nil {
				// 文件路径直接从base64字段解码
				if pathB64, ok := toolState.Data["path_b64"].(string); ok {
					if pathData, err := base64.StdEncoding.DecodeString(pathB64); err == nil {
						toolCall.Path = string(pathData)
					}
				}
				if originalCodeB64, ok := toolState.Data["originalCode_b64"].(string); ok {
					if chunk, exists := base64Chunks[originalCodeB64]; exists && chunk.Complete {
						if toolCall.Code == nil {
							toolCall.Code = &CodeDiff{}
						}
						toolCall.Code.OriginalCode = string(chunk.Data)
					}
				}
				if newCodeB64, ok := toolState.Data["new_bs64"].(string); ok {
					if chunk, exists := base64Chunks[newCodeB64]; exists && chunk.Complete {
						if toolCall.Code == nil {
							toolCall.Code = &CodeDiff{}
						}
						toolCall.Code.NewCode = string(chunk.Data)
					}
				}
			}

			// 执行文件写入
			if toolCall.Path != "" && toolCall.Code != nil && toolCall.Code.NewCode != "" {
				// 读取原始文件内容用于代码对比和回退
				originalContent, _ := oem.ReadFile(workspaceID, toolCall.Path)

				// 若提供了行号，则做区间替换；否则做全量替换
				if toolCall.Code.LineStart > 0 && toolCall.Code.LineEnd >= toolCall.Code.LineStart {
					err := oem.ReplaceFileRegion(workspaceID, toolCall.Path, toolCall.Code.LineStart, toolCall.Code.LineEnd, toolCall.Code.NewCode)
					if err != nil {
						toolCall.Status = "error"
						toolCall.Error = err.Error()
					} else {
						toolCall.Status = "success"
						toolCall.Result = "文件内容替换成功"
						toolCall.Output = fmt.Sprintf("替换文件 %s 内容成功，长度: %d", toolCall.Path, len(toolCall.Code.NewCode))
						// 生成回退操作
						toolCall.Rollback = oem.generateRollbackAction("file_write", toolCall.Path, originalContent)
					}
				} else {
					err := oem.ReplaceFileContent(workspaceID, toolCall.Path, toolCall.Code.NewCode)
					if err != nil {
						toolCall.Status = "error"
						toolCall.Error = err.Error()
					} else {
						toolCall.Status = "success"
						toolCall.Result = "文件内容替换成功"
						toolCall.Output = fmt.Sprintf("替换文件 %s 内容成功，长度: %d", toolCall.Path, len(toolCall.Code.NewCode))
						// 生成回退操作
						toolCall.Rollback = oem.generateRollbackAction("file_write", toolCall.Path, originalContent)
					}
				}
			} else {
				toolCall.Status = "error"
				toolCall.Error = "文件路径或内容不能为空"
			}

		case "file_create":
			// 处理file_create工具
			if toolState.Data != nil {
				// 文件路径直接从base64字段解码
				if pathB64, ok := toolState.Data["path_b64"].(string); ok {
					if pathData, err := base64.StdEncoding.DecodeString(pathB64); err == nil {
						toolCall.Path = string(pathData)
					}
				}
				if contentB64, ok := toolState.Data["content_b64"].(string); ok {
					if chunk, exists := base64Chunks[contentB64]; exists && chunk.Complete {
						toolCall.Content = string(chunk.Data)
					}
				}
			}

			// 执行文件创建
			if toolCall.Path != "" && toolCall.Content != "" {
				err := oem.CreateFile(workspaceID, toolCall.Path)
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					// 写入内容
					err = oem.WriteFile(workspaceID, toolCall.Path, toolCall.Content)
					if err != nil {
						toolCall.Status = "error"
						toolCall.Error = err.Error()
					} else {
						toolCall.Status = "success"
						toolCall.Result = "文件创建成功"
						toolCall.Output = fmt.Sprintf("创建文件 %s 成功，长度: %d", toolCall.Path, len(toolCall.Content))
						// 生成回退操作
						toolCall.Rollback = oem.generateRollbackAction("file_create", toolCall.Path, "")
					}
				}
			} else {
				toolCall.Status = "error"
				toolCall.Error = "文件路径或内容不能为空"
			}

		case "shell_exec":
			// 处理shell_exec工具
			if toolState.Data != nil {
				if commandB64, ok := toolState.Data["command_b64"].(string); ok {
					if chunk, exists := base64Chunks[commandB64]; exists && chunk.Complete {
						toolCall.Command = string(chunk.Data)
					}
				}
			}

			// 执行shell命令
			if toolCall.Command != "" {
				output, err := oem.ShellExec(workspaceID, toolCall.Command)
				if err != nil {
					toolCall.Status = "error"
					toolCall.Error = err.Error()
				} else {
					toolCall.Status = "success"
					toolCall.Result = "命令执行成功"
					toolCall.Output = output
					// 生成回退操作
					toolCall.Rollback = oem.generateRollbackAction("shell_exec", "", toolCall.Command)
				}
			} else {
				toolCall.Status = "error"
				toolCall.Error = "命令不能为空"
			}

		case "conversation_summary":
			// 处理conversation_summary工具
			if toolState.Data != nil {
				if summaryB64, ok := toolState.Data["summary_b64"].(string); ok {
					if chunk, exists := base64Chunks[summaryB64]; exists && chunk.Complete {
						toolCall.Summary = string(chunk.Data)
					}
				}
			}

			// 处理对话总结工具
			if toolCall.Summary != "" {
				toolCall.Status = "success"
				toolCall.Result = toolCall.Summary
				toolCall.Output = fmt.Sprintf("对话总结完成，长度: %d", len(toolCall.Summary))
				status = "finish" // 总结工具表示完成
			} else {
				toolCall.Status = "error"
				toolCall.Error = "对话总结内容不能为空"
			}

		default:
			toolCall.Status = "error"
			toolCall.Error = fmt.Sprintf("不支持的工具: %s", toolState.Tool)
		}

		endTime := time.Now()
		toolCall.EndTime = &endTime

		// 累积thinking内容
		if toolState.Thinking != "" {
			thinkingContent.WriteString(toolState.Thinking)
			thinkingContent.WriteString("\n")
		}

		toolCalls = append(toolCalls, toolCall)
	}

	// 构建思考过程
	thinking := &ThinkingProcess{
		Content: thinkingContent.String(),
	}

	return toolCalls, thinking, status, nil
}

func (e *AutoRetryError) Error() string {
	return fmt.Sprintf("需要自动重试: %s", e.Message)
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

// ReplaceFileRegion 按行号替换文件内容（1-based，包含两端）
func (oem *OnlineEditorManager) ReplaceFileRegion(workspaceID, path string, lineStart, lineEnd int, newCode string) error {
	content, err := oem.ReadFile(workspaceID, path)
	if err != nil {
		return err
	}

	lines := strings.Split(content, "\n")
	totalLines := len(lines)

	// 验证行号范围
	if lineStart < 1 {
		return fmt.Errorf("起始行号不能小于1: %d", lineStart)
	}
	if lineEnd < lineStart {
		return fmt.Errorf("结束行号不能小于起始行号: %d < %d", lineEnd, lineStart)
	}
	if lineStart > totalLines {
		return fmt.Errorf("起始行号超出文件范围: %d > %d", lineStart, totalLines)
	}

	// 如果结束行号超出文件范围，调整到文件末尾
	if lineEnd > totalLines {
		lineEnd = totalLines
	}

	// 构建新内容
	var result []string

	// 添加起始行之前的内容
	if lineStart > 1 {
		result = append(result, lines[:lineStart-1]...)
	}

	// 添加新代码
	newLines := strings.Split(newCode, "\n")
	result = append(result, newLines...)

	// 添加结束行之后的内容
	if lineEnd < totalLines {
		result = append(result, lines[lineEnd:]...)
	}

	// 合并为最终内容
	final := strings.Join(result, "\n")

	// 写入文件
	return oem.ReplaceFileContent(workspaceID, path, final)
}
