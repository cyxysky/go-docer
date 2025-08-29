import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { tool } from 'ai';

const execAsync = promisify(exec);

/**
 * 文件阅读 - 通过文件路径阅读文件内容
 * @param filePath 文件路径
 * @param startLine 开始行号（可选，从1开始）
 * @param endLine 结束行号（可选）
 * @returns 文件内容或指定行范围的内容
 */
export async function readFile(
    filePath: string,
    startLine?: number,
    endLine?: number
): Promise<string> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');

        if (startLine === undefined && endLine === undefined) {
            return content;
        }

        const lines = content.split('\n');
        const start = startLine ? Math.max(1, startLine) - 1 : 0;
        const end = endLine ? Math.min(lines.length, endLine) : lines.length;

        return lines.slice(start, end).join('\n');
    } catch (error: any) {
        throw new Error(`读取文件失败: ${error}`);
    }
}

/**
 * 文件新建 - 在指定路径下新建文件
 * @param dirPath 目录路径
 * @param fileName 文件名称
 * @param content 文件内容
 * @returns 创建的文件完整路径
 */
export async function createFile(
    dirPath: string,
    fileName: string,
    content: string = ''
): Promise<string> {
    try {
        // 确保目录存在
        await fs.promises.mkdir(dirPath, { recursive: true });

        const fullPath = path.join(dirPath, fileName);
        await fs.promises.writeFile(fullPath, content, 'utf-8');

        return fullPath;
    } catch (error) {
        throw new Error(`创建文件失败: ${error}`);
    }
}

/**
 * 文件删除
 * @param filePath 文件路径
 */
export async function deleteFile(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        throw new Error(`删除文件失败: ${error}`);
    }
}

/**
 * 文件夹新建
 * @param dirPath 文件夹路径
 * @param recursive 是否递归创建父目录
 */
export async function createDirectory(
    dirPath: string,
    recursive: boolean = true
): Promise<void> {
    try {
        await fs.promises.mkdir(dirPath, { recursive });
    } catch (error) {
        throw new Error(`创建文件夹失败: ${error}`);
    }
}

/**
 * 文件夹删除
 * @param dirPath 文件夹路径
 * @param recursive 是否递归删除子目录和文件
 */
export async function deleteDirectory(
    dirPath: string,
    recursive: boolean = true
): Promise<void> {
    try {
        if (recursive) {
            await fs.promises.rm(dirPath, { recursive: true, force: true });
        } else {
            await fs.promises.rmdir(dirPath);
        }
    } catch (error) {
        throw new Error(`删除文件夹失败: ${error}`);
    }
}

/**
 * 命令执行
 * @param command 要执行的命令
 * @param cwd 工作目录（可选）
 * @returns 命令执行结果
 */
export async function executeCommand(
    command: string,
    cwd?: string
): Promise<{ stdout: string; stderr: string }> {
    try {
        const options = cwd ? { cwd } : {};
        const result = await execAsync(command, options);
        return result;
    } catch (error) {
        throw new Error(`命令执行失败: ${error}`);
    }
}

/**
 * 全局搜索 - 在指定文件夹路径下搜索某个文字
 * @param searchPath 搜索路径
 * @param searchText 要搜索的文字
 * @param fileExtensions 文件扩展名过滤（可选）
 * @returns 包含搜索结果的数组
 */
export async function globalSearch(
    searchPath: string,
    searchText: string,
    fileExtensions?: string[]
): Promise<Array<{ file: string; line: number; content: string }>> {
    const results: Array<{ file: string; line: number; content: string }> = [];
    try {
        async function searchInDirectory(dirPath: string): Promise<void> {
            const items = await fs.promises.readdir(dirPath);
            for (const item of items) {
                const fullPath = path.join(dirPath, item);
                const stat = await fs.promises.stat(fullPath);
                if (stat.isDirectory()) {
                    // 跳过 node_modules 和 .git 等目录
                    if (!['node_modules', '.git', '.vscode', 'dist', 'build'].includes(item)) {
                        await searchInDirectory(fullPath);
                    }
                } else if (stat.isFile()) {
                    // 检查文件扩展名
                    if (fileExtensions && fileExtensions.length > 0) {
                        const ext = path.extname(item);
                        if (!fileExtensions.includes(ext)) {
                            continue;
                        }
                    }
                    try {
                        const content = await fs.promises.readFile(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes(searchText)) {
                                results.push({
                                    file: fullPath,
                                    line: i + 1,
                                    content: lines[i].trim()
                                });
                            }
                        }
                    } catch (error) {
                        // 忽略无法读取的文件（如二进制文件）
                        continue;
                    }
                }
            }
        }
        await searchInDirectory(searchPath);
        return results;
    } catch (error: any) {
        throw new Error(`搜索失败: ${error}`);
    }
}

/**
 * 文件内容编辑 - 根据指定内容和行号替换文件内容
 * @param filePath 文件路径
 * @param newContent 新的内容
 * @param startLine 开始行号（从1开始）
 * @param endLine 结束行号
 */
export async function editFileContent(
    filePath: string,
    newContent: string,
    startLine: number,
    endLine: number
): Promise<void> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const start = Math.max(1, startLine) - 1;
        const end = Math.min(lines.length, endLine);
        // 替换指定行范围的内容
        const newLines = newContent.split('\n');
        const beforeLines = lines.slice(0, start);
        const afterLines = lines.slice(end);
        const updatedContent = [...beforeLines, ...newLines, ...afterLines].join('\n');
        await fs.promises.writeFile(filePath, updatedContent, 'utf-8');
        return { originContent: content, newContent: updatedContent.join("\n") }
    } catch (error: any) {
        throw new Error(`编辑文件内容失败: ${error}`);
    }
}

/**
 * 生成uuid
 * @returns 生成uuid
 */
export function uuid(): string {
    let s = [];
    let hexDigits = "0123456789abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < 36; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[14] = "4";
    s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);
    s[8] = s[13] = s[18] = s[23] = "-";
    let uuid = s.join("");
    return uuid;
}

// 导出所有工具函数
export const tools = {
    readFile,
    createFile,
    deleteFile,
    createDirectory,
    deleteDirectory,
    executeCommand,
    globalSearch,
    editFileContent,
    uuid,
}

/**
 * 获取ai工具函数
 */
export function getAIObj(workspaceId: string) {
    const getFilePath = (path: string) => {
        return `../go/workspace/workspaces/${workspaceId}/` + path;
    }

    return {
        readFile: tool({
            description: '读取文件内容，支持指定行号范围',
            inputSchema: z.object({
                filePath: z.string().describe('文件路径, 当前目录为./'),
                startLine: z.number().optional().describe('开始行号（可选，从1开始）'),
                endLine: z.number().optional().describe('结束行号（可选）'),
            }),
            execute: async ({ filePath, startLine, endLine }) => {
                try {
                    const content = await readFile(getFilePath(filePath), startLine, endLine);
                    return { success: true, content, filePath: getFilePath(filePath) };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        createFile: tool({
            description: '在指定路径下创建新文件',
            inputSchema: z.object({
                dirPath: z.string().describe('目录路径, 当前目录为./'),
                fileName: z.string().describe('文件名称'),
                content: z.string().optional().describe('文件内容（可选）'),
            }),
            execute: async ({ dirPath, fileName, content = '' }) => {
                try {
                    const fullPath = await createFile(getFilePath(dirPath), fileName, content);
                    // 回滚操作
                    const rollBackFunc = (): Promise<any> => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                console.log("开始执行")
                                await deleteFile(fullPath);
                                resolve({ success: true, message: '文件删除成功' });
                            } catch (error: any) {
                                resolve({ success: false, error: error.message });
                            }
                        })
                    }
                    return { success: true, filePath: fileName, message: '文件创建成功', rollBackFunc };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        deleteFile: tool({
            description: '删除指定文件',
            inputSchema: z.object({
                filePath: z.string().describe('文件路径, 当前目录为./'),
            }),
            execute: async ({ filePath }) => {
                try {
                    const backupPath: string = getFilePath(filePath) + ".agentFileBackup";
                    await fs.promise.copyFileSync(getFilePath(filePath), backupPath);
                    await deleteFile(getFilePath(filePath));
                    // 回滚操作
                    const rollBackFunc = (): Promise<any> => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                await fs.promise.copyFileSync(backupPath, getFilePath(filePath));
                                await deleteFile(backupPath);
                                resolve({ success: true, message: '文件复原成功' });
                            } catch (error: any) {
                                resolve({ success: false, error: error.message });
                            }
                        })
                    }
                    return { success: true, message: '文件删除成功', rollBackFunc };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        createDirectory: tool({
            description: '创建新文件夹',
            inputSchema: z.object({
                dirPath: z.string().describe('文件夹路径, 当前目录为./'),
                recursive: z.boolean().optional().describe('是否递归创建父目录（默认true）'),
            }),
            execute: async ({ dirPath, recursive = true }) => {
                try {
                    // 回滚操作
                    const rollBackFunc = (): Promise<any> => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                await deleteDirectory(getFilePath(dirPath));
                                resolve({ success: true, message: '文件夹删除成功' });
                            } catch (error: any) {
                                resolve({ success: false, error: error.message });
                            }
                        })
                    }
                    await createDirectory(getFilePath(dirPath), recursive);
                    return { success: true, message: '文件夹创建成功', rollBackFunc };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        // deleteDirectory: tool({
        //     description: '删除指定文件夹,不到万不得已，不得使用',
        //     inputSchema: z.object({
        //         dirPath: z.string().describe('文件夹路径, 当前目录为./'),
        //         recursive: z.boolean().optional().describe('是否递归删除子目录和文件（默认true）'),
        //     }),
        //     execute: async ({ dirPath, recursive = true }) => {
        //         try {
        //             const backupPath: string = filePath + ".agentFileBackup";
        //             await fs.promise.copyFileSync(filePath, backupPath);
        //             await deleteDirectory(dirPath, recursive);
        //             // 回滚操作
        //             const rollBackFunc = (): Promise<any> => {
        //                 return new Promise(async (resolve, reject) => {
        //                     try {
        //                         await fs.promise.copyFileSync(backupPath, filePath);
        //                         await deleteFile(backupPath);
        //                         resolve({ success: true, message: '文件复原成功' });
        //                     } catch (error: any) {
        //                         reject({ success: false, error: error.message });
        //                     }
        //                 })
        //             }
        //             return { success: true, message: '文件夹删除成功' };
        //         } catch (error: any) {
        //             return { success: false, error: error.message };
        //         }
        //     },
        // }),
        executeCommand: tool({
            description: '执行系统命令',
            inputSchema: z.object({
                command: z.string().describe('要执行的命令, 当前目录为./'),
                cwd: z.string().optional().describe('工作目录（可选）, 当前目录为./'),
            }),
            execute: async ({ command, cwd }) => {
                try {
                    const result = await executeCommand(command, cwd);
                    return {
                        success: true,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        command
                    };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        globalSearch: tool({
            description: '在指定文件夹路径下搜索文字内容',
            inputSchema: z.object({
                searchPath: z.string().describe('搜索路径, 当前目录为./'),
                searchText: z.string().describe('要搜索的文字'),
                fileExtensions: z.array(z.string()).optional().describe('文件扩展名过滤（可选）'),
            }),
            execute: async ({ searchPath, searchText, fileExtensions }) => {
                try {
                    const results = await globalSearch(getFilePath(searchPath), searchText, fileExtensions);
                    return {
                        success: true,
                        results,
                        count: results.length,
                        searchText,
                        searchPath: getFilePath(searchPath)
                    };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
        editFileContent: tool({
            description: '根据指定行号替换文件内容',
            inputSchema: z.object({
                filePath: z.string().describe('文件路径, 当前目录为./'),
                newContent: z.string().describe('新的内容'),
                startLine: z.number().describe('开始行号（从1开始）'),
                endLine: z.number().describe('结束行号'),
            }),
            execute: async (params) => {
                const { filePath, newContent, startLine, endLine } = params;
                try {
                    // 此次编辑前的文件内容
                    const data = await editFileContent(getFilePath(filePath), newContent, startLine, endLine);
                    // 回滚操作
                    const rollBackFunc = (): Promise<any> => {
                        return new Promise(async (resolve, reject) => {
                            try {
                                await fs.promises.writeFile(getFilePath(filePath), data.originContent, 'utf-8');
                                resolve({ success: true, message: '文件复原成功' });
                            } catch (error: any) {
                                resolve({ success: false, error: error.message });
                            }
                        })
                    }
                    return {
                        success: true,
                        message: '文件内容编辑成功',
                        filePath: getFilePath(filePath),
                        editedLines: `${startLine}-${endLine}`,
                        originData: data.originContent,
                        newContent: newContent,
                        rollBackFunc
                    };
                } catch (error: any) {
                    return { success: false, error: error.message };
                }
            },
        }),
    }
}

