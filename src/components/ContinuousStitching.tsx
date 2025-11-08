import { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useContinuousStitching } from '../hooks/useContinuousStitching';
import { Minimap } from './Minimap';
import { SplitScreenView } from './SplitScreenView';
import { QualityIndicator } from './QualityIndicator';
import type { CameraSettings } from '../types';
import type { FeatureDetectorType } from '../utils/featureDetectors';
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
    exportFinalPanorama,
    reset,
    currentQualityMetrics,
    stitchingConfig,
    setStitchingConfig
  } = useContinuousStitching(videoRef);

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState(30);
  const [captureInterval, setCaptureInterval] = useState(500);
  const [featureCount, setFeatureCount] = useState(1500);
  const [selectedDetector, setSelectedDetector] = useState<FeatureDetectorType>('ORB');

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
    // Update stitching config before starting
    setStitchingConfig({
      ...stitchingConfig,
      featureDetector: selectedDetector,
      nFeatures: featureCount
    });
    startStitching(minConfidence, captureInterval, featureCount);
  };

  const handleStopStitching = () => {
    stopStitching();
  };

  const handleReset = () => {
    reset();
  };

  const handleExportPanorama = () => {
    const finalPanorama = exportFinalPanorama();
    if (finalPanorama) {
      // Create download link
      const link = document.createElement('a');
      link.href = finalPanorama;
      link.download = `microscope-panorama-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleViewPanorama = () => {
    if (panoramaDataUrl) {
      // Open in new window
      const win = window.open();
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Microscope Panorama</title>
              <style>
                body { margin: 0; padding: 20px; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                img { max-width: 100%; height: auto; border: 2px solid #fff; }
              </style>
            </head>
            <body>
              <img src="${panoramaDataUrl}" alt="Microscope Panorama" />
            </body>
          </html>
        `);
      }
    }
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

        <div className="control-group">
          <label>Feature Detection:</label>
          <div className="slider-group">
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={featureCount}
              onChange={(e) => setFeatureCount(parseInt(e.target.value))}
              disabled={isStitching}
            />
            <span className="slider-value">{featureCount} features</span>
          </div>
          <small style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Higher = Better overlap detection, slower processing
          </small>
        </div>

        <div className="control-group">
          <label>Feature Detector Algorithm:</label>
          <select
            value={selectedDetector}
            onChange={(e) => setSelectedDetector(e.target.value as FeatureDetectorType)}
            disabled={isStitching}
            className="detector-selector"
          >
            <option value="ORB">ORB (Fast, Good for most cases)</option>
            <option value="SURF">SURF (Best for Microscopy)</option>
            <option value="SIFT">SIFT (Most Accurate, Slower)</option>
          </select>
          <small style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            {selectedDetector === 'ORB' && '🚀 Fast and patent-free, good general purpose'}
            {selectedDetector === 'SURF' && '🔬 Recommended for microscopy imaging'}
            {selectedDetector === 'SIFT' && '🎯 Most accurate but slower processing'}
          </small>
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

      {/* Export buttons - shown when panorama exists */}
      {panoramaDataUrl && stats.framesAccepted > 0 && (
        <div className="export-buttons">
          <button onClick={handleViewPanorama} className="btn-view">
            👁️ View Panorama
          </button>
          <button onClick={handleExportPanorama} className="btn-export">
            💾 Download PNG
          </button>
        </div>
      )}

      {/* Canvas for capturing (always hidden) */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Video feed - standalone when not stitching */}
      {!isStitching && (
        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-feed"
          />
        </div>
      )}

      {/* Professional Split-Screen View when stitching */}
      {isStitching && (
        <div className="stitching-active-container">
          <SplitScreenView
            videoElement={videoRef}
            panoramaDataUrl={panoramaDataUrl || ''}
            stats={{
              framesAccepted: stats.framesAccepted,
              framesRejected: stats.framesProcessed - stats.framesAccepted,
              isStitching: isStitching,
              lastConfidence: stats.lastConfidence,
              avgQuality: stats.avgQuality || 0,
              coveragePercent:
                coverageStats.totalRegions > 0
                  ? ((coverageStats.goodRegions + coverageStats.excellentRegions) /
                      coverageStats.totalRegions) *
                    100
                  : 0,
              currentFPS: stats.currentFPS || 0,
              lastError: stats.lastError
            }}
            showStats={true}
            showCrosshair={true}
          />

          {/* Quality Indicator - shown when quality metrics are available */}
          {currentQualityMetrics && (
            <div style={{ marginTop: '20px' }}>
              <QualityIndicator
                metrics={currentQualityMetrics}
                showDetails={true}
                compact={false}
              />
            </div>
          )}

          {/* Additional stats and minimap */}
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
              <div className="stat-item">
                <span className="stat-label">Camera Movement:</span>
                <span className="stat-value" style={{ color: stats.lastMovement < 30 ? '#ef4444' : '#10b981' }}>
                  {stats.lastMovement.toFixed(1)}px
                </span>
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
        </div>
      )}
    </div>
  );
};
