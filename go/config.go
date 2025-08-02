package main

import (
	"fmt"
	"strings"
)

// AI模型配置常量
const (
	// OpenAI GPT-3.5 Turbo
	GPT35_TURBO_ID          = "gpt-3.5-turbo"
	GPT35_TURBO_NAME        = "gpt-3.5-turbo"
	GPT35_TURBO_PROVIDER    = "openai"
	GPT35_TURBO_DESCRIPTION = "OpenAI GPT-3.5 Turbo模型"
	GPT35_TURBO_ENDPOINT    = "https://api.openai.com/v1/chat/completions"
	GPT35_TURBO_API_KEY     = "sk-your-openai-api-key"
	GPT35_TURBO_MAX_TOKENS  = 2000
	GPT35_TURBO_TEMPERATURE = 1

	// OpenAI GPT-4
	GPT4_ID          = "gpt-4"
	GPT4_NAME        = "gpt-4"
	GPT4_PROVIDER    = "openai"
	GPT4_DESCRIPTION = "OpenAI GPT-4模型"
	GPT4_ENDPOINT    = "https://api.openai.com/v1/chat/completions"
	GPT4_API_KEY     = "sk-your-openai-api-key"
	GPT4_MAX_TOKENS  = 4000
	GPT4_TEMPERATURE = 1

	// DeepSeek Chat
	DEEPSEEK_CHAT_ID          = "deepseek-chat"
	DEEPSEEK_CHAT_NAME        = "deepseek-chat"
	DEEPSEEK_CHAT_PROVIDER    = "deepseek"
	DEEPSEEK_CHAT_DESCRIPTION = "DeepSeek Chat模型"
	DEEPSEEK_CHAT_ENDPOINT    = "https://api.deepseek.com/v1/chat/completions"
	DEEPSEEK_CHAT_API_KEY     = "sk-e21c117b31cb4ce6b8f4a5dbce791d68"
	DEEPSEEK_CHAT_MAX_TOKENS  = 8192
	DEEPSEEK_CHAT_TEMPERATURE = 1

	// 默认配置
	DEFAULT_MODEL    = "deepseek-chat"
	DEFAULT_STRATEGY = "preview"
)

// GetAIConfig 获取AI配置
func GetAIConfig() *AIConfigData {
	config := &AIConfigData{
		DefaultModel: DEFAULT_MODEL,
		Strategy:     DEFAULT_STRATEGY,
		Models:       make(map[string]*AIModel),
	}

	// 定义AI模型配置
	models := map[string]*AIModel{
		GPT35_TURBO_ID: {
			ID:          GPT35_TURBO_ID,
			Name:        GPT35_TURBO_NAME,
			Provider:    GPT35_TURBO_PROVIDER,
			Description: GPT35_TURBO_DESCRIPTION,
			Endpoint:    GPT35_TURBO_ENDPOINT,
			APIKey:      GPT35_TURBO_API_KEY,
			MaxTokens:   GPT35_TURBO_MAX_TOKENS,
			Temperature: GPT35_TURBO_TEMPERATURE,
			IsDefault:   true,
			IsEnabled:   true,
		},
		GPT4_ID: {
			ID:          GPT4_ID,
			Name:        GPT4_NAME,
			Provider:    GPT4_PROVIDER,
			Description: GPT4_DESCRIPTION,
			Endpoint:    GPT4_ENDPOINT,
			APIKey:      GPT4_API_KEY,
			MaxTokens:   GPT4_MAX_TOKENS,
			Temperature: GPT4_TEMPERATURE,
			IsDefault:   false,
			IsEnabled:   true,
		},
		DEEPSEEK_CHAT_ID: {
			ID:          DEEPSEEK_CHAT_ID,
			Name:        DEEPSEEK_CHAT_NAME,
			Provider:    DEEPSEEK_CHAT_PROVIDER,
			Description: DEEPSEEK_CHAT_DESCRIPTION,
			Endpoint:    DEEPSEEK_CHAT_ENDPOINT,
			APIKey:      DEEPSEEK_CHAT_API_KEY,
			MaxTokens:   DEEPSEEK_CHAT_MAX_TOKENS,
			Temperature: DEEPSEEK_CHAT_TEMPERATURE,
			IsDefault:   false,
			IsEnabled:   true,
		},
	}

	// 将模型添加到配置中
	for id, model := range models {
		config.Models[id] = model
	}

	return config
}

// 构建AI提示词 - 按照新的编辑流程逻辑，确保AI只在确定时输出
func (oem *OnlineEditorManager) buildAIPrompt(userPrompt, context, language string, fileContents map[string]string) string {
	var prompt strings.Builder

	// 系统提示：强制输出纯JSON格式，并确保AI确认能够完成任务
	prompt.WriteString("你是一个专业的代码编辑助手。你必须严格按照以下要求执行：\n\n")
	prompt.WriteString("【重要原则】\n")
	prompt.WriteString("1. 只有在你完全确定能够完成用户请求时，才输出操作结果\n")
	prompt.WriteString("2. 如果信息不足、需求不明确或存在风险，你必须返回错误信息\n")
	prompt.WriteString("3. 你的输出必须是完整的、可执行的、最终的结果\n")
	prompt.WriteString("4. 绝对不允许输出不完整、有错误或不确定的代码\n\n")
	prompt.WriteString("5. 输出的内容一定按照格式！！这是最重要的！！\n\n")

	// 构建代码上下文JSON
	contextJSON := "{\n"
	if len(fileContents) > 0 {
		contextEntries := make([]string, 0)
		for filePath, content := range fileContents {
			// 转义JSON字符串
			escapedContent := strings.ReplaceAll(content, "\\", "\\\\")
			escapedContent = strings.ReplaceAll(escapedContent, "\"", "\\\"")
			escapedContent = strings.ReplaceAll(escapedContent, "\n", "\\n")
			escapedContent = strings.ReplaceAll(escapedContent, "\r", "\\r")
			escapedContent = strings.ReplaceAll(escapedContent, "\t", "\\t")

			contextEntries = append(contextEntries, fmt.Sprintf("    \"%s\": \"%s\"", filePath, escapedContent))
		}
		contextJSON += strings.Join(contextEntries, ",\n")
	}
	contextJSON += "\n  }"

	// 提供完整的编辑信息
	prompt.WriteString("【项目信息详解】\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"context\": ")
	prompt.WriteString(contextJSON)
	prompt.WriteString(",\n")
	prompt.WriteString("  \"file_tree\": [\n")

	// 文件树信息将在调用时动态添加
	prompt.WriteString("    \"{{FILE_TREE_PLACEHOLDER}}\"\n")
	prompt.WriteString("  ],\n")

	prompt.WriteString("  \"tools\": [\n")
	prompt.WriteString("    \"file_read\",\n")
	prompt.WriteString("    \"file_write\",\n")
	prompt.WriteString("    \"file_delete\",\n")
	prompt.WriteString("    \"file_create\",\n")
	prompt.WriteString("    \"file_create_folder\",\n")
	prompt.WriteString("    \"file_delete_folder\"\n")
	prompt.WriteString("  ]\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【字段含义说明】\n")
	prompt.WriteString("1. **context**: 用户主动选择或提供的核心文件内容，这些是你需要重点分析和修改的文件！！\n")
	prompt.WriteString("   - 格式：{\"文件路径\": \"文件完整内容\"}\n")
	prompt.WriteString("   - 用途：了解现有代码结构、依赖关系、编码风格等\n")
	prompt.WriteString("   - 注意：这些文件的内容是完整且准确的，可以直接基于此进行分析和修改！！\n\n")

	prompt.WriteString("2. **file_tree**: 项目的完整文件目录结构\n")
	prompt.WriteString("   - 格式：[\"相对路径1\", \"相对路径2\", ...]\n")
	prompt.WriteString("   - 用途：了解项目整体结构、找到相关文件、避免重复创建\n")
	prompt.WriteString("   - 注意：包含所有文件，但不包含文件内容，需要时请使用file_read工具\n\n")

	prompt.WriteString("3. **tools**: 你可以使用的工具列表\n")
	prompt.WriteString("   - file_read: 读取指定文件的完整内容\n")
	prompt.WriteString("   - file_write: 写入/覆盖文件内容（需要提供完整内容）\n")
	prompt.WriteString("   - file_create: 创建新文件（需要提供完整内容）\n")
	prompt.WriteString("   - file_delete: 删除指定文件\n")
	prompt.WriteString("   - file_create_folder: 创建新文件夹\n")
	prompt.WriteString("   - file_delete_folder: 删除文件夹及其内容\n\n")

	prompt.WriteString("【用户需求】\n")
	prompt.WriteString(userPrompt)
	prompt.WriteString("\n\n")

	prompt.WriteString("【输出要求】\n")
	prompt.WriteString("请仔细分析用户需求和项目信息，并详细记录你的思考过程。输出以下JSON格式：\n\n")

	prompt.WriteString("【成功情况 - 返回操作列表】\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"status\": \"success\",\n")
	prompt.WriteString("  \"thinking\": {\n")
	prompt.WriteString("    \"analysis\": \"详细分析用户需求和当前代码状态, 是字符串\",\n")
	prompt.WriteString("    \"planning\": \"制定实现计划和步骤, 是字符串\",\n")
	prompt.WriteString("    \"considerations\": \"考虑的技术细节、依赖关系、潜在问题等, 是字符串\",\n")
	prompt.WriteString("    \"decisions\": \"关键决策和选择的理由, 是字符串\"\n")
	prompt.WriteString("  },\n")
	prompt.WriteString("  \"change\": [\n")
	prompt.WriteString("    {\n")
	prompt.WriteString("      \"tool\": \"file_write\",\n")
	prompt.WriteString("      \"path\": \"src/main.js\",\n")
	prompt.WriteString("      \"content\": \"完整的文件内容（必须是完整可运行的代码）\"\n")
	prompt.WriteString("    },\n")
	prompt.WriteString("    {\n")
	prompt.WriteString("      \"tool\": \"file_create\",\n")
	prompt.WriteString("      \"path\": \"src/new-file.js\",\n")
	prompt.WriteString("      \"content\": \"完整的新文件内容\"\n")
	prompt.WriteString("    }\n")
	prompt.WriteString("  ]\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【失败情况 - 返回工具调用建议】\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"status\": \"error\",\n")
	prompt.WriteString("  \"thinking\": {\n")
	prompt.WriteString("    \"analysis\": \"分析为什么无法完成请求\",\n")
	prompt.WriteString("    \"missing_info\": \"缺少哪些关键信息,格式是字符串\",\n")
	prompt.WriteString("    \"next_steps\": \"需要采取的下一步行动\"\n")
	prompt.WriteString("  },\n")
	prompt.WriteString("  \"message\": \"具体的错误原因，比如：需要先读取某些文件、缺少依赖信息等\",\n")
	prompt.WriteString("  \"required_tools\": [\n")
	prompt.WriteString("    {\n")
	prompt.WriteString("      \"tool\": \"file_read\",\n")
	prompt.WriteString("      \"path\": \"需要读取的文件路径\",\n")
	prompt.WriteString("      \"reason\": \"为什么需要读取这个文件\"\n")
	prompt.WriteString("    }\n")
	prompt.WriteString("  ],\n")
	prompt.WriteString("  \"next_step\": \"获取所需信息后，请重新发送请求\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【严格要求】\n")
	prompt.WriteString("1. 必须返回纯JSON格式，不要包含```json等markdown标记\n")
	prompt.WriteString("2. status字段必须是\"success\"或\"error\"\n")
	prompt.WriteString("3. 无论成功还是失败，都必须包含thinking字段记录详细思考过程\n")
	prompt.WriteString("4. thinking字段内容要详细且有结构，帮助用户理解你的推理过程\n")
	prompt.WriteString("5. 成功时，change数组中的每个操作都必须是完整的、可执行的\n")
	prompt.WriteString("6. 失败时，必须在required_tools中指定需要执行的具体工具操作\n")
	prompt.WriteString("7. tool字段可以是：file_read, file_write, file_create, file_delete, file_create_folder, file_delete_folder\n")
	prompt.WriteString("8. 对于file_write和file_create，content必须是完整的文件内容\n")
	prompt.WriteString("9. 路径使用相对路径，以项目根目录为基准\n")
	prompt.WriteString("10. error状态时，required_tools应该包含获取必要信息的具体操作\n")
	prompt.WriteString("11. 例如：需要了解现有代码结构时，指定file_read操作\n")
	prompt.WriteString("12. 不要给出模糊的建议，而要给出可执行的工具调用\n\n")

	prompt.WriteString("请根据以上要求，仔细分析用户需求，确认你能够完成后再输出结果。如果有任何不确定的地方，请返回error状态。\n\n")

	prompt.WriteString("【工作流程指南】\n")
	prompt.WriteString("1. **分析阶段**：\n")
	prompt.WriteString("   - 仔细阅读context中的文件内容，理解现有代码结构\n")
	prompt.WriteString("   - 查看file_tree了解项目整体布局\n")
	prompt.WriteString("   - 确定需要修改、创建或删除的文件\n\n")

	prompt.WriteString("2. **信息收集**：\n")
	prompt.WriteString("   - 如果context中的信息不足，使用required_tools请求读取更多文件\n")
	prompt.WriteString("   - 优先读取配置文件（package.json, tsconfig.json, 等）了解项目配置\n")
	prompt.WriteString("   - 读取相关的组件或模块文件了解代码风格和模式\n\n")

	prompt.WriteString("3. **执行原则**：\n")
	prompt.WriteString("   - 不要猜测文件内容，始终通过file_read获取准确信息\n")
	prompt.WriteString("   - 优先选择修改已存在的文件，而不是重新创建\n")
	prompt.WriteString("   - 创建新文件前，检查file_tree确保路径和命名合理\n")
	prompt.WriteString("   - 保持代码风格与现有项目一致\n\n")

	// 移除调试输出
	fmt.Println(prompt.String())
	return prompt.String()
}

// 默认环境变量模板
var defaultEnvironmentTemplates = map[string]map[string]string{
	"base": {
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
	"node": {
		"NODE_ENV":          "development",
		"NPM_CONFIG_PREFIX": "/usr/local",
		"NPM_CONFIG_CACHE":  "/tmp/.npm",
	},
	"python": {
		"PYTHONPATH":              "/workspace",
		"PYTHONUNBUFFERED":        "1",
		"PIP_NO_CACHE_DIR":        "1",
		"PYTHONDONTWRITEBYTECODE": "1",
	},
	"golang": {
		"GOPATH":      "/go",
		"GOROOT":      "/usr/local/go",
		"CGO_ENABLED": "0",
		"GOPROXY":     "https://goproxy.cn,direct",
	},
	"java": {
		"JAVA_HOME":   "/usr/local/openjdk-17",
		"MAVEN_HOME":  "/usr/share/maven",
		"GRADLE_HOME": "/opt/gradle",
	},
}

// 全局脚本管理器
var scriptManager = &ScriptManager{
	Scripts: map[string]string{
		// 终端初始化脚本
		"terminal_init": `#!/bin/bash
# 进入工作目录
cd /workspace 2>/dev/null || cd /

# 禁用历史扩展，避免！号展开
set +H

stty -echo

# 禁用括号粘贴模式，避免终端控制字符
printf '\033[?2004l'

# 设置标准的bash提示符，会自动跟随当前目录变化
export PS1='root@online-editor:\w $ '

# 清空屏幕并显示欢迎信息
clear
echo "🚀 在线代码编辑器终端"
echo "当前目录: $(pwd)"
echo "==============================================="

# 直接启动交互式bash，让它处理所有的提示符逻辑
exec /bin/bash --login -i`,

		// 环境初始化脚本 - 基础版本
		"env_init_basic": `#!/bin/bash
# 确保工作目录存在并设置权限
mkdir -p /workspace
chmod 755 /workspace
cd /workspace

# 创建常用目录
mkdir -p /workspace/tmp
mkdir -p /workspace/logs

# 设置git安全目录（如果git存在）
if command -v git >/dev/null 2>&1; then
	git config --global --add safe.directory /workspace
	git config --global init.defaultBranch main
fi

echo "工作目录初始化完成"`,

		// .bashrc配置内容 - 环境初始化版本
		"bashrc_env_init": `#!/bin/bash
# Online Code Editor Enhanced Shell Configuration

# 设置别名
alias ll='ls -alF'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# 开发相关别名
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'
alias gd='git diff'

# 设置历史记录
export HISTSIZE=2000
export HISTFILESIZE=4000
export HISTCONTROL=ignoredups:erasedups
shopt -s histappend

# 设置编辑器
export EDITOR=nano
export VISUAL=nano

# 自动完成功能
if [ -f /etc/bash_completion ]; then
    . /etc/bash_completion
fi

# 函数：快速创建项目结构
mkproject() {
    if [ -z "$1" ]; then
        echo "用法: mkproject <项目名>"
        return 1
    fi
    mkdir -p "$1"/{src,docs,tests,config}
    cd "$1"
    echo "# $1" > README.md
    echo "项目 $1 创建完成"
}

# 函数：快速Git初始化
gitinit() {
    git init
    echo -e "node_modules/\n.env\n*.log\n.DS_Store" > .gitignore
    git add .
    git commit -m "Initial commit"
    echo "Git仓库初始化完成"
}

# 切换到工作目录
cd /workspace 2>/dev/null || cd /`,

		// .bashrc配置内容 - 安装工具版本
		"bashrc_tool_install": `#!/bin/bash
# 设置别名

# 设置历史记录
export HISTSIZE=1000
export HISTFILESIZE=2000
export HISTCONTROL=ignoredups:erasedups

# 设置工作目录
cd /workspace 2>/dev/null || cd /

echo "Welcome to Online Code Editor!"
echo "Current directory: $(pwd)"
echo "Available commands: ls, cd, pwd, git, etc."`,

		// 端口测试服务器脚本模板
		"port_test_server": `
		echo "启动端口 %s 测试服务器..."
		nohup python3 -c "
import http.server
import socketserver
import sys

PORT = %s
try:
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
        print(f'测试服务器已启动在端口 {PORT}')
        print('访问 http://localhost:%s 进行测试')
        httpd.serve_forever()
except Exception as e:
    print(f'启动服务器失败: {e}')
    sys.exit(1)
" > /tmp/test_server_%s.log 2>&1 &
		echo "测试服务器已在后台启动，日志文件: /tmp/test_server_%s.log"
		echo "请等待几秒钟，然后访问 http://localhost:%s"`,
	},

	Commands: map[string][]string{
		// 检查工具是否存在
		"check_tool": {"which"},

		// 端口检查命令模板
		"port_check_template": {"sh", "-c", "netstat -tlnp 2>/dev/null | grep ':%s ' || ss -tlnp 2>/dev/null | grep ':%s ' || lsof -i :%s 2>/dev/null"},

		// 包管理器安装命令
		"install_apt": {"/bin/bash", "-c", "apt-get update && apt-get install -y %s"},
		"install_apk": {"/bin/bash", "-c", "apk add --no-cache %s"},
		"install_yum": {"/bin/bash", "-c", "yum install -y %s"},
		"install_dnf": {"/bin/bash", "-c", "dnf install -y %s"},
	},
}

// 预设镜像源配置
var presetRegistries = []*RegistryConfig{
	{
		Name:        "Docker Hub (官方)",
		Code:        "dockerhub",
		BaseURL:     "docker.io",
		Description: "Docker官方镜像仓库",
		Type:        "docker_cli",
		Enabled:     true,
		IsDefault:   true,
	},
	{
		Name:        "阿里云容器镜像服务",
		Code:        "aliyun",
		BaseURL:     "cr.console.aliyun.com",
		Description: "阿里云提供的容器镜像服务，国内访问速度快",
		Type:        "registry",
		Enabled:     true,
		IsDefault:   true,
	},
	{
		Name:        "网易云镜像中心",
		Code:        "netease",
		BaseURL:     "hub-mirror.c.163.com",
		Description: "网易云提供的Docker镜像加速服务",
		Type:        "registry",
		Enabled:     true,
		IsDefault:   true,
	},
	{
		Name:        "腾讯云镜像中心",
		Code:        "tencent",
		BaseURL:     "mirror.ccs.tencentyun.com",
		Description: "腾讯云提供的Docker镜像加速服务",
		Type:        "registry",
		Enabled:     true,
		IsDefault:   true,
	},
	{
		Name:        "轩辕云镜像中心",
		Code:        "xuanyuan",
		BaseURL:     "docker.xuanyuan.me",
		Description: "轩辕云提供的Docker镜像加速服务",
		Type:        "registry",
		Enabled:     true,
		IsDefault:   true,
	},
}

var defaultEnvVars = map[string]string{
	"PATH":            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
	"TERM":            "xterm-256color",
	"HOME":            "/root",
	"USER":            "root",
	"SHELL":           "/bin/bash",
	"LANG":            "C.UTF-8",
	"LC_ALL":          "C.UTF-8",
	"DEBIAN_FRONTEND": "noninteractive",
	"TZ":              "Asia/Shanghai",
}
