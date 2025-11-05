import { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useContinuousStitching } from '../hooks/useContinuousStitching';
import { Minimap } from './Minimap';
import type { CameraSettings } from '../types';
import './ContinuousStitching.css';

interface ContinuousStitchingProps {
  settings: CameraSettings;
  onPanoramaUpdate: (dataUrl: string) => void;
}

export const ContinuousStitching: React.FC<ContinuousStitchingProps> = ({
  settings,
  onPanoramaUpdate
}) => {
  const {
    videoRef,
    canvasRef,
    devices,
    isStreaming,
    error: cameraError,
    startCamera,
    stopCamera
  } = useCamera(settings);

  const {
    isStitching,
    panoramaDataUrl,
    stats,
    cvLoaded,
    regionMap,
    coverageStats,
    startStitching,
    stopStitching,
    reset
  } = useContinuousStitching(videoRef);

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState(30);
  const [captureInterval, setCaptureInterval] = useState(500);

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].deviceId);
    }
  }, [devices, selectedDevice]);

  useEffect(() => {
    if (panoramaDataUrl) {
      onPanoramaUpdate(panoramaDataUrl);
    }
  }, [panoramaDataUrl, onPanoramaUpdate]);

  const handleStartCamera = async () => {
    await startCamera();
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
    if (isStreaming) {
      stopCamera();
      setTimeout(() => startCamera(), 100);
    }
  };

  const handleStartStitching = () => {
    startStitching(minConfidence, captureInterval);
  };

  const handleStopStitching = () => {
    stopStitching();
  };

  const handleReset = () => {
    reset();
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 70) return '#10b981'; // green
    if (confidence >= 40) return '#f59e0b'; // orange
    return '#ef4444'; // red
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 70) return 'Excellent';
    if (confidence >= 40) return 'Good';
    return 'Poor';
  };

  return (
    <div className="continuous-stitching">
      <div className="stitching-header">
        <h3>Continuous Panorama Mode</h3>
        {!cvLoaded && <span className="loading-cv">Loading OpenCV...</span>}
      </div>

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

        <div className="control-group">
          <label>Min. Confidence:</label>
          <div className="slider-group">
            <input
              type="range"
              min="10"
              max="90"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseInt(e.target.value))}
              disabled={isStitching}
            />
            <span className="slider-value">{minConfidence}%</span>
          </div>
        </div>

        <div className="control-group">
          <label>Capture Interval:</label>
          <div className="slider-group">
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={captureInterval}
              onChange={(e) => setCaptureInterval(parseInt(e.target.value))}
              disabled={isStitching}
            />
            <span className="slider-value">{captureInterval}ms</span>
          </div>
        </div>
      </div>

      <div className="action-buttons">
        {!isStreaming ? (
          <button
            onClick={handleStartCamera}
            className="btn-primary"
            disabled={!cvLoaded}
          >
            Start Camera
          </button>
        ) : !isStitching ? (
          <>
            <button onClick={handleStartStitching} className="btn-start-stitch">
              Start Panorama
            </button>
            <button onClick={stopCamera} className="btn-secondary">
              Stop Camera
            </button>
          </>
        ) : (
          <>
            <button onClick={handleStopStitching} className="btn-stop-stitch">
              Pause Panorama
            </button>
            <button onClick={handleReset} className="btn-reset">
              Reset
            </button>
          </>
        )}
      </div>

      {cameraError && (
        <div className="error-message">{cameraError}</div>
      )}

      {isStitching && (
        <div className="stitching-content">
          <div className="stitching-stats">
            <div className="stat-item">
              <span className="stat-label">Frames Processed:</span>
              <span className="stat-value">{stats.framesProcessed}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Frames Accepted:</span>
              <span className="stat-value success">
                {stats.framesAccepted} ({stats.framesProcessed > 0
                  ? Math.round((stats.framesAccepted / stats.framesProcessed) * 100)
                  : 0}%)
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Last Confidence:</span>
              <span
                className="stat-value confidence"
                style={{ color: getConfidenceColor(stats.lastConfidence) }}
              >
                {stats.lastConfidence.toFixed(1)}% ({getConfidenceLabel(stats.lastConfidence)})
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Features Matched:</span>
              <span className="stat-value">{stats.lastMatchedFeatures}</span>
            </div>
            {stats.overlapDetected && (
              <div className="overlap-indicator">
                <span className="overlap-badge">🔄 Overlap Detected</span>
                <span className="overlap-hint">Revisiting previously scanned area</span>
              </div>
            )}
            {stats.isProcessing && (
              <div className="processing-indicator">
                <div className="spinner"></div>
                <span>Processing frame...</span>
              </div>
            )}
            {stats.lastError && (
              <div className="error-hint">Last error: {stats.lastError}</div>
            )}
          </div>

          <Minimap
            regionMap={regionMap}
            panoramaDataUrl={panoramaDataUrl}
            currentFramePosition={stats.lastFramePosition}
            coverageStats={coverageStats}
          />
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

        {isStitching && (
          <div className="overlay-indicators">
            <div className="recording-badge">
              <div className="recording-dot"></div>
              <span>RECORDING PANORAMA</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
