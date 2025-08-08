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
			IsDefault:   false,
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
			IsDefault:   true,
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
func (oem *OnlineEditorManager) buildAIPrompt(userPrompt, context string, fileContents map[string]string, toolHistory []ToolExecutionRecord) string {
	var prompt strings.Builder

	// 系统提示：强制输出纯JSON格式，并确保AI确认能够完成任务
	prompt.WriteString("你是一个专业的代码编辑助手。你必须严格按照以下要求执行：\n\n")
	prompt.WriteString("【重要原则】\n")
	prompt.WriteString("1. 每次响应必须包含至少一个工具调用\n")
	prompt.WriteString("2. 如果信息不足，使用file_read工具获取信息，状态设为\"retry\"\n")
	prompt.WriteString("3. 如果完成所有修改，状态设为\"finish\"\n")
	prompt.WriteString("4. 你的输出必须是完整的、可执行的、最终的结果\n")
	prompt.WriteString("5. 绝对不允许输出不完整、有错误或不确定的代码\n\n")
	prompt.WriteString("6. 输出的内容一定按照格式！！这是最重要的！！\n\n")

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

	prompt.WriteString("  \"available_tools\": [\n")
	prompt.WriteString("    \"file_read\",\n")
	prompt.WriteString("    \"file_write\",\n")
	prompt.WriteString("    \"file_delete\",\n")
	prompt.WriteString("    \"file_create\",\n")
	prompt.WriteString("    \"file_create_folder\",\n")
	prompt.WriteString("    \"shell_exec\"\n")
	prompt.WriteString("  ]\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【字段含义说明】\n")
	prompt.WriteString("1. **context**: 用户主动选择或提供的核心文件内容，如果存在，就是你需要修改的内容！！里面所有的文件以及其内容都是完整的\n")
	prompt.WriteString("   - 格式：{\"文件路径\": \"文件完整内容\"}\n")
	prompt.WriteString("   - 用途：了解现有代码结构、依赖关系、编码风格等\n")
	prompt.WriteString("   - 注意：这些文件的内容是完整且准确的，可以直接基于此进行分析和修改！！\n\n")

	prompt.WriteString("2. **file_tree**: 项目的完整文件目录结构\n")
	prompt.WriteString("   - 格式：[\"相对路径1\", \"相对路径2\", ...]\n")
	prompt.WriteString("   - 用途：了解项目整体结构、找到相关文件、避免重复创建\n")
	prompt.WriteString("   - 注意：包含所有文件，但不包含文件内容，需要时请使用file_read工具\n\n")

	prompt.WriteString("3. **tool_history**: 之前的工具调用历史记录\n")
	prompt.WriteString("   - 包含之前所有工具调用的结果和状态\n")
	prompt.WriteString("   - 用于了解已经执行的操作和获取的信息\n")
	prompt.WriteString("   - 特别注意：file_read工具的结果会显示读取到的文件内容\n")
	prompt.WriteString("   - 这些是实际执行后的结果，不是AI的请求\n\n")

	prompt.WriteString("4. **available_tools**: 你可以使用的工具列表\n")
	prompt.WriteString("   - file_read: 读取指定文件的完整内容\n")
	prompt.WriteString("   - file_write: 写入/覆盖文件内容（需要提供完整内容）\n")
	prompt.WriteString("   - file_create: 创建新文件（需要提供完整内容）\n")
	prompt.WriteString("   - file_delete: 删除指定文件\n")
	prompt.WriteString("   - file_create_folder: 创建新文件夹\n")
	prompt.WriteString("   - shell_exec: 执行shell命令\n\n")

	prompt.WriteString("【用户需求】\n")
	prompt.WriteString(userPrompt)
	prompt.WriteString("\n\n")

	prompt.WriteString("【输出要求】\n")
	prompt.WriteString("请仔细分析用户需求和项目信息，并详细记录你的思考过程。输出以下JSON格式：\n\n")

	prompt.WriteString("【状态说明】\n")
	prompt.WriteString("- status: \"finish\" - 表示所有操作完成，可以返回结果给用户\n")
	prompt.WriteString("- status: \"retry\" - 表示需要更多信息或执行工具调用，需要继续处理\n")
	prompt.WriteString("- 【新增】如果用户输入过于模糊或无法理解，直接返回finish状态，不要retry\n\n")

	prompt.WriteString("【工具调用格式】\n")
	prompt.WriteString("tools数组中的每个工具调用必须按照以下格式：\n\n")

	prompt.WriteString("1. **file_write** - 写入文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_write\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"code\": {\n")
	prompt.WriteString("    \"originalCode\": \"原始代码\",\n")
	prompt.WriteString("    \"newCode\": \"新代码\"\n")
	prompt.WriteString("  },\n")
	prompt.WriteString("  \"summary\": \"描述修改内容\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("2. **file_create** - 创建文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_create\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"content\": \"完整文件内容\",\n")
	prompt.WriteString("  \"summary\": \"描述创建的文件\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("3. **file_delete** - 删除文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_delete\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"summary\": \"描述删除原因\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("4. **file_create_folder** - 创建文件夹\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_create_folder\",\n")
	prompt.WriteString("  \"path\": \"文件夹路径\",\n")
	prompt.WriteString("  \"summary\": \"描述创建原因\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("6. **shell_exec** - 执行shell命令\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"shell_exec\",\n")
	prompt.WriteString("  \"command\": \"要执行的命令\",\n")
	prompt.WriteString("  \"summary\": \"描述命令目的\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("7. **file_read** - 读取文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_read\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"summary\": \"描述为什么需要读取这个文件\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【输出格式】\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"status\": \"finish|retry\",\n")
	prompt.WriteString("  \"message\": \"状态说明\",\n")
	prompt.WriteString("  \"thinking\": {\n")
	prompt.WriteString("    \"analysis\": \"详细分析用户需求和当前代码状态\",\n")
	prompt.WriteString("    \"planning\": \"制定实现计划和步骤\",\n")
	prompt.WriteString("    \"considerations\": \"考虑的技术细节、依赖关系、潜在问题等\",\n")
	prompt.WriteString("    \"decisions\": \"关键决策和选择的理由\"\n")
	prompt.WriteString("  },\n")
	prompt.WriteString("  \"tools\": [\n")
	prompt.WriteString("    // 工具调用数组，按照上面的格式\n")
	prompt.WriteString("  ]\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【工作流程指南】\n")
	prompt.WriteString("1. **分析阶段**：\n")
	prompt.WriteString("   - 仔细阅读context中的文件内容，理解现有代码结构\n")
	prompt.WriteString("   - 查看file_tree了解项目整体布局\n")
	prompt.WriteString("   - 查看tool_history了解之前的操作和获取的信息\n")
	prompt.WriteString("   - 特别注意：tool_history中的file_read结果显示了实际读取到的文件内容\n")
	prompt.WriteString("   - 确定需要修改、创建或删除的文件\n\n")

	prompt.WriteString("2. **信息收集**：\n")
	prompt.WriteString("   - 如果context中的信息不足，使用file_read工具获取更多信息\n")
	prompt.WriteString("   - 优先读取配置文件（package.json, tsconfig.json, 等）了解项目配置\n")
	prompt.WriteString("   - 读取相关的组件或模块文件了解代码风格和模式\n")
	prompt.WriteString("   - 状态设为\"retry\"，等待工具执行结果\n")

	prompt.WriteString("3. **代码修改**：\n")
	prompt.WriteString("   - 使用file_write或file_create工具进行代码修改\n")
	prompt.WriteString("   - 保持代码风格与现有项目一致\n")
	prompt.WriteString("   - 修改完成后，使用shell_exec工具进行编译测试\n")
	prompt.WriteString("   - 如果编译有错误，根据错误信息继续修改\n\n")

	prompt.WriteString("4. **完成确认**：\n")
	prompt.WriteString("   - 所有修改完成后，使用shell_exec进行最终编译确认\n")
	prompt.WriteString("   - 确认没有错误后，状态设为\"finish\"\n")
	prompt.WriteString("   - 如果还有问题，状态设为\"retry\"继续处理\n\n")

	prompt.WriteString("【严格要求】\n")
	prompt.WriteString("1. 必须返回纯JSON格式，不要包含```json等markdown标记,并且里面的所有字段都是字符串格式！\n")
	prompt.WriteString("2. status字段必须是\"finish\"或\"retry\"\n")
	prompt.WriteString("3. 每次响应必须至少包含一个工具调用\n")
	prompt.WriteString("4. 如果信息不足，使用file_read工具获取信息，状态设为\"retry\"\n")
	prompt.WriteString("5. 如果完成所有修改，状态设为\"finish\"\n")
	prompt.WriteString("6. 所有工具调用必须包含summary字段说明目的\n")
	prompt.WriteString("7. 路径使用相对路径，以项目根目录为基准\n")
	prompt.WriteString("8. 编译测试使用shell_exec工具，命令用&&连接多个命令\n")
	prompt.WriteString("9. 如果编译有错误，根据错误信息继续修改\n")
	prompt.WriteString("10. 如果context里面存在的文件，就是你需要修改的文件\n")
	prompt.WriteString("11. 【新增】如果用户输入过于模糊（如：\"你好\"、\"测试\"、\"看看\"等），直接返回finish状态，message说明需要更具体的需求\n")

	prompt.WriteString("请根据以上要求，仔细分析用户需求，按照工作流程执行。每次响应必须包含至少一个工具调用。\n\n")

	// 在提示词的最后面添加工具调用历史记录（包含命令/输出/内容等完整信息）
	if len(toolHistory) > 0 {
		prompt.WriteString("【工具调用历史记录】\n")
		prompt.WriteString("以下是之前执行过的工具调用及其结果：\n\n")

		for i, record := range toolHistory {
			prompt.WriteString(fmt.Sprintf("工具调用 #%d:\n", i+1))
			prompt.WriteString(fmt.Sprintf("- 工具类型: %s\n", record.Tool))
			prompt.WriteString(fmt.Sprintf("- 文件路径: %s\n", record.Path))
			prompt.WriteString(fmt.Sprintf("- 执行状态: %s\n", record.Status))
			// 详细信息：命令/内容/输出
			if record.Tool == "shell_exec" {
				if record.Content != "" {
					prompt.WriteString(fmt.Sprintf("- 命令: %s\n", record.Content))
				}
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 输出: %v\n", record.Result))
				}
			} else if record.Tool == "file_create" || record.Tool == "file_write" {
				if record.Content != "" {
					prompt.WriteString("- 写入内容:\n")
					prompt.WriteString(record.Content)
					prompt.WriteString("\n")
				}
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 执行结果: %v\n", record.Result))
				}
			} else if record.Tool == "file_delete" {
				if record.Content != "" {
					prompt.WriteString("- 被删除文件原始内容:\n")
					prompt.WriteString(record.Content)
					prompt.WriteString("\n")
				}
				if record.Result != nil {
					prompt.WriteString(fmt.Sprintf("- 执行结果: %v\n", record.Result))
				}
			} else if record.Tool == "file_read" {
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
			prompt.WriteString(fmt.Sprintf("- 执行时间: %s\n", record.Timestamp.Format("2006-01-02 15:04:05")))
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

// 构建带对话历史的AI提示词
func (oem *OnlineEditorManager) buildAIPromptWithHistory(userPrompt, context string, fileContents map[string]string, conversationHistory []AIConversationMessage, toolHistory []ToolExecutionRecord) string {
	var prompt strings.Builder

	// 系统提示：强制输出纯JSON格式，并确保AI确认能够完成任务
	prompt.WriteString("你是一个专业的代码编辑助手。你必须严格按照以下要求执行：\n\n")
	prompt.WriteString("【重要原则】\n")
	prompt.WriteString("1. 每次响应必须包含至少一个工具调用\n")
	prompt.WriteString("2. 如果信息不足，使用file_read工具获取信息，状态设为\"retry\"\n")
	prompt.WriteString("3. 如果完成所有修改，状态设为\"finish\"\n")
	prompt.WriteString("4. 你的输出必须是完整的、可执行的、最终的结果\n")
	prompt.WriteString("5. 绝对不允许输出不完整、有错误或不确定的代码\n\n")
	prompt.WriteString("6. 输出的内容一定按照格式！！这是最重要的！！\n\n")

	// 添加对话历史
	if len(conversationHistory) > 0 {
		prompt.WriteString("【对话历史】\n")
		for _, message := range conversationHistory {
			if message.Type == "user" {
				prompt.WriteString(fmt.Sprintf("用户: %s\n", message.Content))
			} else if message.Type == "assistant" {
				prompt.WriteString(fmt.Sprintf("助手: %s\n", message.Content))
				// 如果有工具调用，也显示
				if len(message.Tools) > 0 {
					prompt.WriteString("工具调用:\n")
					for _, tool := range message.Tools {
						prompt.WriteString(fmt.Sprintf("  - %s: %s\n", tool.Name, tool.Status))
						// 尽可能展示详细参数与输出
						if tool.Parameters != nil {
							if p, ok := tool.Parameters.(map[string]interface{}); ok {
								if v, ok := p["path"].(string); ok && v != "" {
									prompt.WriteString(fmt.Sprintf("    • path: %s\n", v))
								}
								if v, ok := p["command"].(string); ok && v != "" {
									prompt.WriteString(fmt.Sprintf("    • command: %s\n", v))
								}
								if v, ok := p["content"].(string); ok && v != "" {
									prompt.WriteString("    • content:\n")
									prompt.WriteString(v)
									prompt.WriteString("\n")
								}
								if v, ok := p["original_content"].(string); ok && v != "" {
									prompt.WriteString("    • original_content:\n")
									prompt.WriteString(v)
									prompt.WriteString("\n")
								}
							}
						}
						if tool.Output != "" {
							prompt.WriteString("    • output:\n")
							prompt.WriteString(tool.Output)
							prompt.WriteString("\n")
						}
					}
				}
			}
		}
		prompt.WriteString("\n")
	}

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

	prompt.WriteString("  \"available_tools\": [\n")
	prompt.WriteString("    \"file_read\",\n")
	prompt.WriteString("    \"file_write\",\n")
	prompt.WriteString("    \"file_delete\",\n")
	prompt.WriteString("    \"file_create\",\n")
	prompt.WriteString("    \"file_create_folder\",\n")
	prompt.WriteString("    \"shell_exec\"\n")
	prompt.WriteString("  ]\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【字段含义说明】\n")
	prompt.WriteString("1. **context**: 用户主动选择或提供的核心文件内容，如果存在，就是你需要修改的内容！！里面所有的文件以及其内容都是完整的\n")
	prompt.WriteString("   - 格式：{\"文件路径\": \"文件完整内容\"}\n")
	prompt.WriteString("   - 用途：了解现有代码结构、依赖关系、编码风格等\n")
	prompt.WriteString("   - 注意：这些文件的内容是完整且准确的，可以直接基于此进行分析和修改！！\n\n")

	prompt.WriteString("2. **file_tree**: 项目的完整文件目录结构\n")
	prompt.WriteString("   - 格式：[\"相对路径1\", \"相对路径2\", ...]\n")
	prompt.WriteString("   - 用途：了解项目整体结构、找到相关文件、避免重复创建\n")
	prompt.WriteString("   - 注意：包含所有文件，但不包含文件内容，需要时请使用file_read工具\n\n")

	prompt.WriteString("3. **tool_history**: 之前的工具调用历史记录\n")
	prompt.WriteString("   - 包含之前所有工具调用的结果和状态\n")
	prompt.WriteString("   - 用于了解已经执行的操作和获取的信息\n")
	prompt.WriteString("   - 特别注意：file_read工具的结果会显示读取到的文件内容\n")
	prompt.WriteString("   - 这些是实际执行后的结果，不是AI的请求\n\n")

	prompt.WriteString("4. **available_tools**: 你可以使用的工具列表\n")
	prompt.WriteString("   - file_read: 读取指定文件的完整内容\n")
	prompt.WriteString("   - file_write: 写入/覆盖文件内容（需要提供完整内容）\n")
	prompt.WriteString("   - file_create: 创建新文件（需要提供完整内容）\n")
	prompt.WriteString("   - file_delete: 删除指定文件\n")
	prompt.WriteString("   - file_create_folder: 创建新文件夹\n")
	prompt.WriteString("   - shell_exec: 执行shell命令\n\n")

	prompt.WriteString("【用户需求】\n")
	prompt.WriteString(userPrompt)
	prompt.WriteString("\n\n")

	prompt.WriteString("【输出要求】\n")
	prompt.WriteString("请仔细分析用户需求和项目信息，并详细记录你的思考过程。输出以下JSON格式：\n\n")

	prompt.WriteString("【状态说明】\n")
	prompt.WriteString("- status: \"finish\" - 表示所有操作完成，可以返回结果给用户\n")
	prompt.WriteString("- status: \"retry\" - 表示需要更多信息或执行工具调用，需要继续处理\n")
	prompt.WriteString("- 【新增】如果用户输入过于模糊或无法理解，直接返回finish状态，不要retry\n\n")

	prompt.WriteString("【工具调用格式】\n")
	prompt.WriteString("tools数组中的每个工具调用必须按照以下格式：\n\n")

	prompt.WriteString("1. **file_write** - 写入文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_write\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"code\": {\n")
	prompt.WriteString("    \"originalCode\": \"原始代码\",\n")
	prompt.WriteString("    \"newCode\": \"新代码\"\n")
	prompt.WriteString("  }\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("2. **file_create** - 创建文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_create\",\n")
	prompt.WriteString("  \"path\": \"文件路径\",\n")
	prompt.WriteString("  \"content\": \"文件内容\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("3. **file_delete** - 删除文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_delete\",\n")
	prompt.WriteString("  \"path\": \"文件路径\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("4. **file_read** - 读取文件\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_read\",\n")
	prompt.WriteString("  \"path\": \"文件路径\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("5. **file_create_folder** - 创建文件夹\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"file_create_folder\",\n")
	prompt.WriteString("  \"path\": \"文件夹路径\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("6. **shell_exec** - 执行shell命令\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"type\": \"shell_exec\",\n")
	prompt.WriteString("  \"command\": \"shell命令\"\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【输出格式】\n")
	prompt.WriteString("{\n")
	prompt.WriteString("  \"status\": \"finish\",\n")
	prompt.WriteString("  \"message\": \"操作完成描述\",\n")
	prompt.WriteString("  \"tools\": [\n")
	prompt.WriteString("    // 工具调用数组\n")
	prompt.WriteString("  ],\n")
	prompt.WriteString("  \"thinking\": {\n")
	prompt.WriteString("    \"analysis\": \"分析过程\",\n")
	prompt.WriteString("    \"planning\": \"执行计划\",\n")
	prompt.WriteString("    \"considerations\": \"考虑因素\",\n")
	prompt.WriteString("    \"decisions\": \"决策过程\",\n")
	prompt.WriteString("    \"missing_info\": \"缺失信息\",\n")
	prompt.WriteString("    \"next_steps\": \"下一步行动\"\n")
	prompt.WriteString("  }\n")
	prompt.WriteString("}\n\n")

	prompt.WriteString("【严格要求】\n")
	prompt.WriteString("1. 必须返回纯JSON格式，不要包含```json等markdown标记\n")
	prompt.WriteString("2. status字段必须是\"finish\"或\"retry\"\n")
	prompt.WriteString("3. 每次响应必须至少包含一个工具调用\n")
	prompt.WriteString("4. 如果信息不足，使用file_read工具获取信息，状态设为\"retry\"\n")
	prompt.WriteString("5. 如果完成所有修改，状态设为\"finish\"\n")
	prompt.WriteString("6. 【新增】如果用户输入过于模糊（如：\"你好\"、\"测试\"、\"看看\"等），直接返回finish状态，message说明需要更具体的需求\n\n")
	prompt.WriteString("请根据以上要求，输出完整的JSON格式响应。\n")

	return prompt.String()
}
