import React, { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import './ResizablePanel.css';

interface ResizablePanelProps {
  children: ReactNode;
  direction: 'horizontal' | 'vertical';
  initialSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  onResize?: (size: number) => void;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction,
  initialSize = 200,
  minSize = 100,
  maxSize = 600,
  className = '',
  onResize
}) => {
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);
  const isResizingRef = useRef(false); // 使用ref来跟踪拖拽状态

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 立即设置ref状态
    isResizingRef.current = true;
    setIsResizing(true);
    
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSizeRef.current = size;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) {
      return;
    }

    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPosRef.current;
    
    // 对于垂直方向，向上拖动应该减小高度
    const adjustedDelta = direction === 'vertical' ? -delta : delta;
    const newSize = Math.max(minSize, Math.min(maxSize, startSizeRef.current + adjustedDelta));
    
    setSize(newSize);
    onResize?.(newSize);
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      isResizingRef.current = false;
    };
  }, []);

  const panelStyle = {
    [direction === 'horizontal' ? 'width' : 'height']: `${size}px`,
    flexShrink: 0
  };

  return (
    <div 
      ref={panelRef}
      className={`resizable-panel ${direction} ${className} ${isResizing ? 'resizing' : ''}`}
      style={panelStyle}
    >
      <div className="resizable-content">
        {children}
      </div>
      <div 
        className={`resize-handle ${direction}`}
        onMouseDown={handleMouseDown}
      >
        <div className="resize-handle-line" />
      </div>
    </div>
  );
};

export default ResizablePanel;