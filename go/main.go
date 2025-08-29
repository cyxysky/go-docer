package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/mux"
)

// 主函数
func main() {
	// 创建在线编辑器管理器
	manager, err := NewOnlineEditorManager()
	if err != nil {
		log.Fatalf("创建在线编辑器管理器失败: %v", err)
	}

	// 健康检查
	if err := manager.HealthCheck(); err != nil {
		log.Fatalf("Docker 健康检查失败: %v", err)
	}
	log.Println("Docker 连接正常")

	// 启动定期清理任务
	manager.StartCleanupTask()
	log.Println("定期清理任务已启动")

	// 启动HTTP服务器
	port := 8080
	if portEnv := os.Getenv("PORT"); portEnv != "" {
		if p, err := strconv.Atoi(portEnv); err == nil {
			port = p
		}
	}
	log.Printf("在线代码编辑器服务器启动在端口 %d", port)
	log.Println("API 文档:")
	log.Println("  工作空间管理:")
	log.Println("    GET    /api/v1/workspaces - 列出工作空间")
	log.Println("    POST   /api/v1/workspaces - 创建工作空间")
	log.Println("    GET    /api/v1/workspaces/{id} - 获取工作空间详情")
	log.Println("    POST   /api/v1/workspaces/{id}/start - 启动工作空间")
	log.Println("    POST   /api/v1/workspaces/{id}/stop - 停止工作空间")
	log.Println("    DELETE /api/v1/workspaces/{id} - 删除工作空间")
	log.Println("  文件系统:")
	log.Println("    GET    /api/v1/workspaces/{id}/files - 列出文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/read - 读取文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/write - 写入文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/delete - 删除文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/create - 创建文件")
	log.Println("    POST   /api/v1/workspaces/{id}/files/mkdir - 创建文件夹")
	log.Println("    POST   /api/v1/workspaces/{id}/files/move - 移动文件")
	log.Println("  终端和命令:")
	log.Println("    POST   /api/v1/workspaces/{id}/terminal - 创建终端")
	log.Println("    GET    /api/v1/workspaces/{id}/terminal/{sessionId}/ws - 终端WebSocket")
	log.Println("    GET    /api/v1/ai/chat/{sessionId}/ws - AI推理/内容流式WebSocket")
	log.Println("    POST   /api/v1/workspaces/{id}/exec - 执行命令")
	log.Println("  Git操作:")
	log.Println("    POST   /api/v1/workspaces/{id}/git - Git操作")
	log.Println("  镜像管理:")
	log.Println("    GET    /api/v1/images - 列出镜像")
	log.Println("    POST   /api/v1/images/search/data - 搜索镜像")
	log.Println("    POST   /api/v1/images/{imageName} - 拉取镜像")
	log.Println("    POST   /api/v1/images/import/images - 导入镜像")
	log.Println("    DELETE /api/v1/images/{imageId} - 删除镜像")
	log.Println("  镜像源管理:")
	log.Println("    GET    /api/v1/registries - 获取镜像源列表")
	log.Println("    POST   /api/v1/registries - 添加镜像源")
	log.Println("    PUT    /api/v1/registries/{code} - 更新镜像源")
	log.Println("    DELETE /api/v1/registries/{code} - 删除镜像源")
	log.Println("    POST   /api/v1/registries/{code}/toggle - 切换镜像源状态")
	log.Println("  容器监控:")
	log.Println("    GET    /api/v1/containers/{containerId}/status - 获取容器状态")
	log.Println("    GET    /api/v1/containers/{containerId}/stats - 获取容器统计")
	log.Println("  网络管理:")
	log.Println("    GET    /api/v1/network/ip-pool/stats - 获取IP池统计")
	log.Println("    GET    /api/v1/network/ip-pool/allocations - 获取IP分配信息")
	log.Println("  导出和下载:")
	log.Println("    POST   /api/v1/workspaces/{id}/export - 导出工作空间文件或镜像")
	log.Println("    GET    /api/v1/downloads - 列出用户的下载")
	log.Println("    GET    /api/v1/downloads/{downloadId}/status - 获取下载状态")
	log.Println("    GET    /api/v1/downloads/{downloadId}/file - 下载文件")

	if err := manager.StartServer(port); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}

func (oem *OnlineEditorManager) StartServer(port int) error {
	router := mux.NewRouter()

	// CORS中间件
	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 设置CORS头
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			// 处理预检请求
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// 应用CORS中间件
	router.Use(corsMiddleware)

	// API路由
	api := router.PathPrefix("/api/v1").Subrouter()

	// 工作空间管理
	api.HandleFunc("/workspaces", oem.handleListWorkspaces).Methods("GET")
	api.HandleFunc("/workspaces", oem.handleCreateWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}", oem.handleGetWorkspace).Methods("GET")
	api.HandleFunc("/workspaces/{id}/start", oem.handleStartWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}/stop", oem.handleStopWorkspace).Methods("POST")
	api.HandleFunc("/workspaces/{id}", oem.handleDeleteWorkspace).Methods("DELETE")

	// 文件系统
	api.HandleFunc("/workspaces/{id}/files", oem.handleListFiles).Methods("GET")
	api.HandleFunc("/workspaces/{id}/files/read", oem.handleReadFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/write", oem.handleWriteFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/create", oem.handleCreateFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/mkdir", oem.handleCreateFolder).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/move", oem.handleMoveFile).Methods("POST")
	api.HandleFunc("/workspaces/{id}/files/delete", oem.handleDeleteFile).Methods("POST")

	// 终端
	api.HandleFunc("/workspaces/{id}/terminal", oem.handleCreateTerminal).Methods("POST")
	api.HandleFunc("/workspaces/{id}/terminal/{sessionId}/ws", oem.handleTerminalWebSocket).Methods("GET")

	// 命令执行
	api.HandleFunc("/workspaces/{id}/exec", oem.handleExecuteCommand).Methods("POST")

	// Git操作
	api.HandleFunc("/workspaces/{id}/git", oem.handleGitOperation).Methods("POST")

	// 镜像管理
	api.HandleFunc("/images", oem.handleListImages).Methods("GET")
	api.HandleFunc("/images/available", oem.handleListAvailableImages).Methods("GET")
	api.HandleFunc("/images/templates", oem.handleGetEnvironmentTemplates).Methods("GET")
	api.HandleFunc("/images/custom", oem.handleAddCustomImage).Methods("POST")
	api.HandleFunc("/images/custom/{name}", oem.handleDeleteCustomImage).Methods("DELETE")
	api.HandleFunc("/images/custom/{name}", oem.handleUpdateCustomImage).Methods("PUT")
	api.HandleFunc("/images/{imageName}", oem.handlePullImage).Methods("POST")
	api.HandleFunc("/images/{imageId}", oem.handleDeleteImage).Methods("DELETE")
	api.HandleFunc("/images/import/images", oem.handleImportImage).Methods("POST")               // 新增镜像导入API
	api.HandleFunc("/images/import/status/{importId}", oem.handleGetImportStatus).Methods("GET") // 新增镜像导入API

	// 镜像源管理
	api.HandleFunc("/registries", oem.handleGetRegistries).Methods("GET")
	api.HandleFunc("/registries", oem.handleAddRegistry).Methods("POST")
	api.HandleFunc("/registries/{code}", oem.handleUpdateRegistry).Methods("PUT")
	api.HandleFunc("/registries/{code}", oem.handleDeleteRegistry).Methods("DELETE")
	api.HandleFunc("/registries/{code}/toggle", oem.handleToggleRegistry).Methods("POST")

	// 容器状态监控
	api.HandleFunc("/containers/{containerId}/status", oem.handleGetContainerStatus).Methods("GET")
	api.HandleFunc("/containers/{containerId}/stats", oem.handleGetContainerStats).Methods("GET")

	// 端口访问管理
	api.HandleFunc("/workspaces/{id}/ports/check", oem.handleCheckPorts).Methods("POST")
	api.HandleFunc("/workspaces/{id}/ports/status", oem.handleGetPortStatus).Methods("GET")
	api.HandleFunc("/workspaces/{id}/ports", oem.handleUpdatePortBindings).Methods("PUT")

	// 工作空间收藏
	api.HandleFunc("/workspaces/{id}/favorite", oem.handleToggleFavorite).Methods("POST")

	// 端口测试
	api.HandleFunc("/workspaces/{id}/test-port/{port}", oem.handleTestPort).Methods("POST")

	// 新增：导出和下载功能
	api.HandleFunc("/workspaces/{id}/export", oem.handleExportWorkspace).Methods("POST")
	api.HandleFunc("/downloads", oem.handleListDownloads).Methods("GET")
	api.HandleFunc("/downloads/{downloadId}/status", oem.handleGetDownloadStatus).Methods("GET")
	api.HandleFunc("/downloads/{downloadId}/file", oem.handleDownload).Methods("GET")

	// 静态文件服务
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))

	log.Printf("在线代码编辑器服务器启动在端口 %d", port)

	// 创建HTTP服务器并设置超时
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      router,
		ReadTimeout:  120 * time.Second, // 读取超时
		WriteTimeout: 120 * time.Second, // 写入超时
		IdleTimeout:  120 * time.Second, // 空闲超时
	}

	return server.ListenAndServe()
}
