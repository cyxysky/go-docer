1. 要求模型根据提示词内容进行判断，是否能够直接修改，还是要更多的信息
2. 将提示词进行修改，最终ai输出的结果也需要改为要求模型在每次请求以及回复中至少输出一个工具调用，例如信息缺失就输出file_read工具。
tools : [
  {
    type: 'file_write',
    path: '文件路径',
    code: {
      originalCode: '原始代码',
      newCode: '新代码'
    },
    summary: '描述'
  },
  {
    type: 'file_create',
    path: '文件路径',
    content: '文件内容',
    summary: '描述'
  },
  {
    type: 'file_delete',
    path: '文件路径',
    summary: '描述'
  },
  {
    type: 'file_create_folder',
    path: '文件路径',
    summary: '描述'
  },
  {
    type: 'file_delete_folder',
    path: '文件路径',
    summary: '描述'
  },
  {
    type: 'shell_exec',
    command: '命令',
    summary: '描述'
  },
  {
    type: 'file_read',
    path: '文件路径',
    summary: '描述'
  }
]
3. 每一次调用工具，都将工具的调用内容以及调用结果保存，再下一次请求模型时，将工具调用结构以及结果作为上下文信息提供给模型。
4. 在每次构建提示词时，让ai进行判断，是否能够直接修改，还是要更多的信息。如果直接修改，让ai再输出一次工具调用，使用shell_exec
进行编译以确认是否存在错误信息，将终端调用的输出作为上下文信息提供给模型。让模型判断是否存在错误信息，如果存在错误信息，则让ai进行修改，直到没有错误信息为止。
5. 每次模型输出都要存在状态码，分为finish，retry二种，finish是表明所有结果修改完成，retry是表明模型需要更多信息。
如果输出finish，则将结果返回给前端，如果为retry，将模型输出的tools进行操作，并再次请求模型，直到模型输出finish为止。
最大retry次数为20次。