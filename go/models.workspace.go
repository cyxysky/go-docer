package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	imageTypes "github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/go-connections/nat"
)

// 生成工作空间ID
func generateWorkspaceID() string {
	return fmt.Sprintf("ws_%d", time.Now().UnixNano())
}

// 生成唯一的下载ID
func generateDownloadID() string {
	return fmt.Sprintf("dl_%d", time.Now().UnixNano())
}

// 导出工作空间文件
func (oem *OnlineEditorManager) ExportWorkspaceFiles(workspaceID, exportPath, format string, selectedFiles []string) (*ExportResponse, error) {
	oem.mutex.RLock()
	_, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 验证格式
	if format != "zip" && format != "tar.gz" {
		format = "zip" // 默认使用zip格式
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	sourceDir := workspaceDir

	// 如果指定了路径，使用指定路径
	if exportPath != "" && exportPath != "." {
		sourceDir = filepath.Join(workspaceDir, exportPath)
		// 检查路径是否存在且在工作空间内
		if !strings.HasPrefix(sourceDir, workspaceDir) {
			return nil, fmt.Errorf("导出路径超出工作空间范围")
		}
		if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
			return nil, fmt.Errorf("导出路径不存在: %s", exportPath)
		}
	}

	// 如果有选中文件列表，验证所有路径
	if len(selectedFiles) > 0 {
		for _, file := range selectedFiles {
			fullPath := filepath.Join(workspaceDir, file)
			if !strings.HasPrefix(fullPath, workspaceDir) {
				return nil, fmt.Errorf("文件路径超出工作空间范围: %s", file)
			}
		}
	}

	downloadID := generateDownloadID()

	// 生成文件名
	fileName := fmt.Sprintf("%s_%s", workspaceID, time.Now().Format("20060102_150405"))
	if len(selectedFiles) > 0 {
		fileName = fmt.Sprintf("%s_selected_%s", workspaceID, time.Now().Format("20060102_150405"))
	} else if exportPath != "" && exportPath != "." {
		// 使用路径名作为文件名的一部分
		pathName := strings.ReplaceAll(exportPath, "/", "_")
		fileName = fmt.Sprintf("%s_%s_%s", workspaceID, pathName, time.Now().Format("20060102_150405"))
	}

	var outputPath string
	var err error

	if format == "zip" {
		fileName += ".zip"
		outputPath = filepath.Join(oem.downloadsDir, fileName)
		err = oem.createZipArchive(sourceDir, outputPath, selectedFiles)
	} else {
		fileName += ".tar.gz"
		outputPath = filepath.Join(oem.downloadsDir, fileName)
		err = oem.createTarGzArchive(sourceDir, outputPath, selectedFiles)
	}

	if err != nil {
		return nil, fmt.Errorf("创建归档文件失败: %v", err)
	}

	// 获取文件大小
	fileInfo, err := os.Stat(outputPath)
	if err != nil {
		return nil, fmt.Errorf("获取文件信息失败: %v", err)
	}

	// 保存下载信息
	downloadInfo := &DownloadInfo{
		FilePath:   outputPath,
		FileName:   fileName,
		FileSize:   fileInfo.Size(),
		ExportType: "files",
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(1 * time.Hour), // 24小时后过期
	}

	oem.downloadsMutex.Lock()
	oem.downloads[downloadID] = downloadInfo
	oem.downloadsMutex.Unlock()

	return &ExportResponse{
		Success:    true,
		Message:    "文件导出成功",
		DownloadID: downloadID,
		FileName:   fileName,
		FileSize:   fileInfo.Size(),
		ExportType: "files",
	}, nil
}

// 导出工作空间镜像
func (oem *OnlineEditorManager) ExportWorkspaceImage(workspaceID, imageName, imageTag string) (*ExportResponse, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" && workspace.Status != "stopped" {
		return nil, fmt.Errorf("工作空间状态不适合导出镜像，当前状态: %s", workspace.Status)
	}

	ctx := context.Background()

	// 设置默认镜像名称和标签
	if imageName == "" {
		imageName = fmt.Sprintf("exported_%s", workspaceID)
	}
	if imageTag == "" {
		imageTag = time.Now().Format("20060102_150405")
	}

	newImageName := fmt.Sprintf("%s:%s", imageName, imageTag)

	log.Printf("[%s] 开始导出镜像: %s", workspaceID, newImageName)

	// 提交容器为镜像
	commitResp, err := oem.dockerClient.ContainerCommit(ctx, workspace.ContainerID, container.CommitOptions{
		Reference: newImageName,
		Comment:   fmt.Sprintf("Exported from workspace %s", workspaceID),
		Author:    "Online Code Editor",
	})
	if err != nil {
		return nil, fmt.Errorf("提交容器为镜像失败: %v", err)
	}

	log.Printf("[%s] 镜像提交完成: %s", workspaceID, commitResp.ID)

	// 导出镜像为tar文件
	downloadID := generateDownloadID()
	fileName := fmt.Sprintf("%s_%s.tar", imageName, imageTag)
	outputPath := filepath.Join(oem.downloadsDir, fileName)

	// 使用镜像ID进行导出，避免镜像名称冲突问题
	imageReader, err := oem.dockerClient.ImageSave(ctx, []string{commitResp.ID})
	if err != nil {
		return nil, fmt.Errorf("导出镜像失败: %v", err)
	}
	defer imageReader.Close()

	// 创建输出文件
	outputFile, err := os.Create(outputPath)
	if err != nil {
		return nil, fmt.Errorf("创建输出文件失败: %v", err)
	}
	defer outputFile.Close()

	// 复制镜像数据到文件
	written, err := io.Copy(outputFile, imageReader)
	if err != nil {
		return nil, fmt.Errorf("写入镜像文件失败: %v", err)
	}

	log.Printf("[%s] 镜像导出完成: %s (%d bytes)", workspaceID, fileName, written)

	// 清理临时镜像（可选）
	go func() {
		time.Sleep(5 * time.Second) // 等待导出完成
		oem.dockerClient.ImageRemove(ctx, commitResp.ID, imageTypes.RemoveOptions{})
		log.Printf("[%s] 临时镜像已清理: %s", workspaceID, commitResp.ID)
	}()

	// 保存下载信息
	downloadInfo := &DownloadInfo{
		FilePath:   outputPath,
		FileName:   fileName,
		FileSize:   written,
		ExportType: "image",
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(1 * time.Hour), // 1小时后过期
	}

	oem.downloadsMutex.Lock()
	oem.downloads[downloadID] = downloadInfo
	oem.downloadsMutex.Unlock()

	return &ExportResponse{
		Success:    true,
		Message:    fmt.Sprintf("镜像导出成功: %s", newImageName),
		DownloadID: downloadID,
		FileName:   fileName,
		FileSize:   written,
		ExportType: "image",
	}, nil
}

// 创建ZIP归档
func (oem *OnlineEditorManager) createZipArchive(sourceDir, outputPath string, selectedFiles []string) error {
	zipFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("创建zip文件失败: %v", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// 如果有选中文件列表，只处理选中的文件
	if len(selectedFiles) > 0 {
		return oem.addSelectedFilesToZip(zipWriter, sourceDir, selectedFiles)
	}

	// 否则处理整个目录
	return filepath.Walk(sourceDir, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// 跳过隐藏文件和目录（可选）
		if strings.HasPrefix(info.Name(), ".") && info.Name() != "." {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// 计算相对路径
		relPath, err := filepath.Rel(sourceDir, filePath)
		if err != nil {
			return err
		}

		// 跳过根目录本身
		if relPath == "." {
			return nil
		}

		// 创建zip头
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = relPath

		if info.IsDir() {
			header.Name += "/"
			_, err := zipWriter.CreateHeader(header)
			return err
		} else {
			header.Method = zip.Deflate
			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			file, err := os.Open(filePath)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(writer, file)
			return err
		}
	})
}

// 添加选中的文件到ZIP归档
func (oem *OnlineEditorManager) addSelectedFilesToZip(zipWriter *zip.Writer, sourceDir string, selectedFiles []string) error {
	addedPaths := make(map[string]bool) // 避免重复添加

	for _, selectedFile := range selectedFiles {
		fullPath := filepath.Join(sourceDir, selectedFile)

		// 检查文件/目录是否存在
		info, err := os.Stat(fullPath)
		if err != nil {
			log.Printf("警告: 跳过不存在的文件 %s: %v", selectedFile, err)
			continue
		}

		if info.IsDir() {
			// 添加目录及其所有内容
			err = filepath.Walk(fullPath, func(filePath string, fileInfo os.FileInfo, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}

				// 计算相对于工作空间的路径
				relPath, err := filepath.Rel(sourceDir, filePath)
				if err != nil {
					return err
				}

				// 避免重复添加
				if addedPaths[relPath] {
					return nil
				}
				addedPaths[relPath] = true

				// 创建zip头
				header, err := zip.FileInfoHeader(fileInfo)
				if err != nil {
					return err
				}
				header.Name = relPath

				if fileInfo.IsDir() {
					header.Name += "/"
					_, err := zipWriter.CreateHeader(header)
					return err
				} else {
					header.Method = zip.Deflate
					writer, err := zipWriter.CreateHeader(header)
					if err != nil {
						return err
					}

					file, err := os.Open(filePath)
					if err != nil {
						return err
					}
					defer file.Close()

					_, err = io.Copy(writer, file)
					return err
				}
			})
			if err != nil {
				return err
			}
		} else {
			// 添加单个文件
			if addedPaths[selectedFile] {
				continue
			}
			addedPaths[selectedFile] = true

			// 确保父目录被添加
			parentDir := filepath.Dir(selectedFile)
			if parentDir != "." && !addedPaths[parentDir] {
				// 递归添加父目录
				parts := strings.Split(parentDir, string(filepath.Separator))
				currentPath := ""
				for _, part := range parts {
					if currentPath == "" {
						currentPath = part
					} else {
						currentPath = filepath.Join(currentPath, part)
					}

					if !addedPaths[currentPath] {
						addedPaths[currentPath] = true
						header := &zip.FileHeader{
							Name: currentPath + "/",
						}
						_, err := zipWriter.CreateHeader(header)
						if err != nil {
							return err
						}
					}
				}
			}

			// 添加文件
			header, err := zip.FileInfoHeader(info)
			if err != nil {
				return err
			}
			header.Name = selectedFile
			header.Method = zip.Deflate

			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			file, err := os.Open(fullPath)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(writer, file)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

// 创建tar.gz归档
func (oem *OnlineEditorManager) createTarGzArchive(sourceDir, outputPath string, selectedFiles []string) error {
	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("创建tar.gz文件失败: %v", err)
	}
	defer file.Close()

	gzWriter := gzip.NewWriter(file)
	defer gzWriter.Close()

	tarWriter := tar.NewWriter(gzWriter)
	defer tarWriter.Close()

	// 如果有选中文件列表，只处理选中的文件
	if len(selectedFiles) > 0 {
		return oem.addSelectedFilesToTar(tarWriter, sourceDir, selectedFiles)
	}

	// 否则处理整个目录
	return filepath.Walk(sourceDir, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// 跳过隐藏文件和目录（可选）
		if strings.HasPrefix(info.Name(), ".") && info.Name() != "." {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// 计算相对路径
		relPath, err := filepath.Rel(sourceDir, filePath)
		if err != nil {
			return err
		}

		// 跳过根目录本身
		if relPath == "." {
			return nil
		}

		// 创建tar头
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if !info.IsDir() {
			file, err := os.Open(filePath)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(tarWriter, file)
			return err
		}

		return nil
	})
}

// 添加选中的文件到TAR归档
func (oem *OnlineEditorManager) addSelectedFilesToTar(tarWriter *tar.Writer, sourceDir string, selectedFiles []string) error {
	addedPaths := make(map[string]bool) // 避免重复添加

	for _, selectedFile := range selectedFiles {
		fullPath := filepath.Join(sourceDir, selectedFile)

		// 检查文件/目录是否存在
		info, err := os.Stat(fullPath)
		if err != nil {
			log.Printf("警告: 跳过不存在的文件 %s: %v", selectedFile, err)
			continue
		}

		if info.IsDir() {
			// 添加目录及其所有内容
			err = filepath.Walk(fullPath, func(filePath string, fileInfo os.FileInfo, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}

				// 计算相对于工作空间的路径
				relPath, err := filepath.Rel(sourceDir, filePath)
				if err != nil {
					return err
				}

				// 避免重复添加
				if addedPaths[relPath] {
					return nil
				}
				addedPaths[relPath] = true

				// 创建tar头
				header, err := tar.FileInfoHeader(fileInfo, "")
				if err != nil {
					return err
				}
				header.Name = relPath

				if err := tarWriter.WriteHeader(header); err != nil {
					return err
				}

				if !fileInfo.IsDir() {
					file, err := os.Open(filePath)
					if err != nil {
						return err
					}
					defer file.Close()

					_, err = io.Copy(tarWriter, file)
					return err
				}

				return nil
			})
			if err != nil {
				return err
			}
		} else {
			// 添加单个文件
			if addedPaths[selectedFile] {
				continue
			}
			addedPaths[selectedFile] = true

			// 确保父目录被添加
			parentDir := filepath.Dir(selectedFile)
			if parentDir != "." && !addedPaths[parentDir] {
				// 递归添加父目录
				parts := strings.Split(parentDir, string(filepath.Separator))
				currentPath := ""
				for _, part := range parts {
					if currentPath == "" {
						currentPath = part
					} else {
						currentPath = filepath.Join(currentPath, part)
					}

					if !addedPaths[currentPath] {
						addedPaths[currentPath] = true
						header := &tar.Header{
							Name:     currentPath + "/",
							Mode:     0755,
							Typeflag: tar.TypeDir,
						}
						if err := tarWriter.WriteHeader(header); err != nil {
							return err
						}
					}
				}
			}

			// 添加文件
			header, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			header.Name = selectedFile

			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}

			file, err := os.Open(fullPath)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(tarWriter, file)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

// 获取下载信息
func (oem *OnlineEditorManager) GetDownloadInfo(downloadID string) (*DownloadInfo, error) {
	oem.downloadsMutex.RLock()
	defer oem.downloadsMutex.RUnlock()

	downloadInfo, exists := oem.downloads[downloadID]
	if !exists {
		return nil, fmt.Errorf("下载ID不存在: %s", downloadID)
	}

	// 检查是否过期
	if time.Now().After(downloadInfo.ExpiresAt) {
		return nil, fmt.Errorf("下载链接已过期")
	}

	return downloadInfo, nil
}

// 清理过期的下载文件
func (oem *OnlineEditorManager) CleanupExpiredDownloads() {
	oem.downloadsMutex.Lock()
	defer oem.downloadsMutex.Unlock()

	now := time.Now()
	for downloadID, downloadInfo := range oem.downloads {
		if now.After(downloadInfo.ExpiresAt) {
			// 删除文件
			if err := os.Remove(downloadInfo.FilePath); err != nil {
				log.Printf("删除过期下载文件失败 %s: %v", downloadInfo.FilePath, err)
			}
			// 从map中删除
			delete(oem.downloads, downloadID)
			log.Printf("清理过期下载: %s", downloadID)
		}
	}
}

// 更新工作空间的端口映射信息
func (oem *OnlineEditorManager) updateWorkspacePorts(workspace *Workspace) error {
	ctx := context.Background()
	container, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("获取容器信息失败: %v", err)
	}

	// 更新端口映射信息
	for i := range workspace.Ports {
		containerPort := nat.Port(fmt.Sprintf("%s/%s", workspace.Ports[i].ContainerPort, workspace.Ports[i].Protocol))
		if bindings, exists := container.NetworkSettings.Ports[containerPort]; exists && len(bindings) > 0 {
			workspace.Ports[i].HostPort = bindings[0].HostPort
		}
	}

	return nil
}

// 更新工作空间状态
func (oem *OnlineEditorManager) UpdateWorkspaceStatus(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	status, err := oem.GetContainerStatus(workspace.ContainerID)
	if err != nil {
		return err
	}

	workspace.Status = status
	return nil
}

// 清理过期的工作空间
func (oem *OnlineEditorManager) CleanupExpiredWorkspaces(maxAge time.Duration) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	now := time.Now()
	for workspaceID, workspace := range oem.workspaces {
		if now.Sub(workspace.Created) > maxAge {
			oem.logInfo("清理过期工作空间", workspaceID)
			// 删除容器
			ctx := context.Background()
			if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
				oem.logError("删除过期容器", err)
			}
			// 删除本地目录
			workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
			if err := os.RemoveAll(workspaceDir); err != nil {
				oem.logError("删除过期工作空间目录", err)
			}
			delete(oem.workspaces, workspaceID)
		}
	}
}

// 启动定期清理任务
func (oem *OnlineEditorManager) StartCleanupTask() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour) // 每小时清理一次
		defer ticker.Stop()

		for range ticker.C {
			oem.CleanupExpiredWorkspaces(24 * time.Hour) // 清理超过24小时的工作空间
			oem.CleanupExpiredDownloads()                // 清理过期的下载文件
		}
	}()
}

// 检查工作空间状态（线程安全）
func (oem *OnlineEditorManager) GetWorkspaceStatus(workspaceID string) (string, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	return workspace.Status, nil
}

// 检查工作空间是否存在（线程安全）
func (oem *OnlineEditorManager) WorkspaceExists(workspaceID string) bool {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	_, exists := oem.workspaces[workspaceID]
	return exists
}

// 恢复现有工作空间
func (oem *OnlineEditorManager) recoverExistingWorkspaces() error {
	ctx := context.Background()

	// 获取所有容器（包括已停止的）
	containers, err := oem.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return fmt.Errorf("获取容器列表失败: %v", err)
	}

	// 只基于容器名称恢复工作空间，不依赖目录
	for _, cont := range containers {
		if len(cont.Names) == 0 {
			continue
		}

		containerName := strings.TrimPrefix(cont.Names[0], "/")

		// 检查是否是我们的工作空间容器
		if !strings.HasPrefix(containerName, "ws_") {
			continue
		}

		workspaceID := containerName

		// 检查是否已经在管理列表中
		if _, exists := oem.workspaces[workspaceID]; exists {
			continue
		}

		// 获取容器详细信息
		containerInfo, err := oem.dockerClient.ContainerInspect(ctx, cont.ID)
		if err != nil {
			log.Printf("获取容器详细信息失败 %s: %v", cont.ID, err)
			continue
		}

		// 创建工作空间目录（如果不存在）
		workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
		if err := os.MkdirAll(workspaceDir, 0755); err != nil {
			log.Printf("创建工作空间目录失败 %s: %v", workspaceID, err)
			continue
		}

		// 恢复工作空间对象
		workspace := &Workspace{
			ID:          workspaceID,
			Name:        workspaceID, // 临时使用ID作为名称
			DisplayName: workspaceID, // 临时使用ID作为显示名称
			ContainerID: cont.ID,
			Status:      cont.State,
			Created:     time.Unix(cont.Created, 0),
			NetworkName: oem.networkName,
			Environment: make(map[string]string),
		}

		// 恢复镜像信息
		workspace.Image = containerInfo.Config.Image

		// 恢复网络IP
		if containerInfo.NetworkSettings != nil {
			if endpointSettings, exists := containerInfo.NetworkSettings.Networks[oem.networkName]; exists {
				workspace.NetworkIP = endpointSettings.IPAddress
			}
		}

		// 恢复端口映射
		if containerInfo.NetworkSettings.Ports != nil {
			workspace.Ports = []PortMapping{}
			for containerPort, bindings := range containerInfo.NetworkSettings.Ports {
				if len(bindings) > 0 {
					portMapping := PortMapping{
						ContainerPort: containerPort.Port(),
						Protocol:      containerPort.Proto(),
						HostPort:      bindings[0].HostPort,
						PublicAccess:  bindings[0].HostPort != "",
					}
					workspace.Ports = append(workspace.Ports, portMapping)
				}
			}
		}

		// 设置工作空间目录挂载
		workspace.Volumes = []VolumeMount{
			{
				HostPath:      workspaceDir,
				ContainerPath: "/workspace",
				ReadOnly:      false,
			},
		}

		// 如果容器正在运行，生成访问URL
		if workspace.Status == "running" {
			oem.generateAccessURLs(workspace)
		}

		// 添加到工作空间列表
		oem.workspaces[workspaceID] = workspace
		log.Printf("恢复工作空间: %s (状态: %s)", workspaceID, workspace.Status)
	}

	log.Printf("成功恢复 %d 个工作空间", len(oem.workspaces))
	return nil
}

// IP池相关功能已移除，简化为端口绑定模式

// 生成工作空间访问URL
func (oem *OnlineEditorManager) generateAccessURLs(workspace *Workspace) {
	if workspace.NetworkIP == "" {
		return
	}

	var accessURLs []AccessURL

	// 常见的开发服务器端口
	commonPorts := []string{"3000", "8000", "8080", "8081", "4200", "5000", "5173", "5174"}

	// 处理配置的端口映射
	portMap := make(map[string]bool)
	for _, port := range workspace.Ports {
		accessURL := AccessURL{
			Port:        port.ContainerPort,
			Protocol:    "http",
			InternalURL: fmt.Sprintf("http://%s:%s", workspace.NetworkIP, port.ContainerPort),
			Status:      "checking",
		}

		// 如果有公共访问配置，添加外部URL
		if port.PublicAccess && port.HostPort != "" {
			accessURL.ExternalURL = fmt.Sprintf("http://localhost:%s", port.HostPort)
		}

		accessURLs = append(accessURLs, accessURL)
		portMap[port.ContainerPort] = true
	}

	// 添加常见端口（如果没有在配置中）
	for _, port := range commonPorts {
		if !portMap[port] {
			accessURL := AccessURL{
				Port:        port,
				Protocol:    "http",
				InternalURL: fmt.Sprintf("http://%s:%s", workspace.NetworkIP, port),
				Status:      "checking",
			}
			accessURLs = append(accessURLs, accessURL)
		}
	}

	workspace.AccessURLs = accessURLs
	log.Printf("[%s] 生成访问URL: %d个端口", workspace.ID, len(accessURLs))
}

// 检查端口可用性
func (oem *OnlineEditorManager) checkPortAvailability(workspace *Workspace) {
	if workspace.NetworkIP == "" || workspace.Status != "running" {
		return
	}

	ctx := context.Background()

	for i := range workspace.AccessURLs {
		accessURL := &workspace.AccessURLs[i]

		// 在容器内检查端口是否有服务监听
		checkCmd, err := scriptManager.GetCommand("port_check_template", accessURL.Port, accessURL.Port, accessURL.Port)
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err != nil {
			accessURL.Status = "unavailable"
			continue
		}

		output, err := io.ReadAll(execAttachResp.Reader)
		execAttachResp.Close()

		if err == nil && len(output) > 0 {
			accessURL.Status = "available"
		} else {
			accessURL.Status = "unavailable"
		}
	}
}

// 释放端口
func (oem *OnlineEditorManager) releasePort(port int) {
	// 调用者必须持有锁
	delete(oem.portPool, port)
}

// 创建工作空间
func (oem *OnlineEditorManager) CreateWorkspace(name, images, gitRepo, gitBranch string, customPorts []PortMapping, selectedTools []string, customEnvironment map[string]string) (*Workspace, error) {
	// 先进行基本验证，不持有锁
	var imageConfig *ImageConfig

	// 检查自定义镜像
	oem.customImagesMutex.RLock()
	customConfig, customExists := oem.customImages[images]
	oem.customImagesMutex.RUnlock()

	if customExists {
		imageConfig = customConfig
	} else {
		// 如果不是自定义镜像，创建一个默认配置
		imageConfig = &ImageConfig{
			Name:        images,
			Description: fmt.Sprintf("Docker镜像: %s", images),
			Shell:       "/bin/bash",
			Environment: map[string]string{
				"PATH":            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				"TERM":            "xterm-256color",
				"HOME":            "/root",
				"USER":            "root",
				"SHELL":           "/bin/bash",
				"LANG":            "C.UTF-8",
				"LC_ALL":          "C.UTF-8",
				"DEBIAN_FRONTEND": "noninteractive",
				"TZ":              "Asia/Shanghai",
			},
			IsCustom: false,
		}
	}

	workspaceID := generateWorkspaceID()
	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)

	// 创建工作空间目录
	if err := os.MkdirAll(workspaceDir, 0755); err != nil {
		return nil, fmt.Errorf("创建工作空间目录失败: %v", err)
	}

	log.Printf("请求的镜像: '%s'", images)
	log.Printf("镜像配置: %v", imageConfig)

	// 创建工作空间对象 - 初始状态为pending
	workspace := &Workspace{
		ID:          workspaceID, // 内部使用ID作为名称
		DisplayName: name,        // 用户输入的显示名称
		Image:       images,
		Status:      "pending", // 初始状态：等待资源分配
		Created:     time.Now(),
		GitRepo:     gitRepo,
		GitBranch:   gitBranch,
		Environment: make(map[string]string),
		NetworkName: oem.networkName,
	}

	// 设置端口映射
	workspace.Ports = customPorts

	// 设置用户选择的工具
	workspace.Tools = selectedTools

	// 设置默认卷挂载
	workspace.Volumes = []VolumeMount{
		{
			HostPath:      workspaceDir,
			ContainerPath: "/workspace",
			ReadOnly:      false,
		},
	}

	// 设置环境变量 - 合并镜像默认环境变量和用户自定义环境变量
	workspace.Environment = make(map[string]string)

	// 先添加镜像默认环境变量
	for k, v := range imageConfig.Environment {
		workspace.Environment[k] = v
	}

	// 然后添加用户自定义环境变量（会覆盖同名的默认变量）
	for k, v := range customEnvironment {
		workspace.Environment[k] = v
	}

	// 短暂持有锁，只用于添加到map
	oem.mutex.Lock()
	oem.workspaces[workspaceID] = workspace
	oem.mutex.Unlock()

	// 异步初始化容器，不阻塞响应
	go func() {
		if err := oem.initializeContainer(workspace, images, workspaceDir, imageConfig); err != nil {
			log.Printf("容器初始化失败: %v", err)
			// 更新状态时使用短锁
			oem.mutex.Lock()
			workspace.Status = "failed"
			oem.mutex.Unlock()
		}
	}()

	return workspace, nil
}

// 初始化容器 - 分阶段进行，增加超时和错误处理
func (oem *OnlineEditorManager) initializeContainer(workspace *Workspace, images, workspaceDir string, imageConfig *ImageConfig) error {
	workspaceID := workspace.ID

	// 设置总超时时间（5分钟）
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 阶段1：更新状态为拉取镜像中
	oem.updateWorkspaceStatus(workspaceID, "pulling")

	// 拉取镜像（如果本地没有）
	_, err := oem.dockerClient.ImageInspect(ctx, images)
	if err != nil {
		log.Printf("[%s] 拉取镜像: %s", workspaceID, images)

		// 使用回退机制拉取镜像
		if _, err := oem.pullImageWithFallback(ctx, images); err != nil {
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("拉取镜像失败: %v", err)
		}
	}
	log.Printf("[%s] 镜像准备完成: %s", workspaceID, images)

	// 阶段2：更新状态为创建容器中
	oem.updateWorkspaceStatus(workspaceID, "creating")

	// 简化网络配置，不使用固定IP分配
	log.Printf("[%s] 使用默认网络配置", workspaceID)

	// 设置环境变量
	envs := []string{}
	for k, v := range imageConfig.Environment {
		envs = append(envs, fmt.Sprintf("%s=%s", k, v))
	}

	// 获取镜像配置中的Shell信息
	defaultShell := imageConfig.Shell
	if defaultShell == "" {
		defaultShell = "/bin/bash"
	}

	// 添加基础环境变量 - 优化Slim镜像兼容性
	baseEnvs := []string{
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
		"CONTAINER_NAME=" + workspaceID, // 添加容器名称环境变量
	}
	envs = append(envs, baseEnvs...)

	// 容器挂载卷 - 确保工作空间目录正确挂载到/workspace
	mounts := []mount.Mount{
		{
			Type:   mount.TypeBind,
			Source: workspaceDir,
			Target: "/workspace",
			BindOptions: &mount.BindOptions{
				Propagation: mount.PropagationRPrivate,
			},
		},
	}

	// 清理可能冲突的容器
	if err := oem.cleanupConflictingContainers(); err != nil {
		log.Printf("[%s] 清理冲突容器失败: %v", workspaceID, err)
	}

	// 处理端口映射 - 修复版本
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	log.Printf("[%s] 配置端口映射，共%d个端口", workspaceID, len(workspace.Ports))

	// 处理配置的端口映射
	for _, portMapping := range workspace.Ports {
		containerPortStr := portMapping.ContainerPort
		hostPortStr := portMapping.HostPort
		protocol := portMapping.Protocol

		if containerPortStr == "" {
			continue
		}

		// 创建容器端口标识
		containerPort := nat.Port(fmt.Sprintf("%s/%s", containerPortStr, protocol))
		exposedPorts[containerPort] = struct{}{}

		log.Printf("[%s] 配置端口: 容器%s -> 宿主机%s (协议:%s, 公共访问:%v)",
			workspaceID, containerPortStr, hostPortStr, protocol, portMapping.PublicAccess)

		// 如果有宿主机端口配置，设置端口绑定
		if hostPortStr != "" && portMapping.PublicAccess {
			portBindings[containerPort] = []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: hostPortStr,
				},
			}
			log.Printf("[%s] 端口绑定已设置: %s:%s -> %s", workspaceID, "0.0.0.0", hostPortStr, containerPortStr)
		}
	}

	// 常用开发端口默认暴露（不绑定到宿主机）
	commonPorts := []string{"3000", "8000", "8080", "8081", "4200", "5000", "5173", "5174", "9000"}
	configuredPorts := make(map[string]bool)
	for _, portMapping := range workspace.Ports {
		configuredPorts[portMapping.ContainerPort] = true
	}

	for _, port := range commonPorts {
		if !configuredPorts[port] {
			containerPort := nat.Port(fmt.Sprintf("%s/tcp", port))
			exposedPorts[containerPort] = struct{}{}
		}
	}

	log.Printf("[%s] 总计暴露端口: %d, 绑定端口: %d", workspaceID, len(exposedPorts), len(portBindings))

	// 创建容器配置
	containerConfig := &container.Config{
		Image:        images,
		Env:          envs,
		Tty:          true,
		OpenStdin:    true,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/workspace",
		// 使用tail命令保持容器运行
		Cmd: []string{"tail", "-f", "/dev/null"},
	}

	hostConfig := &container.HostConfig{
		Mounts:       mounts,
		Privileged:   false,
		PortBindings: portBindings,
		// 添加资源限制
		Resources: container.Resources{
			Memory:    512 * 1024 * 1024, // 512MB
			CPUShares: 1024,
		},
	}

	// 使用默认网络配置
	networkingConfig := &network.NetworkingConfig{}

	log.Printf("[%s] 创建容器配置", workspaceID)

	// 设置创建容器的超时（1分钟）
	createCtx, createCancel := context.WithTimeout(ctx, 1*time.Minute)
	defer createCancel()

	resp, err := oem.dockerClient.ContainerCreate(createCtx, containerConfig, hostConfig, networkingConfig, nil, workspaceID)
	if err != nil {
		oem.updateWorkspaceStatus(workspaceID, "failed")
		return fmt.Errorf("创建容器失败: %v", err)
	}
	log.Printf("[%s] 容器创建完成: %s", workspaceID, resp.ID)

	// 更新容器ID
	oem.mutex.Lock()
	workspace.ContainerID = resp.ID
	oem.mutex.Unlock()

	// 阶段3：更新状态为启动中
	oem.updateWorkspaceStatus(workspaceID, "starting")

	// 启动容器
	startCtx, startCancel := context.WithTimeout(ctx, 30*time.Second)
	defer startCancel()

	if err := oem.dockerClient.ContainerStart(startCtx, resp.ID, container.StartOptions{}); err != nil {
		// 如果启动失败，清理容器
		log.Printf("[%s] 容器启动失败，清理容器: %v", workspaceID, err)
		oem.dockerClient.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		oem.updateWorkspaceStatus(workspaceID, "failed")
		return fmt.Errorf("启动容器失败: %v", err)
	}
	log.Printf("[%s] 容器启动成功", workspaceID)

	// 等待容器稳定运行，使用轮询而不是阻塞等待
	for attempts := 0; attempts < 10; attempts++ {
		select {
		case <-ctx.Done():
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("容器启动检查超时")
		default:
			time.Sleep(2 * time.Second)
		}

		containerInfo, err := oem.dockerClient.ContainerInspect(ctx, resp.ID)
		if err != nil {
			log.Printf("[%s] 检查容器状态失败: %v", workspaceID, err)
			continue
		}

		if containerInfo.State.Status == "running" {
			log.Printf("[%s] 容器运行状态确认", workspaceID)
			break
		}

		if attempts == 9 {
			oem.updateWorkspaceStatus(workspaceID, "failed")
			return fmt.Errorf("容器启动后状态异常: %s", containerInfo.State.Status)
		}
	}

	// 阶段4：更新状态为初始化中
	oem.updateWorkspaceStatus(workspaceID, "initializing")

	// 等待容器完全启动并初始化环境
	time.Sleep(3 * time.Second)

	// 异步初始化环境，不阻塞主流程
	go func() {
		if err := oem.initializeEnvironment(workspaceID); err != nil {
			log.Printf("[%s] 环境初始化失败: %v", workspaceID, err)
		}
	}()

	// 阶段5：所有初始化完成，状态设为运行中
	oem.updateWorkspaceStatus(workspaceID, "running")

	// 设置启动时间
	oem.mutex.Lock()
	now := time.Now()
	workspace.Started = &now

	// 生成访问URL
	oem.generateAccessURLs(workspace)
	oem.mutex.Unlock()

	// 验证端口绑定
	if err := oem.verifyPortBindings(workspaceID); err != nil {
		log.Printf("[%s] 初始化后端口绑定验证失败: %v", workspaceID, err)
	}

	log.Printf("[%s] 工作空间初始化完成，状态：运行中", workspaceID)
	return nil
}

// 更新工作空间状态
func (oem *OnlineEditorManager) updateWorkspaceStatus(workspaceID, status string) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	if workspace, exists := oem.workspaces[workspaceID]; exists {
		workspace.Status = status
		log.Printf("[%s] 状态更新: %s", workspaceID, status)
	}
}

// 初始化环境
func (oem *OnlineEditorManager) initializeEnvironment(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	log.Printf("[%s] 开始环境初始化...", workspaceID)

	// 1. 创建工作目录并设置权限
	envInitScript, err := scriptManager.GetScript("env_init_basic")
	if err != nil {
		log.Printf("[%s] 获取环境初始化脚本失败: %v", workspaceID, err)
		return err
	}
	setupCmd := []string{"/bin/bash", "-c", envInitScript}

	execConfig := container.ExecOptions{
		Cmd:          setupCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("[%s] 创建初始化命令失败: %v", workspaceID, err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			output, _ := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()
			log.Printf("[%s] 工作目录初始化: %s", workspaceID, string(output))
		}
	}

	// 2. 创建增强的.bashrc文件
	bashrcContent, err := scriptManager.GetScript("bashrc_env_init")
	if err != nil {
		log.Printf("[%s] 获取bashrc脚本失败: %v", workspaceID, err)
		return err
	}

	// 写入.bashrc文件
	createBashrcCmd := []string{"/bin/bash", "-c", fmt.Sprintf("cat > /root/.bashrc << 'EOF'\n%s\nEOF", bashrcContent)}
	execConfig = container.ExecOptions{
		Cmd:          createBashrcCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err = oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("[%s] 创建.bashrc失败: %v", workspaceID, err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			execAttachResp.Close()
			log.Printf("[%s] .bashrc配置文件已创建", workspaceID)
		}
	}

	// 3. 安装基础开发工具
	return oem.installDevelopmentTools(workspaceID, envs)
}

// 安装开发工具
func (oem *OnlineEditorManager) installDevelopmentTools(workspaceID string, envs []string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 检查并安装用户选择的工具
	var requiredTools []string
	if len(workspace.Tools) > 0 {
		requiredTools = workspace.Tools
	} else {
		// 默认工具列表
		requiredTools = []string{"git", "curl", "wget", "vim"}
	}
	missingTools := []string{}

	// 检查工具是否存在
	for _, tool := range requiredTools {
		checkCmd, _ := scriptManager.GetCommand("check_tool", tool)
		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
			Env:          envs,
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err == nil {
			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err == nil {
				output, _ := io.ReadAll(execAttachResp.Reader)
				execAttachResp.Close()
				if len(output) == 0 {
					missingTools = append(missingTools, tool)
				} else {
					log.Printf("[%s] 工具 %s 已存在", workspaceID, tool)
				}
			}
		}
	}

	// 如果有缺失的工具，尝试安装
	if len(missingTools) > 0 {
		log.Printf("[%s] 缺失工具: %v，尝试安装...", workspaceID, missingTools)

		// 尝试不同的包管理器（按常见程度排序）
		installCommands := [][]string{
			// Debian/Ubuntu
			{"/bin/bash", "-c", "apt-get update && apt-get install -y " + strings.Join(missingTools, " ")},
			// Alpine
			{"/bin/bash", "-c", "apk add --no-cache " + strings.Join(missingTools, " ")},
			// CentOS/RHEL/Rocky
			{"/bin/bash", "-c", "yum install -y " + strings.Join(missingTools, " ")},
			// Fedora
			{"/bin/bash", "-c", "dnf install -y " + strings.Join(missingTools, " ")},
		}

		for i, cmd := range installCommands {
			log.Printf("[%s] 尝试安装方式 %d", workspaceID, i+1)

			installExecConfig := container.ExecOptions{
				Cmd:          cmd,
				AttachStdout: true,
				AttachStderr: true,
				WorkingDir:   "/workspace",
				Env:          envs,
			}

			execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
			if err != nil {
				continue
			}

			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err != nil {
				continue
			}

			// 读取安装输出
			output, _ := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()

			// 检查安装是否成功
			if strings.Contains(string(output), "installed") ||
				strings.Contains(string(output), "upgraded") ||
				strings.Contains(string(output), "OK:") {
				log.Printf("[%s] 工具安装成功", workspaceID)
				break
			}
		}
	}

	log.Printf("[%s] 开发环境初始化完成", workspaceID)
	return nil
}

// 重新创建容器
func (oem *OnlineEditorManager) recreateContainer(workspace *Workspace) error {
	ctx := context.Background()
	workspaceID := workspace.ID

	// 获取镜像配置
	var imageConfig *ImageConfig

	// 检查自定义镜像
	oem.customImagesMutex.RLock()
	customConfig, customExists := oem.customImages[workspace.Image]
	oem.customImagesMutex.RUnlock()

	if customExists {
		imageConfig = customConfig
	} else {
		// 如果不是自定义镜像，创建一个默认配置
		imageConfig = &ImageConfig{
			Name:        workspace.Image,
			Description: fmt.Sprintf("Docker镜像: %s", workspace.Image),
			Shell:       "/bin/bash",
			Environment: map[string]string{
				"PATH":            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				"TERM":            "xterm-256color",
				"HOME":            "/root",
				"USER":            "root",
				"SHELL":           "/bin/bash",
				"LANG":            "C.UTF-8",
				"LC_ALL":          "C.UTF-8",
				"DEBIAN_FRONTEND": "noninteractive",
				"TZ":              "Asia/Shanghai",
			},
			IsCustom: false,
		}
	}

	// 设置环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"TZ=Asia/Shanghai",
		"CONTAINER_NAME=" + workspaceID,
	}

	// 添加镜像特定的环境变量
	for k, v := range imageConfig.Environment {
		envs = append(envs, fmt.Sprintf("%s=%s", k, v))
	}

	// 处理端口映射 - 与创建时保持一致
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}

	log.Printf("[%s] 重建容器时配置端口映射，共%d个端口", workspaceID, len(workspace.Ports))

	for _, portMapping := range workspace.Ports {
		containerPortStr := portMapping.ContainerPort
		hostPortStr := portMapping.HostPort
		protocol := portMapping.Protocol

		if containerPortStr == "" {
			continue
		}

		containerPort := nat.Port(fmt.Sprintf("%s/%s", containerPortStr, protocol))
		exposedPorts[containerPort] = struct{}{}

		log.Printf("[%s] 重建端口配置: 容器%s -> 宿主机%s (协议:%s, 公共访问:%v)",
			workspaceID, containerPortStr, hostPortStr, protocol, portMapping.PublicAccess)

		if hostPortStr != "" && portMapping.PublicAccess {
			portBindings[containerPort] = []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: hostPortStr,
				},
			}
			log.Printf("[%s] 重建端口绑定: %s:%s -> %s", workspaceID, "0.0.0.0", hostPortStr, containerPortStr)
		}
	}

	log.Printf("[%s] 重建容器端口配置完成: 暴露%d个，绑定%d个", workspaceID, len(exposedPorts), len(portBindings))

	// 容器挂载卷
	mounts := []mount.Mount{
		{
			Type:   mount.TypeBind,
			Source: filepath.Join(oem.workspacesDir, workspaceID),
			Target: "/workspace",
			BindOptions: &mount.BindOptions{
				Propagation: mount.PropagationRPrivate,
			},
		},
	}

	// 创建容器配置
	containerConfig := &container.Config{
		Image:        workspace.Image,
		Env:          envs,
		Tty:          true,
		OpenStdin:    true,
		ExposedPorts: exposedPorts,
		WorkingDir:   "/workspace",
		Cmd:          []string{"tail", "-f", "/dev/null"},
	}

	hostConfig := &container.HostConfig{
		Mounts:       mounts,
		Privileged:   false,
		PortBindings: portBindings,
		Resources: container.Resources{
			Memory:    512 * 1024 * 1024,
			CPUShares: 1024,
		},
	}

	networkingConfig := &network.NetworkingConfig{}

	log.Printf("[%s] 重新创建容器配置", workspaceID)
	resp, err := oem.dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, workspaceID)
	if err != nil {
		return fmt.Errorf("创建容器失败: %v", err)
	}

	// 更新容器ID
	oem.mutex.Lock()
	workspace.ContainerID = resp.ID
	workspace.Status = "created"
	oem.mutex.Unlock()

	log.Printf("[%s] 容器重新创建完成: %s", workspaceID, resp.ID)
	return nil
}

// 验证端口绑定是否生效
func (oem *OnlineEditorManager) verifyPortBindings(workspaceID string) error {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("检查容器信息失败: %v", err)
	}

	log.Printf("[%s] 验证端口绑定:", workspaceID)
	log.Printf("[%s] 容器状态: %s", workspaceID, containerInfo.State.Status)

	// 检查端口绑定
	if containerInfo.NetworkSettings != nil && containerInfo.NetworkSettings.Ports != nil {
		for containerPort, bindings := range containerInfo.NetworkSettings.Ports {
			log.Printf("[%s] 容器端口 %s:", workspaceID, containerPort)
			if len(bindings) > 0 {
				for _, binding := range bindings {
					log.Printf("[%s]   -> 宿主机 %s:%s", workspaceID, binding.HostIP, binding.HostPort)
				}
			} else {
				log.Printf("[%s]   -> 无宿主机绑定", workspaceID)
			}
		}
	} else {
		log.Printf("[%s] 无端口配置", workspaceID)
	}

	return nil
}

// 启动工作空间
func (oem *OnlineEditorManager) StartWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status == "running" {
		return fmt.Errorf("工作空间已在运行: %s", workspaceID)
	}

	ctx := context.Background()
	if err := oem.dockerClient.ContainerStart(ctx, workspace.ContainerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("启动容器失败: %v", err)
	}

	// 启动容器后更新端口映射信息
	if err := oem.updateWorkspacePorts(workspace); err != nil {
		log.Printf("更新端口映射失败: %v", err)
	}

	// 如果容器处于初始化阶段，安装工具
	if workspace.Status == "initializing" {
		// 检查并安装必要的工具
		go func() {
			time.Sleep(5 * time.Second) // 等待容器完全启动
			if err := oem.installTools(workspaceID); err != nil {
				log.Printf("安装工具失败: %v", err)
			}
		}()
	}

	// 使用短锁更新状态
	oem.mutex.Lock()
	workspace.Status = "running"
	now := time.Now()
	workspace.Started = &now
	oem.mutex.Unlock()

	// 验证端口绑定
	if err := oem.verifyPortBindings(workspaceID); err != nil {
		log.Printf("[%s] 端口绑定验证失败: %v", workspaceID, err)
	}

	return nil
}

// 停止工作空间
func (oem *OnlineEditorManager) StopWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	ctx := context.Background()
	if err := oem.dockerClient.ContainerStop(ctx, workspace.ContainerID, container.StopOptions{}); err != nil {
		return fmt.Errorf("停止容器失败: %v", err)
	}

	// 使用短锁更新状态
	oem.mutex.Lock()
	workspace.Status = "stopped"
	workspace.Started = nil
	oem.mutex.Unlock()

	return nil
}

// 删除工作空间
func (oem *OnlineEditorManager) DeleteWorkspace(workspaceID string) error {
	// 先获取工作空间信息，使用读锁
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 释放端口
	for _, p := range workspace.Ports {
		if p.HostPort != "" {
			if hostPort, err := strconv.Atoi(p.HostPort); err == nil {
				oem.mutex.Lock()
				oem.releasePort(hostPort)
				oem.mutex.Unlock()
			}
		}
	}

	// 强制删除容器
	if err := oem.dockerClient.ContainerRemove(ctx, workspace.ContainerID, container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("删除容器失败: %v", err)
	}

	// 删除工作空间目录
	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	if err := os.RemoveAll(workspaceDir); err != nil {
		return fmt.Errorf("删除工作空间目录失败: %v", err)
	}

	// 最后从map中删除
	oem.mutex.Lock()
	delete(oem.workspaces, workspaceID)
	oem.mutex.Unlock()

	return nil
}

// 列出工作空间
func (oem *OnlineEditorManager) ListWorkspaces() ([]*Workspace, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	var workspaces []*Workspace
	for _, workspace := range oem.workspaces {
		// 创建工作空间的副本，避免并发访问问题
		workspaceCopy := *workspace
		workspaces = append(workspaces, &workspaceCopy)
	}

	return workspaces, nil
}

// 获取工作空间
func (oem *OnlineEditorManager) GetWorkspace(workspaceID string) (*Workspace, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 返回工作空间的副本，避免并发访问问题
	workspaceCopy := *workspace
	return &workspaceCopy, nil
}

// 安装必要的工具 - 优化版本
func (oem *OnlineEditorManager) installTools(workspaceID string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	// 检查容器是否在运行
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		log.Printf("容器未运行，跳过工具安装，当前状态: %s", containerInfo.State.Status)
		return nil
	}

	log.Printf("开始为工作空间 %s 初始化环境...", workspaceID)

	// 设置完整的环境变量
	envs := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:/opt/homebrew/bin",
		"TERM=xterm-256color",
		"HOME=/root",
		"USER=root",
		"SHELL=/bin/bash",
		"PWD=/workspace",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"DEBIAN_FRONTEND=noninteractive",
		"set +H",
		"BASH_ENV=/dev/null",
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 创建.bashrc文件以改善shell体验
	bashrcContent, err := scriptManager.GetScript("bashrc_tool_install")
	if err != nil {
		log.Printf("获取bashrc脚本失败: %v", err)
		return err
	}

	// 写入.bashrc文件
	createBashrcCmd := []string{"/bin/bash", "-c", fmt.Sprintf("echo '%s' > /root/.bashrc", bashrcContent)}
	execConfig := container.ExecOptions{
		Cmd:          createBashrcCmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		log.Printf("创建.bashrc失败: %v", err)
	} else {
		execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
		if err == nil {
			execAttachResp.Close()
			log.Printf("已创建.bashrc配置文件")
		}
	}

	// 检查并安装必要的工具
	requiredTools := []string{"git", "curl", "wget", "vim", "nano"}
	missingTools := []string{}

	for _, tool := range requiredTools {
		checkCmd, _ := scriptManager.GetCommand("check_tool", tool)
		execConfig := container.ExecOptions{
			Cmd:          checkCmd,
			AttachStdout: true,
			AttachStderr: true,
			WorkingDir:   "/workspace",
			Env:          envs,
		}

		execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
		if err == nil {
			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err == nil {
				output, _ := io.ReadAll(execAttachResp.Reader)
				execAttachResp.Close()
				if len(output) == 0 {
					missingTools = append(missingTools, tool)
				} else {
					log.Printf("工具 %s 已存在: %s", tool, strings.TrimSpace(string(output)))
				}
			}
		}
	}

	// 如果有缺失的工具，尝试安装
	if len(missingTools) > 0 {
		log.Printf("缺失工具: %v，尝试安装...", missingTools)

		// 尝试不同的包管理器
		tools := strings.Join(missingTools, " ")
		aptCmd, _ := scriptManager.GetCommand("install_apt", tools)
		yumCmd, _ := scriptManager.GetCommand("install_yum", tools)
		apkCmd, _ := scriptManager.GetCommand("install_apk", tools)
		dnfCmd, _ := scriptManager.GetCommand("install_dnf", tools)

		installCommands := [][]string{
			aptCmd,
			yumCmd,
			apkCmd,
			dnfCmd,
		}

		success := false
		for i, cmd := range installCommands {
			log.Printf("尝试安装命令 %d: %s", i+1, strings.Join(cmd, " "))

			installExecConfig := container.ExecOptions{
				Cmd:          cmd,
				AttachStdout: true,
				AttachStderr: true,
				WorkingDir:   "/workspace",
				Env:          envs,
			}

			execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
			if err != nil {
				log.Printf("创建安装命令失败: %v", err)
				continue
			}

			execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
			if err != nil {
				log.Printf("执行安装命令失败: %v", err)
				continue
			}

			// 读取安装输出
			output, err := io.ReadAll(execAttachResp.Reader)
			execAttachResp.Close()

			if err == nil {
				log.Printf("安装输出: %s", string(output))
				success = true
				break
			}
		}

		if !success {
			log.Printf("警告: 无法安装工具，容器可能使用了不支持的包管理器")
		}
	}

	// 设置工作空间状态为完全初始化
	oem.mutex.Lock()
	if workspace.Status == "running" {
		// 工具安装完成，状态保持为running
		log.Printf("工作空间 %s 环境初始化完成", workspaceID)
	}
	oem.mutex.Unlock()

	return nil
}

// 清理冲突的容器
func (oem *OnlineEditorManager) cleanupConflictingContainers() error {
	ctx := context.Background()
	containers, err := oem.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return fmt.Errorf("获取容器列表失败: %v", err)
	}

	for _, cont := range containers {
		// 检查是否是我们的工作空间容器
		if strings.HasPrefix(cont.Names[0], "/ws_") {
			// 检查容器状态
			if cont.State == "exited" || cont.State == "dead" {
				log.Printf("清理已停止的工作空间容器: %s", cont.ID)
				oem.dockerClient.ContainerRemove(ctx, cont.ID, container.RemoveOptions{Force: true})
			}
		}
	}

	return nil
}

// 执行shell命令
func (oem *OnlineEditorManager) ShellExec(workspaceID, command string) (string, error) {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()

	installExecConfig := container.ExecOptions{
		Cmd:          []string{"/bin/bash", "-c", command},
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, installExecConfig)
	if err != nil {
		return "", fmt.Errorf("创建安装命令失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("执行安装命令失败: %v", err)
	}

	// 读取安装输出
	output, _ := io.ReadAll(execAttachResp.Reader)
	execAttachResp.Close()

	return string(output), nil
}
