import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Image } from '../types';
import { imageAPI } from '../services/api';

interface ImageContextType {
  images: Image[];
  isLoading: boolean;
  error: string | null;
  loadImages: () => Promise<void>;
  pullImage: (imageName: string) => Promise<void>;
  deleteImage: (imageId: string) => Promise<void>;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export const useImage = () => {
  const context = useContext(ImageContext);
  if (!context) {
    throw new Error('useImage must be used within an ImageProvider');
  }
  return context;
};

interface ImageProviderProps {
  children: React.ReactNode;
}

export const ImageProvider: React.FC<ImageProviderProps> = ({ children }) => {
  const [images, setImages] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await imageAPI.getImages();
      setImages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载镜像失败');
      console.error('加载镜像失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pullImage = useCallback(async (imageName: string) => {
    setError(null);
    try {
      await imageAPI.pullImage(imageName);
      await loadImages(); // 重新加载镜像列表
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '拉取镜像失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [loadImages]);

  const deleteImage = useCallback(async (imageId: string) => {
    setError(null);
    try {
      await imageAPI.deleteImage(imageId);
      await loadImages(); // 重新加载镜像列表
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除镜像失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [loadImages]);

  const value: ImageContextType = {
    images,
    isLoading,
    error,
    loadImages,
    pullImage,
    deleteImage
  };

  return (
    <ImageContext.Provider value={value}>
      {children}
    </ImageContext.Provider>
  );
}; 