import {
  readFile,
  createFile,
  deleteFile,
  createDirectory,
  deleteDirectory,
  executeCommand,
  globalSearch,
  editFileContent,
  tools
} from './tools';

async function testTools() {
  console.log('开始测试工具函数...\n');

  try {
    // 测试创建目录
    console.log('1. 测试创建目录...');
    await createDirectory('./test-dir');
    console.log('✓ 目录创建成功\n');

    // 测试创建文件
    console.log('2. 测试创建文件...');
    const filePath = await createFile('./test-dir', 'test.txt', '这是测试文件内容\n第二行内容\n第三行内容');
    console.log(`✓ 文件创建成功: ${filePath}\n`);

    // 测试读取文件
    console.log('3. 测试读取文件...');
    const fullContent = await readFile(filePath);
    console.log('✓ 完整文件内容:', fullContent);

    const partialContent = await readFile(filePath, 2, 3);
    console.log('✓ 部分内容 (第2-3行):', partialContent, '\n');

    // 测试编辑文件内容
    console.log('4. 测试编辑文件内容...');
    await editFileContent(filePath, '新的第二行内容', 2, 3);
    const updatedContent = await readFile(filePath);
    console.log('✓ 编辑后的内容:', updatedContent, '\n');

    // 测试全局搜索
    console.log('5. 测试全局搜索...');
    const searchResults = await globalSearch('./test-dir', '内容', ['.txt']);
    console.log('✓ 搜索结果:', searchResults, '\n');

    // 测试命令执行
    console.log('6. 测试命令执行...');
    const commandResult = await executeCommand('echo "Hello World"');
    console.log('✓ 命令执行结果:', commandResult.stdout, '\n');

    // 测试删除文件
    console.log('7. 测试删除文件...');
    await deleteFile(filePath);
    console.log('✓ 文件删除成功\n');

    // 测试删除目录
    console.log('8. 测试删除目录...');
    await deleteDirectory('./test-dir');
    console.log('✓ 目录删除成功\n');

    console.log('🎉 所有测试通过！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testTools();
