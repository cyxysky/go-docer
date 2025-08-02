// 类型定义
export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  is_dir?: boolean; // 向后兼容性
  size?: number;
  modifiedTime?: string;
  children?: FileItem[];
}

export interface Tab {
  id: string;
  path: string;
  content: string;
  originalContent: string;
  modified: boolean;
}

export interface EditorPane {
  id: string;
  type: 'editor' | 'split';
  direction?: 'horizontal' | 'vertical';
  size?: number;
  children?: EditorPane[];
  openFiles: string[]; // 在此面板打开的文件列表
  activeFile: string | null;
  isActive: boolean;
}

export interface CodeChange {
  filePath: string;
  originalCode: string;
  newCode: string;
  description: string;
  changeType: 'insert' | 'replace' | 'delete' | 'modify';
  confidence: number;
  applied?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  createdAt: string;
  updatedAt: string;
  // 向后兼容性字段
  image?: string;
  container_id?: string;
  created?: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

export interface Image {
  id: string;
  tags: string[];
  size: number;
  created: string;
}

export interface TerminalSession {
  id: string;
  ws?: WebSocket;
}

export interface Toast {
  id: string;
  message: string;
  type: string | 'success' | 'error' | 'warning' | 'info';
} 