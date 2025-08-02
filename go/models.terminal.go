package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
)

// 生成终端会话ID
func generateTerminalID() string {
	return fmt.Sprintf("term_%d", time.Now().UnixNano())
}

// filterTerminalOutput 过滤终端输出中的控制序列 - 增强版
func filterTerminalOutput(text string) string {
	// 如果文本为空或只包含控制字符，直接返回空
	if len(text) == 0 {
		return ""
	}

	// 过滤括号粘贴模式控制序列
	if strings.Contains(text, "\x1b[?2004l") || strings.Contains(text, "\033[?2004l") ||
		strings.Contains(text, "\x1b[?2004h") || strings.Contains(text, "\033[?2004h") {
		return ""
	}

	// 更全面的控制序列过滤
	patterns := []string{
		// 基本控制字符
		`\x00+`,        // NULL字符
		`[\x01-\x08]+`, // 控制字符 1-8
		`\x0B+`,        // 垂直制表符
		`\x0C+`,        // 换页符
		`[\x0E-\x1F]+`, // 其他控制字符
		`\x7F+`,        // DEL字符

		// ANSI转义序列 - 更精确的匹配
		`\x1b\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]`, // 标准ANSI转义序列
		`\033\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]`, // 八进制格式
		`\x1b\[[?][0-9;]*[hl]`,                   // 私有模式设置
		`\033\[[?][0-9;]*[hl]`,                   // 私有模式设置 (八进制)

		// 特定的终端控制序列
		`\x1b\]0;.*?\x07`,         // 设置窗口标题 (OSC序列)
		`\x1b\]0;.*?\x1b\\`,       // 设置窗口标题 (替代结束符)
		`\x1b\[[0-9]*[ABCD]`,      // 光标移动
		`\x1b\[[0-9]*;[0-9]*[Hf]`, // 光标定位
		`\x1b\[[0-9]*[JK]`,        // 清除屏幕/行
		`\x1b\[s`,                 // 保存光标位置
		`\x1b\[u`,                 // 恢复光标位置
		`\x1b\[2J`,                // 清屏
		`\x1b\[H`,                 // 光标回到首位

		// 颜色控制序列
		`\x1b\[[0-9;]*m`, // 颜色和样式设置
		`\033\[[0-9;]*m`, // 颜色和样式设置 (八进制)

		// 键盘模式设置
		`\x1b\[>[0-9;]*c`, // 设备属性查询响应
		`\x1b\[[0-9;]*n`,  // 状态报告

		// 特殊字符组合
		`\r\n\r\n+`, // 多余的换行组合
		`\n\r+`,     // 混乱的换行
		`\r+\n`,     // 回车换行组合
		`\x08+`,     // 连续退格符

		// Shell特定的控制序列
		`\x1b\[201~`, // 括号粘贴开始
		`\x1b\[200~`, // 括号粘贴结束
	}

	// 逐个应用过滤规则
	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		text = re.ReplaceAllString(text, "")
	}

	// 清理连续的空白字符和换行
	text = regexp.MustCompile(`\s{3,}`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`\n{3,}`).ReplaceAllString(text, "\n\n")

	// 移除行首行尾的多余空白
	lines := strings.Split(text, "\n")
	var cleanLines []string
	for _, line := range lines {
		cleanLine := strings.TrimSpace(line)
		if cleanLine != "" {
			cleanLines = append(cleanLines, cleanLine)
		}
	}

	return strings.Join(cleanLines, "\n")
}

// 创建终端会话 - 优化版本，支持真正的交互式终端
func (oem *OnlineEditorManager) CreateTerminalSession(workspaceID string) (*TerminalSession, error) {
	oem.mutex.Lock()
	defer oem.mutex.Unlock()

	workspace, exists := oem.workspaces[workspaceID]
	if !exists {
		return nil, fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return nil, fmt.Errorf("工作空间未运行: %s", workspaceID)
	}

	sessionID := generateTerminalID()

	session := &TerminalSession{
		ID:           sessionID,
		WorkspaceID:  workspaceID,
		Created:      time.Now(),
		LastActivity: time.Now(),
	}

	oem.terminalSessions[sessionID] = session

	return session, nil
}

// 执行命令
func (oem *OnlineEditorManager) ExecuteCommand(workspaceID string, command []string) (string, error) {
	oem.mutex.RLock()
	workspace, exists := oem.workspaces[workspaceID]
	oem.mutex.RUnlock()

	if !exists {
		return "", fmt.Errorf("工作空间不存在: %s", workspaceID)
	}

	if workspace.Status != "running" {
		return "", fmt.Errorf("工作空间未运行，当前状态: %s", workspace.Status)
	}

	ctx := context.Background()

	// 检查容器状态
	containerInfo, err := oem.dockerClient.ContainerInspect(ctx, workspace.ContainerID)
	if err != nil {
		return "", fmt.Errorf("检查容器状态失败: %v", err)
	}

	if containerInfo.State.Status != "running" {
		return "", fmt.Errorf("容器状态异常: %s", containerInfo.State.Status)
	}

	// 处理特殊命令，如cd等内置命令
	if len(command) > 0 {
		switch command[0] {
		case "cd":
			// cd命令需要特殊处理，因为它是shell内置命令
			if len(command) > 1 {
				// 使用shell来执行cd命令并获取新的工作目录
				shellCmd := fmt.Sprintf("cd %s && pwd", command[1])
				command = []string{"/bin/bash", "-c", shellCmd}
			} else {
				// cd without arguments - go to home directory
				command = []string{"/bin/bash", "-c", "cd ~ && pwd"}
			}
		case "pwd":
			// 确保pwd命令在正确的工作目录执行
			command = []string{"/bin/bash", "-c", "pwd"}
		case "ls", "ll":
			// 使用shell来执行ls命令以支持别名
			if len(command) == 1 {
				command = []string{"/bin/bash", "-c", command[0]}
			} else {
				shellCmd := fmt.Sprintf("%s %s", command[0], strings.Join(command[1:], " "))
				command = []string{"/bin/bash", "-c", shellCmd}
			}
		default:
			// 对于其他命令，如果只有一个参数且可能是复合命令，使用shell执行
			if len(command) == 1 && (strings.Contains(command[0], "&&") ||
				strings.Contains(command[0], "||") ||
				strings.Contains(command[0], "|") ||
				strings.Contains(command[0], ">") ||
				strings.Contains(command[0], "<")) {
				command = []string{"/bin/bash", "-c", command[0]}
			}
		}
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

	log.Printf("执行命令: %v in workspace %s", command, workspaceID)

	// 创建执行配置
	execConfig := container.ExecOptions{
		Cmd:          command,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  false,
		Tty:          false,
		WorkingDir:   "/workspace",
		Env:          envs,
	}

	execResp, err := oem.dockerClient.ContainerExecCreate(ctx, workspace.ContainerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("创建执行配置失败: %v", err)
	}

	execAttachResp, err := oem.dockerClient.ContainerExecAttach(ctx, execResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("执行命令失败: %v", err)
	}
	defer execAttachResp.Close()

	// 设置超时
	timeout := 30 * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 读取输出
	outputChan := make(chan []byte, 1)
	errorChan := make(chan error, 1)

	go func() {
		output, err := io.ReadAll(execAttachResp.Reader)
		if err != nil {
			errorChan <- err
		} else {
			outputChan <- output
		}
	}()

	select {
	case output := <-outputChan:
		// 过滤ASCII控制符
		cleanOutput := filterTerminalOutput(string(output))
		return cleanOutput, nil
	case err := <-errorChan:
		return "", fmt.Errorf("读取命令输出失败: %v", err)
	case <-ctx.Done():
		return "", fmt.Errorf("命令执行超时")
	}
}
