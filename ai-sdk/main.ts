// server.ts
import Koa from 'koa';
import WebSocket from 'ws';
import http from 'http';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { acceptFunctionCallByUUID, rollbackAllFunctionCall, rollbackFunctionCallByUUID, generateStreamText, generateSystemPrompt, getModal, getSession, deleteSession, createSession, getWorkspacesSession, acceptAllFunctionCall } from './ai.service';
import Router from '@koa/router';
// 定义WebSocket连接接口
interface WebSocketConnection {
    id: string;
    ws: WebSocket;
    isAlive: boolean;
    userId?: string;
}

class WebSocketServer {
    private wss: WebSocket.Server;
    private connections: Map<string, WebSocketConnection> = new Map();

    constructor(server: http.Server) {
        this.wss = new WebSocket.Server({ server });
        this.initializeWebSocket();
    }

    /**
     * 初始化WebSocket服务器
     */
    private initializeWebSocket(): void {
        this.wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
            const connectionId: any = request.url?.split('=')[1] || '6657';
            const connection: WebSocketConnection = {
                id: connectionId,
                ws,
                isAlive: true
            };
            // 存储连接
            this.connections.set(connectionId, connection);
            // 处理消息
            ws.on('message', (data: WebSocket.Data) => {
                // let text = [
                //     "这是",
                //     "一个",
                //     "测试",
                //     "用来",
                //     "判断",
                //     "一些",
                //     "东西",
                //     "是否",
                //     "正确",
                //     `\n <FunctionCall id="6657" name="createFile"></FunctionCall> \n`
                // ]
                // let inputData = [
                //     "{",
                //     "dirPath:",
                //     "'./logs/aaa.js'",
                //     ",",
                //     "fileName:",
                //     "asdasd.tx,",
                //     "content:",
                //     "789786",
                //     "}",
                // ]
                // let reasoner = [
                //     "这是",
                //     "思维链",
                //     "的",
                //     "一次",
                //     "测试",
                //     "用来",
                //     "判断",
                //     "思维链",
                //     "是否",
                //     "存在问题",
                // ]
                // let i = 0;
                // ws.send(JSON.stringify({
                //     type: 'text',
                //     data: `\n <ReasoningCall id="7756"></ReasoningCall> \n`
                // }))
                // let xxx = setInterval(() => {
                //     if (reasoner.length) {
                //         ws.send(JSON.stringify({
                //             type: 'reasoning',
                //             data: { id: "7756", data: reasoner[0] }
                //         }))
                //         reasoner.splice(0, 1);
                //     } else {
                //         if (text.length) {
                //             ws.send(JSON.stringify({
                //                 type: 'text',
                //                 data: text[0]
                //             }))
                //             text.splice(0, 1);
                //         } else {
                //             if (inputData.length) {
                //                 ws.send(JSON.stringify({
                //                     type: 'tool-input',
                //                     data: { id: "6657", data: inputData[0] }
                //                 }))
                //                 if (inputData.length === 1) {
                //                     ws.send(JSON.stringify({
                //                         type: 'tool-finish',
                //                         data: [
                //                             {
                //                                 toolCallId: "6657",
                //                                 input: {
                //                                     dirPath: "./logs", fileName: "aaa.js", content: "789779789"
                //                                 },
                //                                 output: {
                //                                     success: true, content: "asdasddas", filePath: "./logs/aaa.js"
                //                                 }
                //                             }
                //                         ]
                //                     }))
                //                 }
                //                 inputData.splice(0, 1);
                //             } else {
                //                 ws.send(JSON.stringify({
                //                     type: 'text',
                //                     data: "end"
                //                 }))
                //                 i++
                //                 if (i > 10) {
                //                     ws.send(JSON.stringify({
                //                         type: 'end',
                //                         data: { rollbackFuncs: ["6657"] }
                //                     }))
                //                     clearInterval(xxx);
                //                 }
                //             }
                //         }
                //     }

                // }, 200)


                
                const message: any = JSON.parse(data.toString());
                generateStreamText(
                    message.workspaceId,
                    message.containerId,
                    connectionId,
                    message.prompt,
                    generateSystemPrompt(message.workspaceId, message.files, message.folders),
                    getModal(""),
                    // 工具调用
                    (data: any) => {
                        ws.send(JSON.stringify({
                            type: 'tool-input',
                            data: data
                        }))
                    },
                    // 工具调用结束
                    (data: any) => {
                        ws.send(JSON.stringify({
                            type: 'tool-finish',
                            data: data
                        }))
                    },
                    // 思维链
                    (data: any) => {
                        ws.send(JSON.stringify({
                            type: 'reasoning',
                            data: data
                        }))
                    },
                    // 文本
                    (data: any) => {
                        // console.log(data)
                        ws.send(JSON.stringify({
                            type: 'text',
                            data: data
                        }))
                    },
                    // 结束对话
                    (data: any) => {
                        ws.send(JSON.stringify({
                            type: 'end',
                            data: data
                        }))
                    }
                );
            });

            // 处理连接关闭
            ws.on('close', () => {
                console.log(`WebSocket connection closed: ${connectionId}`);
                this.connections.delete(connectionId);
            });

            // 处理错误
            ws.on('error', (error) => {
                console.error(`WebSocket error for connection ${connectionId}:`, error);
                this.connections.delete(connectionId);
            });
        });
    }


}

const apiRouter = new Router({
    prefix: "/api/v1/session"
})

apiRouter.post('/delete', async (ctx: any) => {
    let sessionId: string = ctx.request.body.sessionId || "1";
    let workspaceId: string = ctx.request.body.workspaceId || "1";
    ctx.body = deleteSession(workspaceId, sessionId);
})

apiRouter.post('/get', async (ctx: any) => {
    let sessionId: string = ctx.request.body.sessionId || "1";
    let workspaceId: string = ctx.request.body.workspaceId || "1";
    ctx.body = getSession(workspaceId, sessionId);
})

apiRouter.post('/create', async (ctx: any) => {
    let workspaceId: string = ctx.request.body.workspaceId || "1";
    ctx.body = createSession(workspaceId);
})

apiRouter.post('/getWorkspaceSession', async (ctx: any) => {
    let workspaceId: string = ctx.request.body.workspaceId || "1";
    ctx.body = getWorkspacesSession(workspaceId);
})

apiRouter.post("/rollback", async (ctx: any) => {
    const { type, sessionId, workspaceId, toolUUID } = ctx.request.body;
    let result;
    switch (type) {
        case "acceptAll":
            result = await acceptAllFunctionCall(workspaceId, sessionId);
            break;
        case "acceptSome":
            result = await acceptFunctionCallByUUID(workspaceId, sessionId, toolUUID);
            break;
        case "rejectAll":
            result = await rollbackAllFunctionCall(workspaceId, sessionId);
            break;
        case "rejectSome":
            result = await rollbackFunctionCallByUUID(workspaceId, sessionId, toolUUID);
            break;
    }
    ctx.body = result;
})



// 创建Koa应用
const app = new Koa();
app.use(cors());
app.use(bodyParser());
app.use(apiRouter.routes());

// 创建HTTP服务器
const server = http.createServer(app.callback());
// 创建WebSocket服务器
const wsServer = new WebSocketServer(server);

// 启动服务器
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;





