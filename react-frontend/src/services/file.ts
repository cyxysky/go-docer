// 文件服务相关的工具函数和类型定义
// 这个文件目前主要用于类型定义，具体的文件操作通过api.ts中的fileAPI进行

export interface FileServiceState {
  fileTree: any[];
}

export interface FileServiceAction {
  type: string;
  payload?: any;
}