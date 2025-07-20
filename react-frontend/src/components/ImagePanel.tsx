import React from 'react';
import { useImage } from '../contexts/ImageContext';
import { formatBytes } from '../utils';
import './ImagePanel.css';

const ImagePanel: React.FC = () => {
  const { images, loadImages, deleteImage } = useImage();

  return (
    <>
      <div className="image-toolbar">
        <button className="btn btn-sm" onClick={loadImages} title="刷新镜像列表">
          <i className="fas fa-sync-alt"></i>
        </button>
        <button className="btn btn-sm" title="下载镜像">
          <i className="fas fa-download"></i>
        </button>
      </div>

      <div className="image-list">
        {images.length === 0 ? (
          <div className="image-empty">
            <i className="fas fa-layer-group"></i>
            <div>暂无镜像，点击刷新加载镜像列表</div>
          </div>
        ) : (
          images.map((image: any) => (
            <div key={image.id} className="image-item">
              <div className="image-name">
                {image.tags && image.tags.length > 0 ? image.tags[0] : `<未标记>:${image.id.substring(0, 12)}`}
              </div>
              <div className="image-details">
                <span>ID: {image.id.substring(0, 12)}</span>
                <span className="image-size">{formatBytes(image.size)}</span>
              </div>
              <div className="image-actions">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => deleteImage(image.id)} 
                  title="删除镜像"
                >
                  <i className="fas fa-trash"></i>
                  <span>删除</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export default ImagePanel; 