import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useFile } from '../contexts/FileContext';
import { fileAPI } from '../services/api';
import MonacoEditor from './MonacoEditor';
import './SplitEditor.css';

export interface EditorPane {
  id: string;
  type: 'editor' | 'split';
  direction?: 'horizontal' | 'vertical';
  size?: number; // 百分比
  children?: EditorPane[];
  // 使用全局文件系统，每个区域只存储文件路径列表
  openFiles: string[]; // 在此区域打开的文件路径列表
  activeFile: string | null; // 当前激活的文件路径
  isActive?: boolean; // 当前激活的区域
}

interface SplitEditorProps {
  className?: string;
}

const SplitEditor: React.FC<SplitEditorProps> = ({ className }) => {
  const { currentWorkspace } = useWorkspace();
  const { openFile, setActiveTab, setCurrentFile } = useFile();
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
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'left' | 'right' | 'top' | 'bottom' | 'center' | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeData, setResizeData] = useState<{
    paneId: string;
    childIndex: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);
  const [dragSourcePane, setDragSourcePane] = useState<string | null>(null);

  // 使用useCallback来确保事件监听器引用稳定
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeData) return;

    const pane = findPane(editorPanes, resizeData.paneId);
    if (!pane || !pane.children) return;

    const currentPos = pane.direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - resizeData.startPos;
    const containerSize = pane.direction === 'horizontal' ?
      (document.querySelector('.split-editor')?.clientWidth || 1000) :
      (document.querySelector('.split-editor')?.clientHeight || 600);

    const deltaPercent = (delta / containerSize) * 100;

    setEditorPanes(prevPanes => {
      const updatePaneSizes = (panes: EditorPane[]): EditorPane[] => {
        return panes.map(p => {
          if (p.id === resizeData.paneId && p.children) {
            const newChildren = [...p.children];
            const newSize1 = Math.max(10, Math.min(90, resizeData.startSizes[resizeData.childIndex] + deltaPercent));
            const newSize2 = Math.max(10, Math.min(90, resizeData.startSizes[resizeData.childIndex + 1] - deltaPercent));

            newChildren[resizeData.childIndex] = { ...newChildren[resizeData.childIndex], size: newSize1 };
            newChildren[resizeData.childIndex + 1] = { ...newChildren[resizeData.childIndex + 1], size: newSize2 };

            return { ...p, children: newChildren };
          }
          if (p.children) {
            return { ...p, children: updatePaneSizes(p.children) };
          }
          return p;
        });
      };
      return updatePaneSizes(prevPanes);
    });
  }, [isResizing, resizeData, editorPanes]);

  // 处理调整大小结束
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeData(null);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleResizeMove]);

  // 监听拖拽文件事件
  useEffect(() => {
    const handleFileDragStart = (event: CustomEvent) => {
      console.log('🔄 文件拖拽开始:', event.detail.filePath);
      setDraggedFile(event.detail.filePath);
    };

    const handleFileDragEnd = () => {
      console.log('🔄 文件拖拽结束');
      setDraggedFile(null);
      setDragOverPane(null);
      setDragPosition(null);
      setDragSourcePane(null); // 清理源面板状态
    };

    const handleTabDragStart = (event: CustomEvent) => {
      console.log('🔄 标签页拖拽开始:', event.detail);
      setDraggedFile(event.detail.filePath);
      setDragSourcePane(event.detail.sourcePane);
    };

    const handleTabDragEnd = () => {
      console.log('🔄 标签页拖拽结束');
      setDraggedFile(null);
      setDragOverPane(null);
      setDragPosition(null);
      setDragSourcePane(null);
    };

    const handleTabDrop = (event: CustomEvent) => {
      console.log('🔄 标签页拖拽放置:', event.detail);
      // 这里可以处理标签页拖拽到编辑器区域的逻辑
      if (event.detail.filePath) {
        setDraggedFile(event.detail.filePath);
      }
    };

    // 监听文件点击事件，在默认区域打开文件
    const handleFileClick = (event: CustomEvent) => {
      console.log('🔄 文件点击事件:', event.detail);
      const filePath = event.detail.filePath;
      if (filePath) {
        // 找到第一个激活的区域，如果没有则使用第一个区域
        const activePane = findActivePane(editorPanes);
        if (activePane) {
          openFileInPane(filePath, activePane.id);
        } else if (editorPanes.length > 0) {
          openFileInPane(filePath, editorPanes[0].id);
        }
      }
    };

    window.addEventListener('file-drag-start', handleFileDragStart as EventListener);
    window.addEventListener('file-drag-end', handleFileDragEnd as EventListener);
    window.addEventListener('tab-drag-start', handleTabDragStart as EventListener);
    window.addEventListener('tab-drag-end', handleTabDragEnd as EventListener);
    window.addEventListener('tab-drop', handleTabDrop as EventListener);
    window.addEventListener('file-click', handleFileClick as EventListener);

    return () => {
      window.removeEventListener('file-drag-start', handleFileDragStart as EventListener);
      window.removeEventListener('file-drag-end', handleFileDragEnd as EventListener);
      window.removeEventListener('tab-drag-start', handleTabDragStart as EventListener);
      window.removeEventListener('tab-drag-end', handleTabDragEnd as EventListener);
      window.removeEventListener('tab-drop', handleTabDrop as EventListener);
      window.removeEventListener('file-click', handleFileClick as EventListener);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [editorPanes, currentWorkspace]); // 添加依赖项

  // 处理文件拖拽到编辑器区域
  const handleDrop = async (paneId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
    console.log('🔄 处理拖拽放置:', { paneId, position, draggedFile });
    if (!draggedFile) {
      console.log('❌ 没有拖拽的文件');
      return;
    }

    // 如果是center位置，直接在当前区域打开文件
    if (position === 'center') {
      try {
        await openFileInPane(draggedFile, paneId);
        console.log('✅ 成功在当前区域打开文件:', draggedFile);
      } catch (error) {
        console.error('❌ 打开文件失败:', error);
      }
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
      const newPanes = [...prevPanes];
      const targetPaneIndex = findPaneIndex(newPanes, paneId);

      if (targetPaneIndex !== -1) {
        const targetPane = newPanes[targetPaneIndex];
        const splitPane: EditorPane = {
          id: `split-${Date.now()}`,
          type: 'split',
          direction,
          size: targetPane.size || 100,
          children: [],
          openFiles: [],
          activeFile: null
        };

        // 根据拖拽位置决定子面板的顺序
        if (position === 'left' || position === 'top') {
          splitPane.children = [newPane, { ...targetPane, size: 50 }];
        } else {
          splitPane.children = [{ ...targetPane, size: 50 }, newPane];
        }

        newPanes[targetPaneIndex] = splitPane;
        console.log('✅ 创建新的分割面板:', splitPane);
      }

      return newPanes;
    });

    // 打开拖拽的文件到新区域
    if (draggedFile) {
      try {
        await openFileInPane(draggedFile, newPane.id);
        console.log('✅ 成功打开文件到新区域:', draggedFile);
      } catch (error) {
        console.error('❌ 打开文件失败:', error);
      }
    }

    setDraggedFile(null);
    setDragOverPane(null);
    setDragPosition(null);
    setDragSourcePane(null);
  };

  // 处理tab拖拽到编辑器区域
  const handleTabDrop = async (targetPaneId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center', filePath: string) => {
    console.log('🔄 处理Tab拖拽放置:', { targetPaneId, position, filePath, dragSourcePane });

    if (!dragSourcePane || !filePath) {
      console.log('❌ 缺少源面板或文件路径');
      return;
    }

    // 检查源面板是否有这个文件
    const sourcePane = findPane(editorPanes, dragSourcePane);
    if (!sourcePane || !sourcePane.openFiles.includes(filePath)) {
      console.log('❌ 源面板中找不到文件:', filePath);
      return;
    }

    try {
      // 如果是center位置，直接在目标区域打开文件
      if (position === 'center') {
        await openFileInPane(filePath, targetPaneId);
        // 从源区域删除tab
        closeTabInPane(dragSourcePane, filePath);
      } else {
        // 创建新的分割区域
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
          const newPanes = [...prevPanes];
          const targetPaneIndex = findPaneIndex(newPanes, targetPaneId);

          if (targetPaneIndex !== -1) {
            const targetPane = newPanes[targetPaneIndex];
            const splitPane: EditorPane = {
              id: `split-${Date.now()}`,
              type: 'split',
              direction,
              size: targetPane.size || 100,
              children: [],
              openFiles: [],
              activeFile: null
            };

            // 根据拖拽位置决定子面板的顺序
            if (position === 'left' || position === 'top') {
              splitPane.children = [newPane, { ...targetPane, size: 50 }];
            } else {
              splitPane.children = [{ ...targetPane, size: 50 }, newPane];
            }

            newPanes[targetPaneIndex] = splitPane;
          }

          return newPanes;
        });

        // 从源区域删除tab
        closeTabInPane(dragSourcePane, filePath);
      }
    } catch (error) {
      console.error('❌ Tab拖拽失败:', error);
    }

    setDraggedFile(null);
    setDragOverPane(null);
    setDragPosition(null);
    setDragSourcePane(null);
  };

  // 在指定区域打开文件
  const openFileInPane = async (filePath: string, paneId: string) => {
    try {
      // 检查是否有工作空间
      if (!currentWorkspace) {
        console.warn('没有选择工作空间，无法打开文件');
        return;
      }

      // 使用全局的openFile函数来打开文件，这样确保所有区域共享同一个文件状态
      await openFile(filePath);

      setEditorPanes(prevPanes => {
        const updatePaneFiles = (panes: EditorPane[]): EditorPane[] => {
          return panes.map(pane => {
            if (pane.id === paneId) {
              // 添加文件到此区域的打开文件列表（如果还没有的话）
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
      console.error('打开文件失败:', error);
    }
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
            // 只有当存在多个编辑区域且当前区域没有打开文件时才删除
            if (newOpenFiles.length === 0) {
              // 计算总的编辑区域数量
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

              // 只有当存在多个编辑区域时才删除空的区域
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
            // 如果子区域被删除了，需要重新整理分割结构
            if (updatedChildren.length === 1) {
              // 只有一个子区域，直接返回这个子区域，继承父区域的大小
              return { ...updatedChildren[0], size: pane.size };
            } else if (updatedChildren.length === 0) {
              // 没有子区域，返回null标记删除
              return null;
            }
            // 重新计算子区域的大小比例
            const totalSize = updatedChildren.reduce((sum, child) => sum + (child.size || 0), 0);
            if (totalSize > 0) {
              updatedChildren.forEach(child => {
                child.size = (child.size || 0) / totalSize * 100;
              });
            }
            return { ...pane, children: updatedChildren };
          }
          return pane;
        });
      };
      const updatedPanes = updatePaneFiles(prevPanes).filter((pane): pane is EditorPane => pane !== null);

      // 确保至少有一个编辑区域
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
    setCurrentFile(filePath);
    setActiveTab(filePath);
    setEditorPanes(prevPanes => {
      const updatePaneActive = (panes: EditorPane[]): EditorPane[] => {
        return panes.map(pane => {
          if (pane.id === paneId) {
            return {
              ...pane,
              isActive: true,
              activeFile: filePath || pane.activeFile
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

  // 查找面板索引
  const findPaneIndex = (panes: EditorPane[], paneId: string): number => {
    for (let i = 0; i < panes.length; i++) {
      if (panes[i].id === paneId) return i;
      if (panes[i].children) {
        const childIndex = findPaneIndex(panes[i].children!, paneId);
        if (childIndex !== -1) return childIndex;
      }
    }
    return -1;
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
        {pane.openFiles.map((filePath) => (
          <div
            key={filePath}
            className={`pane-tab ${pane.activeFile === filePath ? 'active' : ''}`}
            onClick={() => setActiveFileInPane(pane.id, filePath)}
            draggable={true}
            onDragStart={(e) => {
              e.stopPropagation();
              console.log('🔄 Tab拖拽开始:', filePath);
              e.dataTransfer.setData('text/plain', filePath);
              e.dataTransfer.effectAllowed = 'move';

              // 触发自定义事件，通知编辑器拖拽开始
              const dragEvent = new CustomEvent('tab-drag-start', {
                detail: { filePath: filePath, sourcePane: pane.id }
              });
              window.dispatchEvent(dragEvent);
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              console.log('🔄 Tab拖拽结束');

              // 触发自定义事件，通知编辑器拖拽结束
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
        ))}
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
          className={`editor-pane ${pane.isActive ? 'active' : ''} ${dragOverPane === pane.id ? 'drag-hover' : ''}`}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            // 如果点击的是tab区域，不处理面板点击
            if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
              return;
            }
            // 激活当前面板，即使没有活动文件
            setActiveFileInPane(pane.id, pane.activeFile || '');
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // 检查是否拖拽到tab区域，如果是则不处理拖拽
            if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
              return;
            }
            if (draggedFile) {
              console.log('🔄 拖拽悬停在面板上:', pane.id);
              setDragOverPane(pane.id);

              // 自动检测拖拽位置
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

              // 优先级：左右区域 > 上下区域 > 中央区域
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
            // 只有当鼠标真正离开面板时才清除状态
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              console.log('🔄 拖拽离开面板:', pane.id);
              setDragOverPane(null);
              setDragPosition(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // 检查是否拖拽到tab区域，如果是则直接打开文件
            if (e.target && (e.target as HTMLElement).closest('.pane-tabs')) {
              if (draggedFile) {
                openFileInPane(draggedFile, pane.id);
              }
              return;
            }
            console.log('🔄 拖拽放置事件:', {
              paneId: pane.id,
              dragPosition,
              draggedFile,
              dragSourcePane,
              isTabDrag: !!dragSourcePane,
              willCreateSplit: !dragSourcePane && dragPosition !== 'center'
            });
            if (dragOverPane === pane.id && draggedFile) {
              // 如果有dragSourcePane，说明是从tab拖拽过来的
              if (dragSourcePane) {
                console.log('📁 处理Tab拖拽');
                handleTabDrop(pane.id, dragPosition || 'center', draggedFile);
              } else {
                console.log('🌳 处理文件树拖拽');
                handleDrop(pane.id, dragPosition || 'right');
              }
            }
          }}
        >
          {/* 区域标签页 */}
          {renderPaneTabs(pane)}

          {/* 编辑器内容 */}
          <div className="pane-editor-content">
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

          {/* 拖拽指示器 - VSCode风格 */}
          {dragOverPane === pane.id && draggedFile && (
            <div className="drag-indicators">
              <div
                className={`drag-indicator top ${dragPosition === 'top' ? 'active' : ''}`}
              />
              <div
                className={`drag-indicator bottom ${dragPosition === 'bottom' ? 'active' : ''}`}
              />
              <div
                className={`drag-indicator left ${dragPosition === 'left' ? 'active' : ''}`}
              />
              <div
                className={`drag-indicator right ${dragPosition === 'right' ? 'active' : ''}`}
              />
              <div
                className={`drag-indicator center ${dragPosition === 'center' ? 'active' : ''}`}
              >
                {dragPosition === 'center' && (
                  <span>在此打开文件</span>
                )}
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
                  [pane.direction === 'horizontal' ? 'width' : 'height']: `${child.size}%`,
                  [pane.direction === 'horizontal' ? 'height' : 'width']: '100%'
                }}
              >
                {renderEditorPane(child)}
              </div>
              {index < pane.children!.length - 1 && (
                <div
                  className={`split-resizer ${pane.direction}`}
                  onMouseDown={(e) => handleResizeStart(e, pane.id, index)}
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
    if (!pane || !pane.children) return;

    const startPos = pane.direction === 'horizontal' ? e.clientX : e.clientY;
    const startSizes = pane.children.map(child => child.size || 50);

    setIsResizing(true);
    setResizeData({ paneId, childIndex, startPos, startSizes });

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
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
          <div style={{ fontSize: '3rem', marginBottom: '16px', display: 'block' }}>📁</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先选择工作空间</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            在左侧工作空间面板中点击工作空间旁边的文件夹图标来选择工作空间
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`split-editor ${className || ''}`} style={{ width: '100%', height: '100%' }}>
      {editorPanes.map(pane => renderEditorPane(pane))}
    </div>
  );
};

export default SplitEditor; 