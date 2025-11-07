/**
 * Quality Metrics System - Comprehensive frame quality assessment
 *
 * Evaluates multiple aspects of frame quality to determine if it's suitable
 * for inclusion in the panorama and to guide the user.
 *
 * Metrics include:
 * - Feature count (texture richness)
 * - Match ratio (alignment confidence)
 * - Homography error (geometric accuracy)
 * - Overlap ratio (coverage efficiency)
 * - Brightness (exposure level)
 * - Sharpness (focus quality)
 * - Contrast (detail visibility)
 */

export interface QualityMetrics {
  featureCount: number; // Number of features detected (0-3000+)
  matchRatio: number; // Ratio of good matches (0-1)
  homographyError: number; // RANSAC reprojection error in pixels
  overlapRatio: number; // Overlap with panorama (0-1)
  brightness: number; // Mean intensity (0-255)
  sharpness: number; // Laplacian variance (0-1000+)
  contrast: number; // Standard deviation of intensity (0-100+)
  score: number; // Overall quality score (0-100)
}

export interface QualityThresholds {
  minFeatures: number;
  minMatchRatio: number;
  maxHomographyError: number;
  minOverlap: number;
  maxOverlap: number;
  minBrightness: number;
  maxBrightness: number;
  minSharpness: number;
  minContrast: number;
}

// Default thresholds based on microscopy best practices
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minFeatures: 100,
  minMatchRatio: 0.3,
  maxHomographyError: 5.0,
  minOverlap: 0.2, // 20% minimum overlap
  maxOverlap: 0.8, // 80% maximum overlap
  minBrightness: 30,
  maxBrightness: 225,
  minSharpness: 50,
  minContrast: 15
};

/**
 * Calculate comprehensive quality metrics for a frame
 */
export function calculateQualityMetrics(
  cv: any,
  imageMat: any,
  featureCount: number,
  matchRatio: number,
  homographyError: number,
  overlapRatio: number = 0.5
): QualityMetrics {
  // Calculate image statistics
  const brightness = calculateBrightness(cv, imageMat);
  const sharpness = calculateSharpness(cv, imageMat);
  const contrast = calculateContrast(cv, imageMat);

  // Calculate overall quality score
  const score = calculateOverallScore({
    featureCount,
    matchRatio,
    homographyError,
    overlapRatio,
    brightness,
    sharpness,
    contrast
  });

  return {
    featureCount,
    matchRatio,
    homographyError,
    overlapRatio,
    brightness,
    sharpness,
    contrast,
    score
  };
}

/**
 * Calculate brightness (mean intensity)
 */
export function calculateBrightness(cv: any, imageMat: any): number {
  // Convert to grayscale if needed
  let grayMat = imageMat;
  let needsCleanup = false;

  if (imageMat.channels() > 1) {
    grayMat = new cv.Mat();
    cv.cvtColor(imageMat, grayMat, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  const mean = cv.mean(grayMat);
  const brightness = mean[0];

  if (needsCleanup) {
    grayMat.delete();
  }

  return brightness;
}

/**
 * Calculate sharpness using Laplacian variance
 * Higher values = sharper image
 */
export function calculateSharpness(cv: any, imageMat: any): number {
  // Convert to grayscale if needed
  let grayMat = imageMat;
  let needsCleanup = false;

  if (imageMat.channels() > 1) {
    grayMat = new cv.Mat();
    cv.cvtColor(imageMat, grayMat, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  // Calculate Laplacian
  const laplacian = new cv.Mat();
  cv.Laplacian(grayMat, laplacian, cv.CV_64F);

  // Calculate variance of Laplacian
  const mean = cv.mean(laplacian);
  const meanSquare = new cv.Mat();
  cv.multiply(laplacian, laplacian, meanSquare);
  const meanOfSquares = cv.mean(meanSquare);

  const variance = meanOfSquares[0] - mean[0] * mean[0];

  // Cleanup
  laplacian.delete();
  meanSquare.delete();
  if (needsCleanup) {
    grayMat.delete();
  }

  return variance;
}

/**
 * Calculate contrast (standard deviation of intensity)
 */
export function calculateContrast(cv: any, imageMat: any): number {
  // Convert to grayscale if needed
  let grayMat = imageMat;
  let needsCleanup = false;

  if (imageMat.channels() > 1) {
    grayMat = new cv.Mat();
    cv.cvtColor(imageMat, grayMat, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  const mean = cv.mean(grayMat);
  const meanValue = mean[0];

  // Calculate standard deviation
  const meanMat = new cv.Mat(
    grayMat.rows,
    grayMat.cols,
    grayMat.type(),
    new cv.Scalar(meanValue)
  );
  const diff = new cv.Mat();
  cv.subtract(grayMat, meanMat, diff);

  const diffSquared = new cv.Mat();
  cv.multiply(diff, diff, diffSquared);

  const variance = cv.mean(diffSquared);
  const stdDev = Math.sqrt(variance[0]);

  // Cleanup
  meanMat.delete();
  diff.delete();
  diffSquared.delete();
  if (needsCleanup) {
    grayMat.delete();
  }

  return stdDev;
}

/**
 * Calculate texture score (for adaptive feature count)
 */
export function calculateTextureScore(cv: any, grayMat: any): number {
  // Use Laplacian variance as texture measure
  return calculateSharpness(cv, grayMat);
}

/**
 * Calculate overall quality score (0-100)
 */
function calculateOverallScore(metrics: {
  featureCount: number;
  matchRatio: number;
  homographyError: number;
  overlapRatio: number;
  brightness: number;
  sharpness: number;
  contrast: number;
}): number {
  const weights = {
    features: 0.2,
    matches: 0.25,
    homography: 0.15,
    overlap: 0.1,
    brightness: 0.1,
    sharpness: 0.15,
    contrast: 0.05
  };

  // Feature count score (0-100)
  const featureScore = Math.min(100, (metrics.featureCount / 1500) * 100);

  // Match ratio score (0-100)
  const matchScore = metrics.matchRatio * 100;

  // Homography error score (lower is better, 0 error = 100 score)
  const homographyScore = Math.max(
    0,
    100 - metrics.homographyError * 10
  );

  // Overlap score (optimal ~30-50% overlap)
  const overlapScore = calculateOverlapScore(metrics.overlapRatio);

  // Brightness score (optimal ~100-180)
  const brightnessScore = calculateBrightnessScore(metrics.brightness);

  // Sharpness score
  const sharpnessScore = Math.min(100, (metrics.sharpness / 500) * 100);

  // Contrast score
  const contrastScore = Math.min(100, (metrics.contrast / 50) * 100);

  // Weighted sum
  const totalScore =
    featureScore * weights.features +
    matchScore * weights.matches +
    homographyScore * weights.homography +
    overlapScore * weights.overlap +
    brightnessScore * weights.brightness +
    sharpnessScore * weights.sharpness +
    contrastScore * weights.contrast;

  return Math.round(totalScore);
}

/**
 * Calculate overlap quality score
 * Optimal overlap is 30-50% for efficiency and accuracy
 */
function calculateOverlapScore(overlapRatio: number): number {
  const optimal = 0.4; // 40% is ideal
  const tolerance = 0.2; // ±20% tolerance

  const distance = Math.abs(overlapRatio - optimal);

  if (distance <= tolerance) {
    // Within tolerance: 80-100 score
    return 100 - (distance / tolerance) * 20;
  } else {
    // Outside tolerance: 0-80 score
    const excessDistance = distance - tolerance;
    return Math.max(0, 80 - excessDistance * 100);
  }
}

/**
 * Calculate brightness quality score
 * Optimal brightness is 100-180 (well exposed, not too bright)
 */
function calculateBrightnessScore(brightness: number): number {
  const optimalMin = 80;
  const optimalMax = 180;

  if (brightness >= optimalMin && brightness <= optimalMax) {
    return 100;
  } else if (brightness < optimalMin) {
    // Too dark
    return Math.max(0, (brightness / optimalMin) * 100);
  } else {
    // Too bright
    const excess = brightness - optimalMax;
    return Math.max(0, 100 - (excess / (255 - optimalMax)) * 100);
  }
}

/**
 * Check if quality meets minimum thresholds
 */
export function meetsQualityThresholds(
  metrics: QualityMetrics,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS
): { passes: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (metrics.featureCount < thresholds.minFeatures) {
    reasons.push(
      `Insufficient features (${metrics.featureCount} < ${thresholds.minFeatures})`
    );
  }

  if (metrics.matchRatio < thresholds.minMatchRatio) {
    reasons.push(
      `Low match ratio (${(metrics.matchRatio * 100).toFixed(1)}% < ${(thresholds.minMatchRatio * 100).toFixed(1)}%)`
    );
  }

  if (metrics.homographyError > thresholds.maxHomographyError) {
    reasons.push(
      `High alignment error (${metrics.homographyError.toFixed(2)}px > ${thresholds.maxHomographyError}px)`
    );
  }

  if (metrics.overlapRatio < thresholds.minOverlap) {
    reasons.push(
      `Insufficient overlap (${(metrics.overlapRatio * 100).toFixed(1)}% < ${(thresholds.minOverlap * 100).toFixed(1)}%)`
    );
  }

  if (metrics.overlapRatio > thresholds.maxOverlap) {
    reasons.push(
      `Excessive overlap (${(metrics.overlapRatio * 100).toFixed(1)}% > ${(thresholds.maxOverlap * 100).toFixed(1)}%)`
    );
  }

  if (metrics.brightness < thresholds.minBrightness) {
    reasons.push(
      `Image too dark (${metrics.brightness.toFixed(0)} < ${thresholds.minBrightness})`
    );
  }

  if (metrics.brightness > thresholds.maxBrightness) {
    reasons.push(
      `Image too bright (${metrics.brightness.toFixed(0)} > ${thresholds.maxBrightness})`
    );
  }

  if (metrics.sharpness < thresholds.minSharpness) {
    reasons.push(
      `Image not sharp enough (${metrics.sharpness.toFixed(1)} < ${thresholds.minSharpness})`
    );
  }

  if (metrics.contrast < thresholds.minContrast) {
    reasons.push(
      `Insufficient contrast (${metrics.contrast.toFixed(1)} < ${thresholds.minContrast})`
    );
  }

  return {
    passes: reasons.length === 0,
    reasons
  };
}

/**
 * Get quality level description
 */
export function getQualityLevel(
  score: number
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/**
 * Get recommendations for improving quality
 */
export function getQualityRecommendations(
  metrics: QualityMetrics
): string[] {
  const recommendations: string[] = [];

  if (metrics.sharpness < 50) {
    recommendations.push('🔍 Adjust microscope focus to improve sharpness');
  }

  if (metrics.brightness < 50) {
    recommendations.push('💡 Increase illumination - image is too dark');
  }

  if (metrics.brightness > 200) {
    recommendations.push('💡 Decrease illumination - image is overexposed');
  }

  if (metrics.contrast < 20) {
    recommendations.push(
      '🎨 Adjust contrast settings - image lacks detail visibility'
    );
  }

  if (metrics.featureCount < 200) {
    recommendations.push(
      '🎯 Image lacks texture - consider different specimen area'
    );
  }

  if (metrics.overlapRatio > 0.7) {
    recommendations.push('⚡ Move faster - too much overlap is inefficient');
  }

  if (metrics.overlapRatio < 0.25) {
    recommendations.push('🐌 Move slower - not enough overlap for stitching');
  }

  return recommendations;
}
