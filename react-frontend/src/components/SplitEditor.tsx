import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import MonacoEditor from './MonacoEditor';
import AIAgent from './AIAgent';
import './SplitEditor.css';

export interface EditorPane {
  id: string;
  type: 'editor' | 'split';
  direction?: 'horizontal' | 'vertical';
  size?: number;
  children?: EditorPane[];
  openFiles: string[]; // 在此面板打开的文件列表
  activeFile: string | null;
  isActive: boolean;
}

interface SplitEditorProps {
  className?: string;
}

const SplitEditor: React.FC<SplitEditorProps> = ({ className }) => {
  const { currentWorkspace } = useWorkspace();
  const { openFile, setActiveTab } = useFile();

  // 分割面板状态
  const [editorPanes, setEditorPanes] = useState<EditorPane[]>([
    {
      id: 'main',
      type: 'editor',
      size: 100,
      isActive: true,
      openFiles: [],
      activeFile: null
    }
  ]);

  // 拖拽状态
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'left' | 'right' | 'top' | 'bottom' | 'center' | null>(null);
  const [dragSourcePane, setDragSourcePane] = useState<string | null>(null);

  // 调整大小状态
  const [isResizing, setIsResizing] = useState(false);
  const [resizeData, setResizeData] = useState<{
    paneId: string;
    childIndex: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  // AI助手状态
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(400);

  // 添加快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setIsAIVisible(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);



  // 监听拖拽事件
  useEffect(() => {
    const handleFileDragStart = (event: CustomEvent) => {
      setDraggedFile(event.detail.filePath);
    };

    const handleFileDragEnd = () => {
      setDraggedFile(null);
      setDragOverPane(null);
      setDragPosition(null);
      setDragSourcePane(null);
    };

    const handleTabDragStart = (event: CustomEvent) => {
      setDraggedFile(event.detail.filePath);
      setDragSourcePane(event.detail.sourcePane);
    };

    const handleTabDragEnd = () => {
      setDraggedFile(null);
      setDragOverPane(null);
      setDragPosition(null);
      setDragSourcePane(null);
    };

    const handleFileClick = (event: CustomEvent) => {
      const filePath = event.detail.filePath;
      if (filePath) {
        console.log('🔄 文件点击事件:', filePath);

        // 找到激活的面板，如果没有则使用第一个面板
        const activePane = findActivePane(editorPanes);
        const targetPane = activePane || editorPanes[0];

        if (targetPane) {
          console.log('🔄 在面板中打开文件:', { filePath, paneId: targetPane.id });
          openFileInPane(filePath, targetPane.id);
        }
      }
    };

    window.addEventListener('file-drag-start', handleFileDragStart as EventListener);
    window.addEventListener('file-drag-end', handleFileDragEnd as EventListener);
    window.addEventListener('tab-drag-start', handleTabDragStart as EventListener);
    window.addEventListener('tab-drag-end', handleTabDragEnd as EventListener);
    window.addEventListener('file-click', handleFileClick as EventListener);

    return () => {
      window.removeEventListener('file-drag-start', handleFileDragStart as EventListener);
      window.removeEventListener('file-drag-end', handleFileDragEnd as EventListener);
      window.removeEventListener('tab-drag-start', handleTabDragStart as EventListener);
      window.removeEventListener('tab-drag-end', handleTabDragEnd as EventListener);
      window.removeEventListener('file-click', handleFileClick as EventListener);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [editorPanes, currentWorkspace]);

  // 在指定区域打开文件
  const openFileInPane = async (filePath: string, paneId: string) => {
    try {
      if (!currentWorkspace) {
        console.warn('❌ 没有选择工作空间，无法打开文件');
        return;
      }
      await openFile(filePath);
      setEditorPanes(prevPanes => {
        const updatePaneFiles = (panes: EditorPane[]): EditorPane[] => {
          return panes.map(pane => {
            if (pane.id === paneId) {
              // 添加文件到此面板的打开文件列表（如果还没有的话）
              const newOpenFiles = pane.openFiles.includes(filePath)
                ? pane.openFiles
                : [...pane.openFiles, filePath];

              return {
                ...pane,
                openFiles: newOpenFiles,
                activeFile: filePath,
                isActive: true
              };
            }
            if (pane.children) {
              return { ...pane, children: updatePaneFiles(pane.children) };
            }
            return pane;
          });
        };
        return updatePaneFiles(prevPanes);
      });
    } catch (error) {
      console.error('❌ 打开文件失败:', error);
    }
  }

  // 处理文件拖拽放置
  const handleDrop = async (paneId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
    if (!draggedFile) return;

    if (position === 'center') {
      await openFileInPane(draggedFile, paneId);
      setDraggedFile(null);
      setDragOverPane(null);
      setDragPosition(null);
      return;
    }

    const direction = position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
    const newPane: EditorPane = {
      id: `editor-${Date.now()}`,
      type: 'editor',
      size: 50,
      isActive: true,
      openFiles: [],
      activeFile: null
    };

    setEditorPanes(prevPanes => {
      const updatePanes = (panes: EditorPane[]): EditorPane[] => {
        return panes.map(pane => {
          if (pane.id === paneId) {
            const splitPane: EditorPane = {
              id: `split-${Date.now()}`,
              type: 'split',
              direction,
              size: pane.size ?? 100,
              children: [],
              openFiles: [],
              activeFile: null,
              isActive: false
            };

            if (position === 'left' || position === 'top') {
              splitPane.children = [newPane, { ...pane, size: 50 }];
            } else {
              splitPane.children = [{ ...pane, size: 50 }, newPane];
            }

            return splitPane;
          }
          if (pane.children) {
            return { ...pane, children: updatePanes(pane.children) };
          }
          return pane;
        });
      };
      return updatePanes(prevPanes);
    });

    if (draggedFile) {
      await openFileInPane(draggedFile, newPane.id);
    }

    setDraggedFile(null);
    setDragOverPane(null);
    setDragPosition(null);
    setDragSourcePane(null);
  };

  // 处理标签页拖拽放置
  const handleTabDrop = async (targetPaneId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center', filePath: string) => {
    if (!dragSourcePane || !filePath) return;

    const sourcePane = findPane(editorPanes, dragSourcePane);
    if (!sourcePane) return;

    try {
      if (position === 'center') {
        await openFileInPane(filePath, targetPaneId);
        closeTabInPane(dragSourcePane, filePath);
      } else {
        const direction = position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
        const newPane: EditorPane = {
          id: `editor-${Date.now()}`,
          type: 'editor',
          size: 50,
          isActive: true,
          openFiles: [filePath],
          activeFile: filePath
        };

        setEditorPanes(prevPanes => {
          const updatePanes = (panes: EditorPane[]): EditorPane[] => {
            return panes.map(pane => {
              if (pane.id === targetPaneId) {
                const splitPane: EditorPane = {
                  id: `split-${Date.now()}`,
                  type: 'split',
                  direction,
                  size: pane.size ?? 100,
                  children: [],
                  openFiles: [],
                  activeFile: null,
                  isActive: false
                };

                if (position === 'left' || position === 'top') {
                  splitPane.children = [newPane, { ...pane, size: 50 }];
                } else {
                  splitPane.children = [{ ...pane, size: 50 }, newPane];
                }

                return splitPane;
              }
              if (pane.children) {
                return { ...pane, children: updatePanes(pane.children) };
              }
              return pane;
            });
          };
          return updatePanes(prevPanes);
        });

        closeTabInPane(dragSourcePane, filePath);
      }
    } catch (error) {
      console.error('标签页拖拽失败:', error);
    }

    setDraggedFile(null);
    setDragOverPane(null);
    setDragPosition(null);
    setDragSourcePane(null);
  };

  // 关闭指定标签页
  const closeTabInPane = (paneId: string, filePath: string) => {
    setEditorPanes(prevPanes => {
      const updatePaneFiles = (panes: EditorPane[]): (EditorPane | null)[] => {
        return panes.map(pane => {
          if (pane.id === paneId) {
            // 从打开文件列表中移除文件
            const newOpenFiles = pane.openFiles.filter(f => f !== filePath);

            let newActiveFile = pane.activeFile;
            if (pane.activeFile === filePath) {
              // 如果关闭的是当前活动文件，选择列表中的最后一个文件
              newActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
            }

            // 检查是否应该删除这个编辑区域
            if (newOpenFiles.length === 0) {
              const countEditorPanes = (panesArray: EditorPane[]): number => {
                let count = 0;
                panesArray.forEach(p => {
                  if (p.type === 'editor') {
                    count++;
                  } else if (p.children) {
                    count += countEditorPanes(p.children);
                  }
                });
                return count;
              };

              const totalEditorPanes = countEditorPanes(prevPanes);

              if (totalEditorPanes > 1) {
                return null; // 标记为删除
              }
            }

            return {
              ...pane,
              openFiles: newOpenFiles,
              activeFile: newActiveFile
            };
          }
          if (pane.children) {
            const updatedChildren = updatePaneFiles(pane.children).filter((pane): pane is EditorPane => pane !== null);
            if (updatedChildren.length === 1) {
              return { ...updatedChildren[0], size: pane.size };
            } else if (updatedChildren.length === 0) {
              return null;
            }
            const totalSize = updatedChildren.reduce((sum, child) => sum + (child.size ?? 0), 0);
            if (totalSize > 0) {
              updatedChildren.forEach(child => {
                child.size = (child.size ?? 0) / totalSize * 100;
              });
            }
            return { ...pane, children: updatedChildren };
          }
          return pane;
        });
      };
      const updatedPanes = updatePaneFiles(prevPanes).filter((pane): pane is EditorPane => pane !== null);

      if (updatedPanes.length === 0) {
        return [{
          id: 'main',
          type: 'editor',
          size: 100,
          isActive: true,
          openFiles: [],
          activeFile: null
        }];
      }

      return updatedPanes;
    });
  };

  // 设置区域激活的文件
  const setActiveFileInPane = (paneId: string, filePath: string) => {
    setActiveTab(filePath);
    setEditorPanes(prevPanes => {
      const updatePaneActive = (panes: EditorPane[]): EditorPane[] => {
        return panes.map(pane => {
          if (pane.id === paneId) {
            return {
              ...pane,
              isActive: true,
              activeFile: filePath
            };
          }
          return {
            ...pane,
            isActive: false,
            children: pane.children ? updatePaneActive(pane.children) : undefined
          };
        });
      };
      return updatePaneActive(prevPanes);
    });
  };



  // 查找面板
  const findPane = (panes: EditorPane[], paneId: string): EditorPane | null => {
    for (const pane of panes) {
      if (pane.id === paneId) return pane;
      if (pane.children) {
        const found = findPane(pane.children, paneId);
        if (found) return found;
      }
    }
    return null;
  };

  // 查找激活的面板
  const findActivePane = (panes: EditorPane[]): EditorPane | null => {
    for (const pane of panes) {
      if (pane.isActive) return pane;
      if (pane.children) {
        const found = findActivePane(pane.children);
        if (found) return found;
      }
    }
    return null;
  };

  // 渲染区域标签页
  const renderPaneTabs = (pane: EditorPane) => {
    return (
      <div className="pane-tabs">
        {pane.openFiles.map((filePath) => {
          return (
            <div
              key={filePath}
              className={`pane-tab ${pane.activeFile === filePath ? 'active' : ''}`}
              onClick={() => setActiveFileInPane(pane.id, filePath)}
              draggable={true}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', filePath);
                e.dataTransfer.effectAllowed = 'move';

                const dragEvent = new CustomEvent('tab-drag-start', {
                  detail: { filePath: filePath, sourcePane: pane.id }
                });
                window.dispatchEvent(dragEvent);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                const dragEvent = new CustomEvent('tab-drag-end');
                window.dispatchEvent(dragEvent);
              }}
            >
              <i className="fas fa-file-code"></i>
              <span className="tab-name">{filePath.split('/').pop()}</span>
              <i
                className="fas fa-times pane-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTabInPane(pane.id, filePath);
                }}
              ></i>
            </div>
          );
        })}
        {pane.openFiles.length === 0 && (
          <div className="pane-tab active">
            <i className="fas fa-home"></i>
            <span>欢迎</span>
          </div>
        )}
      </div>
    );
  };

  // 渲染单个编辑器面板
  const renderEditorPane = (pane: EditorPane) => {
    if (pane.type === 'editor') {
      return (
        <div
          key={pane.id}
          className={`editor-pane`}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
              return;
            }
            setActiveFileInPane(pane.id, pane.activeFile || '');
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            draggedFile && openFileInPane(draggedFile, pane.id);
          }}
        >
          {renderPaneTabs(pane)}

          <div
            className={`pane-editor-content`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              draggedFile && setDragOverPane(pane.id);
            }}
          >
            {pane.activeFile ? (
              <MonacoEditor
                filePath={pane.activeFile}
                isActive={pane.isActive}
              />
            ) : (
              <div className="pane-welcome">
                <div className="welcome-content">
                  <i className="fas fa-file-code"></i>
                  <h3>欢迎使用多区域编辑器</h3>
                  <p>拖拽文件到此区域开始编辑</p>
                </div>
              </div>
            )}
          </div>

          {dragOverPane === pane.id && draggedFile && (
            <div
              className="drag-indicators"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
                  return;
                }
                if (draggedFile) {
                  setDragOverPane(pane.id);

                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const width = rect.width;
                  const height = rect.height;

                  const tabHeight = 44;
                  const leftZone = width * 0.35;
                  const rightZone = width - (width * 0.35);
                  const topZone = tabHeight + (height - tabHeight) * 0.3;
                  const bottomZone = height - (height * 0.3);

                  if (x < leftZone && y > tabHeight) {
                    setDragPosition('left');
                  } else if (x > rightZone && y > tabHeight) {
                    setDragPosition('right');
                  } else if (y < topZone && y > tabHeight && x >= leftZone && x <= rightZone) {
                    setDragPosition('top');
                  } else if (y > bottomZone && x >= leftZone && x <= rightZone) {
                    setDragPosition('bottom');
                  } else if (y > tabHeight) {
                    setDragPosition('center');
                  } else {
                    setDragPosition(null);
                  }
                }
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverPane(null);
                  setDragPosition(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
                  if (draggedFile) {
                    openFileInPane(draggedFile, pane.id);
                  }
                  return;
                }
                if (dragOverPane === pane.id && draggedFile) {
                  if (dragSourcePane) {
                    handleTabDrop(pane.id, dragPosition || 'center', draggedFile);
                  } else {
                    handleDrop(pane.id, dragPosition || 'right');
                  }
                }
              }}
            >
              <div className={`drag-indicator top ${dragPosition === 'top' ? 'active' : ''}`} />
              <div className={`drag-indicator bottom ${dragPosition === 'bottom' ? 'active' : ''}`} />
              <div className={`drag-indicator left ${dragPosition === 'left' ? 'active' : ''}`} />
              <div className={`drag-indicator right ${dragPosition === 'right' ? 'active' : ''}`} />
              <div className={`drag-indicator center ${dragPosition === 'center' ? 'active' : ''}`}>
                {dragPosition === 'center' && <span>在此打开文件</span>}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (pane.type === 'split' && pane.children) {
      return (
        <div
          key={pane.id}
          className={`split-pane ${pane.direction}`}
          style={{ width: '100%', height: '100%' }}
        >
          {pane.children.map((child, index) => (
            <React.Fragment key={child.id}>
              <div
                style={{
                  [pane.direction === 'horizontal' ? 'width' : 'height']: `${child.size ?? 50}%`,
                  [pane.direction === 'horizontal' ? 'height' : 'width']: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
              >
                {renderEditorPane(child)}
              </div>
              {index < pane.children!.length - 1 && (
                <div
                  className={`split-resizer ${pane.direction} ${isResizing && resizeData?.paneId === pane.id && resizeData?.childIndex === index ? 'dragging' : ''}`}
                  onMouseDown={(e) => handleResizeStart(e, pane.id, index)}
                  style={{
                    position: 'relative',
                    zIndex: 100
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      );
    }

    return null;
  };

  // 处理调整大小开始
  const handleResizeStart = (e: React.MouseEvent, paneId: string, childIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const pane = findPane(editorPanes, paneId);
    if (!pane || !pane.children) {
      console.warn('找不到面板或面板没有子元素:', { paneId, pane });
      return;
    }

    const startPos = pane.direction === 'horizontal' ? e.clientX : e.clientY;
    const startSizes = pane.children.map(child => child.size ?? 50);

    setIsResizing(true);
    setResizeData({ paneId, childIndex, startPos, startSizes });

    // 创建内联的事件处理函数，避免闭包问题
    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = pane.direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      const containerSize = pane.direction === 'horizontal' ?
        (document.querySelector('.split-editor')?.clientWidth || 1000) :
        (document.querySelector('.split-editor')?.clientHeight || 600);

      const deltaPercent = (delta / containerSize) * 100;

      setEditorPanes(prevPanes => {
        const updatePaneSizes = (panes: EditorPane[]): EditorPane[] => {
          return panes.map(p => {
            if (p.id === paneId && p.children) {
              const newChildren = [...p.children];
              // 确保索引在有效范围内
              if (childIndex >= 0 &&
                childIndex + 1 < newChildren.length &&
                childIndex < startSizes.length &&
                childIndex + 1 < startSizes.length) {

                const newSize1 = Math.max(10, Math.min(90, startSizes[childIndex] + deltaPercent));
                const newSize2 = Math.max(10, Math.min(90, startSizes[childIndex + 1] - deltaPercent));

                newChildren[childIndex] = { ...newChildren[childIndex], size: newSize1 };
                newChildren[childIndex + 1] = { ...newChildren[childIndex + 1], size: newSize2 };

                return { ...p, children: newChildren };
              }
            }
            if (p.children) {
              return { ...p, children: updatePaneSizes(p.children) };
            }
            return p;
          });
        };
        return updatePaneSizes(prevPanes);
      });
    };

    const handleMouseUp = () => {
      console.log('结束拖拽调整大小');
      setIsResizing(false);
      setResizeData(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = pane.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // 当没有工作空间时显示提示
  if (!currentWorkspace) {
    return (
      <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#969696',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📁</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先选择工作空间</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`split-editor ${className || ''}`} style={{ width: '100%', height: '100%', display: 'flex' }}>
      {/* 编辑器区域 */}
      <div style={{ 
        width: isAIVisible ? `calc(100% - ${aiSidebarWidth}px)` : '100%', 
        height: '100%',
        position: 'relative',
      }}>
        {editorPanes.map(pane => renderEditorPane(pane))}
        
        {/* AI助手切换按钮 */}
        {currentWorkspace && (
          <button
            onClick={() => setIsAIVisible(!isAIVisible)}
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '22px',
              boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
            }}
            title="AI代码助手 (Ctrl+Shift+A)"
          >
            🤖
          </button>
        )}
      </div>

      {/* AI助手侧边栏 */}
      {isAIVisible && (
        <AIAgent
          editor={null} // 这里需要传递当前激活的编辑器实例
          onClose={() => setIsAIVisible(false)}
          isVisible={isAIVisible}
          currentWorkspace={currentWorkspace || undefined}
          fileTree={undefined}
          onWidthChange={setAiSidebarWidth}
        />
      )}
    </div>
  );
};

export default SplitEditor; 