package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 列出文件 - 使用主机文件系统
func (oem *OnlineEditorManager) ListFiles(workspaceID, path string) ([]FileInfo, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	// 允许在pending、creating、starting、initializing、running状态下访问
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return nil, fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)

	// 如果路径为空，使用根路径
	if path == "" {
		path = "."
	}

	fullPath := filepath.Join(workspaceDir, path)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return nil, fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查目录是否存在，如果不存在则创建
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// 尝试创建目录
		if err := os.MkdirAll(fullPath, 0755); err != nil {
			return nil, fmt.Errorf("目录不存在且创建失败: %s, 错误: %v", path, err)
		}
		// 创建成功后返回空文件列表
		return []FileInfo{}, nil
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, fmt.Errorf("读取目录失败: %v", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// 构建相对路径
		relativePath := entry.Name()
		if path != "." {
			relativePath = filepath.Join(path, entry.Name())
		}

		fileInfo := FileInfo{
			Name:         entry.Name(),
			Path:         relativePath,
			IsDir:        entry.IsDir(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime(),
			Permissions:  info.Mode().String(),
		}
		files = append(files, fileInfo)
	}

	return files, nil
}

// 读取文件 - 使用主机文件系统
func (oem *OnlineEditorManager) ReadFile(workspaceID, filePath string) (string, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return "", fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return "", fmt.Errorf("访问路径超出工作空间范围")
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %v", err)
	}

	return string(content), nil
}

// 写入文件 - 使用主机文件系统
func (oem *OnlineEditorManager) WriteFile(workspaceID, filePath, content string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 创建目录
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %v", err)
	}

	// 写入文件
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("写入文件失败: %v", err)
	}

	return nil
}

// 删除文件
func (oem *OnlineEditorManager) DeleteFile(workspaceID, filePath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	_, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	if err := os.RemoveAll(fullPath); err != nil {
		return fmt.Errorf("删除文件失败: %v", err)
	}

	return nil
}

// 创建文件
func (oem *OnlineEditorManager) CreateFile(workspaceID, filePath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, filePath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查文件是否已存在
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("文件已存在: %s", filePath)
	}

	// 创建目录
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %v", err)
	}

	// 创建空文件
	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("创建文件失败: %v", err)
	}
	defer file.Close()

	return nil
}

// 创建文件夹
func (oem *OnlineEditorManager) CreateFolder(workspaceID, folderPath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 只在工作空间明确失败或停止时才禁止访问文件系统
	if workspace.Status == "failed" || workspace.Status == "stopped" {
		return fmt.Errorf("工作空间状态异常，无法访问文件系统。当前状态: %s", workspace.Status)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	fullPath := filepath.Join(workspaceDir, folderPath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(fullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查文件夹是否已存在
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("文件夹已存在: %s", folderPath)
	}

	// 创建文件夹
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return fmt.Errorf("创建文件夹失败: %v", err)
	}

	return nil
}

// 移动文件或文件夹
func (oem *OnlineEditorManager) MoveFile(workspaceID, sourcePath, targetPath string) error {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	// 如果工作空间未运行，返回错误
	if workspace.Status != "running" {
		return fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	workspaceDir := filepath.Join(oem.workspacesDir, workspaceID)
	sourceFullPath := filepath.Join(workspaceDir, sourcePath)
	targetFullPath := filepath.Join(workspaceDir, targetPath)

	// 检查路径是否在工作空间内
	if !strings.HasPrefix(sourceFullPath, workspaceDir) || !strings.HasPrefix(targetFullPath, workspaceDir) {
		return fmt.Errorf("访问路径超出工作空间范围")
	}

	// 检查源文件是否存在
	if _, err := os.Stat(sourceFullPath); os.IsNotExist(err) {
		return fmt.Errorf("源文件不存在: %s", sourcePath)
	}

	// 检查目标路径是否已存在
	if _, err := os.Stat(targetFullPath); err == nil {
		return fmt.Errorf("目标路径已存在: %s", targetPath)
	}

	// 创建目标目录
	targetDir := filepath.Dir(targetFullPath)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("创建目标目录失败: %v", err)
	}

	// 移动文件或文件夹
	if err := os.Rename(sourceFullPath, targetFullPath); err != nil {
		return fmt.Errorf("移动文件失败: %v", err)
	}

	return nil
}
