package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// CLI 命令行接口
type CLI struct {
	manager *ContainerManager
}

// NewCLI 创建CLI实例
func NewCLI() (*CLI, error) {
	manager, err := NewContainerManager()
	if err != nil {
		return nil, err
	}
	return &CLI{manager: manager}, nil
}

// Run 运行CLI
func (cli *CLI) Run() {
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
	case "network":
		cli.manageNetwork(ctx)
	case "port":
		cli.managePorts(ctx)
	case "volume":
		cli.manageVolumes(ctx)
	case "interactive":
		cli.interactiveMode(ctx)
	default:
		fmt.Printf("未知命令: %s\n", command)
		cli.printUsage()
	}
}

// printUsage 打印使用说明
func (cli *CLI) printUsage() {
	fmt.Println("容器管理工具")
	fmt.Println("用法:")
	fmt.Println("  create     - 创建容器")
	fmt.Println("  start      - 启动容器")
	fmt.Println("  stop       - 停止容器")
	fmt.Println("  remove     - 删除容器")
	fmt.Println("  list       - 列出所有容器")
	fmt.Println("  logs       - 查看容器日志")
	fmt.Println("  exec       - 在容器中执行命令")
	fmt.Println("  stats      - 查看容器统计信息")
	fmt.Println("  network    - 管理网络")
	fmt.Println("  port       - 管理端口映射")
	fmt.Println("  volume     - 管理卷挂载")
	fmt.Println("  interactive - 交互模式")
}

// createContainer 创建容器
func (cli *CLI) createContainer(ctx context.Context) {
	fs := flag.NewFlagSet("create", flag.ExitOnError)
	name := fs.String("name", "", "容器名称")
	image := fs.String("image", "", "镜像名称")
	port := fs.String("port", "", "端口映射 (host:container)")
	volume := fs.String("volume", "", "卷挂载 (host:container)")
	network := fs.String("network", "bridge", "网络名称")
	cmd := fs.String("cmd", "", "启动命令")
	workingDir := fs.String("workdir", "", "工作目录")
	env := fs.String("env", "", "环境变量 (key=value,key=value)")

	fs.Parse(os.Args[2:])

	if *name == "" || *image == "" {
		fmt.Println("必须指定容器名称和镜像")
		return
	}

	config := &ContainerConfig{
		Name:       *name,
		Image:      *image,
		Network:    *network,
		WorkingDir: *workingDir,
	}

	// 解析端口映射
	if *port != "" {
		parts := strings.Split(*port, ":")
		if len(parts) == 2 {
			config.Ports = []PortMapping{
				{
					HostPort:      parts[0],
					ContainerPort: parts[1],
					Protocol:      "tcp",
				},
			}
		}
	}

	// 解析卷挂载
	if *volume != "" {
		parts := strings.Split(*volume, ":")
		if len(parts) == 2 {
			config.Volumes = []VolumeMount{
				{
					HostPath:      parts[0],
					ContainerPath: parts[1],
					ReadOnly:      false,
				},
			}
		}
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

	fmt.Printf("容器创建成功: %s (ID: %s)\n", container.Name, container.ID[:12])
}

// startContainer 启动容器
func (cli *CLI) startContainer(ctx context.Context) {
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
func (cli *CLI) stopContainer(ctx context.Context) {
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
func (cli *CLI) removeContainer(ctx context.Context) {
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
func (cli *CLI) listContainers(ctx context.Context) {
	containers, err := cli.manager.ListContainers(ctx)
	if err != nil {
		log.Printf("获取容器列表失败: %v", err)
		return
	}

	fmt.Printf("%-12s %-20s %-20s %-10s %-20s\n", "ID", "名称", "镜像", "状态", "创建时间")
	fmt.Println(strings.Repeat("-", 85))

	for _, container := range containers {
		fmt.Printf("%-12s %-20s %-20s %-10s %-20s\n",
			container.ID[:12],
			container.Name,
			container.Image,
			container.Status,
			container.Created.Format("2006-01-02 15:04:05"))
	}
}

// getLogs 获取日志
func (cli *CLI) getLogs(ctx context.Context) {
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
func (cli *CLI) executeCommand(ctx context.Context) {
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
func (cli *CLI) getStats(ctx context.Context) {
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

	// 格式化输出统计信息
	statsJSON, _ := json.MarshalIndent(stats, "", "  ")
	fmt.Println(string(statsJSON))
}

// manageNetwork 管理网络
func (cli *CLI) manageNetwork(ctx context.Context) {
	if len(os.Args) < 3 {
		fmt.Println("网络管理命令:")
		fmt.Println("  create -name <name> -driver <driver> -subnet <subnet>")
		fmt.Println("  connect -network <network> -container <container>")
		return
	}

	subCommand := os.Args[2]
	switch subCommand {
	case "create":
		cli.createNetwork(ctx)
	case "connect":
		cli.connectToNetwork(ctx)
	default:
		fmt.Printf("未知网络命令: %s\n", subCommand)
	}
}

// createNetwork 创建网络
func (cli *CLI) createNetwork(ctx context.Context) {
	fs := flag.NewFlagSet("network-create", flag.ExitOnError)
	name := fs.String("name", "", "网络名称")
	driver := fs.String("driver", "bridge", "网络驱动")
	subnet := fs.String("subnet", "172.18.0.0/16", "子网")

	fs.Parse(os.Args[3:])

	if *name == "" {
		fmt.Println("必须指定网络名称")
		return
	}

	network, err := cli.manager.CreateNetwork(ctx, *name, *driver, *subnet)
	if err != nil {
		log.Printf("创建网络失败: %v", err)
		return
	}

	fmt.Printf("网络创建成功: %s (ID: %s)\n", network.Name, network.ID[:12])
}

// connectToNetwork 连接到网络
func (cli *CLI) connectToNetwork(ctx context.Context) {
	fs := flag.NewFlagSet("network-connect", flag.ExitOnError)
	networkName := fs.String("network", "", "网络名称")
	containerID := fs.String("container", "", "容器ID")

	fs.Parse(os.Args[3:])

	if *networkName == "" || *containerID == "" {
		fmt.Println("必须指定网络名称和容器ID")
		return
	}

	err := cli.manager.ConnectContainerToNetwork(ctx, *containerID, *networkName)
	if err != nil {
		log.Printf("连接网络失败: %v", err)
		return
	}

	fmt.Printf("容器 %s 成功连接到网络 %s\n", *containerID, *networkName)
}

// managePorts 管理端口
func (cli *CLI) managePorts(ctx context.Context) {
	fmt.Println("端口管理功能:")
	fmt.Println("  端口映射在创建容器时通过 -port 参数指定")
	fmt.Println("  格式: -port hostPort:containerPort")
	fmt.Println("  示例: -port 8080:80")
}

// manageVolumes 管理卷
func (cli *CLI) manageVolumes(ctx context.Context) {
	fmt.Println("卷管理功能:")
	fmt.Println("  卷挂载在创建容器时通过 -volume 参数指定")
	fmt.Println("  格式: -volume hostPath:containerPath")
	fmt.Println("  示例: -volume /tmp/data:/app/data")
}

// interactiveMode 交互模式
func (cli *CLI) interactiveMode(ctx context.Context) {
	fmt.Println("进入交互模式 (输入 'help' 查看命令, 'exit' 退出)")
	
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("container-manager> ")
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
		os.Args = append([]string{"container-manager"}, args...)
		
		// 执行命令
		cli.executeInteractiveCommand(ctx, args[0], args[1:])
		
		// 恢复原始参数
		os.Args = originalArgs
	}
}

// executeInteractiveCommand 执行交互式命令
func (cli *CLI) executeInteractiveCommand(ctx context.Context, command string, args []string) {
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
			container, err := cli.manager.CreateContainer(ctx, config)
			if err != nil {
				fmt.Printf("创建失败: %v\n", err)
			} else {
				fmt.Printf("创建成功: %s\n", container.Name)
			}
		} else {
			fmt.Println("用法: create <name> <image>")
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
	default:
		fmt.Printf("未知命令: %s\n", command)
	}
}

// printInteractiveHelp 打印交互式帮助
func (cli *CLI) printInteractiveHelp() {
	fmt.Println("可用命令:")
	fmt.Println("  list                    - 列出所有容器")
	fmt.Println("  create <name> <image>   - 创建容器")
	fmt.Println("  start <container-id>    - 启动容器")
	fmt.Println("  stop <container-id>     - 停止容器")
	fmt.Println("  logs <container-id> [n] - 查看容器日志")
	fmt.Println("  help                    - 显示此帮助")
	fmt.Println("  exit                    - 退出")
} 