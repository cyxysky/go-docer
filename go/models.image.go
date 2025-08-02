package main

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	imageTypes "github.com/docker/docker/api/types/image"
)

// 镜像配置结构
type ImageConfig struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Shell       string            `json:"shell"`
	Environment map[string]string `json:"environment"`
	Tags        []string          `json:"tags,omitempty"`
	Size        int64             `json:"size,omitempty"`
	Created     time.Time         `json:"created,omitempty"`
	IsCustom    bool              `json:"is_custom"`
}

// 自定义镜像请求
type CustomImageRequest struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Shell       string            `json:"shell"`
	Environment map[string]string `json:"environment"`
}

// Docker镜像搜索相关的数据结构
type DockerHubSearchRequest struct {
	Query    string `json:"query"`
	Limit    int    `json:"limit,omitempty"`
	Registry string `json:"registry,omitempty"` // 镜像源配置
}

type DockerHubSearchResult struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Stars       int    `json:"star_count"`
	Official    bool   `json:"is_official"`
	Automated   bool   `json:"is_automated"`
	Pulls       int    `json:"pull_count"`
}

type DockerHubSearchResponse struct {
	Results []DockerHubSearchResult `json:"results"`
	Count   int                     `json:"count"`
}

// 镜像源配置
type RegistryConfig struct {
	Name        string `json:"name"`        // 显示名称
	Code        string `json:"code"`        // 代码标识
	BaseURL     string `json:"base_url"`    // 镜像基础URL
	Description string `json:"description"` // 描述
	Type        string `json:"type"`        // 类型：docker_cli, api, registry
	Enabled     bool   `json:"enabled"`     // 是否启用
	IsDefault   bool   `json:"is_default"`  // 是否为默认源（不可删除）
}

// 镜像源操作请求
type RegistryRequest struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	BaseURL     string `json:"base_url"`
	Description string `json:"description"`
	Type        string `json:"type"`
}

// 镜像源管理器
type RegistryManager struct {
	registries map[string]*RegistryConfig
	mutex      sync.RWMutex
}

// 创建镜像源管理器
func NewRegistryManager() *RegistryManager {
	rm := &RegistryManager{
		registries: make(map[string]*RegistryConfig),
		mutex:      sync.RWMutex{},
	}

	// 注册预设镜像源
	for _, registry := range presetRegistries {
		rm.registries[registry.Code] = registry
	}

	return rm
}

// 添加自定义镜像
func (oem *OnlineEditorManager) AddCustomImage(req CustomImageRequest) (*ImageConfig, error) {
	// 验证镜像名称格式
	if req.Name == "" {
		return nil, fmt.Errorf("镜像名称不能为空")
	}

	// 设置默认值
	if req.Shell == "" {
		req.Shell = "/bin/bash"
	}
	if req.Description == "" {
		req.Description = fmt.Sprintf("自定义镜像 %s", req.Name)
	}
	if req.Environment == nil {
		req.Environment = make(map[string]string)
	}

	// 尝试拉取镜像
	ctx := context.Background()
	log.Printf("开始拉取自定义镜像: %s", req.Name)

	actualImageName, err := oem.pullImageWithFallback(ctx, req.Name)
	if err != nil {
		return nil, fmt.Errorf("拉取镜像失败: %v", err)
	}

	// 获取镜像信息
	imageInfo, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, actualImageName)
	if err != nil {
		return nil, fmt.Errorf("获取镜像信息失败: %v", err)
	}

	// 创建镜像配置
	config := &ImageConfig{
		Name:        req.Name,
		Description: req.Description,
		Shell:       req.Shell,
		Environment: req.Environment,
		Size:        imageInfo.Size,
		Created:     time.Now(), // 使用当前时间作为添加时间
		IsCustom:    true,
	}

	// 保存到自定义镜像列表
	oem.customImagesMutex.Lock()
	oem.customImages[req.Name] = config
	oem.customImagesMutex.Unlock()

	log.Printf("自定义镜像添加成功: %s", req.Name)
	return config, nil
}

// 获取所有可用镜像配置
func (oem *OnlineEditorManager) GetAvailableImages() ([]*ImageConfig, error) {
	var images []*ImageConfig

	// 添加自定义镜像配置
	oem.customImagesMutex.RLock()
	for _, config := range oem.customImages {
		images = append(images, config)
	}
	oem.customImagesMutex.RUnlock()

	// 添加Docker中的实际镜像
	ctx := context.Background()
	dockerImages, err := oem.dockerClient.ImageList(ctx, imageTypes.ListOptions{})
	if err != nil {
		oem.logError("获取Docker镜像列表", err)
		return images, nil // 即使Docker镜像获取失败，也返回自定义配置
	}

	for _, dockerImage := range dockerImages {
		// 获取镜像详细信息（暂时不使用，但保留用于未来扩展）
		_, _, err := oem.dockerClient.ImageInspectWithRaw(ctx, dockerImage.ID)
		if err != nil {
			continue
		}

		// 获取镜像标签
		var tags []string
		if len(dockerImage.RepoTags) > 0 {
			tags = dockerImage.RepoTags
		} else {
			tags = []string{dockerImage.ID[:12]} // 使用短ID作为标签
		}

		// 为每个标签创建一个配置
		for _, tag := range tags {
			// 检查是否已经存在（避免重复）
			exists := false
			for _, existingImage := range images {
				if existingImage.Name == tag {
					exists = true
					break
				}
			}

			if !exists {
				// 根据镜像名称设置特定的环境变量
				if strings.Contains(tag, "node") {
					defaultEnvVars["NODE_ENV"] = "development"
					defaultEnvVars["NPM_CONFIG_PREFIX"] = "/usr/local"
				} else if strings.Contains(tag, "python") {
					defaultEnvVars["PYTHONPATH"] = "/workspace"
					defaultEnvVars["PYTHONUNBUFFERED"] = "1"
					defaultEnvVars["PIP_NO_CACHE_DIR"] = "1"
				} else if strings.Contains(tag, "golang") {
					defaultEnvVars["GOPATH"] = "/go"
					defaultEnvVars["GOROOT"] = "/usr/local/go"
					defaultEnvVars["CGO_ENABLED"] = "0"
				} else if strings.Contains(tag, "openjdk") || strings.Contains(tag, "java") {
					defaultEnvVars["JAVA_HOME"] = "/usr/local/openjdk-17"
					defaultEnvVars["MAVEN_HOME"] = "/usr/share/maven"
				} else if strings.Contains(tag, "php") {
					defaultEnvVars["PHP_INI_DIR"] = "/usr/local/etc/php"
					defaultEnvVars["PHP_CFLAGS"] = "-fstack-protector-strong -fpic -fpie -O2"
				} else if strings.Contains(tag, "ruby") {
					defaultEnvVars["RUBY_VERSION"] = "3.2"
					defaultEnvVars["GEM_HOME"] = "/usr/local/bundle"
				}

				images = append(images, &ImageConfig{
					Name:        tag,
					Description: fmt.Sprintf("Docker镜像: %s", tag),
					Shell:       "/bin/bash",
					Environment: defaultEnvVars,
					Tags:        []string{tag},
					Size:        dockerImage.Size,
					Created:     time.Unix(dockerImage.Created, 0),
					IsCustom:    false,
				})
			}
		}
	}

	return images, nil
}

// 获取所有镜像源
func (rm *RegistryManager) GetAllRegistries() []*RegistryConfig {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()

	var registries []*RegistryConfig
	for _, registry := range rm.registries {
		registries = append(registries, registry)
	}
	return registries
}

// 获取启用的镜像源
func (rm *RegistryManager) GetEnabledRegistries() []*RegistryConfig {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()

	var registries []*RegistryConfig
	for _, registry := range rm.registries {
		if registry.Enabled {
			registries = append(registries, registry)
		}
	}
	return registries
}

// 获取指定镜像源
func (rm *RegistryManager) GetRegistry(code string) *RegistryConfig {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()

	if registry, exists := rm.registries[code]; exists {
		return registry
	}
	return nil
}

// 更新镜像源状态
func (rm *RegistryManager) UpdateRegistryStatus(code string, enabled bool) error {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	if registry, exists := rm.registries[code]; exists {
		registry.Enabled = enabled
		return nil
	}
	return fmt.Errorf("镜像源不存在: %s", code)
}

// 添加镜像源
func (rm *RegistryManager) AddRegistry(req RegistryRequest) error {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	// 检查代码是否已存在
	if _, exists := rm.registries[req.Code]; exists {
		return fmt.Errorf("镜像源代码已存在: %s", req.Code)
	}

	// 验证必要字段
	if req.Name == "" || req.Code == "" || req.BaseURL == "" {
		return fmt.Errorf("名称、代码和基础URL不能为空")
	}

	registry := &RegistryConfig{
		Name:        req.Name,
		Code:        req.Code,
		BaseURL:     req.BaseURL,
		Description: req.Description,
		Type:        req.Type,
		Enabled:     true,
		IsDefault:   false,
	}

	rm.registries[req.Code] = registry
	return nil
}

// 更新镜像源
func (rm *RegistryManager) UpdateRegistry(code string, req RegistryRequest) error {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	registry, exists := rm.registries[code]
	if !exists {
		return fmt.Errorf("镜像源不存在: %s", code)
	}

	// 验证必要字段
	if req.Name == "" || req.BaseURL == "" {
		return fmt.Errorf("名称和基础URL不能为空")
	}

	// 更新字段
	registry.Name = req.Name
	registry.BaseURL = req.BaseURL
	registry.Description = req.Description
	registry.Type = req.Type

	return nil
}

// 删除镜像源
func (rm *RegistryManager) DeleteRegistry(code string) error {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	registry, exists := rm.registries[code]
	if !exists {
		return fmt.Errorf("镜像源不存在: %s", code)
	}

	// 默认镜像源不能删除
	if registry.IsDefault {
		return fmt.Errorf("默认镜像源不能删除: %s", code)
	}

	delete(rm.registries, code)
	return nil
}

// DeleteCustomImage 删除自定义镜像配置
func (oem *OnlineEditorManager) DeleteCustomImage(imageName string) error {
	oem.customImagesMutex.Lock()
	defer oem.customImagesMutex.Unlock()

	if _, exists := oem.customImages[imageName]; !exists {
		return fmt.Errorf("custom image configuration not found: %s", imageName)
	}

	delete(oem.customImages, imageName)
	return nil
}

// UpdateCustomImage 更新自定义镜像配置
func (oem *OnlineEditorManager) UpdateCustomImage(imageName string, req CustomImageRequest) (*ImageConfig, error) {
	oem.customImagesMutex.Lock()
	defer oem.customImagesMutex.Unlock()

	existingConfig, exists := oem.customImages[imageName]
	if !exists {
		return nil, fmt.Errorf("custom image configuration not found: %s", imageName)
	}

	// 更新配置
	updatedConfig := &ImageConfig{
		Name:        imageName, // 不允许修改名称
		Description: req.Description,
		Shell:       req.Shell,
		Environment: req.Environment,
		Tags:        existingConfig.Tags,
		Size:        existingConfig.Size,
		Created:     existingConfig.Created,
		IsCustom:    true,
	}

	oem.customImages[imageName] = updatedConfig
	return updatedConfig, nil
}

// 镜像管理相关方法
func (oem *OnlineEditorManager) PullImage(imageName string) error {
	ctx := context.Background()
	_, err := oem.pullImageWithFallback(ctx, imageName)
	return err
}

// 删除镜像
func (oem *OnlineEditorManager) DeleteImage(imageID string) error {
	ctx := context.Background()
	_, err := oem.dockerClient.ImageRemove(ctx, imageID, imageTypes.RemoveOptions{})
	if err != nil {
		return fmt.Errorf("删除镜像失败: %v", err)
	}
	return nil
}

// 导入镜像
func (oem *OnlineEditorManager) ImportImage(tarFilePath string, userImageName string) (string, error) {
	// 设置超时上下文，最多等待10分钟
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	log.Printf("开始导入镜像: %s", tarFilePath)

	// 使用Docker CLI命令导入镜像
	cmd := exec.CommandContext(ctx, "docker", "load", "-i", tarFilePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("镜像导入失败: %v, 输出: %s", err, string(output))
		return "", fmt.Errorf("failed to load image: %v, output: %s", err, string(output))
	}

	log.Printf("镜像导入成功，输出: %s", string(output))

	// 如果用户指定了镜像名称，使用用户指定的名称
	if userImageName != "" {
		log.Printf("使用用户指定的镜像名称: %s", userImageName)

		// 从输出中提取原始镜像ID
		outputStr := string(output)
		var originalImageID string
		if strings.Contains(outputStr, "Loaded image ID:") {
			parts := strings.Split(outputStr, "Loaded image ID:")
			if len(parts) > 1 {
				originalImageID = strings.TrimSpace(parts[1])
				originalImageID = strings.Trim(originalImageID, "\n\r\"'")
			}
		}

		if originalImageID != "" {
			// 使用docker tag命令给镜像打标签
			tagCmd := exec.CommandContext(ctx, "docker", "tag", originalImageID, userImageName)
			tagOutput, tagErr := tagCmd.CombinedOutput()
			if tagErr != nil {
				log.Printf("给镜像打标签失败: %v, 输出: %s", tagErr, string(tagOutput))
				// 即使打标签失败，也返回原始镜像名称
				return originalImageID, nil
			}
			log.Printf("镜像标签设置成功: %s", userImageName)
			return userImageName, nil
		}
	}

	// 从输出中提取镜像名称
	outputStr := string(output)
	if strings.Contains(outputStr, "Loaded image:") {
		parts := strings.Split(outputStr, "Loaded image:")
		if len(parts) > 1 {
			imageName := strings.TrimSpace(parts[1])
			// 移除可能的换行符和引号
			imageName = strings.Trim(imageName, "\n\r\"'")
			log.Printf("提取到镜像名称: %s", imageName)
			return imageName, nil
		}
	}

	log.Printf("未找到镜像名称，使用默认名称")
	return "imported-image", nil
}

// 使用Docker CLI拉取镜像，支持镜像加速器
func (oem *OnlineEditorManager) pullImageWithFallback(ctx context.Context, originalImage string) (string, error) {
	log.Printf("使用Docker CLI拉取镜像: %s", originalImage)

	// 设置超时
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	// 使用docker pull命令，这会自动使用配置的镜像加速器
	cmd := exec.CommandContext(ctx, "docker", "pull", originalImage)

	// 获取输出
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Docker pull失败: %v, 输出: %s", err, string(output))
		return "", fmt.Errorf("拉取镜像失败: %v", err)
	}

	log.Printf("Docker pull成功: %s", originalImage)

	return originalImage, nil
}
