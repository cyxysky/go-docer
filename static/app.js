// 在线代码编辑器前端JavaScript - VSCode风格

let currentWorkspace = null;
let currentFile = null;
let editor = null;
let monacoEditor = null;
let terminalWebSocket = null;
let terminalSession = null;
let xterm = null;
let xtermFitAddon = null;
let statsInterval = null;
let openTabs = new Map();
let activeTab = null;

// 终端管理
let terminals = [];
let activeTerminalId = null;

// 文件浏览器功能
let currentDirectory = '/workspace';

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    updateStyles();
    updateHTMLStructure();
    initMonacoEditor();
    initPanelTabs();
    loadWorkspaces();
    setInterval(loadWorkspaces, 15000);

    // 添加键盘快捷键
    initKeyboardShortcuts();

    // 初始化终端
    initTerminal();

    // 初始化主题
    initTheme();

    showToast('在线代码编辑器已启动', 'success');
});

// 初始化Monaco Editor
function initMonacoEditor() {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });

    require(['vs/editor/editor.main'], function () {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: [
                '// 欢迎使用在线代码编辑器',
                '// 支持多种编程语言和开发环境',
                '',
                '// 快捷键：',
                '// Ctrl+S     - 保存文件',
                '// Ctrl+Enter - 运行代码',
                '// F5         - 运行代码',
                '// Ctrl+`     - 打开/关闭终端',
                '',
                '// 特性：',
                '// - VSCode级别的代码编辑体验',
                '// - Docker容器化开发环境',
                '// - 内置终端支持',
                '// - Git集成',
                '// - 实时容器监控',
                '',
                '// 开始使用：',
                '// 1. 创建工作空间',
                '// 2. 选择开发环境',
                '// 3. 开始编码！'
            ].join('\n'),
            language: 'javascript',
            theme: currentTheme === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            fontSize: 14,
            fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderWhitespace: 'selection',
            suggestions: {
                enabled: true
            },
            quickSuggestions: {
                other: true,
                comments: false,
                strings: false
            }
        });

        // 监听编辑器内容变化
        monacoEditor.onDidChangeModelContent(function () {
            if (activeTab) {
                const tab = openTabs.get(activeTab);
                if (tab) {
                    tab.modified = true;
                    updateTabTitle(activeTab);
                }
            }
        });

        // 添加保存命令
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
            saveFile();
        });

        // 添加运行命令
        monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
            runCode();
        });

        monacoEditor.addCommand(monaco.KeyCode.F5, function () {
            runCode();
        });
    });
}

// 初始化面板标签
function initPanelTabs() {
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            const panel = this.getAttribute('data-panel');
            switchPanel(panel);
        });
    });

    // 初始化侧边栏标签
    initSidebarTabs();
}

// 初始化侧边栏标签
function initSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            switchSidebarTab(tabName);
        });
    });
}

// 切换侧边栏标签
function switchSidebarTab(tabName) {
    // 更新标签状态
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // 更新内容显示
    document.querySelectorAll('.sidebar-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // 根据切换的标签执行相应操作
    switch (tabName) {
        case 'workspace':
            loadWorkspaces();
            break;
        case 'files':
            if (currentWorkspace) {
                loadDirectory('/workspace');
            }
            break;
        case 'images':
            loadImages();
            break;
    }
}

// 切换面板
function switchPanel(panelName) {
    // 更新标签状态
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    const activeTab = document.querySelector(`.panel-tab[data-panel="${panelName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    // 显示/隐藏面板内容
    const panels = {
        'terminal': 'terminal-panel',
        'git': 'git-panel',
        'stats': 'stats-panel'
    };

    Object.values(panels).forEach(id => {
        const panelElement = document.getElementById(id);
        if (panelElement) {
            panelElement.classList.add('hidden');
        }
    });

    if (panels[panelName]) {
        const targetPanel = document.getElementById(panels[panelName]);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
        }
    }

    // 如果切换到统计面板，刷新数据
    if (panelName === 'stats' && currentWorkspace) {
        refreshStats();
    }
}

// 初始化键盘快捷键
function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (event) {
        // Ctrl+` - 切换终端
        if (event.ctrlKey && event.key === '`') {
            event.preventDefault();
            switchPanel('terminal');
        }

        // Ctrl+Shift+` - 新建终端
        if (event.ctrlKey && event.shiftKey && event.key === '`') {
            event.preventDefault();
            newTerminal();
        }

        // Ctrl+Shift+G - 打开Git面板
        if (event.ctrlKey && event.shiftKey && event.key === 'G') {
            event.preventDefault();
            switchPanel('git');
        }
    });
}

// 初始化终端 - 支持WebSocket交互式终端
function initTerminal() {
    // 终端已经在HTML中定义，这里只需要初始化状态
    updateTerminalStatus('disconnected');

    // 清空终端输出
    const terminalBody = document.getElementById('terminal');
    if (terminalBody) {
        const welcomeDiv = terminalBody.querySelector('.terminal-welcome');
        if (welcomeDiv) {
            welcomeDiv.innerHTML = `
                <i class="fas fa-terminal"></i>
                <div>在线代码编辑器终端</div>
                <div class="terminal-hint">选择工作空间后点击"连接终端"开始使用</div>
            `;
        }
    }

    // 初始化 xterm.js
    initXterm();
}

// 初始化 xterm.js 终端
function initXterm() {
    // 立即尝试初始化 xterm.js
    if (typeof Terminal !== 'undefined' && typeof FitAddon !== 'undefined') {
        try {
            // 创建 xterm 实例
            xterm = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: 'Consolas, Monaco, Courier New, monospace',
                theme: {
                    background: '#0c0c0c',
                    foreground: '#cccccc',
                    cursor: '#cccccc',
                    selection: '#264f78',
                    black: '#000000',
                    red: '#cd3131',
                    green: '#0dbc79',
                    yellow: '#e5e510',
                    blue: '#2472c8',
                    magenta: '#bc3fbc',
                    cyan: '#11a8cd',
                    white: '#e5e5e5',
                    brightBlack: '#666666',
                    brightRed: '#f14c4c',
                    brightGreen: '#23d18b',
                    brightYellow: '#f5f543',
                    brightBlue: '#3b8eea',
                    brightMagenta: '#d670d6',
                    brightCyan: '#29b8db',
                    brightWhite: '#ffffff'
                },
                allowTransparency: true,
                scrollback: 1000,
                rows: 20,
                cols: 80
            });

            // 创建 fit addon
            xtermFitAddon = new FitAddon.FitAddon();
            xterm.loadAddon(xtermFitAddon);

            console.log('✅ Xterm.js 初始化成功');

            // 立即显示 xterm 终端
            showXtermTerminal();
        } catch (error) {
            console.error('❌ Xterm.js 初始化失败:', error);
        }
    } else {
        console.warn('⚠️ Xterm.js 未加载，使用备用终端');
    }
}

// 显示 xterm 终端
function showXtermTerminal() {
    const welcomeDiv = document.getElementById('terminalWelcome');
    const xtermContainer = document.getElementById('xtermContainer');

    if (welcomeDiv) welcomeDiv.style.display = 'none';
    if (xtermContainer) {
        xtermContainer.style.display = 'flex';
        xtermContainer.innerHTML = '';

        try {
            xterm.open(xtermContainer);
            xtermFitAddon.fit();

            // 显示欢迎信息
            xterm.write('\x1b[1;32m🚀 在线代码编辑器终端\x1b[0m\r\n');
            xterm.write('\x1b[1;36m选择工作空间后点击"连接终端"开始使用\x1b[0m\r\n\r\n');
            xterm.write('\x1b[1;33mroot@online-editor:/workspace $ \x1b[0m');

            console.log('✅ Xterm.js 终端显示成功');
        } catch (error) {
            console.error('❌ Xterm.js 终端显示失败:', error);
        }
    }
}

// Toast通知系统
function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-triangle',
        'warning': 'fa-exclamation-circle',
        'info': 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // 显示动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 自动删除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 4000);
}

// 创建工作空间
async function createWorkspace() {
    const name = document.getElementById('workspaceName').value.trim();
    const image = document.getElementById('workspaceImage').value;
    const gitRepo = document.getElementById('gitRepo').value.trim();
    const gitBranch = document.getElementById('gitBranch').value.trim() || 'main';

    if (!name) {
        showToast('请输入工作空间名称', 'warning');
        return;
    }

    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="loading-spinner"></span> 创建中...';
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
            clearWorkspaceForm();
            loadWorkspaces();
        } else {
            const error = await response.text();
            showToast('创建失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('创建失败: ' + error.message, 'error');
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
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #969696;">
                <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 8px;"></i>
                <div>暂无工作空间</div>
                <div style="font-size: 11px; margin-top: 4px;">点击上方创建您的第一个工作空间</div>
            </div>
        `;
        return;
    }

    workspaces.forEach(workspace => {
        const item = document.createElement('div');
        item.className = 'workspace-item';
        if (currentWorkspace === workspace.id) {
            item.classList.add('active');
        }

        // 获取镜像显示名称
        const imageName = workspace.image.split(':')[0];
        const imageTag = workspace.image.split(':')[1] || 'latest';

        item.innerHTML = `
            <div class="workspace-name">
                <i class="fas fa-cube"></i>
                ${workspace.name}
            </div>
            <div class="workspace-details">
                <span class="workspace-image">${imageName}:${imageTag}</span>
                <span class="workspace-status ${workspace.status}">${getStatusText(workspace.status)}</span>
            </div>
            <div class="workspace-actions">
                <button class="btn" onclick="selectWorkspace('${workspace.id}')" title="选择工作空间">
                    <i class="fas fa-folder-open"></i>
                </button>
                ${workspace.status !== 'running' ? `
                    <button class="btn" onclick="startWorkspace('${workspace.id}')" title="启动工作空间">
                        <i class="fas fa-play"></i>
                    </button>
                ` : `
                    <button class="btn" onclick="stopWorkspace('${workspace.id}')" title="停止工作空间">
                        <i class="fas fa-stop"></i>
                    </button>
                `}
                <button class="btn" onclick="deleteWorkspace('${workspace.id}')" title="删除工作空间">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        container.appendChild(item);
    });
}

// 获取状态显示文本
function getStatusText(status) {
    const statusMap = {
        'pending': '等待中',
        'pulling': '拉取镜像',
        'creating': '创建中',
        'starting': '启动中',
        'initializing': '初始化',
        'running': '运行中',
        'stopped': '已停止',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

// 选择工作空间
async function selectWorkspace(workspaceId) {
    currentWorkspace = workspaceId;

    // 更新UI状态
    document.querySelectorAll('.workspace-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.workspace-item').classList.add('active');

    // 更新状态栏
    document.getElementById('containerStatus').textContent = '已连接';

    // 加载文件树
    await loadFileTree(workspaceId);

    // 开始监控状态
    startStatsMonitoring(workspaceId);

    showToast(`已选择工作空间: ${workspaceId.substring(0, 8)}`, 'success');
}

// 启动工作空间
async function startWorkspace(workspaceId) {
    const button = event.target;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span class="loading-spinner"></span>';
    button.disabled = true;

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/start`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('工作空间启动成功！', 'success');
            loadWorkspaces();
        } else {
            const error = await response.text();
            showToast('启动失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('启动失败: ' + error.message, 'error');
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

// 停止工作空间
async function stopWorkspace(workspaceId) {
    const button = event.target;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span class="loading-spinner"></span>';
    button.disabled = true;

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/stop`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('工作空间停止成功！', 'success');
            loadWorkspaces();
        } else {
            const error = await response.text();
            showToast('停止失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('停止失败: ' + error.message, 'error');
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

// 删除工作空间
async function deleteWorkspace(workspaceId) {
    if (!confirm('确定要删除这个工作空间吗？此操作不可恢复。')) {
        return;
    }

    try {
        // 先停止工作空间
        const stopResponse = await fetch(`/api/v1/workspaces/${workspaceId}/stop`, {
            method: 'POST'
        });

        if (!stopResponse.ok) {
            console.warn('停止工作空间失败，继续删除:', await stopResponse.text());
        }

        // 等待一下让容器完全停止
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 删除工作空间
        const response = await fetch(`/api/v1/workspaces/${workspaceId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('工作空间删除成功', 'success');

            // 如果删除的是当前工作空间，清空选择
            if (currentWorkspace === workspaceId) {
                currentWorkspace = null;
                currentFile = null;

                // 清空文件树
                const fileTree = document.getElementById('fileTree');
                if (fileTree) {
                    fileTree.innerHTML = `
                        <div class="file-tree-empty">
                            <i class="fas fa-folder-open"></i>
                            <div>选择工作空间查看文件</div>
                        </div>
                    `;
                }

                // 清空终端
                disconnectTerminal();

                // 显示欢迎页面
                showWelcomeTab();
            }

            loadWorkspaces();
        } else {
            const errorText = await response.text();
            throw new Error(`删除失败: ${errorText}`);
        }
    } catch (error) {
        console.error('删除工作空间失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 加载文件树
async function loadFileTree(workspaceId, path = '') {
    console.log(path)
    if (!workspaceId) return;

    try {
        const response = await fetch(`/api/v1/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`);
        if (response.ok) {
            const files = await response.json();
            displayFileTree(files, workspaceId, path);
        }
    } catch (error) {
        console.error('加载文件树失败:', error);
        showToast('加载文件树失败', 'error');
    }
}

// 显示文件树
function displayFileTree(files, workspaceId, currentPath) {
    const container = document.getElementById('fileTree');
    if (!container) {
        console.error('文件树容器不存在');
        return;
    }

    container.innerHTML = '';
    console.log(files);
    // 检查files是否为有效数组
    if (!files || !Array.isArray(files)) {
        console.error('文件列表无效:', files);
        container.innerHTML = `
            <div class="file-tree-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <div>加载文件列表失败</div>
            </div>
        `;
        return;
    }

    // 添加返回上一级按钮
    if (currentPath && currentPath !== '') {
        const parentPath = getParentPath(currentPath);
        const backItem = document.createElement('div');
        backItem.className = 'file-item back-item';
        backItem.innerHTML = `
            <div class="file-name">
                <i class="fas fa-level-up-alt"></i>
                <span>返回上一级</span>
            </div>
        `;
        backItem.onclick = () => loadFileTree(workspaceId, parentPath);
        container.appendChild(backItem);
    }

    if (files.length === 0) {
        container.innerHTML += `
            <div class="file-tree-empty">
                <i class="fas fa-folder-open"></i>
                <div>当前目录为空</div>
            </div>
        `;
        return;
    }

    // 分离文件夹和文件
    const folders = files.filter(file => file && file.is_dir);
    const fileList = files.filter(file => file && !file.is_dir);

    // 先显示文件夹
    folders.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item folder-item';
        item.innerHTML = `
            <div class="file-name">
                <i class="fas fa-folder"></i>
                <span>${file.name || '未知文件夹'}</span>
            </div>
        `;
        item.onclick = () => loadFileTree(workspaceId, file.path);
        container.appendChild(item);
    });

    // 再显示文件
    fileList.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item file-item-file';
        item.innerHTML = `
            <div class="file-name">
                <i class="fas ${getFileIcon(file.name || '')}"></i>
                <span>${file.name || '未知文件'}</span>
            </div>
            <div class="file-actions">
                <button class="btn btn-sm" onclick="openFile('${file.path || ''}')" title="打开文件">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

// 获取文件图标
function getFileIcon(filename) {
    if (!filename || typeof filename !== 'string') {
        return 'fas fa-file';
    }

    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'js': 'fab fa-js-square',
        'ts': 'fab fa-js-square',
        'py': 'fab fa-python',
        'go': 'fas fa-code',
        'java': 'fab fa-java',
        'php': 'fab fa-php',
        'html': 'fab fa-html5',
        'css': 'fab fa-css3-alt',
        'json': 'fas fa-file-code',
        'md': 'fab fa-markdown',
        'txt': 'fas fa-file-alt',
        'yml': 'fas fa-file-code',
        'yaml': 'fas fa-file-code',
        'xml': 'fas fa-file-code',
        'sql': 'fas fa-database'
    };
    return iconMap[ext] || 'fas fa-file';
}

// 打开文件
async function openFile(filePath) {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    // 确保Monaco Editor已初始化
    if (!monacoEditor) {
        showToast('编辑器正在加载中，请稍候...', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/read`, {
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
            openTab(filePath, content);
            showToast(`已打开: ${filePath}`, 'success');
        } else {
            const error = await response.text();
            showToast('打开文件失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('打开文件失败: ' + error.message, 'error');
    }
}

// 打开标签页
function openTab(filePath, content) {
    const tabId = filePath;

    // 如果标签已存在，切换到该标签
    if (openTabs.has(tabId)) {
        switchTab(tabId);
        return;
    }

    // 创建新标签
    const tab = {
        id: tabId,
        path: filePath,
        content: content,
        originalContent: content,
        modified: false
    };

    openTabs.set(tabId, tab);

    // 创建标签UI
    createTabElement(tab);

    // 切换到新标签
    switchTab(tabId);
}

// 创建标签元素
function createTabElement(tab) {
    const tabsContainer = document.querySelector('.editor-tabs');

    // 移除欢迎标签
    const welcomeTab = document.getElementById('welcomeTab');
    if (welcomeTab) {
        welcomeTab.remove();
    }

    const tabElement = document.createElement('div');
    tabElement.className = 'editor-tab';
    tabElement.id = `tab-${tab.id}`;

    const filename = tab.path.split('/').pop();
    const icon = getFileIcon(filename);

    tabElement.innerHTML = `
        <i class="${icon}"></i>
        <span class="tab-name">${filename}</span>
        <i class="fas fa-times editor-tab-close" onclick="closeTab('${tab.id}', event)"></i>
    `;

    tabElement.onclick = (e) => {
        if (!e.target.classList.contains('editor-tab-close')) {
            switchTab(tab.id);
        }
    };

    tabsContainer.appendChild(tabElement);
}

// 切换标签
function switchTab(tabId) {
    const tab = openTabs.get(tabId);
    if (!tab) return;

    // 更新标签状态
    document.querySelectorAll('.editor-tab').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // 更新编辑器内容 - 确保Monaco Editor已初始化
    if (monacoEditor && typeof monacoEditor.setValue === 'function') {
        try {
            monacoEditor.setValue(tab.content);

            // 设置语言模式
            const language = getLanguageFromFilename(tab.path);
            if (monaco && monaco.editor && monaco.editor.setModelLanguage) {
                monaco.editor.setModelLanguage(monacoEditor.getModel(), language);
            }
        } catch (error) {
            console.error('设置编辑器内容失败:', error);
            showToast('编辑器设置失败: ' + error.message, 'error');
            return;
        }
    } else {
        console.error('Monaco Editor 未初始化或setValue方法不可用');
        showToast('编辑器未就绪，请等待加载完成', 'warning');
        return;
    }

    // 更新状态
    activeTab = tabId;
    currentFile = tab.path;
    document.getElementById('currentFile').textContent = tab.path;
}

// 关闭标签
function closeTab(tabId, event) {
    if (event) {
        event.stopPropagation();
    }

    const tab = openTabs.get(tabId);
    if (!tab) return;

    // 检查是否有未保存的更改
    if (tab.modified) {
        if (!confirm('文件有未保存的更改，确定要关闭吗？')) {
            return;
        }
    }

    // 删除标签
    openTabs.delete(tabId);
    document.getElementById(`tab-${tabId}`).remove();

    // 如果关闭的是当前标签，切换到其他标签
    if (activeTab === tabId) {
        const remainingTabs = Array.from(openTabs.keys());
        if (remainingTabs.length > 0) {
            switchTab(remainingTabs[remainingTabs.length - 1]);
        } else {
            // 显示欢迎页面
            showWelcomeTab();
        }
    }
}

// 关闭所有标签
function closeAllTabs() {
    openTabs.clear();
    document.querySelector('.editor-tabs').innerHTML = '';
    showWelcomeTab();
}

// 显示欢迎标签
function showWelcomeTab() {
    const tabsContainer = document.querySelector('.editor-tabs');
    tabsContainer.innerHTML = `
        <div class="editor-tab active" id="welcomeTab">
            <i class="fas fa-home"></i>
            <span>欢迎</span>
        </div>
    `;

    if (monacoEditor) {
        monacoEditor.setValue([
            '// 欢迎使用在线代码编辑器',
            '// 支持多种编程语言和开发环境',
            '',
            '// 快捷键：',
            '// Ctrl+S     - 保存文件',
            '// Ctrl+Enter - 运行代码',
            '// F5         - 运行代码',
            '// Ctrl+`     - 打开/关闭终端',
            '',
            '// 特性：',
            '// - VSCode级别的代码编辑体验',
            '// - Docker容器化开发环境',
            '// - 内置终端支持',
            '// - Git集成',
            '// - 实时容器监控',
            '',
            '// 开始使用：',
            '// 1. 创建工作空间',
            '// 2. 选择开发环境',
            '// 3. 开始编码！'
        ].join('\n'));
    }

    activeTab = null;
    currentFile = null;
    document.getElementById('currentFile').textContent = '未选择文件';
}

// 更新标签标题
function updateTabTitle(tabId) {
    const tab = openTabs.get(tabId);
    if (!tab) return;

    const tabElement = document.getElementById(`tab-${tabId}`);
    const nameElement = tabElement.querySelector('.tab-name');
    const filename = tab.path.split('/').pop();

    nameElement.textContent = tab.modified ? `${filename} ●` : filename;
}

// 保存文件
async function saveFile() {
    if (!currentWorkspace || !activeTab) {
        showToast('请先打开文件', 'warning');
        return;
    }

    const tab = openTabs.get(activeTab);
    if (!tab) return;

    const content = monacoEditor.getValue();

    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files/write`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: tab.path,
                content: content
            })
        });

        if (response.ok) {
            tab.content = content;
            tab.originalContent = content;
            tab.modified = false;
            updateTabTitle(activeTab);
            showToast('文件保存成功！', 'success');
        } else {
            const error = await response.text();
            showToast('保存失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 运行代码
async function runCode() {
    if (!currentWorkspace || !activeTab) {
        showToast('请先打开文件', 'warning');
        return;
    }

    const tab = openTabs.get(activeTab);
    if (!tab) return;

    const command = getRunCommand(tab.path);
    if (!command) {
        showToast('不支持运行此类型的文件', 'warning');
        return;
    }

    // 切换到终端面板
    switchPanel('terminal');

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
            appendToTerminal(`$ ${command.join(' ')}`, 'command');
            appendToTerminal(data.output || '', 'output');
        } else {
            const error = await response.text();
            appendToTerminal(`错误: ${error}`, 'error');
        }
    } catch (error) {
        appendToTerminal(`执行失败: ${error.message}`, 'error');
    }
}

// WebSocket交互式终端系统

// 连接终端
async function connectTerminal() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    if (terminalWebSocket && terminalWebSocket.readyState === WebSocket.OPEN) {
        showToast('终端已连接', 'info');
        return;
    }

    try {
        // 更新状态为连接中
        updateTerminalStatus('connecting');

        // 创建终端会话
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/terminal`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`创建终端会话失败: ${errorText}`);
        }

        terminalSession = await response.json();
        console.log('[Terminal] 创建会话:', terminalSession);

        // 连接WebSocket - 使用相对路径避免跨域问题
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//localhost:8080/api/v1/workspaces/${currentWorkspace}/terminal/${terminalSession.id}/ws`;

        console.log('[Terminal] 连接WebSocket:', wsUrl);

        // 添加连接超时处理
        const connectTimeout = setTimeout(() => {
            if (terminalWebSocket && terminalWebSocket.readyState === WebSocket.CONNECTING) {
                console.error('[Terminal] WebSocket连接超时');
                terminalWebSocket.close();
                showToast('终端连接超时，请检查网络连接', 'error');
                updateTerminalStatus('error');
            }
        }, 10000); // 10秒超时

        terminalWebSocket = new WebSocket(wsUrl);

        // 创建终端界面
        createTerminalInterface();

        terminalWebSocket.onopen = function () {
            console.log('[Terminal] WebSocket连接已建立');
            clearTimeout(connectTimeout); // 清除连接超时
            showToast('终端连接成功', 'success');
            updateTerminalStatus('connected');

            // 发送初始化命令
            setTimeout(() => {
                if (terminalWebSocket && terminalWebSocket.readyState === WebSocket.OPEN) {
                    terminalWebSocket.send('clear\n');
                }
            }, 100);
        };

        terminalWebSocket.onmessage = function (event) {

            // 统一处理数据，让appendToTerminalOutput处理类型转换
            appendToTerminalOutput(event.data);
        };

        terminalWebSocket.onclose = function (event) {
            console.log('[Terminal] WebSocket连接已关闭:', event.code, event.reason);
            clearTimeout(connectTimeout); // 清除连接超时
            showToast('终端连接已断开', 'warning');
            updateTerminalStatus('disconnected');
            terminalWebSocket = null;
            terminalSession = null;
        };

        terminalWebSocket.onerror = function (error) {
            console.error('[Terminal] WebSocket错误:', error);
            clearTimeout(connectTimeout); // 清除连接超时
            showToast('终端连接失败', 'error');
            updateTerminalStatus('error');
        };

    } catch (error) {
        console.error('[Terminal] 创建终端失败:', error);
        showToast('创建终端失败: ' + error.message, 'error');
        updateTerminalStatus('error');
    }
}

// 断开终端连接
function disconnectTerminal() {
    if (terminalWebSocket) {
        terminalWebSocket.close();
        terminalWebSocket = null;
        terminalSession = null;
        showToast('终端已断开连接', 'info');
    }

    // 重置终端界面
    const welcomeDiv = document.getElementById('terminalWelcome');
    const xtermContainer = document.getElementById('xtermContainer');

    if (welcomeDiv) welcomeDiv.style.display = 'flex';
    if (xtermContainer) xtermContainer.style.display = 'none';

    // 如果使用 xterm.js，清空并重置
    if (xterm && typeof Terminal !== 'undefined') {
        try {
            xterm.clear();
            xtermContainer.innerHTML = '';
        } catch (error) {
            console.error('清空 xterm 失败:', error);
        }
    }

    updateTerminalStatus('disconnected');
}

// 创建终端界面
function createTerminalInterface() {
    const terminalBody = document.getElementById('terminal');

    // 隐藏欢迎界面，显示 xterm 容器
    const welcomeDiv = document.getElementById('terminalWelcome');
    const xtermContainer = document.getElementById('xtermContainer');

    if (welcomeDiv) welcomeDiv.style.display = 'none';
    if (xtermContainer) xtermContainer.style.display = 'flex';

    // 如果 xterm.js 可用，使用它
    if (xterm && typeof Terminal !== 'undefined') {
        try {
            // 清空容器
            xtermContainer.innerHTML = '';

            // 打开 xterm
            xterm.open(xtermContainer);
            xtermFitAddon.fit();

            // 清空之前的内容
            xterm.clear();

            // 处理输入
            xterm.onData(function (data) {
                if (terminalWebSocket && terminalWebSocket.readyState === WebSocket.OPEN) {
                    terminalWebSocket.send(data);
                }
            });

            // 处理窗口大小变化
            window.addEventListener('resize', function () {
                if (xtermFitAddon) {
                    xtermFitAddon.fit();
                }
            });

            console.log('✅ Xterm.js 终端界面创建成功');
            return;
        } catch (error) {
            console.error('❌ Xterm.js 创建失败，使用备用终端:', error);
        }
    }

    // 备用方案：使用原来的简单终端
    terminalBody.innerHTML = `
        <div class="terminal-output" id="terminalOutput"></div>
        <div class="terminal-input-container">
            <input type="text" 
                   id="terminalInput" 
                   class="terminal-input" 
                   placeholder="输入命令..." 
                   autocomplete="off" 
                   spellcheck="false">
        </div>
    `;

    const input = document.getElementById('terminalInput');

    // 处理键盘事件
    input.addEventListener('keydown', function (event) {
        if (!terminalWebSocket || terminalWebSocket.readyState !== WebSocket.OPEN) {
            console.log('[Terminal] WebSocket未连接，忽略按键');
            return;
        }

        const keyCode = event.keyCode || event.which;
        console.log('[Terminal] 按键事件:', keyCode, event.key);

        if (keyCode === 13) { // Enter
            event.preventDefault();
            const command = input.value;
            console.log('[Terminal] 发送命令:', command);

            // 发送命令到终端
            terminalWebSocket.send(command + '\n');

            // 清空输入框
            input.value = '';
        } else if (keyCode === 9) { // Tab - 补全
            event.preventDefault();
            terminalWebSocket.send('\t');
        } else if (keyCode === 8) { // Backspace
            // 不发送Backspace，让浏览器处理
            return;
        } else if (keyCode === 127) { // Delete
            // 不发送Delete，让浏览器处理
            return;
        } else if (keyCode === 38) { // Arrow Up
            event.preventDefault();
            terminalWebSocket.send('\x1b[A');
        } else if (keyCode === 40) { // Arrow Down
            event.preventDefault();
            terminalWebSocket.send('\x1b[B');
        } else if (keyCode === 37) { // Arrow Left
            event.preventDefault();
            terminalWebSocket.send('\x1b[D');
        } else if (keyCode === 39) { // Arrow Right
            event.preventDefault();
            terminalWebSocket.send('\x1b[C');
        } else if (event.ctrlKey && keyCode === 67) { // Ctrl+C
            event.preventDefault();
            terminalWebSocket.send('\x03');
        } else if (event.ctrlKey && keyCode === 68) { // Ctrl+D
            event.preventDefault();
            terminalWebSocket.send('\x04');
        } else if (event.ctrlKey && keyCode === 90) { // Ctrl+Z
            event.preventDefault();
            terminalWebSocket.send('\x1a');
        }
        // 其他按键让浏览器正常处理（输入到输入框）
    });

    // 聚焦输入框
    input.focus();
}

// 向终端输出添加文本
function appendToTerminalOutput(text) {
    // 如果使用 xterm.js，直接写入
    if (xterm && typeof Terminal !== 'undefined') {
        try {
            // 检查text类型并转换为字符串
            if (text === null || text === undefined) {
                console.warn('收到空的终端数据');
                return;
            }

            let textStr = text;
            if (typeof text === 'object') {
                // 如果是Blob，转换为字符串
                if (text instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = function () {
                        const result = reader.result;
                        if (typeof result === 'string') {
                            xterm.write(result);
                        }
                    };
                    reader.readAsText(text, 'utf-8');
                    return; // 异步处理，直接返回
                }
                // 如果是ArrayBuffer，转换为字符串
                else if (text instanceof ArrayBuffer) {
                    const decoder = new TextDecoder('utf-8');
                    textStr = decoder.decode(text);
                } else {
                    console.warn('收到非字符串类型的终端数据:', typeof text);
                    textStr = String(text);
                }
            } else if (typeof text !== 'string') {
                textStr = String(text);
            }

            xterm.write(textStr);
            return;
        } catch (error) {
            console.error('Xterm.js 写入失败:', error);
        }
    }

    // 备用方案：使用原来的简单终端
    const output = document.getElementById('terminalOutput');
    if (!output) {
        console.error('终端输出容器不存在');
        return;
    }

    // 检查text类型并转换为字符串
    if (text === null || text === undefined) {
        console.warn('收到空的终端数据');
        return;
    }

    let textStr = text;
    if (typeof text === 'object') {
        // 如果是Blob，转换为字符串
        if (text instanceof Blob) {
            const reader = new FileReader();
            reader.onload = function () {
                const result = reader.result;
                if (typeof result === 'string') {
                    appendTextToOutput(result);
                }
            };
            reader.readAsText(text, 'utf-8');
            return; // 异步处理，直接返回
        }
        // 如果是ArrayBuffer，转换为字符串
        else if (text instanceof ArrayBuffer) {
            const decoder = new TextDecoder('utf-8');
            textStr = decoder.decode(text);
        } else {
            console.warn('收到非字符串类型的终端数据:', typeof text);
            textStr = String(text);
        }
    } else if (typeof text !== 'string') {
        textStr = String(text);
    }

    appendTextToOutput(textStr);
}

// 辅助函数：将文本添加到输出
function appendTextToOutput(textStr) {
    const output = document.getElementById('terminalOutput');
    if (!output) return;

    // 处理ANSI转义序列和特殊字符
    textStr = textStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 处理ANSI转义序列
    const processedText = processAnsiEscapeCodes(textStr);

    // 创建HTML元素并添加到输出
    const span = document.createElement('span');
    span.innerHTML = processedText;
    output.appendChild(span);

    // 滚动到底部
    output.scrollTop = output.scrollHeight;
}

// ANSI转义序列处理函数
function processAnsiEscapeCodes(text) {
    // 移除光标位置控制序列
    text = text.replace(/\x1b\[\?2004[hl]/g, ''); // 移除括号模式控制

    // 移除其他控制序列
    text = text.replace(/\x1b\[(\d+)A/g, ''); // 光标上移
    text = text.replace(/\x1b\[(\d+)B/g, ''); // 光标下移
    text = text.replace(/\x1b\[(\d+)C/g, ''); // 光标右移
    text = text.replace(/\x1b\[(\d+)D/g, ''); // 光标左移
    text = text.replace(/\x1b\[(\d+);(\d+)H/g, ''); // 光标定位
    text = text.replace(/\x1b\[K/g, ''); // 清除从光标到行尾
    text = text.replace(/\x1b\[J/g, ''); // 清除从光标到屏幕末尾
    text = text.replace(/\x1b\[(\d+)G/g, ''); // 光标水平定位

    // 移除其他可能的控制序列
    text = text.replace(/\x1b\[(\d+)X/g, ''); // 清除字符
    text = text.replace(/\x1b\[(\d+)L/g, ''); // 插入行
    text = text.replace(/\x1b\[(\d+)M/g, ''); // 删除行
    text = text.replace(/\x1b\[(\d+)P/g, ''); // 删除字符
    text = text.replace(/\x1b\[(\d+)@/g, ''); // 插入字符
    text = text.replace(/\x1b\[(\d+)S/g, ''); // 向上滚动
    text = text.replace(/\x1b\[(\d+)T/g, ''); // 向下滚动

    // 移除其他转义序列
    text = text.replace(/\x1b\[(\d+)d/g, ''); // 垂直定位
    text = text.replace(/\x1b\[(\d+)`/g, ''); // 水平定位
    text = text.replace(/\x1b\[(\d+)a/g, ''); // 水平定位
    text = text.replace(/\x1b\[(\d+)e/g, ''); // 垂直定位

    // 移除其他控制字符
    text = text.replace(/\x1b\[(\d+)c/g, ''); // 设备属性
    text = text.replace(/\x1b\[(\d+)f/g, ''); // 光标定位
    text = text.replace(/\x1b\[(\d+)g/g, ''); // 制表符停止
    text = text.replace(/\x1b\[(\d+)h/g, ''); // 设置模式
    text = text.replace(/\x1b\[(\d+)l/g, ''); // 重置模式
    text = text.replace(/\x1b\[(\d+)m/g, ''); // 其他SGR序列
    text = text.replace(/\x1b\[(\d+)n/g, ''); // 设备状态
    text = text.replace(/\x1b\[(\d+)q/g, ''); // 键盘LED
    text = text.replace(/\x1b\[(\d+)r/g, ''); // 设置滚动区域
    text = text.replace(/\x1b\[(\d+)s/g, ''); // 保存光标位置
    text = text.replace(/\x1b\[(\d+)u/g, ''); // 恢复光标位置

    // 移除其他转义序列
    text = text.replace(/\x1b\[(\d+);(\d+)r/g, ''); // 设置滚动区域
    text = text.replace(/\x1b\[(\d+);(\d+)f/g, ''); // 光标定位
    text = text.replace(/\x1b\[(\d+);(\d+)H/g, ''); // 光标定位

    // 处理颜色和样式 - 移到后面处理
    text = text.replace(/\x1b\[(\d+(?:;\d+)*)?m/g, function (match, codes) {
        if (!codes) {
            return '</span>'; // 重置所有样式
        }

        const codeArray = codes.split(';').map(Number);
        let styles = [];

        for (let code of codeArray) {
            switch (code) {
                // 前景色
                case 30: styles.push('color: #000000'); break; // 黑色
                case 31: styles.push('color: #ff0000'); break; // 红色
                case 32: styles.push('color: #00ff00'); break; // 绿色
                case 33: styles.push('color: #ffff00'); break; // 黄色
                case 34: styles.push('color: #0000ff'); break; // 蓝色
                case 35: styles.push('color: #ff00ff'); break; // 洋红
                case 36: styles.push('color: #00ffff'); break; // 青色
                case 37: styles.push('color: #ffffff'); break; // 白色

                // 背景色
                case 40: styles.push('background-color: #000000'); break; // 黑色背景
                case 41: styles.push('background-color: #ff0000'); break; // 红色背景
                case 42: styles.push('background-color: #00ff00'); break; // 绿色背景
                case 43: styles.push('background-color: #ffff00'); break; // 黄色背景
                case 44: styles.push('background-color: #0000ff'); break; // 蓝色背景
                case 45: styles.push('background-color: #ff00ff'); break; // 洋红背景
                case 46: styles.push('background-color: #00ffff'); break; // 青色背景
                case 47: styles.push('background-color: #ffffff'); break; // 白色背景

                // 样式
                case 0: return '</span>'; // 重置
                case 1: styles.push('font-weight: bold'); break; // 粗体
                case 4: styles.push('text-decoration: underline'); break; // 下划线
                case 7: styles.push('background-color: currentColor; color: #000000'); break; // 反色

                // 高亮前景色
                case 90: styles.push('color: #808080'); break; // 亮黑
                case 91: styles.push('color: #ff8080'); break; // 亮红
                case 92: styles.push('color: #80ff80'); break; // 亮绿
                case 93: styles.push('color: #ffff80'); break; // 亮黄
                case 94: styles.push('color: #8080ff'); break; // 亮蓝
                case 95: styles.push('color: #ff80ff'); break; // 亮洋红
                case 96: styles.push('color: #80ffff'); break; // 亮青
                case 97: styles.push('color: #ffffff'); break; // 亮白
            }
        }

        if (styles.length > 0) {
            return `<span style="${styles.join('; ')}">`;
        }

        return '';
    });

    // 移除残留的控制字符
    text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); // 移除任何残留的转义序列
    text = text.replace(/\x1b\[[0-9;]*/g, ''); // 移除不完整的转义序列

    // 清理多余的等号和其他控制字符
    text = text.replace(/^=+/, ''); // 移除开头的等号
    text = text.replace(/=+$/, ''); // 移除结尾的等号

    // 只移除真正的控制字符，保留换行符和npm进度指示器
    text = text.replace(/[\u0000-\u0007\u000B\u000E-\u001F\u007F-\u009F]/g, ''); // 移除控制字符，但保留\t\n\r

    // 保留npm进度指示器（盲文模式字符）
    // 这些字符是npm下载进度的动画：⠇⠙⠹⠸⠼⠴⠦⠧⠏⠋
    // 不要删除它们！

    // 只移除其他可能的控制字符，但保留换行符
    text = text.replace(/[\u0008]/g, ''); // 只移除退格符

    // 清理npm进度指示器的重复显示
    // 将连续的进度指示器替换为单个
    text = text.replace(/([⠇⠙⠹⠸⠼⠴⠦⠧⠏⠋])\1+/g, '$1');

    // 清理提示符前的等号
    text = text.replace(/([=]+)(root@[^#]+#)/g, '$2');

    return text;
}

// 更新终端状态
function updateTerminalStatus(status) {
    const terminalContainer = document.querySelector('.terminal-container');
    const terminalTitle = document.querySelector('.terminal-title span');

    if (terminalContainer) {
        // 移除所有状态类
        terminalContainer.classList.remove('terminal-status-connected', 'terminal-status-disconnected', 'terminal-status-error', 'terminal-status-connecting');
        // 添加当前状态类
        terminalContainer.classList.add(`terminal-status-${status}`);
    }

    if (terminalTitle) {
        switch (status) {
            case 'connected':
                terminalTitle.textContent = '终端 (已连接)';
                break;
            case 'disconnected':
                terminalTitle.textContent = '终端 (已断开)';
                break;
            case 'error':
                terminalTitle.textContent = '终端 (错误)';
                break;
            case 'connecting':
                terminalTitle.textContent = '终端 (连接中)';
                break;
            default:
                terminalTitle.textContent = '终端';
        }
    }
}

// 清屏
function clearTerminal() {
    // 如果使用 xterm.js，清空终端
    if (xterm && typeof Terminal !== 'undefined') {
        try {
            xterm.clear();
            return;
        } catch (error) {
            console.error('清空 xterm 失败:', error);
        }
    }

    // 备用方案：清空简单终端
    const output = document.getElementById('terminalOutput');
    if (output) {
        output.innerHTML = '';
    }
}

// 新终端
function newTerminal() {
    disconnectTerminal();
    setTimeout(() => {
        connectTerminal();
    }, 500);
}

// 文件管理器功能
function refreshFileTree() {
    if (currentWorkspace) {
        loadDirectory(currentDirectory);
        showToast('文件树已刷新', 'success');
    } else {
        showToast('请先选择工作空间', 'warning');
    }
}

function createFile() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    const fileName = prompt('请输入文件名:');
    if (fileName && fileName.trim()) {
        // 这里可以实现创建文件的逻辑
        showToast(`文件 ${fileName} 创建功能待实现`, 'info');
    }
}

function createFolder() {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    const folderName = prompt('请输入文件夹名:');
    if (folderName && folderName.trim()) {
        // 这里可以实现创建文件夹的逻辑
        showToast(`文件夹 ${folderName} 创建功能待实现`, 'info');
    }
}

// 镜像管理功能
async function loadImages() {
    try {
        const response = await fetch('/api/v1/images');
        if (response.ok) {
            const images = await response.json();
            displayImages(images);
        } else {
            throw new Error(await response.text());
        }
    } catch (error) {
        console.error('加载镜像列表失败:', error);
        showToast('加载镜像列表失败: ' + error.message, 'error');

        // 显示空状态
        const imageList = document.getElementById('imageList');
        imageList.innerHTML = `
            <div class="image-empty">
                <i class="fas fa-layer-group"></i>
                <div>加载镜像失败</div>
                <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">请检查Docker服务状态</div>
            </div>
        `;
    }
}

function displayImages(images) {
    const container = document.getElementById('imageList');

    if (!images || images.length === 0) {
        container.innerHTML = `
            <div class="image-empty">
                <i class="fas fa-layer-group"></i>
                <div>暂无镜像</div>
                <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">点击拉取镜像按钮获取镜像</div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    images.forEach(image => {
        const item = document.createElement('div');
        item.className = 'image-item';

        const size = image.size ? formatBytes(image.size) : '未知';
        const created = image.created ? new Date(image.created).toLocaleDateString() : '未知';

        item.innerHTML = `
            <div class="image-name">${image.repository}:${image.tag}</div>
            <div class="image-details">
                <span class="image-size">${size}</span>
                <span style="font-size: 10px; color: var(--text-secondary);">${created}</span>
            </div>
            <div class="image-actions" style="margin-top: 8px; display: flex; gap: 4px;">
                <button class="btn btn-sm" onclick="deleteImage('${image.id}')" title="删除镜像">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        container.appendChild(item);
    });
}

function pullImage() {
    const imageName = prompt('请输入要拉取的镜像名称 (例如: nginx:latest):');
    if (imageName && imageName.trim()) {
        showToast(`拉取镜像 ${imageName} 功能待实现`, 'info');
    }
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
            showToast('镜像删除成功', 'success');
            loadImages();
        } else {
            throw new Error(await response.text());
        }
    } catch (error) {
        showToast('删除镜像失败: ' + error.message, 'error');
    }
}

// 格式化字节大小
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 主题管理
function initTheme() {
    // 从localStorage获取保存的主题，默认为暗色主题
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    // 保存主题选择
    localStorage.setItem('theme', newTheme);

    showToast(`已切换到${newTheme === 'dark' ? '暗色' : '亮色'}主题`, 'success');
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // 更新主题图标
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // 更新Monaco Editor主题
    if (monacoEditor) {
        monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }
}

// Git操作
async function gitStatus() {
    await gitOperation('status');
}

async function gitAdd() {
    await gitOperation('add');
}

async function gitCommit() {
    const message = document.getElementById('commitMessage').value.trim();
    if (!message) {
        showToast('请输入提交信息', 'warning');
        return;
    }
    await gitOperation('commit', message);
}

async function gitPush() {
    await gitOperation('push');
}

async function gitPull() {
    await gitOperation('pull');
}

async function gitOperation(type, message = '') {
    if (!currentWorkspace) {
        showToast('请先选择工作空间', 'warning');
        return;
    }

    // 切换到终端面板以显示输出
    switchPanel('terminal');

    const button = event.target;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span class="loading-spinner"></span>';
    button.disabled = true;

    try {
        const body = { type };
        if (message) body.message = message;

        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/git`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.output) {
                const cleanOutput = data.output.replace(/[\u0001\u0002]\u0000{6}/g, '').replace(/\ufffd/g, '');
                appendToTerminal(cleanOutput, 'output');
            }

            showToast(`Git ${type} 操作完成！`, 'success');

            // 清空提交信息
            if (type === 'commit' && message) {
                document.getElementById('commitMessage').value = '';
            }

            // 如果是克隆操作，刷新文件树
            if (type === 'clone') {
                await loadDirectory('/workspace');
            }
        } else {
            const error = await response.text();
            appendToTerminal(`Git操作失败: ${error}`, 'error');
            showToast(`Git ${type} 操作失败`, 'error');
        }
    } catch (error) {
        appendToTerminal(`Git操作异常: ${error.message}`, 'error');
        showToast(`Git ${type} 操作异常`, 'error');
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

// 监控相关
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
        const workspaceResponse = await fetch(`/api/v1/workspaces/${workspaceId}`);
        if (workspaceResponse.ok) {
            const workspace = await workspaceResponse.json();

            const statsResponse = await fetch(`/api/v1/containers/${workspace.container_id}/stats`);
            if (statsResponse.ok) {
                const stats = await statsResponse.json();

                document.getElementById('cpuUsage').textContent =
                    stats.cpu_usage ? stats.cpu_usage.toFixed(1) + '%' : '--';
                document.getElementById('memoryUsage').textContent =
                    stats.memory_usage ? stats.memory_usage.toFixed(1) + '%' : '--';
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

function getLanguageFromFilename(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'py': 'python',
        'go': 'go',
        'java': 'java',
        'php': 'php',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'sass',
        'less': 'less',
        'json': 'json',
        'md': 'markdown',
        'xml': 'xml',
        'sql': 'sql',
        'sh': 'shell',
        'bash': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml',
        'toml': 'toml',
        'ini': 'ini',
        'txt': 'plaintext',
        'log': 'plaintext',
        'rb': 'ruby',
        'rs': 'rust',
        'cpp': 'cpp',
        'c': 'c',
        'h': 'c',
        'cs': 'csharp',
        'kt': 'kotlin',
        'swift': 'swift',
        'dart': 'dart',
        'vue': 'html',
        'svelte': 'html'
    };
    return languageMap[ext] || 'plaintext';
}

function getRunCommand(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const commandMap = {
        'js': ['node', filePath],
        'ts': ['npx', 'ts-node', filePath],
        'py': ['python3', filePath],
        'go': ['go', 'run', filePath],
        'java': ['java', filePath.replace('.java', '')],
        'php': ['php', filePath],
        'sh': ['bash', filePath],
        'rb': ['ruby', filePath],
        'rs': ['rustc', filePath, '&&', `./${filePath.replace('.rs', '')}`],
        'cpp': ['g++', filePath, '-o', filePath.replace('.cpp', ''), '&&', `./${filePath.replace('.cpp', '')}`],
        'c': ['gcc', filePath, '-o', filePath.replace('.c', ''), '&&', `./${filePath.replace('.c', '')}`]
    };
    return commandMap[ext];
}

// 镜像管理函数
async function loadImages() {
    const button = event.target;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span class="loading-spinner"></span> 加载中...';
    button.disabled = true;

    try {
        const response = await fetch('/api/v1/images');
        if (response.ok) {
            const images = await response.json();
            displayImages(images);
            showToast('镜像列表已刷新', 'success');
        } else {
            const error = await response.text();
            showToast('加载镜像失败: ' + error, 'error');
        }
    } catch (error) {
        console.error('加载镜像失败:', error);
        showToast('加载镜像失败: ' + error.message, 'error');
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

function displayImages(images) {
    const container = document.getElementById('imageList');
    container.innerHTML = '';

    if (images.length === 0) {
        container.innerHTML = `
            <div style="padding: 15px; text-align: center; color: #969696; font-size: 12px;">
                <i class="fas fa-box-open" style="font-size: 1.5rem; margin-bottom: 6px;"></i>
                <div>暂无镜像</div>
                <div style="font-size: 10px; margin-top: 4px;">创建工作空间时会自动拉取</div>
            </div>
        `;
        return;
    }

    images.forEach(image => {
        const item = document.createElement('div');
        item.className = 'image-item';

        // 获取镜像名称和标签
        const imageName = image.tags && image.tags.length > 0 ?
            image.tags[0] :
            `<未标记>:${image.id.substring(0, 12)}`;

        // 格式化大小
        const sizeInMB = (image.size / 1024 / 1024).toFixed(1);

        item.innerHTML = `
            <div class="image-name">${imageName}</div>
            <div class="image-details">
                <span>ID: ${image.id.substring(0, 12)}</span>
                <span class="image-size">${sizeInMB} MB</span>
            </div>
            <div class="image-actions">
                <button class="btn btn-secondary" onclick="deleteImage('${image.id}')" title="删除镜像">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;

        container.appendChild(item);
    });
}

async function deleteImage(imageId) {
    if (!confirm('确定要删除这个镜像吗？\n注意：如果有工作空间正在使用此镜像，删除可能会失败。')) {
        return;
    }

    const button = event.target;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span class="loading-spinner"></span>';
    button.disabled = true;

    try {
        const response = await fetch(`/api/v1/images/${imageId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('镜像删除成功！', 'success');
            loadImages(); // 刷新镜像列表
        } else {
            const error = await response.text();
            showToast('删除镜像失败: ' + error, 'error');
        }
    } catch (error) {
        showToast('删除镜像失败: ' + error.message, 'error');
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

// 创建终端标签页
function createTerminalTab(terminalId, title = 'Terminal') {
    const terminalTabs = document.getElementById('terminal-tabs');
    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.setAttribute('data-terminal-id', terminalId);
    tab.innerHTML = `
        <span class="tab-title">${title}</span>
        <button class="tab-close" onclick="closeTerminal('${terminalId}')">×</button>
    `;

    tab.addEventListener('click', () => {
        switchTerminal(terminalId);
    });

    terminalTabs.appendChild(tab);
    return tab;
}

// 切换终端
function switchTerminal(terminalId) {
    // 隐藏所有终端
    document.querySelectorAll('.terminal-panel').forEach(panel => {
        panel.style.display = 'none';
    });

    // 移除所有活动标签样式
    document.querySelectorAll('.terminal-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // 显示选中的终端
    const terminalPanel = document.querySelector(`[data-terminal-id="${terminalId}"]`);
    if (terminalPanel) {
        terminalPanel.style.display = 'block';
    }

    // 激活对应的标签
    const terminalTab = document.querySelector(`.terminal-tab[data-terminal-id="${terminalId}"]`);
    if (terminalTab) {
        terminalTab.classList.add('active');
    }

    activeTerminalId = terminalId;
}

// 关闭终端
function closeTerminal(terminalId) {
    // 关闭WebSocket连接
    const terminal = terminals.find(t => t.id === terminalId);
    if (terminal && terminal.ws) {
        terminal.ws.close();
    }

    // 移除终端
    terminals = terminals.filter(t => t.id !== terminalId);

    // 移除标签页
    const tab = document.querySelector(`.terminal-tab[data-terminal-id="${terminalId}"]`);
    if (tab) {
        tab.remove();
    }

    // 移除终端面板
    const panel = document.querySelector(`[data-terminal-id="${terminalId}"]`);
    if (panel) {
        panel.remove();
    }

    // 如果关闭的是当前活动终端，切换到其他终端
    if (activeTerminalId === terminalId) {
        const remainingTerminals = terminals.filter(t => t.id !== terminalId);
        if (remainingTerminals.length > 0) {
            switchTerminal(remainingTerminals[0].id);
        } else {
            // 没有终端了，隐藏终端区域
            document.getElementById('terminal-container').style.display = 'none';
        }
    }
}

// 创建新终端
async function createTerminal() {
    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/terminal`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('创建终端失败: ' + await response.text());
        }

        const session = await response.json();
        const terminalId = session.id;

        // 创建终端面板
        const terminalContainer = document.getElementById('terminal-container');
        terminalContainer.style.display = 'block';

        const terminalContent = document.getElementById('terminal-content');
        const terminalPanel = document.createElement('div');
        terminalPanel.className = 'terminal-panel';
        terminalPanel.setAttribute('data-terminal-id', terminalId);
        terminalPanel.style.display = 'none';

        terminalPanel.innerHTML = `
            <div class="terminal-output" id="terminal-output-${terminalId}"></div>
            <div class="terminal-input-line">
                <span class="terminal-prompt" id="terminal-prompt-${terminalId}">$</span>
                <input type="text" class="terminal-input" id="terminal-input-${terminalId}" placeholder="输入命令...">
            </div>
        `;

        terminalContent.appendChild(terminalPanel);

        // 创建标签页
        createTerminalTab(terminalId, `Terminal ${terminals.length + 1}`);

        // 连接WebSocket
        const wsUrl = `ws://localhost:8080/api/v1/workspaces/${currentWorkspace}/terminal/${terminalId}/ws`;
        const ws = new WebSocket(wsUrl);

        const terminal = {
            id: terminalId,
            ws: ws,
            output: document.getElementById(`terminal-output-${terminalId}`),
            input: document.getElementById(`terminal-input-${terminalId}`),
            prompt: document.getElementById(`terminal-prompt-${terminalId}`)
        };

        terminals.push(terminal);

        ws.onopen = function () {
            console.log('终端WebSocket连接成功');
            terminal.output.innerHTML += '<div class="terminal-line">终端已连接</div>';
        };

        ws.onmessage = function (event) {
            let data = event.data;

            if (data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = function () {
                    const processedText = processAnsiEscapeCodes(reader.result);
                    terminal.output.innerHTML += `<div class="terminal-line">${processedText}</div>`;
                    terminal.output.scrollTop = terminal.output.scrollHeight;
                };
                reader.readAsText(data, 'utf-8');
            } else {
                const processedText = processAnsiEscapeCodes(data);
                terminal.output.innerHTML += `<div class="terminal-line">${processedText}</div>`;
                terminal.output.scrollTop = terminal.output.scrollHeight;
            }
        };

        ws.onclose = function (event) {
            console.log('终端WebSocket连接关闭:', event.code);
            terminal.output.innerHTML += '<div class="terminal-line">终端连接已关闭</div>';
        };

        ws.onerror = function (error) {
            console.error('终端WebSocket错误:', error);
            terminal.output.innerHTML += '<div class="terminal-line">终端连接错误</div>';
        };

        // 设置输入处理
        terminal.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                const command = this.value;
                if (command.trim()) {
                    terminal.output.innerHTML += `<div class="terminal-line"><span class="command">$ ${command}</span></div>`;
                    if (terminal.ws && terminal.ws.readyState === WebSocket.OPEN) {
                        terminal.ws.send(command + '\n');
                    }
                    this.value = '';
                }
                e.preventDefault();
            }
        });

        // 切换到新终端
        switchTerminal(terminalId);

    } catch (error) {
        console.error('创建终端失败:', error);
    }
}

// 更新HTML结构
function updateHTMLStructure() {
    const mainContainer = document.getElementById('main-container');

    // 更新终端区域为VSCode风格
    const terminalContainer = document.getElementById('terminal-container');
    if (terminalContainer) {
        terminalContainer.innerHTML = `
            <div class="terminal-header">
                <div class="terminal-tabs" id="terminal-tabs"></div>
                <div class="terminal-actions">
                    <button class="terminal-action-btn" onclick="createTerminal()" title="新建终端">
                        <span>+</span>
                    </button>
                    <button class="terminal-action-btn" onclick="toggleTerminal()" title="切换终端">
                        <span>⌄</span>
                    </button>
                </div>
            </div>
            <div class="terminal-content" id="terminal-content"></div>
        `;
    }

    // 更新文件浏览器，添加返回上一级功能
    const fileBrowser = document.getElementById('file-browser');
    if (fileBrowser) {
        const header = fileBrowser.querySelector('.file-browser-header');
        if (header) {
            header.innerHTML = `
                <div class="file-browser-title">文件浏览器</div>
                <div class="file-browser-actions">
                    <button class="file-action-btn" onclick="goToParentDirectory()" title="返回上一级">
                        <span>↑</span>
                    </button>
                    <button class="file-action-btn" onclick="refreshFileBrowser()" title="刷新">
                        <span>↻</span>
                    </button>
                </div>
            `;
        }
    }
}

// 返回上一级目录
async function goToParentDirectory() {
    if (currentDirectory === '/workspace') {
        return;
    }

    const parentDir = currentDirectory.split('/').slice(0, -1).join('/') || '/workspace';
    await loadDirectory(parentDir);
}

// 刷新文件浏览器
async function refreshFileBrowser() {
    await loadDirectory(currentDirectory);
}

// 加载目录内容
async function loadDirectory(path) {
    try {
        const response = await fetch(`/api/v1/workspaces/${currentWorkspace}/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error('加载目录失败');
        }

        const files = await response.json();
        currentDirectory = path;

        // 更新文件列表
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '';

        // 添加返回上一级选项（如果不是根目录）
        if (path !== '/workspace') {
            const backItem = document.createElement('div');
            backItem.className = 'file-item back-item';
            backItem.innerHTML = '<span class="file-icon">📁</span><span class="file-name">..</span>';
            backItem.onclick = () => goToParentDirectory();
            fileList.appendChild(backItem);
        }

        // 添加文件和目录
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';

            const icon = file.is_dir ? '📁' : '📄';
            fileItem.innerHTML = `
                <span class="file-icon">${icon}</span>
                <span class="file-name">${file.name}</span>
            `;

            if (file.is_dir) {
                fileItem.onclick = () => loadDirectory(path + '/' + file.name);
            } else {
                fileItem.onclick = () => openFile(path + '/' + file.name);
            }

            fileList.appendChild(fileItem);
        });

        // 更新当前路径显示
        const pathDisplay = document.querySelector('.file-browser-title');
        if (pathDisplay) {
            pathDisplay.textContent = `文件浏览器 - ${path}`;
        }

    } catch (error) {
        console.error('加载目录失败:', error);
    }
}

// 切换终端显示
function toggleTerminal() {
    const terminalContainer = document.getElementById('terminal-container');
    const isVisible = terminalContainer.style.display !== 'none';
    terminalContainer.style.display = isVisible ? 'none' : 'block';
}

// 更新CSS样式
function updateStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* VSCode风格的终端样式 */
        .terminal-container {
            background: #1e1e1e;
            border-top: 1px solid #3c3c3c;
            height: 300px;
            display: flex;
            flex-direction: column;
        }
        
        .terminal-header {
            background: #2d2d30;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px;
            height: 35px;
        }
        
        .terminal-tabs {
            display: flex;
            flex: 1;
        }
        
        .terminal-tab {
            background: #1e1e1e;
            color: #cccccc;
            padding: 8px 12px;
            border-right: 1px solid #3c3c3c;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            min-width: 120px;
        }
        
        .terminal-tab.active {
            background: #007acc;
            color: white;
        }
        
        .terminal-tab:hover {
            background: #3c3c3c;
        }
        
        .tab-close {
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 2px;
        }
        
        .tab-close:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .terminal-actions {
            display: flex;
            gap: 5px;
        }
        
        .terminal-action-btn {
            background: none;
            border: none;
            color: #cccccc;
            cursor: pointer;
            padding: 5px;
            border-radius: 3px;
            font-size: 14px;
        }
        
        .terminal-action-btn:hover {
            background: #3c3c3c;
        }
        
        .terminal-content {
            flex: 1;
            overflow: hidden;
        }
        
        .terminal-panel {
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        .terminal-output {
            flex: 1;
            background: #1e1e1e;
            color: #cccccc;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            padding: 10px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .terminal-line {
            margin: 0;
            line-height: 1.4;
        }
        
        .terminal-input-line {
            background: #1e1e1e;
            border-top: 1px solid #3c3c3c;
            padding: 5px 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .terminal-prompt {
            color: #007acc;
            font-weight: bold;
        }
        
        .terminal-input {
            background: transparent;
            border: none;
            color: #cccccc;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            flex: 1;
            outline: none;
        }
        
        .terminal-input::placeholder {
            color: #666666;
        }
        
        .command {
            color: #007acc;
            font-weight: bold;
        }
        
        /* 文件浏览器样式 */
        .file-browser-header {
            background: #2d2d30;
            border-bottom: 1px solid #3c3c3c;
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .file-browser-title {
            color: #cccccc;
            font-size: 12px;
            font-weight: bold;
        }
        
        .file-browser-actions {
            display: flex;
            gap: 5px;
        }
        
        .file-action-btn {
            background: none;
            border: none;
            color: #cccccc;
            cursor: pointer;
            padding: 3px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .file-action-btn:hover {
            background: #3c3c3c;
        }
        
        .file-item {
            padding: 6px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #cccccc;
            font-size: 12px;
        }
        
        .file-item:hover {
            background: #3c3c3c;
        }
        
        .file-item.back-item {
            color: #007acc;
            font-weight: bold;
        }
        
        .file-icon {
            font-size: 14px;
        }
        
        .file-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        /* 暗色主题适配 */
        [data-theme="dark"] .terminal-container {
            background: #1e1e1e;
        }
        
        [data-theme="dark"] .terminal-header {
            background: #2d2d30;
        }
        
        [data-theme="dark"] .terminal-tab {
            background: #1e1e1e;
            color: #cccccc;
        }
        
        [data-theme="dark"] .terminal-tab.active {
            background: #007acc;
            color: white;
        }
        
        [data-theme="dark"] .terminal-output {
            background: #1e1e1e;
            color: #cccccc;
        }
        
        /* 亮色主题适配 */
        [data-theme="light"] .terminal-container {
            background: #f3f3f3;
        }
        
        [data-theme="light"] .terminal-header {
            background: #e1e1e1;
        }
        
        [data-theme="light"] .terminal-tab {
            background: #f3f3f3;
            color: #333333;
        }
        
        [data-theme="light"] .terminal-tab.active {
            background: #007acc;
            color: white;
        }
        
        [data-theme="light"] .terminal-output {
            background: #ffffff;
            color: #333333;
        }
    `;
    document.head.appendChild(style);
}