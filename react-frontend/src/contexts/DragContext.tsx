import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface DragContextType {
  draggedFiles: string[];
  setDraggedFiles: (files: string[]) => void;
  clearDraggedFiles: () => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

const DragContext = createContext<DragContextType | undefined>(undefined);

export const useDrag = () => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDrag must be used within a DragProvider');
  }
  return context;
};

interface DragProviderProps {
  children: ReactNode;
}

export const DragProvider: React.FC<DragProviderProps> = ({ children }) => {
  const [draggedFiles, setDraggedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const clearDraggedFiles = () => {
    setDraggedFiles([]);
    setIsDragging(false);
  };

  return (
    <DragContext.Provider
      value={{
        draggedFiles,
        setDraggedFiles,
        clearDraggedFiles,
        isDragging,
        setIsDragging,
      }}
    >
      {children}
    </DragContext.Provider>
  );
}; 