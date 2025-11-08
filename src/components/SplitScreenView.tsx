/**
 * Split-Screen View - Live camera feed + Building panorama
 *
 * Based on MicroVisioneer's approach of showing real-time feedback
 * during manual scanning. Users can see both what the camera sees
 * and how the panorama is being built simultaneously.
 */

import React, { useEffect, useRef } from 'react';
import './SplitScreenView.css';

export interface SplitScreenStats {
  framesAccepted: number;
  framesRejected: number;
  isStitching: boolean;
  lastConfidence: number;
  avgQuality: number;
  coveragePercent: number;
  currentFPS: number;
  lastError?: string;
}

export interface SplitScreenViewProps {
  videoElement: React.RefObject<HTMLVideoElement | null>;
  panoramaDataUrl: string | null;
  stats: SplitScreenStats;
  showStats?: boolean;
  showCrosshair?: boolean;
}

export const SplitScreenView: React.FC<SplitScreenViewProps> = ({
  videoElement,
  panoramaDataUrl,
  stats,
  showStats = true,
  showCrosshair = true
}) => {
  const panoramaCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Move video element into the split screen view
  useEffect(() => {
    if (videoElement.current && videoContainerRef.current) {
      // Move the video element into our container
      videoContainerRef.current.appendChild(videoElement.current);
      videoElement.current.className = 'camera-preview';
    }

    // Cleanup: return video to its original parent on unmount
    return () => {
      if (videoElement.current) {
        videoElement.current.className = 'video-feed';
      }
    };
  }, [videoElement]);

  // Update panorama canvas when dataUrl changes
  useEffect(() => {
    if (panoramaDataUrl && panoramaCanvasRef.current) {
      const canvas = panoramaCanvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.src = panoramaDataUrl;
      }
    }
  }, [panoramaDataUrl]);

  return (
    <div className="split-screen-container">
      {/* Left Panel: Live Camera Feed */}
      <div className="split-panel camera-panel">
        <div className="panel-header">
          <h3>📹 Live Camera Feed</h3>
          <div className="status-badge">
            {stats.isStitching ? (
              <span className="status-capturing">
                <span className="pulse-dot" />
                Capturing
              </span>
            ) : (
              <span className="status-paused">Paused</span>
            )}
          </div>
        </div>

        <div className="panel-content camera-view" ref={videoContainerRef}>

          {showCrosshair && (
            <div className="camera-overlay">
              <div className="crosshair">
                <div className="crosshair-line horizontal" />
                <div className="crosshair-line vertical" />
                <div className="crosshair-center" />
              </div>
            </div>
          )}

          {showStats && (
            <div className="camera-stats">
              <div className="stat-item">
                <span className="stat-label">FPS:</span>
                <span className="stat-value">{stats.currentFPS.toFixed(1)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Confidence:</span>
                <span className="stat-value">
                  {stats.lastConfidence.toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {stats.lastError && (
            <div className="camera-error">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{stats.lastError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Building Panorama */}
      <div className="split-panel panorama-panel">
        <div className="panel-header">
          <h3>🖼️ Building Panorama</h3>
          <div className="progress-badge">
            <span className="frames-count">
              {stats.framesAccepted} frames
            </span>
            <span className="coverage-percent">
              {stats.coveragePercent.toFixed(0)}% coverage
            </span>
          </div>
        </div>

        <div className="panel-content panorama-view">
          {panoramaDataUrl ? (
            <div className="panorama-canvas-container">
              <canvas
                ref={panoramaCanvasRef}
                className="panorama-canvas"
              />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📷</div>
              <h4>No panorama yet</h4>
              <p>Start capturing to build your panorama</p>
            </div>
          )}

          {showStats && panoramaDataUrl && (
            <div className="panorama-stats">
              <div className="stat-item">
                <span className="stat-label">Quality:</span>
                <span className="stat-value">
                  {stats.avgQuality.toFixed(0)}/100
                </span>
                <div className="quality-bar">
                  <div
                    className="quality-fill"
                    style={{ width: `${stats.avgQuality}%` }}
                  />
                </div>
              </div>
              <div className="stat-item">
                <span className="stat-label">Accepted/Rejected:</span>
                <span className="stat-value success">
                  ✓ {stats.framesAccepted}
                </span>
                <span className="stat-separator">/</span>
                <span className="stat-value error">
                  ✗ {stats.framesRejected}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
