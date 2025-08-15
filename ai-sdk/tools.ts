import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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
    } catch (error: any) {
        throw new Error(`编辑文件内容失败: ${error}`);
    }
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
    editFileContent
};
