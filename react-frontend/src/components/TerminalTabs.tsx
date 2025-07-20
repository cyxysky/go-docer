import React from 'react';
import { useMultiTerminal } from '../contexts/MultiTerminalContext';
import './TerminalTabs.css';

const TerminalTabs: React.FC = () => {
  const {
    terminalTabs,
    addTerminal,
    removeTerminal,
    setActiveTerminal
  } = useMultiTerminal();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return 'fas fa-circle text-success';
      case 'connecting':
        return 'fas fa-spinner fa-spin text-warning';
      case 'error':
        return 'fas fa-exclamation-circle text-danger';
      default:
        return 'fas fa-circle text-muted';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return '#10b981';
      case 'connecting':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs-list">
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.isActive ? 'active' : ''}`}
            onClick={() => setActiveTerminal(tab.id)}
          >
            <div className="terminal-tab-content">
              <i 
                className={getStatusIcon(tab.status)} 
                style={{ color: getStatusColor(tab.status) }}
              ></i>
              <span className="terminal-tab-title">{tab.title}</span>
            </div>
            {terminalTabs.length > 1 && (
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTerminal(tab.id);
                }}
                title="关闭终端"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        className="terminal-tab-add"
        onClick={addTerminal}
        title="新建终端"
      >
        <i className="fas fa-plus"></i>
      </button>
    </div>
  );
};

export default TerminalTabs; 