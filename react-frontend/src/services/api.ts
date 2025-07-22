// API服务层 - 统一管理所有API调用

const API_BASE_URL = '/api/v1';

// 通用请求方法
const request = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }

    // 检查响应内容类型
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonData = await response.json();
      return jsonData;
    }
    
    // 如果不是 JSON，尝试解析为 JSON（某些 API 可能没有设置正确的 content-type）
    const textData = await response.text();
    try {
      return JSON.parse(textData);
    } catch {
      // 如果解析失败，返回原始文本
      return textData;
    }
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
};

// 工作空间相关API
export const workspaceAPI = {
  // 获取工作空间列表
  getWorkspaces: () => request('/workspaces'),
  
  // 创建工作空间
  createWorkspace: (data: {
    name: string;
    image: string;
    git_repo?: string;
    git_branch?: string;
    tools?: string[];
  }) => request('/workspaces', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  // 启动工作空间
  startWorkspace: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/start`, { method: 'POST' }),
  
  // 停止工作空间
  stopWorkspace: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/stop`, { method: 'POST' }),
  
  // 删除工作空间
  deleteWorkspace: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}`, { method: 'DELETE' }),

  // 更新端口绑定
  updatePortBindings: (workspaceId: string, ports: Array<{containerPort: string, hostPort: string, protocol: string}>) =>
    request(`/workspaces/${workspaceId}/ports`, {
      method: 'PUT',
      body: JSON.stringify({ ports: ports.map(p => ({
        container_port: p.containerPort,
        host_port: p.hostPort,
        protocol: p.protocol,
        public_access: p.hostPort !== ''
      })) }),
    }),

  // 切换收藏状态
  toggleFavorite: (workspaceId: string) =>
    request(`/workspaces/${workspaceId}/favorite`, { method: 'POST' }),

  // 测试端口
  testPort: (workspaceId: string, port: string) =>
    request(`/workspaces/${workspaceId}/test-port/${port}`, { method: 'POST' }),
};

// 文件相关API
export const fileAPI = {
  // 获取文件树
  getFileTree: (workspaceId: string, path: string = '') => 
    request(`/workspaces/${workspaceId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  
  // 读取文件内容
  readFile: (workspaceId: string, filePath: string) => 
    request(`/workspaces/${workspaceId}/files/read`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),
  
  // 写入文件内容
  writeFile: (workspaceId: string, filePath: string, content: string) => 
    request(`/workspaces/${workspaceId}/files/write`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    }),
  
  // 创建文件
  createFile: (workspaceId: string, filePath: string) => 
    request(`/workspaces/${workspaceId}/files/create`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),
  
  // 创建文件夹
  createFolder: (workspaceId: string, folderPath: string) => 
    request(`/workspaces/${workspaceId}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    }),
  
  // 删除文件或文件夹
  deleteFile: (workspaceId: string, filePath: string) => 
    request(`/workspaces/${workspaceId}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),
  
  // 移动文件或文件夹
  moveFile: (workspaceId: string, sourcePath: string, targetPath: string) => 
    request(`/workspaces/${workspaceId}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ source_path: sourcePath, target_path: targetPath }),
    }),
};

// 镜像相关API
export const imageAPI = {
  // 获取镜像列表
  getImages: () => request('/images'),
  
  // 拉取镜像
  pullImage: (imageName: string) => 
    request('/images/pull', {
      method: 'POST',
      body: JSON.stringify({ image: imageName }),
    }),
  
  // 删除镜像
  deleteImage: (imageId: string) => 
    request(`/images/${imageId}`, { method: 'DELETE' }),
};

// 终端相关API
export const terminalAPI = {
  // 创建终端会话
  createSession: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/terminal`, { method: 'POST' }),
  
  // 获取终端WebSocket URL
  getWebSocketUrl: (workspaceId: string, sessionId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${API_BASE_URL}/workspaces/${workspaceId}/terminal/${sessionId}/ws`;
  },
};

// Git相关API
export const gitAPI = {
  // Git状态
  status: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/git/status`, { method: 'POST' }),
  
  // Git添加
  add: (workspaceId: string, files: string[] = []) => 
    request(`/workspaces/${workspaceId}/git/add`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
  
  // Git提交
  commit: (workspaceId: string, message: string) => 
    request(`/workspaces/${workspaceId}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  
  // Git推送
  push: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/git/push`, { method: 'POST' }),
  
  // Git拉取
  pull: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/git/pull`, { method: 'POST' }),
};

// 统计相关API
export const statsAPI = {
  // 获取容器统计信息
  getStats: (workspaceId: string) => 
    request(`/workspaces/${workspaceId}/stats`),
};

export default {
  workspace: workspaceAPI,
  file: fileAPI,
  image: imageAPI,
  terminal: terminalAPI,
  git: gitAPI,
  stats: statsAPI,
}; 