package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// SimpleCLI 简化版命令行接口
type SimpleCLI struct {
	manager *SimpleContainerManager
}

// NewSimpleCLI 创建简化版CLI实例
func NewSimpleCLI() (*SimpleCLI, error) {
	manager, err := NewSimpleContainerManager()
	if err != nil {
		return nil, err
	}
	return &SimpleCLI{manager: manager}, nil
}

// Run 运行CLI
func (cli *SimpleCLI) Run() {
	if len(os.Args) < 2 {
		cli.printUsage()
		return
	}

	command := os.Args[1]
	ctx := context.Background()

	switch command {
	case "create":
		cli.createContainer(ctx)
	case "start":
		cli.startContainer(ctx)
	case "stop":
		cli.stopContainer(ctx)
	case "remove":
		cli.removeContainer(ctx)
	case "list":
		cli.listContainers(ctx)
	case "logs":
		cli.getLogs(ctx)
	case "exec":
		cli.executeCommand(ctx)
	case "stats":
		cli.getStats(ctx)
	case "interactive":
		cli.interactiveMode(ctx)
	default:
		fmt.Printf("未知命令: %s\n", command)
		cli.printUsage()
	}
}

// printUsage 打印使用说明
func (cli *SimpleCLI) printUsage() {
	fmt.Println("简化版容器管理工具")
	fmt.Println("用法:")
	fmt.Println("  create     - 创建容器")
	fmt.Println("  start      - 启动容器")
	fmt.Println("  stop       - 停止容器")
	fmt.Println("  remove     - 删除容器")
	fmt.Println("  list       - 列出所有容器")
	fmt.Println("  logs       - 查看容器日志")
	fmt.Println("  exec       - 在容器中执行命令")
	fmt.Println("  stats      - 查看容器统计信息")
	fmt.Println("  interactive - 交互模式")
}

// createContainer 创建容器
func (cli *SimpleCLI) createContainer(ctx context.Context) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	name := fs.String("name", "", "容器名称")
	image := fs.String("image", "", "镜像名称（仅用于标识）")
	cmd := fs.String("cmd", "", "启动命令")
	workdir := fs.String("workdir", "", "工作目录")
	env := fs.String("env", "", "环境变量 (key=value,key=value)")

	fs.Parse(os.Args[2:])

	if *name == "" {
		fmt.Println("必须指定容器名称")
		return
	}

	config := &ContainerConfig{
		Name:       *name,
		Image:      *image,
		WorkingDir: *workdir,
	}

	// 解析命令
	if *cmd != "" {
		config.Command = strings.Split(*cmd, " ")
	}

	// 解析环境变量
	if *env != "" {
		config.Environment = make(map[string]string)
		pairs := strings.Split(*env, ",")
		for _, pair := range pairs {
			kv := strings.Split(pair, "=")
			if len(kv) == 2 {
				config.Environment[kv[0]] = kv[1]
			}
		}
	}

	container, err := cli.manager.CreateContainer(ctx, config)
	if err != nil {
		log.Printf("创建容器失败: %v", err)
		return
	}

	fmt.Printf("容器创建成功: %s (ID: %s)\n", container.Name, container.ID)
}

// startContainer 启动容器
func (cli *SimpleCLI) startContainer(ctx context.Context) {
	fs := flag.NewFlagSet("start", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	err := cli.manager.StartContainer(ctx, *containerID)
	if err != nil {
		log.Printf("启动容器失败: %v", err)
		return
	}

	fmt.Printf("容器启动成功: %s\n", *containerID)
}

// stopContainer 停止容器
func (cli *SimpleCLI) stopContainer(ctx context.Context) {
	fs := flag.NewFlagSet("stop", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	timeout := fs.Int("timeout", 10, "停止超时时间(秒)")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	t := time.Duration(*timeout) * time.Second
	err := cli.manager.StopContainer(ctx, *containerID, &t)
	if err != nil {
		log.Printf("停止容器失败: %v", err)
		return
	}

	fmt.Printf("容器停止成功: %s\n", *containerID)
}

// removeContainer 删除容器
func (cli *SimpleCLI) removeContainer(ctx context.Context) {
	fs := flag.NewFlagSet("remove", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	force := fs.Bool("force", false, "强制删除")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	err := cli.manager.RemoveContainer(ctx, *containerID, *force)
	if err != nil {
		log.Printf("删除容器失败: %v", err)
		return
	}

	fmt.Printf("容器删除成功: %s\n", *containerID)
}

// listContainers 列出容器
func (cli *SimpleCLI) listContainers(ctx context.Context) {
	containers, err := cli.manager.ListContainers(ctx)
	if err != nil {
		log.Printf("获取容器列表失败: %v", err)
		return
	}

	if len(containers) == 0 {
		fmt.Println("没有找到容器")
		return
	}

	fmt.Printf("%-20s %-20s %-15s %-10s %-20s\n", "ID", "名称", "镜像", "状态", "创建时间")
	fmt.Println(strings.Repeat("-", 90))

	for _, container := range containers {
		fmt.Printf("%-20s %-20s %-15s %-10s %-20s\n",
			container.ID,
			container.Name,
			container.Image,
			container.Status,
			container.Created.Format("2006-01-02 15:04:05"))
	}
}

// getLogs 获取日志
func (cli *SimpleCLI) getLogs(ctx context.Context) {
	fs := flag.NewFlagSet("logs", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	tail := fs.Int("tail", 100, "显示最后N行日志")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	logs, err := cli.manager.GetContainerLogs(ctx, *containerID, *tail)
	if err != nil {
		log.Printf("获取日志失败: %v", err)
		return
	}

	for _, log := range logs {
		fmt.Println(log)
	}
}

// executeCommand 执行命令
func (cli *SimpleCLI) executeCommand(ctx context.Context) {
	fs := flag.NewFlagSet("exec", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")
	command := fs.String("cmd", "", "要执行的命令")

	fs.Parse(os.Args[2:])

	if *containerID == "" || *command == "" {
		fmt.Println("必须指定容器ID和命令")
		return
	}

	cmdParts := strings.Split(*command, " ")
	output, err := cli.manager.ExecuteCommand(ctx, *containerID, cmdParts)
	if err != nil {
		log.Printf("执行命令失败: %v", err)
		return
	}

	fmt.Println(output)
}

// getStats 获取统计信息
func (cli *SimpleCLI) getStats(ctx context.Context) {
	fs := flag.NewFlagSet("stats", flag.ExitOnError)
	containerID := fs.String("id", "", "容器ID或名称")

	fs.Parse(os.Args[2:])

	if *containerID == "" {
		fmt.Println("必须指定容器ID或名称")
		return
	}

	stats, err := cli.manager.GetContainerStats(ctx, *containerID)
	if err != nil {
		log.Printf("获取统计信息失败: %v", err)
		return
	}

	fmt.Printf("容器统计信息:\n")
	for key, value := range stats {
		fmt.Printf("  %s: %v\n", key, value)
	}
}

// interactiveMode 交互模式
func (cli *SimpleCLI) interactiveMode(ctx context.Context) {
	fmt.Println("进入交互模式 (输入 'help' 查看命令, 'exit' 退出)")
	
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("simple-container> ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		if input == "exit" || input == "quit" {
			break
		}

		if input == "help" {
			cli.printInteractiveHelp()
			continue
		}

		// 解析并执行命令
		args := strings.Fields(input)
		if len(args) == 0 {
			continue
		}

		// 临时修改 os.Args 来复用现有的命令处理逻辑
		originalArgs := os.Args
		os.Args = append([]string{"simple-container"}, args...)
		
		// 执行命令
		cli.executeInteractiveCommand(ctx, args[0], args[1:])
		
		// 恢复原始参数
		os.Args = originalArgs
	}
}

// executeInteractiveCommand 执行交互式命令
func (cli *SimpleCLI) executeInteractiveCommand(ctx context.Context, command string, args []string) {
	switch command {
	case "list":
		cli.listContainers(ctx)
	case "create":
		// 简化版创建命令
		if len(args) >= 2 {
			config := &ContainerConfig{
				Name:  args[0],
				Image: args[1],
			}
			if len(args) >= 3 {
				config.Command = args[2:]
			}
			container, err := cli.manager.CreateContainer(ctx, config)
			if err != nil {
				fmt.Printf("创建失败: %v\n", err)
			} else {
				fmt.Printf("创建成功: %s (ID: %s)\n", container.Name, container.ID)
			}
		} else {
			fmt.Println("用法: create <name> <image> [command...]")
		}
	case "start":
		if len(args) >= 1 {
			err := cli.manager.StartContainer(ctx, args[0])
			if err != nil {
				fmt.Printf("启动失败: %v\n", err)
			} else {
				fmt.Printf("启动成功: %s\n", args[0])
			}
		} else {
			fmt.Println("用法: start <container-id>")
		}
	case "stop":
		if len(args) >= 1 {
			err := cli.manager.StopContainer(ctx, args[0], nil)
			if err != nil {
				fmt.Printf("停止失败: %v\n", err)
			} else {
				fmt.Printf("停止成功: %s\n", args[0])
			}
		} else {
			fmt.Println("用法: stop <container-id>")
		}
	case "logs":
		if len(args) >= 1 {
			tail := 50
			if len(args) >= 2 {
				if t, err := strconv.Atoi(args[1]); err == nil {
					tail = t
				}
			}
			logs, err := cli.manager.GetContainerLogs(ctx, args[0], tail)
			if err != nil {
				fmt.Printf("获取日志失败: %v\n", err)
			} else {
				for _, log := range logs {
					fmt.Println(log)
				}
			}
		} else {
			fmt.Println("用法: logs <container-id> [tail-lines]")
		}
	case "exec":
		if len(args) >= 2 {
			output, err := cli.manager.ExecuteCommand(ctx, args[0], args[1:])
			if err != nil {
				fmt.Printf("执行失败: %v\n", err)
			} else {
				fmt.Println(output)
			}
		} else {
			fmt.Println("用法: exec <container-id> <command...>")
		}
	case "stats":
		if len(args) >= 1 {
			stats, err := cli.manager.GetContainerStats(ctx, args[0])
			if err != nil {
				fmt.Printf("获取统计信息失败: %v\n", err)
			} else {
				for key, value := range stats {
					fmt.Printf("  %s: %v\n", key, value)
				}
			}
		} else {
			fmt.Println("用法: stats <container-id>")
		}
	default:
		fmt.Printf("未知命令: %s\n", command)
	}
}

// printInteractiveHelp 打印交互式帮助
func (cli *SimpleCLI) printInteractiveHelp() {
	fmt.Println("可用命令:")
	fmt.Println("  list                           - 列出所有容器")
	fmt.Println("  create <name> <image> [cmd...] - 创建容器")
	fmt.Println("  start <container-id>           - 启动容器")
	fmt.Println("  stop <container-id>            - 停止容器")
	fmt.Println("  logs <container-id> [n]        - 查看容器日志")
	fmt.Println("  exec <container-id> <cmd...>   - 在容器中执行命令")
	fmt.Println("  stats <container-id>           - 查看容器统计信息")
	fmt.Println("  help                           - 显示此帮助")
	fmt.Println("  exit                           - 退出")
} 