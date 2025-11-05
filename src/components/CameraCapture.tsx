import { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import type { CameraSettings, CapturedImage } from '../types';
import './CameraCapture.css';

interface CameraCaptureProps {
  onCapture: (image: CapturedImage) => void;
  settings: CameraSettings;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, settings }) => {
  const {
    videoRef,
    canvasRef,
    devices,
    isStreaming,
    error,
    startCamera,
    stopCamera,
    captureImage
  } = useCamera(settings);

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].deviceId);
    }
  }, [devices, selectedDevice]);

  const handleStartCamera = async () => {
    await startCamera();
  };

  const handleCapture = async () => {
    setIsCapturing(true);
    const image = await captureImage();
    if (image) {
      onCapture(image);
    }
    setIsCapturing(false);
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
    if (isStreaming) {
      stopCamera();
      setTimeout(() => startCamera(), 100);
    }
  };

  return (
    <div className="camera-capture">
      <div className="camera-controls">
        <div className="control-group">
          <label htmlFor="camera-select">Camera:</label>
          <select
            id="camera-select"
            value={selectedDevice}
            onChange={(e) => handleDeviceChange(e.target.value)}
            disabled={isStreaming}
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="control-buttons">
          {!isStreaming ? (
            <button onClick={handleStartCamera} className="btn-primary">
              Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={handleCapture}
                className="btn-capture"
                disabled={isCapturing}
              >
                {isCapturing ? 'Capturing...' : 'Capture Image'}
              </button>
              <button onClick={stopCamera} className="btn-secondary">
                Stop Camera
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="video-feed"
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
};
