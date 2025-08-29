import { deepseek } from '@ai-sdk/deepseek';
import { ModelMessage, streamText, tool, stepCountIs } from 'ai';
import { getAIObj, uuid } from './tools';
import 'dotenv/config';

const historyChatMap: any = {};
const sessionRollbackMap: any = {};

/**
 * 获取对话
 * @param sessionId 会话id
 */
export function getSession(workspaceId: string, sessionId: string): any {
  return historyChatMap?.[workspaceId]?.[sessionId];
}

/**
 * 删除对话
 * @param sessionId 会话id
 * @returns 是否删除成功
 */
export function deleteSession(workspaceId: string, sessionId: string): boolean {
  if (!historyChatMap?.[workspaceId]) {
    return false;
  }
  delete historyChatMap[workspaceId][sessionId];
  return true;
}

/**
 * 新增会话
 * @param sessionId 会话id
 */
export function createSession(workspaceId: string): any {
  let sessionId = Date.now() + "884695";
  if (!historyChatMap?.[workspaceId]) {
    historyChatMap[workspaceId] = {}
  }
  historyChatMap[workspaceId][sessionId] = [];
  return { sessionId };
}

/**
 * 获取对应工作空间下的对话
 * @param workspaceId 工作空间id
 * @returns 工作空间对话数组
 */
export function getWorkspacesSession(workspaceId: string): any {
  let data: Array<{ workspaceId: string, sessionId: string, messages: any, sessionRollbackFunc: any }> = [];
  for (let key in historyChatMap[workspaceId]) {
    const k = key;
    const v = historyChatMap[workspaceId][key];
    data.push({
      workspaceId,
      sessionId: k,
      sessionRollbackFunc: sessionRollbackMap?.[workspaceId]?.[key] || [],
      messages: v
    })
  }
  return data;
}

/**
 * 回滚部分工具操作
 * @param workspaceId 工作空间id
 * @param sessionId 对话id
 * @param toolUUID 工具uuid
 * @return 是否回滚成功
 */
export async function rollbackFunctionCallByUUID(workspaceId: string, sessionId: string, toolUUID: string): boolean {
  // 该次对话中的所有待回滚的函数
  const toolsRollbackFuncs = sessionRollbackMap[workspaceId][sessionId];
  // 当前回滚的函数索引
  const index = toolsRollbackFuncs.findIndex(o => o.uuid === toolUUID);
  // 需要回滚的函数集合
  const execFuncs = toolsRollbackFuncs.slice(index, toolsRollbackFuncs.length);
  let result = [];
  for (let i = execFuncs.length; i > 0; i--) {
    if (execFuncs[i]?.rollBackFunc) {
      let data = await execFuncs[i]?.rollBackFunc();
      result.push(data);
    }
  }
  // 重置工具操作数组
  sessionRollbackMap[workspaceId][sessionId] = toolsRollbackFuncs.slice(0, index);
  return result.some(item => !item.success);
}

/**
 * 回滚全部工具操作
 * @param workspaceId 工作空间id
 * @param sessionId 对话id
 * @returns 是否回滚全部操作成功
 */
export async function rollbackAllFunctionCall(workspaceId: string, sessionId: string): boolean {
  const toolsRollbackFuncs = sessionRollbackMap[workspaceId][sessionId];
  let result = [];
  for (let i = toolsRollbackFuncs.length; i > 0; i--) {
    let data = await execFuncs[i].rollBackFunc();
    result.push(data);
  }
  sessionRollbackMap[workspaceId][sessionId] = [];
  return result.some(item => !item.success);
}

/**
 * 接受对话中的所有工具操作
 * @param workspaceId 工作空间id
 * @param sessionId 对话id
 * @returns 
 */
export function acceptAllFunctionCall(workspaceId: string, sessionId: string): boolean {
  sessionRollbackMap[workspaceId][sessionId] = [];
  return true;
}

/**
 * 接受部分工具操作
 * @param workspaceId 工作空间id
 * @param sessionId 对话id
 * @param toolUUID 工具uuid
 * @returns 操作结果
 */
export function acceptFunctionCallByUUID(workspaceId: string, sessionId: string, toolUUID: string): boolean {
  const toolsRollbackFuncs = sessionRollbackMap[workspaceId][sessionId];
  const index = toolsRollbackFuncs.findIndex(o => o.uuid === toolUUID);
  // 重置工具操作
  sessionRollbackMap[workspaceId][sessionId] = toolsRollbackFuncs.slice(index, toolsRollbackFuncs.length)
  return true;
}

/**
 * 获得模型
 * @param modal 模型名称
 * @returns 模型
 */
export function getModal(modal: string) {
  return deepseek('deepseek-reasoner');
}

/**
 * 使用模型回答问题，流式输出
 * @param sessionId 对话id
 * @param prompts 提示词
 * @param modal 模型
 * @param onToolInput 工具参数输出
 * @param onToolStart 工具开始输出
 * @param onText 文本输出
 * @param onEnd 结束
 */
export async function generateStreamText(
  workspaceId: string,
  sessionId: string,
  prompts: string,
  systemPrompts: string,
  model: any,
  onToolInput: (data: any) => void,
  onToolFinish: (data: any) => void,
  onReasoning: (data: any) => any,
  onText: (data: any) => any,
  onEnd: (data: any) => any,
) {
  let fullResponse: string = '', tools: any = {}, messages: any = [], data: any = [], reasoningData: any = {}, openAiData = [];
  console.log(workspaceId);
  // 获取历史消息记录
  if (historyChatMap?.[workspaceId]?.[sessionId]) {
    const mData = historyChatMap?.[workspaceId]?.[sessionId];
    // 获取至多10个消息数据
    data = mData!.slice(mData!.length - 9 < 0 ? 0 : mData!.length - 9, mData!.length) || [];
  }
  // 添加信息
  data.push({ role: "user", content: prompts });
  // 初始化历史消息的格式
  messages = data.map((item: any) => { return { role: item.role, content: item.content } })
  // 添加当前消息
  const result = streamText({
    model: model,
    system: systemPrompts,
    messages,
    tools: getAIObj(workspaceId),
    stopWhen: stepCountIs(10),
    onStepFinish: async ({ toolResults }) => {
      toolResults.length && toolResults.forEach(tool => {
        tools[tool.toolCallId].output = tool.output;
        let uuids = uuid();
        // 设置uuid
        tools[tool.toolCallId]["uuid"] = uuids;
        // 设置回滚函数
        !sessionRollbackMap[workspaceId] && (sessionRollbackMap[workspaceId] = {})
        !sessionRollbackMap[workspaceId][sessionId] && (sessionRollbackMap[workspaceId][sessionId] = [])
        sessionRollbackMap[workspaceId][sessionId].push({
          uuid: uuids,
          rollBackFunc: tool?.output?.rollBackFunc
        })
        console.log(sessionRollbackMap)
      })
      onToolFinish(toolResults);
    },
  });
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      // 文本结束
      case 'text-end':
        fullResponse += '\n';
        break;

      // 文本内容
      case 'text-delta':
        fullResponse += delta.text;
        onText(delta.text);
        break;

      // 思维链开始
      case 'reasoning-start':
        reasoningData[delta.id] = "";
        fullResponse += `\n <ReasoningCall id="${delta.id}"></ReasoningCall> \n`;
        onText(`\n <ReasoningCall id="${delta.id}"></ReasoningCall> \n`);
        break;

      // 思维链内容
      case 'reasoning-delta':
        reasoningData[delta.id] += delta.text
        onReasoning({ id: delta.id, data: delta.text });
        break;

      // 工具输入开始
      case "tool-input-start":
        const { id, toolName } = delta;
        // 工具开始调用,添加调用标签
        fullResponse += `\n <FunctionCall id="${id}" name="${toolName}"></FunctionCall> \n`;
        // 添加调用内容
        tools[id] = { input: "", output: "" };
        onText(`\n <FunctionCall id="${id}" name="${toolName}"></FunctionCall> \n`);
        break;

      // 工具输入中
      case 'tool-input-delta':
        // 需要解析的内容
        tools[delta.id].input += delta.delta;
        onToolInput({ id: delta.id, data: delta.delta });
        break;
    }
  }
  // 添加消息
  data.push({ role: 'assistant', content: fullResponse, tools, reasoningData });
  historyChatMap[workspaceId][sessionId] = data;
  onEnd({ data: data, rollbackFuncs: sessionRollbackMap[workspaceId][sessionId].map(o => { return { uuid: o.uuid } }) });
}

/**
 * 生成系统提示词
 * @param workspace_id 工作空间id
 * @param files 文件
 * @param folders 文件夹
 * @returns 系统提示词
 */
export function generateSystemPrompt(workspace_id: string, files: string[], folders: string[]) {
  return `
  你是一个经验丰富的程序员，请根据用户的需求，使用工具完成任务,一下是你要遵循的规则
  1.你的文本都要用markdown格式输出, 其中代码输出需要注明对应的语言。
  2.在每一次工具输出前，需要输出一段文本简单概括你要做的操作。
  3.在读取文件时,不要一次性读取全部文件，要分段读取，一次最多读取200行，可以多次读取！重要！
  4.在每一次编辑完成后，你需要检查一下是否引入了错误。如果引入了，并且你有相当的把握解决错误，那么解决他。否则，尝试撤销编辑。
  5.如果用户询问简单问题，你不需要调用工具并在最后进行总结。
  
  以下是用户提供的，需要重点关注的文件和文件夹，请仔细阅读，并根据文件和文件夹的内容，完成任务:
  <user-content>
  ${files.map((file: string) => `<file>${file}</file>`).join('\n')}
  ${folders.map((folder: string) => `<folder>${folder}</folder>`).join('\n')}
  </user-content>


  以下是用户的系统信息：
  <system-info>

  系统是 linux 系统
  </system-info>
  `
}

//   工作空间的目录是 ../go/workspace/workspaces/${workspace_id}/