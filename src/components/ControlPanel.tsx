import { useState } from 'react';
import type { CapturedImage } from '../types';
import './ControlPanel.css';

interface ControlPanelProps {
  images: CapturedImage[];
  onClearImages: () => void;
  onStitchImages: () => void;
  onExportImage: () => void;
  isStitching: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  images,
  onClearImages,
  onStitchImages,
  onExportImage,
  isStitching
}) => {
  const [autoCapture, setAutoCapture] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(2);

  return (
    <div className="control-panel">
      <div className="panel-section">
        <h3>Captured Images</h3>
        <div className="image-count">
          <span className="count-number">{images.length}</span>
          <span className="count-label">images</span>
        </div>
      </div>

      <div className="panel-section">
        <h3>Auto Capture</h3>
        <div className="auto-capture-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
            />
            <span>Enable auto capture</span>
          </label>

          {autoCapture && (
            <div className="interval-control">
              <label>Interval (seconds):</label>
              <input
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={captureInterval}
                onChange={(e) => setCaptureInterval(parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>
      </div>

      <div className="panel-section">
        <h3>Actions</h3>
        <div className="action-buttons">
          <button
            onClick={onStitchImages}
            disabled={images.length < 2 || isStitching}
            className="btn-action btn-stitch"
          >
            {isStitching ? 'Stitching...' : 'Stitch Images'}
          </button>

          <button
            onClick={onExportImage}
            disabled={images.length === 0}
            className="btn-action btn-export"
          >
            Export Image
          </button>

          <button
            onClick={onClearImages}
            disabled={images.length === 0}
            className="btn-action btn-clear"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h3>Image Gallery</h3>
        <div className="thumbnail-grid">
          {images.length === 0 ? (
            <p className="empty-gallery">No images captured</p>
          ) : (
            images.map((image) => (
              <div key={image.id} className="thumbnail">
                <img src={image.dataUrl} alt={`Capture ${image.id}`} />
                <span className="thumbnail-time">
                  {new Date(image.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
