1. 将工具的调用作为用户的消息填充到对话的构建中，这样可以优化对话构建，而不是每一次都将初始化提示词都发送给模型，减少token消耗，例如
user： 修改xxx文件，修改之前先阅读xxx文件。
ai：我将调用阅读xxx的工具（输出工具调用）
user： 工具调用成功，输出xxx
类似这样的对话构建。但是需要每次在user内容开始位置强调输出内容格式规范

ok

2. 优化内容输出提示词构建。使得除了思维链以外，内容数据输出也能够做到流式输出
这需要优化提示词，需要模型怎样输出才能做到工具预览与执行并行存在。

目前方案

要求模型只输出 NDJSON（每行一个 JSON 对象，行尾 \n）。不要输出任何行外文本或空行。
任意二进制或多行文本一律使用 base64。
由于模型输出的是流式的数据，所以需要状态机进行处理，在每次接受到流式数据时记录数据，遇到换行符号时，尝试将开始到换行符之前的内容进行json解析，解析成功清空状态机，直到输出完毕。
修改工具调用提示词

修改要求模型输出的提示词调用形式，要求输出格式如下：

- {"type":"thinking","id":"w1","data_b64":"b3"}

- {"type":"bs64_start","bs64_id":"b3"}
- {"type":"bs64_chunk","bs64_id":"b3","seq":0,"data_b64":"<<=4KB base64>"}
- {"type":"bs64_end","bs64_id":"b3","hash":"sha256:<对完整拼接字符串计算>"}

- {"type":"tool","id":"w1","tool":"file_write","data":{
    "path_b64":"src/a.ts",
    "originalCode_b64":"b2",
    "new_bs64":"b1"
  }}

- {"type":"bs64_start","bs64_id":"b1"}
- {"type":"bs64_chunk","bs64_id":"b1","seq":0,"data_b64":"<<=4KB base64>"}
- {"type":"bs64_end","bs64_id":"b1","hash":"sha256:<对完整拼接字符串计算>"}

- {"type":"bs64_start","bs64_id":"b2"}
- {"type":"bs64_chunk","bs64_id":"b2","seq":0,"data_b64":"<<=4KB base64>"}
- {"type":"bs64_end","bs64_id":"b2","hash":"sha256:<对完整拼接字符串计算>"}

- {"type":"done"}


例如我有一个文件编辑工具file_write，模型先输出调用该工具的thinking
- {"type":"thinking","id":"w1","data_b64":"b3"} 

再输出b3的bs64_chunk，在流式接收的同时，使用ws将内容发送给前端，由前端流式展示。
- {"type":"bs64_start","bs64_id":"b3"}
- {"type":"bs64_chunk","bs64_id":"b3","seq":0,"data_b64":"<<=4KB base64>"}
- {"type":"bs64_end","bs64_id":"b3","hash":"sha256:<对完整拼接字符串计算>"}

然后输出工具json，并引用 bs64的chunk源b1
- {"type":"tool","id":"w1","tool":"file_write","data":{
    "path_b64":"src/a.ts",
    "originalCode_b64":"b2",
    "new_bs64":"b1"
  }}

这表明工具使用编辑，新的代码的bs64的chunk源是b1,旧代码bs64id是b2,向前端发送该工具的json内容。
模型继续输出工具的bs64chunk
在输出bs64_start后，就将内容解码后通过ws发送给前端。发送时，需要将工具id一并发送前端，由前端流式展示。

- {"type":"bs64_start","bs64_id":"b1"}
- {"type":"bs64_chunk","bs64_id":"b1","seq":0,"data_b64":"<<=4KB base64>"}
- {"type":"bs64_end","bs64_id":"b1","hash":"sha256:<对完整拼接字符串计算>"}

在对应的bs64的chunk输出完毕后，将对应的hash值进行校验，如果成功，将工具json中的bs64值进行替换，执行工具。失败，抛出错误。继续下一个工具的判断

调用的工具包括以下工具时，需要输出bs64chunk，并通过对应的id进行实时判断替换。
注意，只有以下工具的以下内容需要这样输出bs64_chunk
file_write
  originalCode
  newCode
file_create
  content
shell_exec
  command
conversation_summary
  summary

约束：
- bs64 的内容只传一次，预览和工具都通过 bs64_id 引用，bs64_id没有示例中这么简单。
- 大字段必须切片为 bs64_chunk（seq 从0递增）；结束时提供 hash 以校验完整性。
- 模型输出逻辑
  第一个工具
    thinking
    thinking的bs64chunk
    工具json
    工具的bs64chunk
  第二个工具
    thinking
    thinking的bs64chunk
    工具json
    工具的bs64chunk
  以此类推

修改建议
你直接再handler.go的第820行进行content流的解析，包括状态机处理，工具调用，数据ws发送等。工具分批次执行，分批次展示。
823之后的函数内关于工具调用的函数
将模型再每次工具thinking都保存在ToolCall里面的Thinking里面，再将内容保存下来
修改config.go的buildAIPrompt函数，修改构建的提示词
还有models.ai.go的callAIStreamWithModel和parseAIResponse函数

3. 文件读取工具的优化。不需要读取全部文件内容，可以要求ai进行200行200行的分批读取，一旦ai确认读取完毕，停止读取调用。
4. 提供新功能：在ai读取文件的时候，可以使用搜索功能，即本地代码库进行全局搜索，找出特征函数出现的位置，包括文件地址，出现行号

5. 3个主要工具：
    文件编辑
    文件新建
    shell执行。
6. 3个主要工具问题：
    文件删除如何复原
    文件编辑如何撤销部分编辑内容
    文件新建如果撤销


