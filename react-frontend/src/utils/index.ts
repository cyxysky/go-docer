// 工具函数

// 获取状态显示文本
export const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': '等待中',
    'pulling': '拉取镜像',
    'creating': '创建中',
    'starting': '启动中',
    'initializing': '初始化',
    'running': '运行中',
    'stopped': '已停止',
    'failed': '失败'
  };
  return statusMap[status] || status;
};

// 获取文件图标
export const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'js': 'fab fa-js-square',
    'ts': 'fab fa-js-square',
    'py': 'fab fa-python',
    'go': 'fas fa-code',
    'java': 'fab fa-java',
    'php': 'fab fa-php',
    'html': 'fab fa-html5',
    'css': 'fab fa-css3-alt',
    'json': 'fas fa-file-code',
    'md': 'fab fa-markdown',
    'txt': 'fas fa-file-alt',
    'yml': 'fas fa-file-code',
    'yaml': 'fas fa-file-code',
    'xml': 'fas fa-file-code',
    'sql': 'fas fa-database'
  };
  return iconMap[ext || ''] || 'fas fa-file';
};

// 格式化字节大小
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}; 