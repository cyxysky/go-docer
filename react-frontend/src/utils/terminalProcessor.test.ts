import { processTerminalData, needsProcessing, TerminalDataProcessor } from './terminalProcessor';

// 测试数据示例
const testCases = [
  {
    name: '普通文本',
    input: 'Hello World\n',
    expected: 'Hello World\n',
    shouldProcess: false
  },
  {
    name: '包含ANSI颜色代码',
    input: '\x1b[32mHello\x1b[0m \x1b[31mWorld\x1b[0m\n',
    expected: 'Hello World\n',
    shouldProcess: true
  },
  {
    name: '包含控制字符',
    input: 'Hello\x07World\x08\x0B\x0C\n',
    expected: 'HelloWorld\n',
    shouldProcess: true
  },
  {
    name: '包含光标控制序列',
    input: '\x1b[2J\x1b[HHello\x1b[10CWorld\n',
    expected: 'HelloWorld\n',
    shouldProcess: true
  },
  {
    name: '包含OSC序列',
    input: '\x1b]0;Window Title\x07Hello World\n',
    expected: 'Hello World\n',
    shouldProcess: true
  },
  {
    name: '混合内容',
    input: '\x1b[32mHello\x1b[0m\x07\x08\x1b[2JWorld\x1b[0m\n',
    expected: 'HelloWorld\n',
    shouldProcess: true
  },
  {
    name: '二进制数据模拟',
    input: new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 10]).buffer,
    expected: 'Hello World\n',
    shouldProcess: true
  }
];

// 运行测试
console.log('=== @rushstack/terminal 处理器测试 ===\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log(`输入: ${JSON.stringify(testCase.input)}`);
  
  const needsProc = needsProcessing(testCase.input);
  console.log(`需要处理: ${needsProc} (期望: ${testCase.shouldProcess})`);
  
  if (needsProc) {
    const result = processTerminalData(testCase.input);
    console.log(`输出: ${JSON.stringify(result)}`);
    console.log(`期望: ${JSON.stringify(testCase.expected)}`);
    console.log(`结果: ${result === testCase.expected ? '✅ 通过' : '❌ 失败'}`);
  } else {
    console.log(`跳过处理，直接输出`);
  }
  
  console.log('---\n');
});

// 性能测试
console.log('=== 性能测试 ===\n');

const largeInput = '\x1b[32m'.repeat(1000) + 'Hello World'.repeat(100) + '\x1b[0m'.repeat(1000);
console.log(`大文本输入长度: ${largeInput.length} 字符`);

const startTime = performance.now();
const processedLarge = processTerminalData(largeInput);
const endTime = performance.now();

console.log(`处理时间: ${(endTime - startTime).toFixed(2)}ms`);
console.log(`输出长度: ${processedLarge.length} 字符`);
console.log(`压缩比: ${((1 - processedLarge.length / largeInput.length) * 100).toFixed(2)}%`);

// 实际使用示例
console.log('\n=== 实际使用示例 ===\n');

// 模拟WebSocket数据接收
const mockWebSocketData = [
  '\x1b[32m$ \x1b[0m', // 绿色提示符
  'ls -la\n', // 命令
  '\x1b[1;34mtotal 1234\x1b[0m\n', // 蓝色输出
  '\x1b[32mdrwxr-xr-x\x1b[0m 2 user user 4096 Jan 1 12:00 \x1b[1;36m.\x1b[0m\n', // 目录列表
  '\x1b[32mdrwxr-xr-x\x1b[0m 2 user user 4096 Jan 1 12:00 \x1b[1;36m..\x1b[0m\n',
  '\x1b[32m$ \x1b[0m' // 下一个提示符
];

console.log('原始WebSocket数据:');
mockWebSocketData.forEach((data, index) => {
  console.log(`${index + 1}. ${JSON.stringify(data)}`);
});

console.log('\n处理后的数据:');
mockWebSocketData.forEach((data, index) => {
  const processed = processTerminalData(data);
  console.log(`${index + 1}. ${JSON.stringify(processed)}`);
});

console.log('\n=== 测试完成 ==='); 