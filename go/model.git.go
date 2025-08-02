package main

import (
	"context"
	"fmt"
	"io"
	"log"

	"github.com/docker/docker/api/types/container"
)

// 克隆Git仓库
func (oem *OnlineEditorManager) cloneGitRepo(workspaceID, repo, branch string) error {
	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	ctx := context.Background()
	// 在容器内执行git clone
	execConfig := container.ExecOptions{
		Cmd:          []string{"git", "clone", "-b", branch, repo, "."},
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return fmt.Errorf("创建git clone执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("附加到git clone执行失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return fmt.Errorf("读取git clone输出失败: %v", err)
	}

	// 检查执行结果
	if len(output) > 0 {
		log.Printf("Git clone output: %s", string(output))
	}

	return nil
}

// Git操作
func (oem *OnlineEditorManager) GitOperation(workspaceID string, operation GitOperation) (string, error) {
	oem.mutex.RLock()
	defer oem.mutex.RUnlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return "", fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	// 检查容器实际状态
	ctx := context.Background()
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return "", fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		return "", fmt.Errorf("容器未运行，当前状态: %s", containerInfo.State.Status)
	}

	var cmd []string
	switch operation.Type {
	case "clone":
		// 使用工作空间中保存的Git仓库信息进行克隆
		if workspace.GitRepo == "" {
			return "", fmt.Errorf("工作空间未配置Git仓库")
		}
		repo := operation.Repo
		branch := operation.Branch
		if repo == "" {
			repo = workspace.GitRepo
		}
		if branch == "" {
			branch = workspace.GitBranch
		}

		// 先清空工作空间目录，然后克隆
		cmd = []string{"/bin/sh", "-c", fmt.Sprintf("rm -rf /workspace/* /workspace/.* 2>/dev/null || true && git clone -b %s %s .", branch, repo)}
	case "status":
		cmd = []string{"git", "status"}
	case "add":
		if len(operation.Files) > 0 {
			cmd = append([]string{"git", "add"}, operation.Files...)
		} else {
			cmd = []string{"git", "add", "."}
		}
	case "commit":
		cmd = []string{"git", "commit", "-m", operation.Message}
	case "push":
		cmd = []string{"git", "push"}
	case "pull":
		cmd = []string{"git", "pull"}
	case "checkout":
		cmd = []string{"git", "checkout", operation.Branch}
	case "branch":
		cmd = []string{"git", "branch"}
	case "log":
		cmd = []string{"git", "log", "--oneline", "-10"}
	default:
		return "", fmt.Errorf("不支持的Git操作: %s", operation.Type)
	}

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
	}

	// 添加镜像特定的环境变量
	if workspace.Environment != nil {
		for k, v := range workspace.Environment {
			envs = append(envs, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// 在容器内执行Git命令
	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建Git执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("附加到Git执行失败: %v", err)
	}
	defer execAttachResp.Close()

	output, err := io.ReadAll(execAttachResp.Reader)
	if err != nil {
		return "", fmt.Errorf("读取Git输出失败: %v", err)
	}

	return string(output), nil
}
