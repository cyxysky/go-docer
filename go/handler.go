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
