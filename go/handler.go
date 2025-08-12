package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/docker/docker/api/types/container"
	imageTypes "github.com/docker/docker/api/types/image"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

func (oem *OnlineEditorManager) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := oem.ListWorkspaces()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(workspaces)
}

func (oem *OnlineEditorManager) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string            `json:"name"`
		Image       string            `json:"image"`
		GitRepo     string            `json:"git_repo"`
		GitBranch   string            `json:"git_branch"`
		Ports       []PortMapping     `json:"ports"`
		Tools       []string          `json:"tools"`
		Environment map[string]string `json:"environment"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 如果没有提供环境变量，初始化为空map
	if req.Environment == nil {
		req.Environment = make(map[string]string)
	}

	workspace, err := oem.CreateWorkspace(req.Name, req.Image, req.GitRepo, req.GitBranch, req.Ports, req.Tools, req.Environment)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(workspace)
}

func (oem *OnlineEditorManager) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	workspace, err := oem.GetWorkspace(workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(workspace)
}

func (oem *OnlineEditorManager) handleStartWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.StartWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleStopWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.StopWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if err := oem.DeleteWorkspace(workspaceID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleListFiles(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	path := r.URL.Query().Get("path")

	files, err := oem.ListFiles(workspaceID, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if files == nil {
		files = []FileInfo{}
	}
	json.NewEncoder(w).Encode(files)
}

func (oem *OnlineEditorManager) handleReadFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	content, err := oem.ReadFile(workspaceID, req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 确保返回纯字符串格式，而不是JSON格式
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	// 直接写入内容，不使用任何JSON编码
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(content))
}

func (oem *OnlineEditorManager) handleWriteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.WriteFile(workspaceID, req.Path, req.Content); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.DeleteFile(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.CreateFile(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "缺少文件夹路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.CreateFolder(workspaceID, req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleMoveFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		SourcePath string `json:"source_path"`
		TargetPath string `json:"target_path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.SourcePath == "" || req.TargetPath == "" {
		http.Error(w, "缺少源路径或目标路径参数", http.StatusBadRequest)
		return
	}

	if err := oem.MoveFile(workspaceID, req.SourcePath, req.TargetPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleCreateTerminal(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	session, err := oem.CreateTerminalSession(workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(session)
}

// 优化的终端WebSocket处理器 - 支持真正的交互式终端
func (oem *OnlineEditorManager) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	sessionID := vars["sessionId"]

	log.Printf("[Terminal] 创建终端会话: %s for workspace: %s", sessionID, workspaceID)

	// 升级到WebSocket
	conn, err := oem.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket升级失败: %v", err)
		return
	}
	defer conn.Close()

	// 获取终端会话
	oem.mutex.RLock()
	session, exists := oem.terminalSessions[sessionID]
	workspace, workspaceExists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists || session.WorkspaceID != workspaceID {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\n❌ 终端会话不存在\r\n"))
		return
	}

	if !workspaceExists || workspace.Status != "running" {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\n❌ 工作空间未运行\r\n"))
		return
	}

	session.WebSocket = conn
	session.LastActivity = time.Now()

	// 创建交互式终端
	ctx := context.Background()

	// 获取镜像配置中的Shell信息
	defaultShell := "/bin/bash"

	// 检查自定义镜像
	oem.customImagesMutex.RLock()
	if customConfig, exists := oem.customImages[workspace.Image]; exists && customConfig.Shell != "" {
		defaultShell = customConfig.Shell
	}
	oem.customImagesMutex.RUnlock()

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		fmt.Sprintf("SHELL=%s", defaultShell),
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"TZ=Asia/Shanghai",
		// 重要：禁用历史扩展以避免提示符重复
		"set +H",
		// 禁用括号粘贴模式
		"BASH_ENV=/dev/null",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 获取终端初始化脚本
	initScript, err := scriptManager.GetScript("terminal_init")
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 获取终端脚本失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}

	// 创建Exec配置
	execConfig := container.ExecOptions{
		Cmd:          []string{"/bin/bash", "-c", initScript},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	log.Printf("[Terminal] 创建容器Exec配置")
	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 创建终端失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}

	log.Printf("[Terminal] 附加到容器Exec")
	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		errorMsg := fmt.Sprintf("\r\n❌ 附加到终端失败: %v\r\n", err)
		conn.WriteMessage(websocket.TextMessage, []byte(errorMsg))
		return
	}
	defer execAttachResp.Close()

	// 设置WebSocket超时
	conn.SetReadDeadline(time.Now().Add(60 * time.Minute))
	conn.SetWriteDeadline(time.Now().Add(30 * time.Second))

	// 用于同步关闭
	done := make(chan struct{})

	// 从容器读取输出并转发到WebSocket
	go func() {
		defer close(done)
		buffer := make([]byte, 1024)

		for {
			n, err := execAttachResp.Reader.Read(buffer)
			if err != nil {
				if err == io.EOF {
					log.Printf("[Terminal] 容器输出流结束")
				} else if strings.Contains(err.Error(), "use of closed network connection") {
					log.Printf("[Terminal] Docker连接已关闭")
				} else {
					log.Printf("[Terminal] 读取容器输出失败: %v", err)
				}
				break
			}

			if n > 0 {
				// 重置写入超时
				conn.SetWriteDeadline(time.Now().Add(30 * time.Second))

				// 获取实际数据
				actualData := buffer[:n]

				// 基本UTF-8验证，确保数据有效
				text := string(actualData)
				if !utf8.ValidString(text) {
					text = strings.ToValidUTF8(text, "")
					if len(text) == 0 {
						continue // 跳过无效数据
					}
				}

				// 极简过滤：只移除明确有害的控制序列，保留所有bash输出
				// 移除括号粘贴模式控制序列（这些会干扰终端显示）
				filtered := strings.ReplaceAll(text, "\x1b[?2004h", "")
				filtered = strings.ReplaceAll(filtered, "\x1b[?2004l", "")

				// 直接发送到WebSocket，让前端完全按照后端的输出显示
				if err := conn.WriteMessage(websocket.TextMessage, []byte(filtered)); err != nil {
					log.Printf("[Terminal] 发送数据到WebSocket失败: %v", err)
					break
				}

				// 更新活动时间
				session.LastActivity = time.Now()
			}
		}
	}()

	// 从WebSocket读取输入并转发到容器
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				// 重置读取超时
				conn.SetReadDeadline(time.Now().Add(60 * time.Minute))

				_, message, err := conn.ReadMessage()
				if err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
						log.Printf("[Terminal] WebSocket读取失败: %v", err)
					} else if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
						log.Printf("[Terminal] WebSocket正常关闭: %v", err)
					} else {
						log.Printf("[Terminal] WebSocket读取错误: %v", err)
					}
					log.Printf("退出循环")
					return
				}

				// 处理特殊键序列
				if len(message) > 0 {
					// 完整的ASCII码分析和转换

					// 写入到容器终端
					if _, err := execAttachResp.Conn.Write(message); err != nil {
						log.Printf("[Terminal] 写入容器失败: %v", err)
						return
					}

					// 更新活动时间
					session.LastActivity = time.Now()
				}
			}
		}
	}()

	// 等待任一协程结束
	<-done

	log.Printf("[Terminal] 终端会话结束: %s", sessionID)

	// 清理会话
	oem.mutex.Lock()
	delete(oem.terminalSessions, sessionID)
	oem.mutex.Unlock()
}

// AI推理/内容流式WebSocket：/api/v1/ai/chat/{sessionId}/ws
// 发送的消息为 JSON：
// {"type":"reasoning","data":"..."}
// {"type":"content","data":"..."}
// {"type":"done"}
func (oem *OnlineEditorManager) handleAIChatWebSocket(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	conn, err := oem.upgrader.Upgrade(w, r, nil)

	if err != nil {
		log.Printf("[AI WS] 升级失败: %v", err)
		return
	}
	defer conn.Close()

	var payloads struct {
		WorkspaceID string   `json:"workspace_id"`
		ModelID     string   `json:"model_id"`
		Prompt      string   `json:"prompt"`
		Files       []string `json:"files"`
		FilePaths   []string `json:"file_paths"`
		MessageID   string   `json:"message_id"`
	}

	_, msgs, err := conn.ReadMessage()
	_ = json.Unmarshal(msgs, &payloads)
	conv := oem.aiConversationManager.GetConversation(sessionID)
	if conv == nil {
		conv = oem.aiConversationManager.CreateConversationWithID(sessionID, payloads.WorkspaceID)
	}
	_ = oem.aiConversationManager.AddUserMessage(sessionID, payloads.MessageID, payloads.Prompt)
	_ = oem.aiConversationManager.AddAssistantMessage(sessionID, payloads.MessageID)

	// 第一轮
	// 思维链
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "reasoning",
		"data": "AI助手已启动",
	})
	// 工具调用
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "status",
		"data": map[string]bool{"tools_running": true},
	})
	// 思考结果
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "thinking",
		"data": "这是第一轮思考结果",
	})

	time.Sleep(1 * time.Second)

	time1 := time.Now()

	tools1 := []ToolCall{
		{
			Name:        "file_read",
			Status:      "success",
			Result:      "文件内容",
			Output:      "文件内容",
			Error:       "",
			ExecutionId: "123",
			StartTime:   &time1,
			EndTime:     &time1,
			Rollback:    nil,
			Path:        "README.md",
			Content:     "文件内容",
			Command:     "",
			Summary:     "",
			Code:        nil,
		},
	}

	// 工具调用结结果
	_ = conn.WriteJSON(map[string]interface{}{
		"type":       "tools",
		"data":       tools1,
		"session_id": sessionID,
	})

	// 工具调用结束
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "status",
		"data": map[string]bool{"tools_running": false},
	})

	// 重试
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "retry",
		"data": "retry",
	})

	_ = oem.aiConversationManager.updateAssistantMessageWithReasoning(sessionID, tools1, &ThinkingProcess{
		Content: "这是第一轮思考结果",
	}, "这是第一轮思考结果", payloads.MessageID, payloads.Prompt)

	// 第二轮
	// 思维链
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "reasoning",
		"data": "这是第二轮思考结果",
	})

	// 工具调用
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "status",
		"data": map[string]bool{"tools_running": true},
	})

	// 思考结果
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "thinking",
		"data": "这是第二轮思考结果",
	})

	time.Sleep(2 * time.Second)

	time2 := time.Now()
	tools2 := []ToolCall{
		{
			Name:        "file_write",
			Status:      "success",
			Result:      "文件内容",
			Output:      "文件内容",
			Error:       "",
			ExecutionId: "123",
			StartTime:   &time2,
			EndTime:     &time2,
			Rollback:    nil,
			Path:        "README.md",
			Content:     "文件内容",
			Command:     "",
			Summary:     "",
			Code:        nil,
		},
		{
			Name:        "shell_exec",
			Status:      "success",
			Result:      "文件内容",
			Output:      "文件内容",
			Error:       "",
			ExecutionId: "123",
			StartTime:   &time2,
			EndTime:     &time2,
			Rollback:    nil,
			Path:        "",
			Content:     "",
			Command:     "ls -l",
			Summary:     "",
			Code:        nil,
		},
		{
			Name:        "conversation_summary",
			Status:      "success",
			Result:      "AI助手已启动，并完成了文件读写和shell命令执行",
			Output:      "AI助手已启动，并完成了文件读写和shell命令执行",
			Error:       "",
			ExecutionId: "123",
			StartTime:   &time2,
			EndTime:     &time2,
			Rollback:    nil,
			Path:        "",
			Content:     "",
			Command:     "",
			Summary:     "AI助手已启动，并完成了文件读写和shell命令执行",
			Code:        nil,
		},
	}

	// 工具调用结结果
	_ = conn.WriteJSON(map[string]interface{}{
		"type":       "tools",
		"data":       tools2,
		"session_id": sessionID,
	})

	_ = oem.aiConversationManager.updateAssistantMessageWithReasoning(sessionID, tools2, &ThinkingProcess{
		Content: "这是第二轮思考结果",
	}, "这是第二轮思考结果", payloads.MessageID, payloads.Prompt)

	time.Sleep(1 * time.Second)

	// 工具调用
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "status",
		"data": map[string]bool{"tools_running": false},
	})

	_ = conn.WriteJSON(map[string]interface{}{
		"type":       "done",
		"data":       "AI助手已启动",
		"status":     "finish",
		"session_id": sessionID,
	})

	return

	// 简化：仅接收一条用户消息后触发一次调用；可扩展为持续会话
	_, msg, err := conn.ReadMessage()
	if err != nil {
		log.Printf("[AI WS] 读取消息失败: %v", err)
		return
	}

	var payload struct {
		WorkspaceID string   `json:"workspace_id"`
		ModelID     string   `json:"model_id"`
		Prompt      string   `json:"prompt"`
		Files       []string `json:"files"`
		FilePaths   []string `json:"file_paths"`
		MessageID   string   `json:"message_id"`
	}
	_ = json.Unmarshal(msg, &payload)

	// 构造最小请求
	req := AICodeGenerationRequest{
		Prompt:    payload.Prompt,
		Workspace: payload.WorkspaceID,
		Model:     payload.ModelID,
		SessionID: sessionID,
		Files:     payload.Files,
		FilePaths: payload.FilePaths,
	}

	// 统一使用流式传输（所有模型）——前端模型来源于后端配置，无需额外判断，仅按ID获取
	model := oem.aiModelManager.GetModel(payload.ModelID)
	if model != nil {
		{
			// 确保会话存在并记录用户消息
			conv := oem.aiConversationManager.GetConversation(sessionID)
			if conv == nil {
				conv = oem.aiConversationManager.CreateConversationWithID(sessionID, payload.WorkspaceID)
			}

			// 构建文件上下文（仅精确文件读取；目录仅作为上下文路径，不展开不读取）
			fileContents := make(map[string]string)
			maxFileSize := int64(1024 * 1024 * 10)
			fileTree, errTree := oem.GetWorkspaceFileTree(payload.WorkspaceID)
			if errTree != nil {
				fileTree = []string{}
			}
			fileSet := make(map[string]struct{}, len(fileTree))
			for _, f := range fileTree {
				fileSet[f] = struct{}{}
			}
			// 仅当是精确文件时读取内容
			if len(req.Files) > 0 {
				for _, p := range req.Files {
					if p == "" {
						continue
					}
					clean := strings.TrimPrefix(p, "./")
					clean = strings.TrimPrefix(clean, "/")
					if _, ok := fileSet[clean]; ok {
						if content, err := oem.ReadFile(req.Workspace, clean); err == nil && int64(len(content)) <= maxFileSize {
							fileContents[clean] = content
						}
					}
				}
			}
			if len(req.FilePaths) > 0 {
				for _, p := range req.FilePaths {
					clean := strings.TrimPrefix(p, "./")
					clean = strings.TrimPrefix(clean, "/")
					if _, ok := fileSet[clean]; ok {
						if content, err := oem.ReadFile(req.Workspace, clean); err == nil && int64(len(content)) <= maxFileSize {
							fileContents[clean] = content
						}
					}
				}
			}
			// 获取对话历史
			history := oem.aiConversationManager.GetConversationHistory(sessionID)

			// 创建用户消息
			_ = oem.aiConversationManager.AddUserMessage(sessionID, payload.MessageID, payload.Prompt)

			// 创建助手消息（用于保存AI输出）
			_ = oem.aiConversationManager.AddAssistantMessage(sessionID, payload.MessageID)

			// 构建提示词（初始没有工具调用历史）
			prompt := oem.buildAIPrompt(payload.Prompt, payload.WorkspaceID, fileContents, true)

			// 创建思维链和内容缓冲区
			var reasoningBuf, contentBuf strings.Builder

			// 流式调用
			oem.logInfo("调用AI模型(流式)", map[string]interface{}{"model": model.Name, "is_reasoner": model.IsReasoner, "workspace": payload.WorkspaceID})

			err := oem.callAIStreamWithModel(prompt, model, history,
				func(reason string) {
					reasoningBuf.WriteString(reason)
					// 立即发送推理内容到前端
					if err := conn.WriteJSON(map[string]interface{}{"type": "reasoning", "data": reason, "session_id": sessionID}); err != nil {
						log.Printf("[AI WS] 发送推理内容失败: %v", err)
						return
					}
				},
				func(content string) {
					// 仅累积最终内容，不在流式阶段发送content
					contentBuf.WriteString(content)
				},
			)
			if err != nil {
				log.Printf("[AI WS] 流式调用失败: %v", err)
				if err := conn.WriteJSON(map[string]string{"type": "error", "message": err.Error()}); err != nil {
					log.Printf("[AI WS] 发送错误消息失败: %v", err)
				}
				return
			}

			// 流式结束后：解析最终content并执行工具，前端展示
			finalContent := strings.TrimSpace(contentBuf.String())
			log.Printf("[AI WS] 流式结束，最终内容长度: %d", len(finalContent))

			if finalContent != "" {
				// 自动循环：最多20次
				maxLoops := 20
				currentPrompt := prompt
				for i := 0; i < maxLoops; i++ {
					// 工具阶段开始（loading提示）
					_ = conn.WriteJSON(map[string]interface{}{"type": "status", "data": map[string]bool{"tools_running": true}})

					tools, thinking, status, perr := oem.parseAIResponse(finalContent, payload.WorkspaceID)
					if perr != nil {
						// perr 存在意味着可能需要重试（AutoRetryError）或致命错误
						if _, ok := perr.(*AutoRetryError); !ok {
							log.Printf("[AI WS] 解析AI响应失败: %v", perr)
							_ = conn.WriteJSON(map[string]string{"type": "error", "message": perr.Error()})
							// 结束loading
							_ = conn.WriteJSON(map[string]interface{}{"type": "status", "data": map[string]bool{"tools_running": false}})
							break
						}
					}

					// 写入对话（每轮都记录thinking与工具，保存推理内容）
					_ = oem.aiConversationManager.updateAssistantMessageWithReasoning(sessionID, tools, thinking, reasoningBuf.String(), payloads.MessageID, payloads.Prompt)

					// 将工具结果发送给前端
					if len(tools) > 0 {
						_ = conn.WriteJSON(map[string]interface{}{"type": "tools", "data": tools, "session_id": sessionID})
					}

					// 结束
					if status == "finish" {
						// 结束loading
						_ = conn.WriteJSON(map[string]interface{}{"type": "status", "data": map[string]bool{"tools_running": false}})
						// 最终输出：使用thinking作为结果文本，并保存到对话历史
						finalDisplay := "操作完成"
						// 保存最终内容到对话历史
						_ = conn.WriteJSON(map[string]interface{}{"type": "content", "data": finalDisplay, "status": "finish", "session_id": sessionID})
						break
					}

					// status == retry：自动继续提问
					history := oem.aiConversationManager.GetConversationHistory(sessionID)
					// 构建当前对话过程中的工具调用历史
					currentPrompt = oem.buildAIPrompt(payload.Prompt, payload.WorkspaceID, fileContents, false)
					// 重置ai输出内容
					finalContent = ""
					// 重置思维链内容
					reasoningBuf.Reset()
					// 重试
					_ = conn.WriteJSON(map[string]interface{}{"type": "retry", "data": "retry", "session_id": sessionID})
					// 新一轮：仅流式推理内容（不推送content增量）
					err := oem.callAIStreamWithModel(currentPrompt, model, history,
						func(reason string) {
							reasoningBuf.WriteString(reason)
							_ = conn.WriteJSON(map[string]interface{}{"type": "reasoning", "data": reason, "session_id": sessionID})
						},
						func(content string) {
							finalContent += content
						},
					)
					// 本轮结束，结束loading（下一轮开始前会再次置true）
					_ = conn.WriteJSON(map[string]interface{}{"type": "status", "data": map[string]bool{"tools_running": false}})

					if err != nil {
						log.Printf("[AI WS] 第二阶段流式调用失败: %v", err)
						_ = conn.WriteJSON(map[string]string{"type": "error", "message": err.Error()})
						break
					}
				}
			}

			// 收尾，通知前端完成（最终content已在finish时发送）
			log.Printf("[AI WS] 发送完成信号")
			if err := conn.WriteJSON(map[string]string{"type": "done"}); err != nil {
				log.Printf("[AI WS] 发送done信号失败: %v", err)
			}
		}
	}
	// 不存在模型，返回明确错误
	_ = conn.WriteJSON(map[string]string{"type": "error", "message": "无效的模型ID"})
}

func (oem *OnlineEditorManager) handleExecuteCommand(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Command []string `json:"command"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	output, err := oem.ExecuteCommand(workspaceID, req.Command)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"output": output})
}

func (oem *OnlineEditorManager) handleGitOperation(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var operation GitOperation
	if err := json.NewDecoder(r.Body).Decode(&operation); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	output, err := oem.GitOperation(workspaceID, operation)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"output": output})
}

func (oem *OnlineEditorManager) handleListImages(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	images, err := oem.dockerClient.ImageList(ctx, imageTypes.ListOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("获取镜像列表失败: %v", err), http.StatusInternalServerError)
		return
	}

	var imageList []map[string]interface{}
	for _, image := range images {
		// 获取镜像详细信息
		imageInfo, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, image.ID)
		if err != nil {
			continue
		}

		// 获取镜像标签
		var tags []string
		if len(image.RepoTags) > 0 {
			tags = image.RepoTags
		} else {
			tags = []string{image.ID[:12]} // 使用短ID作为标签
		}

		imageList = append(imageList, map[string]interface{}{
			"id":           image.ID,
			"tags":         tags,
			"size":         image.Size,
			"created":      image.Created,
			"architecture": imageInfo.Architecture,
			"os":           imageInfo.Os,
		})
	}

	json.NewEncoder(w).Encode(imageList)
}

// 获取所有可用镜像配置
func (oem *OnlineEditorManager) handleListAvailableImages(w http.ResponseWriter, r *http.Request) {
	images, err := oem.GetAvailableImages()
	if err != nil {
		http.Error(w, fmt.Sprintf("获取可用镜像失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(images)
}

// 获取环境变量模板
func (oem *OnlineEditorManager) handleGetEnvironmentTemplates(w http.ResponseWriter, r *http.Request) {
	templates := oem.GetEnvironmentTemplates()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(templates)
}

// 添加自定义镜像
func (oem *OnlineEditorManager) handleAddCustomImage(w http.ResponseWriter, r *http.Request) {
	var req CustomImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	config, err := oem.AddCustomImage(req)
	if err != nil {
		http.Error(w, "添加自定义镜像失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// 删除自定义镜像配置
func (oem *OnlineEditorManager) handleDeleteCustomImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageName := vars["name"]

	err := oem.DeleteCustomImage(imageName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// 更新自定义镜像配置
func (oem *OnlineEditorManager) handleUpdateCustomImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageName := vars["name"]

	var req CustomImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	imageConfig, err := oem.UpdateCustomImage(imageName, req)
	if err != nil {
		http.Error(w, "更新镜像配置失败: "+err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(imageConfig)
}

func (oem *OnlineEditorManager) handlePullImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageName := vars["imageName"]

	if err := oem.PullImage(imageName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (oem *OnlineEditorManager) handleDeleteImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	imageID := vars["imageId"]

	if err := oem.DeleteImage(imageID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// 处理镜像导入
func (oem *OnlineEditorManager) handleImportImage(w http.ResponseWriter, r *http.Request) {
	log.Printf("收到镜像导入请求: %s %s", r.Method, r.URL.Path)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析multipart表单
	err := r.ParseMultipartForm(32 << 20) // 32MB max
	if err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image_file")
	if err != nil {
		http.Error(w, "Failed to get uploaded file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 检查文件类型
	if !strings.HasSuffix(header.Filename, ".tar") && !strings.HasSuffix(header.Filename, ".tar.gz") {
		http.Error(w, "Only .tar and .tar.gz files are supported", http.StatusBadRequest)
		return
	}

	// 创建临时文件
	tempFile, err := os.CreateTemp("", header.Filename+".tar")
	if err != nil {
		http.Error(w, "Failed to create temp file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 复制上传的文件到临时文件
	_, err = io.Copy(tempFile, file)
	if err != nil {
		tempFile.Close()
		os.Remove(tempFile.Name())
		http.Error(w, "Failed to save uploaded file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 保存临时文件路径，然后关闭文件
	tempFilePath := tempFile.Name()
	tempFile.Close()

	// 获取用户指定的镜像名称
	userImageName := r.FormValue("image_name")
	log.Printf("用户指定的镜像名称: %s", userImageName)

	// 生成导入任务ID
	importID := generateDownloadID() // 复用下载ID生成函数

	// 立即返回响应，表示导入任务已开始
	log.Printf("返回导入任务响应: %s", importID)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "镜像导入任务已开始",
		"import_id": importID,
		"status":    "importing",
	})

	// 创建导入任务记录
	importTask := &ImportTaskInfo{
		ID:        importID,
		FileName:  header.Filename,
		Status:    "importing",
		CreatedAt: time.Now(),
	}

	oem.importTasksMutex.Lock()
	oem.importTasks[importID] = importTask
	oem.importTasksMutex.Unlock()

	// 异步执行镜像导入
	go func() {
		defer os.Remove(tempFilePath) // 在异步处理完成后删除临时文件

		log.Printf("开始异步导入镜像: %s", header.Filename)

		imageName, err := oem.ImportImage(tempFilePath, userImageName)

		// 更新任务状态
		oem.importTasksMutex.Lock()
		if task, exists := oem.importTasks[importID]; exists {
			now := time.Now()
			task.CompletedAt = &now

			if err != nil {
				log.Printf("镜像导入失败: %v", err)
				task.Status = "failed"
				task.Error = err.Error()
			} else {
				log.Printf("镜像导入成功: %s", imageName)
				task.Status = "completed"
				task.ImageName = imageName
			}
		}
		oem.importTasksMutex.Unlock()
	}()
}

// 处理查询导入状态
func (oem *OnlineEditorManager) handleGetImportStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	importID := vars["importId"]

	oem.importTasksMutex.RLock()
	task, exists := oem.importTasks[importID]
	oem.importTasksMutex.RUnlock()

	if !exists {
		http.Error(w, "导入任务不存在", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

func (oem *OnlineEditorManager) handleGetContainerStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	containerID := vars["containerId"]

	status, err := oem.GetContainerStatus(containerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": status})
}

func (oem *OnlineEditorManager) handleGetContainerStats(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	containerID := vars["containerId"]

	stats, err := oem.GetContainerStats(containerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(stats)
}

func (oem *OnlineEditorManager) handleToggleFavorite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.Lock()
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		oem.mutex.Unlock()
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	// 切换收藏状态
	workspace.IsFavorite = !workspace.IsFavorite
	oem.mutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":          workspaceID,
		"is_favorite": workspace.IsFavorite,
		"message":     fmt.Sprintf("工作空间已%s", map[bool]string{true: "收藏", false: "取消收藏"}[workspace.IsFavorite]),
	})
}

func (oem *OnlineEditorManager) handleTestPort(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]
	port := vars["port"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	if workspace.Status != "running" {
		http.Error(w, "工作空间未运行", http.StatusBadRequest)
		return
	}

	// 在容器内启动一个简单的HTTP服务器进行测试
	testCmd, err := scriptManager.FormatScript("port_test_server", port, port, port, port, port, port)
	if err != nil {
		http.Error(w, fmt.Sprintf("获取测试脚本失败: %v", err), http.StatusInternalServerError)
		return
	}

	output, err := oem.ExecuteCommand(workspaceID, []string{"/bin/bash", "-c", testCmd})
	if err != nil {
		http.Error(w, fmt.Sprintf("启动测试服务器失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  fmt.Sprintf("端口 %s 测试服务器启动命令已执行", port),
		"output":   output,
		"test_url": fmt.Sprintf("http://localhost:%s", port),
		"note":     "请等待几秒钟让服务器完全启动，然后访问测试URL",
	})
}

func (oem *OnlineEditorManager) handleCheckPorts(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	if workspace.Status != "running" {
		http.Error(w, "工作空间未运行", http.StatusBadRequest)
		return
	}

	// 异步检查端口状态
	go func() {
		oem.checkPortAvailability(workspace)
	}()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "checking"})
}

func (oem *OnlineEditorManager) handleGetPortStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"workspace_ip": workspace.NetworkIP,
		"access_urls":  workspace.AccessURLs,
		"ports":        workspace.Ports,
	})
}

func (oem *OnlineEditorManager) handleUpdatePortBindings(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req struct {
		Ports []PortMapping `json:"ports"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	oem.mutex.Lock()
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		oem.mutex.Unlock()
		http.Error(w, "工作空间不存在", http.StatusNotFound)
		return
	}

	// 更新端口配置
	workspace.Ports = req.Ports
	wasRunning := workspace.Status == "running"
	oem.mutex.Unlock()

	// 如果工作空间正在运行，重启容器以应用新的端口配置
	if wasRunning {
		log.Printf("[%s] 端口配置已更新，重启容器以应用新配置", workspaceID)

		// 停止容器
		if err := oem.StopWorkspace(workspaceID); err != nil {
			log.Printf("[%s] 停止容器失败: %v", workspaceID, err)
			http.Error(w, "停止容器失败: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// 删除旧容器
		ctx := context.Background()
		if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
			log.Printf("[%s] 删除旧容器失败: %v", workspaceID, err)
		}

		// 重新创建并启动容器
		go func() {
			time.Sleep(2 * time.Second) // 等待容器完全停止

			// 重新初始化容器
			if err := oem.recreateContainer(workspace); err != nil {
				log.Printf("[%s] 重新创建容器失败: %v", workspaceID, err)
				oem.mutex.Lock()
				workspace.Status = "failed"
				oem.mutex.Unlock()
				return
			}

			// 启动容器
			if err := oem.StartWorkspace(workspaceID); err != nil {
				log.Printf("[%s] 启动容器失败: %v", workspaceID, err)
				oem.mutex.Lock()
				workspace.Status = "failed"
				oem.mutex.Unlock()
			} else {
				log.Printf("[%s] 容器重启完成，端口配置已应用", workspaceID)
			}
		}()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "端口配置已更新",
		"ports":      workspace.Ports,
		"restarting": wasRunning,
		"note":       "容器正在重启以应用新的端口配置",
	})
}

// 处理导出请求
func (oem *OnlineEditorManager) handleExportWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["id"]

	var req ExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 验证导出类型
	if req.Type != "files" && req.Type != "image" {
		http.Error(w, "不支持的导出类型，只支持 'files' 或 'image'", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var response *ExportResponse
	var err error

	if req.Type == "files" {
		// 导出文件
		response, err = oem.ExportWorkspaceFiles(workspaceID, req.Path, req.Format, req.SelectedFiles)
	} else {
		// 导出镜像
		response, err = oem.ExportWorkspaceImage(workspaceID, req.ImageName, req.ImageTag)
	}

	if err != nil {
		http.Error(w, "导出失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(response)
}

// 处理下载请求
func (oem *OnlineEditorManager) handleDownload(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	downloadID := vars["downloadId"]

	downloadInfo, err := oem.GetDownloadInfo(downloadID)
	if err != nil {
		http.Error(w, "下载链接无效或已过期: "+err.Error(), http.StatusNotFound)
		return
	}

	// 检查文件是否存在
	if _, err := os.Stat(downloadInfo.FilePath); os.IsNotExist(err) {
		http.Error(w, "下载文件不存在", http.StatusNotFound)
		return
	}

	// 打开文件
	file, err := os.Open(downloadInfo.FilePath)
	if err != nil {
		http.Error(w, "无法打开下载文件: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// 设置下载响应头
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", downloadInfo.FileName))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", downloadInfo.FileSize))
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// 流式传输文件内容
	_, err = io.Copy(w, file)
	if err != nil {
		log.Printf("下载文件传输失败 %s: %v", downloadID, err)
	} else {
		log.Printf("下载完成: %s (%s)", downloadID, downloadInfo.FileName)
	}
}

// 获取下载状态
func (oem *OnlineEditorManager) handleGetDownloadStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	downloadID := vars["downloadId"]

	downloadInfo, err := oem.GetDownloadInfo(downloadID)
	if err != nil {
		http.Error(w, "下载ID不存在或已过期: "+err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"download_id":  downloadID,
		"file_name":    downloadInfo.FileName,
		"file_size":    downloadInfo.FileSize,
		"export_type":  downloadInfo.ExportType,
		"created_at":   downloadInfo.CreatedAt,
		"expires_at":   downloadInfo.ExpiresAt,
		"status":       "ready",
		"download_url": fmt.Sprintf("/api/v1/downloads/%s/file", downloadID),
	})
}

// 列出用户的下载
func (oem *OnlineEditorManager) handleListDownloads(w http.ResponseWriter, r *http.Request) {
	oem.downloadsMutex.RLock()
	defer oem.downloadsMutex.RUnlock()

	var downloads []map[string]interface{}
	now := time.Now()

	for downloadID, downloadInfo := range oem.downloads {
		// 跳过已过期的下载
		if now.After(downloadInfo.ExpiresAt) {
			continue
		}

		downloads = append(downloads, map[string]interface{}{
			"download_id":  downloadID,
			"file_name":    downloadInfo.FileName,
			"file_size":    downloadInfo.FileSize,
			"export_type":  downloadInfo.ExportType,
			"created_at":   downloadInfo.CreatedAt,
			"expires_at":   downloadInfo.ExpiresAt,
			"download_url": fmt.Sprintf("/api/v1/downloads/%s/file", downloadID),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(downloads)
}

// 获取镜像源列表
func (oem *OnlineEditorManager) handleGetRegistries(w http.ResponseWriter, r *http.Request) {
	registries := oem.registryManager.GetAllRegistries()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"registries": registries,
		"count":      len(registries),
	})
}

// 切换镜像源状态
func (oem *OnlineEditorManager) handleToggleRegistry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	code := vars["code"]

	var req struct {
		Enabled bool `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	err := oem.registryManager.UpdateRegistryStatus(code, req.Enabled)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	log.Printf("镜像源状态更新: %s = %t", code, req.Enabled)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    code,
		"enabled": req.Enabled,
		"message": fmt.Sprintf("镜像源 %s 已%s", code, map[bool]string{true: "启用", false: "禁用"}[req.Enabled]),
	})
}

// 添加镜像源
func (oem *OnlineEditorManager) handleAddRegistry(w http.ResponseWriter, r *http.Request) {
	var req RegistryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 设置默认类型
	if req.Type == "" {
		req.Type = "registry"
	}

	err := oem.registryManager.AddRegistry(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("镜像源添加成功: %s (%s)", req.Name, req.Code)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("镜像源 %s 添加成功", req.Name),
		"code":    req.Code,
	})
}

// 更新镜像源
func (oem *OnlineEditorManager) handleUpdateRegistry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	code := vars["code"]

	var req RegistryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	err := oem.registryManager.UpdateRegistry(code, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	log.Printf("镜像源更新成功: %s", code)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("镜像源 %s 更新成功", req.Name),
		"code":    code,
	})
}

// 删除镜像源
func (oem *OnlineEditorManager) handleDeleteRegistry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	code := vars["code"]

	err := oem.registryManager.DeleteRegistry(code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("镜像源删除成功: %s", code)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("镜像源 %s 删除成功", code),
		"code":    code,
	})
}

// 获取AI模型
func (oem *OnlineEditorManager) handleGetAIModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	models := oem.aiModelManager.GetAllModels()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models)
}

// 添加AI模型
func (oem *OnlineEditorManager) handleAddAIModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	var req AIModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	model, err := oem.aiModelManager.AddModel(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("添加AI模型失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model)
}

// 更新AI模型
func (oem *OnlineEditorManager) handleUpdateAIModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	modelID := vars["id"]

	var req AIModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	model, err := oem.aiModelManager.UpdateModel(modelID, req)
	if err != nil {
		http.Error(w, fmt.Sprintf("更新AI模型失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model)
}

// 删除AI模型
func (oem *OnlineEditorManager) handleDeleteAIModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	modelID := vars["id"]

	err := oem.aiModelManager.DeleteModel(modelID)
	if err != nil {
		http.Error(w, fmt.Sprintf("删除AI模型失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "AI模型删除成功"})
}

// 设置默认AI模型
func (oem *OnlineEditorManager) handleSetDefaultAIModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	modelID := vars["id"]

	err := oem.aiModelManager.SetDefaultModel(modelID)
	if err != nil {
		http.Error(w, fmt.Sprintf("设置默认AI模型失败: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "默认AI模型设置成功"})
}

// 执行拒绝操作
func (oem *OnlineEditorManager) handleRejectOperation(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	var req RejectOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		oem.logError("拒绝操作请求体解析失败", err)
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	// 验证请求
	if req.WorkspaceID == "" {
		http.Error(w, "工作空间ID不能为空", http.StatusBadRequest)
		return
	}

	if req.Operation == "" {
		http.Error(w, "操作类型不能为空", http.StatusBadRequest)
		return
	}

	if req.FilePath == "" {
		http.Error(w, "文件路径不能为空", http.StatusBadRequest)
		return
	}

	// 记录请求信息
	oem.logInfo("拒绝操作请求", map[string]interface{}{
		"workspace_id": req.WorkspaceID,
		"operation":    req.Operation,
		"file_path":    req.FilePath,
	})

	// 执行拒绝操作
	response, err := oem.ExecuteRejectOperation(req)
	if err != nil {
		oem.logError("拒绝操作执行", err)
		http.Error(w, fmt.Sprintf("拒绝操作失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 记录响应信息
	oem.logInfo("拒绝操作响应", map[string]interface{}{
		"success": response.Success,
		"message": response.Message,
	})

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		oem.logError("拒绝操作响应编码失败", err)
		http.Error(w, "响应编码失败", http.StatusInternalServerError)
		return
	}
}

// 创建对话会话
func (oem *OnlineEditorManager) handleCreateConversation(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		WorkspaceID string `json:"workspace_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		oem.logError("创建对话会话请求体解析失败", err)
		http.Error(w, "请求体解析失败", http.StatusBadRequest)
		return
	}

	if req.WorkspaceID == "" {
		http.Error(w, "工作空间ID不能为空", http.StatusBadRequest)
		return
	}

	// 创建对话会话
	conversation := oem.aiConversationManager.CreateConversation(req.WorkspaceID)

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(conversation); err != nil {
		oem.logError("创建对话会话响应编码失败", err)
		http.Error(w, "响应编码失败", http.StatusInternalServerError)
		return
	}
}

// 获取工作空间的对话会话列表
func (oem *OnlineEditorManager) handleGetConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	workspaceID := vars["id"]

	if workspaceID == "" {
		http.Error(w, "工作空间ID不能为空", http.StatusBadRequest)
		return
	}

	// 获取对话会话列表
	conversations := oem.aiConversationManager.GetConversationsByWorkspace(workspaceID)

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(conversations); err != nil {
		oem.logError("获取对话会话列表响应编码失败", err)
		http.Error(w, "响应编码失败", http.StatusInternalServerError)
		return
	}
}

// 获取对话会话详情
func (oem *OnlineEditorManager) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	if sessionID == "" {
		http.Error(w, "会话ID不能为空", http.StatusBadRequest)
		return
	}

	// 获取对话会话
	conversation := oem.aiConversationManager.GetConversation(sessionID)
	if conversation == nil {
		http.Error(w, "对话会话不存在", http.StatusNotFound)
		return
	}

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(conversation); err != nil {
		oem.logError("获取对话会话详情响应编码失败", err)
		http.Error(w, "响应编码失败", http.StatusInternalServerError)
		return
	}
}

// 删除对话会话
func (oem *OnlineEditorManager) handleDeleteConversation(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		http.Error(w, "方法不允许", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	if sessionID == "" {
		http.Error(w, "会话ID不能为空", http.StatusBadRequest)
		return
	}

	// 删除对话会话
	err := oem.aiConversationManager.DeleteConversation(sessionID)
	if err != nil {
		oem.logError("删除对话会话失败", err)
		http.Error(w, fmt.Sprintf("删除对话会话失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 返回响应
	w.WriteHeader(http.StatusOK)
}
