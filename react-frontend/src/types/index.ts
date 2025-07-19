// 类型定义
export interface Workspace {
  id: string;
  name: string;
  image: string;
  status: string;
  container_id?: string;
  git_repo?: string;
  git_branch?: string;
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface Tab {
  id: string;
  path: string;
  content: string;
  originalContent: string;
  modified: boolean;
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