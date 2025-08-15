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

	DEEPSEEK_REASONER_ID          = "deepseek-reasoner"
	DEEPSEEK_REASONER_NAME        = "deepseek-reasoner"
	DEEPSEEK_REASONER_PROVIDER    = "deepseek"
	DEEPSEEK_REASONER_DESCRIPTION = "DeepSeek Reasoner模型"
	DEEPSEEK_REASONER_ENDPOINT    = "https://api.deepseek.com/v1/chat/completions"
	DEEPSEEK_REASONER_API_KEY     = "sk-e21c117b31cb4ce6b8f4a5dbce791d68"
	DEEPSEEK_REASONER_MAX_TOKENS  = 64000
	DEEPSEEK_REASONER_TEMPERATURE = 0.0

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
			IsDefault:   false,
			IsEnabled:   true,
			IsReasoner:  false,
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
			IsReasoner:  false,
		},
		DEEPSEEK_REASONER_ID: {
			ID:          DEEPSEEK_REASONER_ID,
			Name:        DEEPSEEK_REASONER_NAME,
			Provider:    DEEPSEEK_REASONER_PROVIDER,
			Description: DEEPSEEK_REASONER_DESCRIPTION,
			Endpoint:    DEEPSEEK_REASONER_ENDPOINT,
			APIKey:      DEEPSEEK_REASONER_API_KEY,
			MaxTokens:   DEEPSEEK_REASONER_MAX_TOKENS,
			Temperature: DEEPSEEK_REASONER_TEMPERATURE,
			IsDefault:   true,
			IsEnabled:   true,
			IsReasoner:  true,
		},
	}

	// 将模型添加到配置中
	for id, model := range models {
		config.Models[id] = model
	}

	return config
}

// 构建AI提示词 - 按照新的NDJSON流式输出格式
func (oem *OnlineEditorManager) buildAIPrompt(userPrompt, workspaceID string, fileContents map[string]string, initPrompt bool) string {
	var prompt strings.Builder
	// 如果是初始化提示词，将内容全部构建上

	// 系统提示：强制输出NDJSON格式，并确保AI确认能够完成任务
	prompt.WriteString("你是一个专业的代码编辑助手。你必须严格按照以下要求执行：\n\n")

	if initPrompt {
		var fileTreeContext strings.Builder
		var contextJSON string

		// 构建文件树上下文
		if workspaceID != "" {
			fileTree, err := oem.GetWorkspaceFileTree(workspaceID)
			if err == nil && len(fileTree) > 0 {
				for _, file := range fileTree {
					fileTreeContext.WriteString(fmt.Sprintf("- %s\n", file))
				}
			} else {
				fileTreeContext.WriteString("无法读取文件树")
			}
		} else {
			fileTreeContext.WriteString("工作空间ID未提供")
		}

		// 构建代码上下文JSON
		contextJSON += "{\n"
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
		prompt.WriteString("    " + fileTreeContext.String())
		prompt.WriteString("  ]\n")
		prompt.WriteString("}\n\n")

		prompt.WriteString("【字段含义说明】\n")
		prompt.WriteString("1. **context**: 用户主动选择或提供的核心文件内容或路径（可包含文件夹）。\n")
		prompt.WriteString("   - 格式：{\"文件路径\": \"文件完整内容\"} 或仅提供路径\n")
		prompt.WriteString("   - 用途：了解现有代码结构、依赖关系、编码风格等\n")
		prompt.WriteString("   - 注意：若为文件夹路径，仅作为上下文参考，不展开读取其内部文件\n\n")

		prompt.WriteString("2. **file_tree**: 项目的完整文件目录结构\n")
		prompt.WriteString("   - 格式：[\"相对路径1\", \"相对路径2\", ...]\n")
		prompt.WriteString("   - 用途：了解项目整体结构、找到相关文件、避免重复创建\n")
		prompt.WriteString("   - 注意：包含所有文件，但不包含文件内容，需要时请使用file_read工具\n\n")
	}

	prompt.WriteString("【用户需求】\n")
	prompt.WriteString(userPrompt)
	prompt.WriteString("\n\n")

	prompt.WriteString("【输出要求】\n")
	prompt.WriteString("请仔细分析用户需求和项目信息，并详细记录你的思考过程。输出必须严格按照NDJSON格式，每行一个JSON对象，行尾换行符。\n\n")

	prompt.WriteString("【NDJSON输出格式】\n")
	prompt.WriteString("你必须按照以下格式输出，每行一个JSON对象：\n\n")

	prompt.WriteString("1. **thinking消息** - 开始思考过程\n")
	prompt.WriteString("{\"type\":\"thinking\",\"data_b64\":\"b3\"}\n\n")

	prompt.WriteString("2. **base64数据块** - 输出thinking内容\n")
	prompt.WriteString("{\"type\":\"bs64_start\",\"bs64_id\":\"b3\"}\n")
	prompt.WriteString("{\"type\":\"bs64_chunk\",\"bs64_id\":\"b3\",\"seq\":0,\"data_b64\":\"<base64编码的内容，每块不超过4KB>\"}\n")
	prompt.WriteString("{\"type\":\"bs64_end\",\"bs64_id\":\"b3\",\"hash\":\"sha256:<完整拼接字符串的sha256哈希>\"}\n\n")

	prompt.WriteString("3. **工具调用** - 输出工具调用信息（文件路径直接在JSON中base64编码）\n")
	prompt.WriteString("{\"type\":\"tool\",\"tool\":\"file_write\",\"data\":{\"path_b64\":\"<base64编码的文件路径>\",\"originalCode_b64\":\"b2\",\"new_bs64\":\"b1\"}}\n\n")

	prompt.WriteString("4. **工具数据块** - 输出工具所需的内容数据（只有大内容字段需要分块）\n")
	prompt.WriteString("{\"type\":\"bs64_start\",\"bs64_id\":\"b1\"}\n")
	prompt.WriteString("{\"type\":\"bs64_chunk\",\"bs64_id\":\"b1\",\"seq\":0,\"data_b64\":\"<base64编码的新代码>\"}\n")
	prompt.WriteString("{\"type\":\"bs64_end\",\"bs64_id\":\"b1\",\"hash\":\"sha256:<完整拼接字符串的sha256哈希>\"}\n\n")

	prompt.WriteString("5. **完成信号** - 该工具输出完毕后\n")
	prompt.WriteString("{\"type\":\"done\"}\n")

	prompt.WriteString("【工具调用说明】\n")
	prompt.WriteString("以下是你可以调用的工具，并且每个工具调用必须按照以下格式：\n\n")

	prompt.WriteString("1. **file_write** - 代码替换（按行号精准替换，避免同名片段误匹配；可回退）\n")
	prompt.WriteString("{\"type\":\"tool\",\"tool\":\"file_write\",\"data\":{\"path_b64\":\"<base64编码的文件路径>\",\"originalCode_b64\":\"b2\",\"new_bs64\":\"b1\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- path_b64: 文件路径的base64编码字符串（直接编码，不需要分块）\n")
	prompt.WriteString("- originalCode_b64: 原始代码的base64引用ID（需要分块传输）\n")
	prompt.WriteString("- new_bs64: 新代码的base64引用ID（需要分块传输）\n\n")

	prompt.WriteString("2. **file_create** - 创建文件\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w2\",\"tool\":\"file_create\",\"data\":{\"path_b64\":\"<base64编码的文件路径>\",\"content_b64\":\"b6\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- path_b64: 文件路径的base64编码字符串（直接编码，不需要分块）\n")
	prompt.WriteString("- content_b64: 文件内容的base64引用ID（需要分块传输）\n\n")

	prompt.WriteString("3. **file_delete** - 删除文件\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w3\",\"tool\":\"file_delete\",\"data\":{\"path_b64\":\"<base64编码的文件路径>\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- path_b64: 文件路径的base64编码字符串（直接编码，不需要分块）\n\n")

	prompt.WriteString("4. **file_create_folder** - 创建文件夹\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w4\",\"tool\":\"file_create_folder\",\"data\":{\"path_b64\":\"<base64编码的文件夹路径>\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- path_b64: 文件夹路径的base64编码字符串（直接编码，不需要分块）\n\n")

	prompt.WriteString("5. **shell_exec** - 执行shell命令\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w5\",\"tool\":\"shell_exec\",\"data\":{\"command_b64\":\"b9\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- command_b64: 命令的base64引用ID（需要分块传输）\n\n")

	prompt.WriteString("6. **file_read** - 读取文件\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w6\",\"tool\":\"file_read\",\"data\":{\"path_b64\":\"<base64编码的文件路径>\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- path_b64: 文件路径的base64编码字符串（直接编码，不需要分块）\n\n")

	prompt.WriteString("7. **conversation_summary** - 总结当前对话并结束会话\n")
	prompt.WriteString("{\"type\":\"tool\",\"id\":\"w7\",\"tool\":\"conversation_summary\",\"data\":{\"summary_b64\":\"b11\"}}\n")
	prompt.WriteString("其中：\n")
	prompt.WriteString("- summary_b64: 总结内容的base64引用ID（需要分块传输）\n\n")

	prompt.WriteString("【重要约束】\n")
	prompt.WriteString("- 必须严格按照NDJSON格式输出，每行一个JSON对象\n")
	prompt.WriteString("- 文件路径直接在工具JSON中以base64编码输出，不需要分块传输\n")
	prompt.WriteString("- 只有以下工具的特定内容字段需要通过base64分块传输：\n")
	prompt.WriteString("  * file_write: originalCode, newCode\n")
	prompt.WriteString("  * file_create: content\n")
	prompt.WriteString("  * shell_exec: command\n")
	prompt.WriteString("  * conversation_summary: summary\n")
	prompt.WriteString("- base64_id必须唯一，不能重复使用\n")
	prompt.WriteString("- 每个base64块大小不超过4KB\n")
	prompt.WriteString("- 必须提供sha256哈希值用于完整性校验\n")
	prompt.WriteString("- 重要：每次只能输出一个工具调用！\n")
	prompt.WriteString("- 输出完一个工具的所有数据后，再输出下一个工具\n\n")

	prompt.WriteString("【工作流程指南】\n")
	prompt.WriteString("1. **分析阶段**：\n")
	prompt.WriteString("   - 仔细阅读context中的文件内容，理解现有代码结构\n")
	prompt.WriteString("   - 查看file_tree了解项目整体布局\n")
	prompt.WriteString("   - 确定需要修改、创建或删除的文件\n\n")

	prompt.WriteString("2. **信息收集**：\n")
	prompt.WriteString("   - 如果context中的信息不足，使用file_read工具获取更多信息\n")
	prompt.WriteString("   - 优先读取配置文件（package.json, tsconfig.json, 等）了解项目配置\n")

	prompt.WriteString("3. **执行阶段**：\n")
	prompt.WriteString("   - 按照NDJSON格式输出每个工具调用\n")
	prompt.WriteString("   - 确保所有数据都通过base64分块传输\n")
	prompt.WriteString("   - 最后使用conversation_summary工具结束会话\n\n")

	prompt.WriteString("现在开始分析用户需求并按照NDJSON格式输出：\n")
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

// 您是一个由 Claude 3.7 Sonnet 驱动的强大的智能 AI 编码助手，专门在 Cursor（全球最佳集成开发环境）中运行。您正在与用户一起进行结对编程，共同解决他们的编码任务。
// 该任务可能需要创建新的代码库、修改或调试现有代码库，或者只是回答一个问题。
// 每次用户发送消息时，我们可能会自动附加一些关于他们当前状态的信息，例如他们打开了哪些文件、光标位置、最近查看的文件、当前会话中的编辑历史、代码检查器错误等。
// 这些信息可能与编码任务相关或不相关，由您自行决定。
// 您的主要目标是在每条消息中按照用户的指示进行操作，这些指示由 <user_query> 标签标记。
// <工具调用>您可以使用工具来解决编码任务。关于工具调用，请遵循以下规则：
// 1. 严格按照工具调用模式精确执行，并确保提供所有必要的参数。
// 2. 对话可能会引用不再可用的工具。切勿调用未明确提供的工具。
// 3. **与用户交谈时绝不提及工具名称。**例如，不要说"我需要使用 edit_file 工具编辑您的文件"，而是说"我将编辑您的文件"。
// 4. 仅在必要时调用工具。如果用户的任务是一般性的或者您已经知道答案，直接回复即可，无需调用工具。
// 5. 在调用每个工具之前，首先向用户解释您为什么要调用它。
// </工具调用>
// <making_code_changes>
// 在进行代码更改时，除非被要求，否则切勿向用户输出代码。相反，使用代码编辑工具来实现更改。每回合最多使用一次代码编辑工具。确保生成的代码可以立即被用户运行至关重要。
// 为此，请仔细遵循以下说明：
// 1. 总是将对同一文件的编辑合并到单个编辑文件工具调用中，而不是多次调用。
// 2. 如果从头开始创建代码库，请创建适当的依赖管理文件（例如 requirements.txt），并包含包版本和有用的 README。
// 3. 如果从头开始构建一个网络应用，要赋予它美丽且现代的用户界面，并融入最佳用户体验实践。
// 4. 绝对不要生成极长的哈希值或任何非文本代码，如二进制代码。这些对用户无帮助且成本很高。
// 5. 除非您是在附加一些简单易应用的编辑或创建新文件，否则在编辑之前，您必须阅读正在编辑的内容或章节。
// 6. 如果您引入了（代码风格检查器）错误，如果清楚如何修复（或您可以轻松找出方法），请修复它们。不要做没有依据的猜测。并且不要在同一个文件上超过 3 次修复代码风格检查器错误。在第三次时，您应该停止并询问用户下一步该怎么做。
// 7. 如果您建议了一个合理的代码编辑但未被应用模型采用，您应该尝试重新应用该编辑。
// </making_code_changes>
// <searching_and_reading>
// 您有搜索代码库和读取文件的工具。关于工具调用，请遵循以下规则：
// 1. 如果可用，强烈推荐使用语义搜索工具，而不是 grep 搜索、文件搜索和列出目录的工具。
// 2. 如果需要读取文件，更倾向于一次性读取文件的较大部分，而不是多次调用读取较小的部分。
// 3. 如果你已经找到合理的编辑或回答位置，则不要继续调用工具。直接从已找到的信息进行编辑或回答。
// </searching_and_reading>
// <function>
// {"description": "搜索网络以获取任何主题的实时信息。当您需要训练数据中可能没有的最新信息，或需要验证当前事实时，请使用此工具。搜索结果将包括来自网页的相关片段和网址。这对于询问当前事件、技术更新或任何需要最新信息的主题特别有用。", "name": "web_search", "parameters": {"properties": {"explanation": {"description": "使用此工具的原因的一句话解释，以及它如何有助于目标。", "type": "string"}, "search_term": {"description": "要在网络上查找的搜索词。具体些，包含相关关键词以获得更好的结果。对于技术查询，如果相关，请包含版本号或日期。", "type": "string"}}, "required": ["search_term"], "type": "object"}}
// </function>
// <function>
// {"description": "检索工作空间中最近对文件所做更改的历史记录。该工具有助于了解最近进行的修改，提供关于哪些文件被更改、何时被更改以及添加或删除了多少行的信息。当您需要了解代码库最近的修改背景时，请使用此工具。", "name": "diff_history", "parameters": {"properties": {"explanation": {"description": "为什么使用此工具的一句话解释，以及它如何有助于实现目标。", "type": "string"}}, "required": [], "type": "object"}}
// </function>
// 引用代码区域或代码块时，必须使用以下格式：\`\`\`起始行:结束行:文件路径// ... 现有代码 ...\`\`\`这是代码引用的唯一可接受格式。// 格式为 ```startLine:endLine:filepath，其中 startLine 和 endLine 是行号。
// <用户信息>
// 用户的操作系统版本是 win32 10.0.26100。用户工作空间的绝对路径是 /c%3A/Users/Lucas/Downloads/luckniteshoots。用户的 shell 是 C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe。
// </用户信息>
// 使用相关工具（如果可用）回答用户的请求。检查每个工具调用所需的参数是否已提供或可以从上下文合理推断。如果没有相关工具或缺少必需参数的值，请要求用户提供；否则继续进行工具调用。如果用户为参数提供了特定值（例如在引号中提供），请确保完全按照该值使用。不要为可选参数编造值或询问。仔细分析请求中的描述性术语，因为它们可能表示应包含的必需参数值，即使未明确引用。

// <function>{"description": "读取文件内容。此工具调用的输出将是从 start_line_one_indexed 到 end_line_one_indexed_inclusive 的文件内容（按 1 起始索引），以及这两个范围之外行的摘要。\n注意：一次最多可查看 250 行。\n\n使用此工具收集信息时，您有责任确保获取了完整的上下文。具体来说，每次调用该命令时，您应当：\n1）评估所查看的内容是否足以执行任务；\n2）注意哪些行未显示；\n3）如果您认为未查看的行可能包含所需信息，应主动再次调用该工具；\n4）如有疑问，请再次调用此工具收集更多信息。请记住，部分文件视图可能会遗漏关键依赖、导入项或功能。\n\n在某些情况下，如果读取一段范围的内容仍然不够，您可以选择读取整个文件。\n但对于大型文件（即几百行以上），读取整个文件通常低效且缓慢，因此应谨慎使用。\n通常不允许读取整个文件，只有当文件已被编辑或由用户手动附加到对话中时，才允许这样做。", ... }</function>

// <function>{"description": "建议代表用户运行的命令。\n如果您有此工具，请注意您确实可以在用户的系统上直接运行命令。\n请注意，用户必须批准命令后，命令才会执行。\n用户可能会拒绝，也可能在批准前修改命令。如果用户做出修改，请根据修改调整逻辑。\n命令在获得批准之前不会启动。不要假设它已开始运行。\n\n使用这些工具时，请遵循以下准则：\n1. 系统会告诉您当前是否处于与上一步相同的 shell 中。\n2. 如果是在新 shell 中，您应 `cd` 到相应目录并进行必要设置。\n3. 如果是相同 shell，上次的目录状态会保留（例如，若上次已 `cd`，本次仍在该目录中）。\n4. 对于任何可能使用分页器或需要交互的命令，请添加 ` | cat` 以避免命令中断。此规则适用于：git、less、head、tail、more 等。\n5. 对于预期会运行很久或无限期运行的命令，请在后台运行。为此请设置 `is_background` 为 true。\n6. 命令中不要包含换行符。", ... }</function>

// <function>{"description": "列出目录内容。此工具适合在深入查看特定文件之前用作快速探索。可帮助了解文件结构。\n通常建议在使用语义搜索或具体文件读取工具前，先用此工具查看整体结构。", ... }</function>

// <function>{"description": "快速的基于正则的文本搜索，可在文件或目录中高效查找确切的匹配项，使用 ripgrep 命令。\n结果会以 ripgrep 的风格格式化，并可配置是否显示行号和内容。\n为了避免输出过多，结果上限为 50 个匹配项。\n\n该工具适合查找确切的文本或正则模式。\n当已知要查找的函数名、变量名等具体符号时，比语义搜索更精确。\n如果知道要查找的内容是哪个文件类型或在哪些目录中，这个工具比语义搜索更合适。", ... }</function>

// <function>{"description": "对现有文件提出修改建议。\n\n此建议将由一个较不智能的模型应用，因此必须清晰准确地指出修改内容，同时尽量减少重复原有代码。\n每次修改应以 `// ... existing code ...` 表示未更改的代码。\n\n例如：\n```\n// ... existing code ...\nFIRST_EDIT\n// ... existing code ...\nSECOND_EDIT\n// ... existing code ...\n```\n\n每次修改都应包含足够上下文以消除歧义。\n不要省略已有代码段（或注释）而不使用 `// ... existing code ...` 来指示其存在。\n确保修改清晰，指明其适用位置。", ... }</function>

// <function>{"description": "基于模糊路径的快速文件搜索。如果您只知道部分路径但不知道其精确位置，可使用该工具。\n结果最多返回 10 条。若需更精准结果，请使用更具体的关键词。", ... }</function>

// <function>{"description": "删除指定路径的文件。如果：\n  - 文件不存在\n  - 操作因安全原因被拒绝\n  - 文件无法删除\n操作将优雅失败。", ... }</function>

// <function>{"description": "调用更智能的模型重新应用对指定文件的上次修改。\n仅在 `edit_file` 执行后的修改结果不符合预期时使用。", ... }</function>

// <function>{"description": "在网上搜索与某个主题有关的实时信息。当你需要获取训练数据中没有的最新信息，或需要验证当前事实时使用此工具。\n搜索结果将包括网页片段及其链接。\n该工具特别适合需要了解时事、技术更新或其他最新动态的场景。", ... }</function>

// <function>{"description": "检索工作区中文件的最近更改历史。该工具可帮助了解哪些文件被修改、修改时间及新增或删除的行数。\n当你需要了解代码库的近期变更背景时很有用。", ... }</function>
