import { deepseek } from '@ai-sdk/deepseek';
import { ModelMessage, streamText, tool, stepCountIs } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import {
  readFile,
  createFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
  executeCommand,
  globalSearch,
  editFileContent
} from './tools';

const messages: ModelMessage[] = [];

async function main() {
  while (true) {

    messages.push({ role: 'user', content: "今天北京几度" });

    const result = streamText({
      model: deepseek('deepseek-reasoner'),
      messages,
      tools: {
        // 文件操作工具
        readFile: tool({
          description: '读取文件内容，支持指定行号范围',
          inputSchema: z.object({
            filePath: z.string().describe('文件路径'),
            startLine: z.number().optional().describe('开始行号（可选，从1开始）'),
            endLine: z.number().optional().describe('结束行号（可选）'),
          }),
          execute: async ({ filePath, startLine, endLine }) => {
            try {
              const content = await readFile(filePath, startLine, endLine);
              return { success: true, content, filePath };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        createFile: tool({
          description: '在指定路径下创建新文件',
          inputSchema: z.object({
            dirPath: z.string().describe('目录路径'),
            fileName: z.string().describe('文件名称'),
            content: z.string().optional().describe('文件内容（可选）'),
          }),
          execute: async ({ dirPath, fileName, content = '' }) => {
            try {
              const fullPath = await createFile(dirPath, fileName, content);
              return { success: true, filePath: fullPath, message: '文件创建成功' };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        deleteFile: tool({
          description: '删除指定文件',
          inputSchema: z.object({
            filePath: z.string().describe('文件路径'),
          }),
          execute: async ({ filePath }) => {
            try {
              await deleteFile(filePath);
              return { success: true, message: '文件删除成功' };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        createDirectory: tool({
          description: '创建新文件夹',
          inputSchema: z.object({
            dirPath: z.string().describe('文件夹路径'),
            recursive: z.boolean().optional().describe('是否递归创建父目录（默认true）'),
          }),
          execute: async ({ dirPath, recursive = true }) => {
            try {
              await createDirectory(dirPath, recursive);
              return { success: true, message: '文件夹创建成功' };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        deleteDirectory: tool({
          description: '删除指定文件夹',
          inputSchema: z.object({
            dirPath: z.string().describe('文件夹路径'),
            recursive: z.boolean().optional().describe('是否递归删除子目录和文件（默认true）'),
          }),
          execute: async ({ dirPath, recursive = true }) => {
            try {
              await deleteDirectory(dirPath, recursive);
              return { success: true, message: '文件夹删除成功' };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        // 系统工具
        executeCommand: tool({
          description: '执行系统命令',
          inputSchema: z.object({
            command: z.string().describe('要执行的命令'),
            cwd: z.string().optional().describe('工作目录（可选）'),
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

        // 搜索和编辑工具
        globalSearch: tool({
          description: '在指定文件夹路径下搜索文字内容',
          inputSchema: z.object({
            searchPath: z.string().describe('搜索路径'),
            searchText: z.string().describe('要搜索的文字'),
            fileExtensions: z.array(z.string()).optional().describe('文件扩展名过滤（可选）'),
          }),
          execute: async ({ searchPath, searchText, fileExtensions }) => {
            try {
              const results = await globalSearch(searchPath, searchText, fileExtensions);
              return { 
                success: true, 
                results, 
                count: results.length,
                searchText,
                searchPath 
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        editFileContent: tool({
          description: '根据指定行号替换文件内容',
          inputSchema: z.object({
            filePath: z.string().describe('文件路径'),
            newContent: z.string().describe('新的内容'),
            startLine: z.number().describe('开始行号（从1开始）'),
            endLine: z.number().describe('结束行号'),
          }),
          execute: async ({ filePath, newContent, startLine, endLine }) => {
            try {
              await editFileContent(filePath, newContent, startLine, endLine);
              return { 
                success: true, 
                message: '文件内容编辑成功',
                filePath,
                editedLines: `${startLine}-${endLine}`
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),

        // 保留原有的天气工具作为示例
        weather: tool({
          description: 'Get the weather in a location (fahrenheit)',
          inputSchema: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          execute: async ({ location }) => {
            const temperature = Math.round(Math.random() * (90 - 32) + 32);
            return {
              location,
              temperature,
            };
          },
        }),

        convertFahrenheitToCelsius: tool({
          description: 'Convert a temperature in fahrenheit to celsius',
          inputSchema: z.object({
            temperature: z
              .number()
              .describe('The temperature in fahrenheit to convert'),
          }),
          execute: async ({ temperature }) => {
            const celsius = Math.round((temperature - 32) * (5 / 9));
            return {
              celsius,
            };
          },
        }),
      },
      stopWhen: stepCountIs(2),
      onStepFinish: async ({ toolResults }) => {
        if (toolResults.length) {
          console.log("开始调用工具")
          console.log(JSON.stringify(toolResults, null, 2));
        }
      },
    });

    let fullResponse = '';
    for await (const delta of result.fullStream) {
      console.log(delta);
      fullResponse += delta;
    }

    messages.push({ role: 'assistant', content: fullResponse });
    console.log(messages)
  }
}

main().catch(console.error);