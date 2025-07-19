import React, { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getStatusText } from '../utils';
import './WorkspacePanel.css';

const WorkspacePanel: React.FC = () => {
  const { 
    workspaces, 
    currentWorkspace, 
    createWorkspace, 
    selectWorkspace, 
    startWorkspace, 
    stopWorkspace, 
    deleteWorkspace 
  } = useWorkspace();

  const [name, setName] = useState('');
  const [image, setImage] = useState('node:18-slim');
  const [gitRepo, setGitRepo] = useState('');
  const [gitBranch, setGitBranch] = useState('main');

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createWorkspace(name, image, gitRepo, gitBranch);
      setName('');
      setGitRepo('');
      setGitBranch('main');
    } catch (error) {
      console.error('创建工作空间失败:', error);
    }
  };

  return (
    <>
      {/* 创建工作空间 */}
      <div className="workspace-creation">
        <div className="workspace-creation-body">
          <div className="form-group">
            <label className="form-label">名称</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="输入工作空间名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">开发环境</label>
            <select className="form-control" value={image} onChange={(e) => setImage(e.target.value)}>
              <option value="node:18-slim">Node.js 18 (Debian Slim)</option>
              <option value="python:3.11-slim">Python 3.11 (Debian Slim)</option>
              <option value="golang:1.24-slim">Go 1.24 (Debian Slim)</option>
              <option value="openjdk:17-slim">Java 17 (Debian Slim)</option>
              <option value="php:8.2-cli-slim">PHP 8.2 CLI (Debian Slim)</option>
              <option value="ruby:3.2-slim">Ruby 3.2 (Debian Slim)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Git 仓库 (可选)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="https://github.com/user/repo.git"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">分支</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="main" 
              value={gitBranch}
              onChange={(e) => setGitBranch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary w-100" onClick={handleCreate}>
            <i className="fas fa-rocket"></i> 创建
          </button>
        </div>
      </div>

      {/* 工作空间列表 */}
      <div className="workspace-list">

        <div className="workspace-list-content">
          {!workspaces || workspaces.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', color: '#969696'}}>
              <i className="fas fa-folder-open" style={{fontSize: '2rem', marginBottom: '8px'}}></i>
              <div>暂无工作空间</div>
              <div style={{fontSize: '11px', marginTop: '4px'}}>点击上方创建您的第一个工作空间</div>
            </div>
          ) : (
            workspaces.map((workspace: any) => (
              <div 
                key={workspace.id}
                className={`workspace-item ${currentWorkspace === workspace.id ? 'active' : ''}`}
              >
                <div className="workspace-name">
                  <i className="fas fa-cube"></i>
                  {workspace.name}
                </div>
                <div className="workspace-details">
                  <span className="workspace-image">{workspace.image}</span>
                  <span className={`workspace-status ${workspace.status}`}>
                    {getStatusText(workspace.status)}
                  </span>
                </div>
                <div className="workspace-actions">
                  <button className="btn" onClick={() => selectWorkspace(workspace.id)} title="选择工作空间">
                    <i className="fas fa-folder-open"></i>
                  </button>
                  {workspace.status !== 'running' ? (
                    <button className="btn" onClick={() => startWorkspace(workspace.id)} title="启动工作空间">
                      <i className="fas fa-play"></i>
                    </button>
                  ) : (
                    <button className="btn" onClick={() => stopWorkspace(workspace.id)} title="停止工作空间">
                      <i className="fas fa-stop"></i>
                    </button>
                  )}
                  <button className="btn" onClick={() => deleteWorkspace(workspace.id)} title="删除工作空间">
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default WorkspacePanel; 