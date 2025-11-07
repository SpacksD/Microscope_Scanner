/**
 * Quality Indicator - Detailed frame quality metrics and recommendations
 *
 * Shows comprehensive quality assessment including:
 * - Overall quality score (0-100)
 * - Feature detection metrics
 * - Image quality (brightness, sharpness, contrast)
 * - Actionable recommendations for improvement
 */

import React from 'react';
import type { QualityMetrics } from '../utils/qualityMetrics';
import { getQualityLevel, getQualityRecommendations } from '../utils/qualityMetrics';
import './QualityIndicator.css';

export interface QualityIndicatorProps {
  metrics: QualityMetrics | null;
  showDetails?: boolean;
  compact?: boolean;
}

export const QualityIndicator: React.FC<QualityIndicatorProps> = ({
  metrics,
  showDetails = true,
  compact = false
}) => {
  if (!metrics) {
    return (
      <div className="quality-indicator empty">
        <div className="empty-message">
          No quality data available
        </div>
      </div>
    );
  }

  const qualityLevel = getQualityLevel(metrics.score);
  const recommendations = getQualityRecommendations(metrics);

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'excellent': return '#4caf50';
      case 'good': return '#8bc34a';
      case 'fair': return '#ff9800';
      case 'poor': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getLevelLabel = (level: string): string => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  if (compact) {
    return (
      <div className="quality-indicator compact">
        <div className="compact-score">
          <CircularProgress
            value={metrics.score}
            size={40}
            color={getLevelColor(qualityLevel)}
          />
          <span className="compact-label">{metrics.score}/100</span>
        </div>
        <div className="compact-level" style={{ color: getLevelColor(qualityLevel) }}>
          {getLevelLabel(qualityLevel)}
        </div>
      </div>
    );
  }

  return (
    <div className="quality-indicator">
      <div className="quality-header">
        <h3>Frame Quality Analysis</h3>
        <div className="overall-score">
          <CircularProgress
            value={metrics.score}
            size={80}
            color={getLevelColor(qualityLevel)}
          />
          <div className="score-label">
            <div className="score-value">{metrics.score}</div>
            <div className="score-max">/100</div>
          </div>
          <div
            className="quality-level"
            style={{ color: getLevelColor(qualityLevel) }}
          >
            {getLevelLabel(qualityLevel)}
          </div>
        </div>
      </div>

      {showDetails && (
        <>
          <div className="quality-metrics">
            <MetricBar
              label="Features Detected"
              value={metrics.featureCount}
              max={3000}
              color="#2196f3"
              unit=""
            />
            <MetricBar
              label="Match Quality"
              value={metrics.matchRatio * 100}
              max={100}
              color="#4caf50"
              unit="%"
            />
            <MetricBar
              label="Sharpness"
              value={Math.min(metrics.sharpness, 1000)}
              max={1000}
              color="#9c27b0"
              unit=""
            />
            <MetricBar
              label="Brightness"
              value={metrics.brightness}
              max={255}
              color="#ff9800"
              unit=""
            />
            <MetricBar
              label="Contrast"
              value={Math.min(metrics.contrast, 100)}
              max={100}
              color="#00bcd4"
              unit=""
            />
            <MetricBar
              label="Overlap"
              value={metrics.overlapRatio * 100}
              max={100}
              color="#8bc34a"
              unit="%"
              optimal={40}
            />
          </div>

          {recommendations.length > 0 && (
            <div className="quality-recommendations">
              <h4>💡 Recommendations</h4>
              <ul className="recommendations-list">
                {recommendations.map((rec, index) => (
                  <li key={index} className="recommendation-item">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {metrics.homographyError !== undefined && (
            <div className="additional-metrics">
              <div className="metric-row">
                <span className="metric-label">Homography Error:</span>
                <span className="metric-value">
                  {metrics.homographyError.toFixed(2)}px
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Circular Progress Component
interface CircularProgressProps {
  value: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 80,
  color = '#4caf50',
  strokeWidth = 6
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="circular-progress"
    >
      <circle
        className="progress-bg"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <circle
        className="progress-bar"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

// Metric Bar Component
interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  unit?: string;
  optimal?: number; // Optimal value for indicator
}

const MetricBar: React.FC<MetricBarProps> = ({
  label,
  value,
  max,
  color,
  unit = '',
  optimal
}) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div className="metric-bar">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className="metric-value">
          {value < 1 ? value.toFixed(2) : Math.round(value)}
          {unit}
        </span>
      </div>
      <div className="bar-container">
        <div
          className="bar-fill"
          style={{
            width: `${percentage}%`,
            background: color
          }}
        />
        {optimal && (
          <div
            className="optimal-marker"
            style={{ left: `${(optimal / max) * 100}%` }}
            title={`Optimal: ${optimal}${unit}`}
          />
        )}
      </div>
    </div>
  );
};
