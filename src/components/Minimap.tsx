import { useEffect, useRef } from 'react';
import type { RegionMap, RegionData, CoverageStats } from '../utils/regionTracking';
import './Minimap.css';

interface MinimapProps {
  regionMap: RegionMap;
  panoramaDataUrl?: string;
  currentFramePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  coverageStats: CoverageStats;
  width?: number;
  height?: number;
  // Note: enableZoom and enablePan are placeholders for future enhancements
  enableZoom?: boolean;
  enablePan?: boolean;
}

export const Minimap: React.FC<MinimapProps> = ({
  regionMap,
  panoramaDataUrl,
  currentFramePosition,
  coverageStats,
  width = 300,
  height = 300
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Calculate scale to fit panorama in minimap
    const bounds = regionMap.panoramaBounds;
    const panoramaWidth = bounds.maxX - bounds.minX;
    const panoramaHeight = bounds.maxY - bounds.minY;

    if (panoramaWidth === 0 || panoramaHeight === 0) return;

    const scaleX = (width - 40) / panoramaWidth;
    const scaleY = (height - 40) / panoramaHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - panoramaWidth * scale) / 2;
    const offsetY = (height - panoramaHeight * scale) / 2;

    // Draw panorama image if available
    if (panoramaDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(
          img,
          offsetX,
          offsetY,
          panoramaWidth * scale,
          panoramaHeight * scale
        );
        ctx.restore();

        // Draw regions on top of image
        drawRegions(ctx, regionMap, bounds, scale, offsetX, offsetY);

        // Draw current frame position
        if (currentFramePosition) {
          drawCurrentFrame(ctx, currentFramePosition, bounds, scale, offsetX, offsetY);
        }
      };
      img.src = panoramaDataUrl;
    } else {
      // Draw regions only
      drawRegions(ctx, regionMap, bounds, scale, offsetX, offsetY);
    }
  }, [regionMap, panoramaDataUrl, currentFramePosition, width, height]);

  return (
    <div className="minimap-container">
      <div className="minimap-header">
        <h4>Coverage Map</h4>
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="minimap-canvas"
      />

      <div className="minimap-stats">
        <div className="stat-row">
          <span className="stat-label">Overall Quality:</span>
          <span className="stat-value" style={{ color: getQualityColor(coverageStats.overallQuality) }}>
            {coverageStats.overallQuality.toFixed(0)}%
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Regions:</span>
          <span className="stat-value">{coverageStats.totalRegions}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Avg Captures:</span>
          <span className="stat-value">{coverageStats.avgCapturesPerRegion.toFixed(1)}</span>
        </div>
      </div>

      <div className="quality-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
          <span>Poor ({coverageStats.poorRegions})</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div>
          <span>Fair ({coverageStats.fairRegions})</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
          <span>Good ({coverageStats.goodRegions})</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#3b82f6' }}></div>
          <span>Excellent ({coverageStats.excellentRegions})</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Draw region grid with quality colors
 */
const drawRegions = (
  ctx: CanvasRenderingContext2D,
  regionMap: RegionMap,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
  offsetX: number,
  offsetY: number
) => {
  regionMap.regions.forEach((region: RegionData) => {
    const x = (region.x - bounds.minX) * scale + offsetX;
    const y = (region.y - bounds.minY) * scale + offsetY;
    const w = region.width * scale;
    const h = region.height * scale;

    // Fill with quality color
    ctx.fillStyle = getRegionColor(region.quality);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, y, w, h);

    // Draw border
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Draw capture count if region is large enough
    if (w > 30 && h > 30) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(region.captureCount.toString(), x + w / 2, y + h / 2);
    }

    ctx.globalAlpha = 1.0;
  });
};

/**
 * Draw current frame position indicator
 */
const drawCurrentFrame = (
  ctx: CanvasRenderingContext2D,
  framePos: { x: number; y: number; width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
  offsetX: number,
  offsetY: number
) => {
  const x = (framePos.x - bounds.minX) * scale + offsetX;
  const y = (framePos.y - bounds.minY) * scale + offsetY;
  const w = framePos.width * scale;
  const h = framePos.height * scale;

  // Draw pulsing outline
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.strokeRect(x, y, w, h);

  // Draw crosshair at center
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const crosshairSize = 10;

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - crosshairSize, centerY);
  ctx.lineTo(centerX + crosshairSize, centerY);
  ctx.moveTo(centerX, centerY - crosshairSize);
  ctx.lineTo(centerX, centerY + crosshairSize);
  ctx.stroke();

  ctx.globalAlpha = 1.0;
};

/**
 * Get color for region quality
 */
const getRegionColor = (quality: string): string => {
  switch (quality) {
    case 'excellent': return '#3b82f6'; // blue
    case 'good': return '#10b981'; // green
    case 'fair': return '#f59e0b'; // orange
    case 'poor': return '#ef4444'; // red
    default: return '#6b7280'; // gray
  }
};

/**
 * Get color for overall quality percentage
 */
const getQualityColor = (quality: number): string => {
  if (quality >= 75) return '#10b981'; // green
  if (quality >= 50) return '#f59e0b'; // orange
  return '#ef4444'; // red
};
