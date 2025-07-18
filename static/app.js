// 在线代码编辑器前端JavaScript - Docker容器化版本

let currentWorkspace = null;
let currentFile = null;
let editor = null;
let terminalSocket = null;
let statsInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 等待 CodeMirror 加载完成后再初始化编辑器
    if (typeof CodeMirror !== 'undefined') {
        initCodeEditor();
    } else {
        // 如果 CodeMirror 还没加载，等待一下再试
        setTimeout(() => {
            if (typeof CodeMirror !== 'undefined') {
                initCodeEditor();
            } else {
                console.error('CodeMirror failed to load');
            }
        }, 1000);
    }
    
    loadWorkspaces();
    loadImages();
    setInterval(loadWorkspaces, 10000); // 每10秒刷新工作空间列表
});

// 初始化代码编辑器
function initCodeEditor() {
    editor = CodeMirror(document.getElementById('editorContainer'), {
        mode: 'javascript',
        theme: 'dracula',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        value: '// 欢迎使用在线代码编辑器\n// 请选择工作空间和文件开始编码\n',
        extraKeys: {
            'Ctrl-S': function(cm) { saveFile(); },
            'F5': function(cm) { runCode(); }
        }
    });
}

// Toast 通知系统
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast show bg-${type} text-white`;
    toast.innerHTML = `
        <div class="toast-body">
            ${message}
        </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 创建工作空间
async function createWorkspace() {
    const name = document.getElementById('workspaceName').value;
    const image = document.getElementById('workspaceImage').value;
    const gitRepo = document.getElementById('gitRepo').value;
    const gitBranch = document.getElementById('gitBranch').value || 'main';
    
    if (!name) {
        showToast('请输入工作空间名称', 'warning');
        return;
    }

    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="loading"></span> 创建中...';
    button.disabled = true;

    try {
        const response = await fetch('/api/v1/workspaces', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                image: image,
                git_repo: gitRepo,
                git_branch: gitBranch
            })
        });

        if (response.ok) {
            const workspace = await response.json();
            showToast('工作空间创建成功！', 'success');
            loadWorkspaces();
            clearWorkspaceForm();
        } else {
            const error = await response.text();
            showToast('创建工作空间失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('创建工作空间失败: ' + error.message, 'danger');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// 加载工作空间列表
async function loadWorkspaces() {
    try {
        const response = await fetch('/api/v1/workspaces');
        if (response.ok) {
            const workspaces = await response.json();
            displayWorkspaces(workspaces);
        }
    } catch (error) {
        console.error('加载工作空间失败:', error);
    }
}

// 显示工作空间列表
function displayWorkspaces(workspaces) {
    const container = document.getElementById('workspaceList');
    container.innerHTML = '';

    if (workspaces.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">暂无工作空间</p>';
        return;
    }

    workspaces.forEach(workspace => {
        const div = document.createElement('div');
        div.className = 'workspace-card';
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="mb-0">${workspace.name}</h6>
                <span class="status-badge status-${workspace.status}">${workspace.status}</span>
            </div>
            <p class="text-muted small mb-2">
                <i class="fas fa-docker me-1"></i>${workspace.image}<br>
                <i class="fas fa-hashtag me-1"></i>${workspace.id.substring(0, 8)}
                ${workspace.git_repo ? `<br><i class="fas fa-git-alt me-1"></i>Git: ${workspace.git_repo.split('/').pop().replace('.git', '')}` : ''}
            </p>
            <div class="btn-group btn-group-sm w-100">
                <button class="btn btn-outline-primary" onclick="selectWorkspace('${workspace.id}')" title="选择">
                    <i class="fas fa-folder-open"></i>
                </button>
                <button class="btn btn-outline-success" onclick="startWorkspace('${workspace.id}')" title="启动" ${workspace.status === 'running' ? 'disabled' : ''} style="display: ${workspace.status === 'running' ? 'none' : 'inline-block'}">
                    <i class="fas fa-play"></i>
                </button>
                <button class="btn btn-outline-warning" onclick="stopWorkspace('${workspace.id}')" title="停止" ${workspace.status !== 'running' ? 'disabled' : ''}>
                    <i class="fas fa-stop"></i>
                </button>
                <button class="btn btn-outline-danger" onclick="deleteWorkspace('${workspace.id}')" title="删除">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

// 选择工作空间
async function selectWorkspace(workspaceId) {
    currentWorkspace = workspaceId;
    await loadFileTree(workspaceId);
    document.getElementById('currentFile').textContent = '工作空间: ' + workspaceId.substring(0, 8);
    
    // 获取工作空间信息
    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}`);
        if (response.ok) {
            const workspace = await response.json();
            if (workspace.git_repo) {
                showToast(`已选择工作空间 (Git: ${workspace.git_repo.split('/').pop().replace('.git', '')})`, 'info');
            } else {
                showToast('已选择工作空间', 'info');
            }
        }
    } catch (error) {
        showToast('已选择工作空间', 'info');
    }
    
    // 开始监控容器状态
    startStatsMonitoring(workspaceId);
}

// 启动工作空间
async function startWorkspace(workspaceId) {
    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/start`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('工作空间启动成功！', 'success');
            loadWorkspaces();
        } else {
            const error = await response.text();
            showToast('启动工作空间失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('启动工作空间失败: ' + error.message, 'danger');
    }
}

// 停止工作空间
async function stopWorkspace(workspaceId) {
    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/stop`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('工作空间停止成功！', 'success');
            loadWorkspaces();
        } else {
            const error = await response.text();
            showToast('停止工作空间失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('停止工作空间失败: ' + error.message, 'danger');
    }
}

// 删除工作空间
async function deleteWorkspace(workspaceId) {
    if (!confirm('确定要删除这个工作空间吗？此操作不可恢复！')) {
        return;
    }

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('工作空间删除成功！', 'success');
            loadWorkspaces();
            if (currentWorkspace === workspaceId) {
                currentWorkspace = null;
                document.getElementById('fileTree').innerHTML = '';
                document.getElementById('currentFile').textContent = '未选择文件';
                editor.setValue('');
                stopStatsMonitoring();
            }
        } else {
            const error = await response.text();
            showToast('删除工作空间失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('删除工作空间失败: ' + error.message, 'danger');
    }
}

// 加载文件树
async function loadFileTree(workspaceId, path = '') {
    if (!workspaceId) return;

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`);
        if (response.ok) {
            const files = await response.json();
            displayFileTree(files, workspaceId, path);
        }
    } catch (error) {
        console.error('加载文件树失败:', error);
        showToast('加载文件树失败', 'danger');
    }
}

// 显示文件树
function displayFileTree(files, workspaceId, currentPath) {
    const container = document.getElementById('fileTree');
    container.innerHTML = '';

    if (currentPath) {
        const backButton = document.createElement('div');
        backButton.className = 'file-item back-button';
        backButton.innerHTML = '<i class="fas fa-level-up-alt"></i> ..';
        backButton.onclick = () => loadFileTree(workspaceId, getParentPath(currentPath));
        container.appendChild(backButton);
    }

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        if (file.is_dir) {
            div.innerHTML = `<i class="fas fa-folder"></i> ${file.name}`;
            div.onclick = () => loadFileTree(workspaceId, file.path);
        } else {
            div.innerHTML = `<i class="fas fa-file"></i> ${file.name}`;
            div.onclick = () => openFile(workspaceId, file.path);
        }
        
        container.appendChild(div);
    });
}

// 打开文件
async function openFile(workspaceId, filePath) {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/files/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: filePath
            })
        });

        if (response.ok) {
            const content = await response.text();
            editor.setValue(content);
            currentFile = filePath;
            document.getElementById('currentFile').textContent = filePath;
            
            // 设置编辑器模式
            const mode = getEditorMode(filePath);
            editor.setOption('mode', mode);
            
            showToast(`已打开文件: ${filePath}`, 'success');
        } else {
            const error = await response.text();
            showToast('打开文件失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('打开文件失败: ' + error.message, 'danger');
    }
}

// 保存文件
async function saveFile() {
    if (!currentWorkspace || !currentFile) {
        showToast('请先选择工作空间和文件', 'warning');
        return;
    }

    const content = editor.getValue();
    
    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/write`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: currentFile,
                content: content
            })
        });

        if (response.ok) {
            showToast('文件保存成功！', 'success');
        } else {
            const error = await response.text();
            showToast('保存文件失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('保存文件失败: ' + error.message, 'danger');
    }
}

// 运行代码
async function runCode() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    const command = getRunCommand(currentFile);
    if (!command) {
        showToast('不支持运行此类型的文件', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: command
            })
        });

        if (response.ok) {
            const data = await response.json();
            appendToTerminal('$ ' + command.join(' '));
            appendToTerminal(data.output);
        } else {
            const error = await response.text();
            appendToTerminal('错误: ' + error);
        }
    } catch (error) {
        appendToTerminal('执行失败: ' + error.message);
    }
}

// 终端输入处理
function handleTerminalInput(event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const command = input.value.trim();
        
        if (command) {
            // 显示命令
            appendToTerminal(`$ ${command}`, 'command');
            
            // 执行命令
            executeCommand(command);
            
            // 清空输入框
            input.value = '';
        }
    }
}

// 执行命令
async function executeCommand(command) {
    if (!currentWorkspace) {
        appendToTerminal('错误: 请先选择工作空间', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: command.split(' ')
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.output) {
                // 处理输出中的控制字符
                const cleanOutput = result.output.replace(/\u0001\u0000\u0000\u0000\u0000\u0000\u0000/g, '')
                                               .replace(/\u0002\u0000\u0000\u0000\u0000\u0000\u0000/g, '')
                                               .replace(/\ufffd/g, '');
                appendToTerminal(cleanOutput, 'output');
            }
        } else {
            const error = await response.text();
            appendToTerminal(`错误: ${error}`, 'error');
        }
    } catch (error) {
        appendToTerminal(`错误: ${error.message}`, 'error');
    }
}

// 添加内容到终端
function appendToTerminal(text, type = 'output') {
    const terminal = document.getElementById('terminal');
    
    if (type === 'command') {
        // 命令输入行
        const commandLine = document.createElement('div');
        commandLine.className = 'terminal-line';
        commandLine.innerHTML = `<span class="terminal-prompt">$ </span><span class="terminal-output">${text}</span>`;
        terminal.appendChild(commandLine);
    } else {
        // 输出行
        const lines = text.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                const outputLine = document.createElement('div');
                outputLine.className = 'terminal-line';
                
                if (type === 'error') {
                    outputLine.innerHTML = `<span class="terminal-error">${line}</span>`;
                } else if (type === 'success') {
                    outputLine.innerHTML = `<span class="terminal-success">${line}</span>`;
                } else if (type === 'warning') {
                    outputLine.innerHTML = `<span class="terminal-warning">${line}</span>`;
                } else if (type === 'info') {
                    outputLine.innerHTML = `<span class="terminal-info">${line}</span>`;
                } else {
                    outputLine.innerHTML = `<span class="terminal-output">${line}</span>`;
                }
                
                terminal.appendChild(outputLine);
            }
        });
    }
    
    // 添加新的输入行
    const inputLine = document.createElement('div');
    inputLine.className = 'terminal-line';
    inputLine.innerHTML = `
        <span class="terminal-prompt">$ </span>
        <input type="text" class="terminal-input" placeholder="输入命令..." onkeypress="handleTerminalInput(event)">
        <span class="terminal-cursor"></span>
    `;
    terminal.appendChild(inputLine);
    
    // 滚动到底部
    terminal.scrollTop = terminal.scrollHeight;
    
    // 聚焦到新的输入框
    const newInput = inputLine.querySelector('.terminal-input');
    newInput.focus();
}

// 清空终端
function clearTerminal() {
    const terminal = document.getElementById('terminal');
    terminal.innerHTML = `
        <div class="terminal-line">
            <span class="terminal-prompt">$ </span>
            <span class="terminal-output">终端已清空</span>
        </div>
        <div class="terminal-line">
            <span class="terminal-prompt">$ </span>
            <input type="text" class="terminal-input" placeholder="输入命令..." onkeypress="handleTerminalInput(event)">
            <span class="terminal-cursor"></span>
        </div>
    `;
    
    // 聚焦到输入框
    const input = terminal.querySelector('.terminal-input');
    input.focus();
}

// Git操作
async function gitClone() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }
    await gitOperation('clone');
}

async function gitStatus() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }
    await gitOperation('status');
}

async function gitAdd() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }
    await gitOperation('add');
}

async function gitCommit() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    const message = document.getElementById('commitMessage').value;
    if (!message) {
        showToast('请输入提交信息', 'warning');
        return;
    }

    await gitOperation('commit', message);
}

async function gitPush() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }
    await gitOperation('push');
}

async function gitPull() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }
    await gitOperation('pull');
}

async function gitOperation(type, message = '') {
    try {
        console.log('执行Git操作:', type, message);
        
        const body = {
            type: type
        };

        if (message) {
            body.message = message;
        }

        console.log('请求体:', body);

        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/git`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        console.log('响应状态:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('响应数据:', data);
            
            // 处理输出中的控制字符
            if (data.output) {
                const cleanOutput = data.output.replace(/\u0001\u0000\u0000\u0000\u0000\u0000\u0000/g, '')
                                             .replace(/\u0002\u0000\u0000\u0000\u0000\u0000\u0000/g, '')
                                             .replace(/\ufffd/g, '');
                appendToTerminal(cleanOutput, 'output');
            }
            
            // 如果是克隆操作，刷新文件树
            if (type === 'clone') {
                await loadFileTree(currentWorkspace);
                showToast('Git仓库克隆完成！', 'success');
            } else {
                showToast(`Git ${type} 操作完成！`, 'success');
            }
        } else {
            const error = await response.text();
            console.error('Git操作失败:', error);
            appendToTerminal(`Git操作失败: ${error}`, 'error');
            showToast(`Git ${type} 操作失败: ${error}`, 'danger');
        }
    } catch (error) {
        console.error('Git操作异常:', error);
        appendToTerminal(`Git操作异常: ${error.message}`, 'error');
        showToast(`Git ${type} 操作异常: ${error.message}`, 'danger');
    }
}

// 镜像管理
async function loadImages() {
    try {
        const response = await fetch('/api/v1/images');
        if (response.ok) {
            const images = await response.json();
            displayImages(images);
        }
    } catch (error) {
        console.error('加载镜像失败:', error);
        showToast('加载镜像失败', 'danger');
    }
}

function displayImages(images) {
    const container = document.getElementById('imageList');
    container.innerHTML = '';

    if (images.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">暂无镜像</p>';
        return;
    }

    images.forEach(image => {
        const div = document.createElement('div');
        div.className = 'mb-2 p-2 border rounded';
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <strong>${image.tags[0] || image.id.substring(0, 12)}</strong>
                    <small class="text-muted">${(image.size / 1024 / 1024).toFixed(1)} MB</small>
                </div>
                <button class="btn btn-outline-danger btn-sm" onclick="deleteImage('${image.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function deleteImage(imageId) {
    if (!confirm('确定要删除这个镜像吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/v1/images/${imageId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('镜像删除成功！', 'success');
            loadImages();
        } else {
            const error = await response.text();
            showToast('删除镜像失败: ' + error, 'danger');
        }
    } catch (error) {
        showToast('删除镜像失败: ' + error.message, 'danger');
    }
}

// 容器状态监控
function startStatsMonitoring(workspaceId) {
    stopStatsMonitoring();
    statsInterval = setInterval(() => {
        refreshStats(workspaceId);
    }, 5000);
}

function stopStatsMonitoring() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
}

async function refreshStats(workspaceId = currentWorkspace) {
    if (!workspaceId) return;

    try {
        // 获取工作空间信息
        const workspaceResponse = await fetch(`/api/v1/workspaces/${workspaceId}`);
        if (workspaceResponse.ok) {
            const workspace = await workspaceResponse.json();
            
            // 获取容器统计信息
            const statsResponse = await fetch(`/api/v1/containers/${workspace.container_id}/stats`);
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                
                document.getElementById('cpuUsage').textContent = stats.cpu_usage ? stats.cpu_usage.toFixed(1) + '%' : '--';
                document.getElementById('memoryUsage').textContent = stats.memory_usage ? stats.memory_usage.toFixed(1) + '%' : '--';
            }
        }
    } catch (error) {
        console.error('获取容器统计失败:', error);
    }
}

// 辅助函数
function clearWorkspaceForm() {
    document.getElementById('workspaceName').value = '';
    document.getElementById('gitRepo').value = '';
    document.getElementById('gitBranch').value = 'main';
}

function getParentPath(path) {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
}

function getEditorMode(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const modeMap = {
        'js': 'javascript',
        'ts': 'javascript',
        'py': 'python',
        'go': 'go',
        'java': 'clike',
        'php': 'php',
        'html': 'xml',
        'css': 'css',
        'json': 'application/json',
        'md': 'markdown',
        'xml': 'xml',
        'sql': 'sql',
        'sh': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml'
    };
    return modeMap[ext] || 'text';
}

function getRunCommand(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const commandMap = {
        'js': ['node', filePath],
        'py': ['python3', filePath],
        'go': ['go', 'run', filePath],
        'java': ['java', filePath.replace('.java', '')],
        'php': ['php', filePath],
        'sh': ['bash', filePath]
    };
    return commandMap[ext];
} 