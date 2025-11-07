/**
 * Global Alignment - Multi-frame matching system
 *
 * Instead of only comparing against the last frame, this system compares
 * against multiple nearby frames to find the best match. This is CRITICAL for:
 * 1. Detecting when revisiting previously scanned areas
 * 2. Maintaining global consistency across the panorama
 * 3. Reducing error accumulation from frame-to-frame stitching
 *
 * Based on MIST algorithm's global optimization approach.
 */

import type { TranslationDatabase, FrameRecord } from './translationDatabase';
import type { FeatureDetectorConfig } from './featureDetectors';
import {
  detectFeatures,
  matchFeatures,
  matchFeaturesRatioTest
} from './featureDetectors';

export interface AlignmentCandidate {
  frameId: string;
  confidence: number;
  homography: any;
  translationDistance: number;
  matchCount: number;
  reprojectionError: number;
  framePosition: { x: number; y: number; width: number; height: number };
}

export interface GlobalAlignmentConfig {
  maxCandidates: number; // Number of nearby frames to try (default: 5)
  searchRadius: number; // Radius to search for candidates (default: 500px)
  minConfidence: number; // Minimum confidence to accept (default: 50)
  useRatioTest: boolean; // Use Lowe's ratio test (default: true)
  ratioThreshold: number; // Ratio test threshold (default: 0.75)
}

const DEFAULT_CONFIG: GlobalAlignmentConfig = {
  maxCandidates: 5,
  searchRadius: 500,
  minConfidence: 50,
  useRatioTest: true,
  ratioThreshold: 0.75
};

/**
 * Find best alignment by comparing against multiple previous frames
 */
export async function findBestAlignment(
  cv: any,
  newFrameImage: HTMLImageElement,
  estimatedPosition: { x: number; y: number },
  database: TranslationDatabase,
  featureConfig: FeatureDetectorConfig,
  alignmentConfig: Partial<GlobalAlignmentConfig> = {}
): Promise<AlignmentCandidate | null> {
  const config = { ...DEFAULT_CONFIG, ...alignmentConfig };

  // Find nearby frames as candidates
  const candidates = database.findNearbyFrames(
    estimatedPosition.x,
    estimatedPosition.y,
    config.searchRadius
  );

  if (candidates.length === 0) {
    return null; // No candidates to match against
  }

  // Limit to max candidates
  const topCandidates = candidates.slice(0, config.maxCandidates);

  // Detect features in new frame
  const newFrameMat = cv.imread(newFrameImage);
  const newFrameGray = new cv.Mat();
  cv.cvtColor(newFrameMat, newFrameGray, cv.COLOR_RGBA2GRAY);

  const newFrameFeatures = detectFeatures(cv, newFrameGray, featureConfig);

  // Try to match against each candidate
  const results: AlignmentCandidate[] = [];

  for (const candidate of topCandidates) {
    try {
      const result = await matchAgainstFrame(
        cv,
        newFrameFeatures,
        candidate,
        featureConfig,
        config
      );

      if (result && result.confidence >= config.minConfidence) {
        results.push(result);
      }
    } catch (error) {
      console.warn(`Failed to match against frame ${candidate.id}:`, error);
    }
  }

  // Cleanup
  newFrameMat.delete();
  newFrameGray.delete();
  newFrameFeatures.keypoints.delete();
  newFrameFeatures.descriptors.delete();
  newFrameFeatures.detector.delete();

  // Return best match (highest confidence)
  if (results.length === 0) {
    return null;
  }

  return results.sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Match new frame features against a candidate frame
 */
async function matchAgainstFrame(
  _cv: any,
  _newFrameFeatures: any,
  _candidate: FrameRecord,
  _featureConfig: FeatureDetectorConfig,
  _config: GlobalAlignmentConfig
): Promise<AlignmentCandidate | null> {
  // For now, we need to reconstruct features from candidate
  // In future, we could store descriptors in database
  // For this implementation, we'll need to pass candidate image data

  // Note: This is a simplified version. Full implementation would require
  // storing descriptor data in FrameRecord or passing candidate images

  return null; // Placeholder - needs candidate image data
}

/**
 * Match new frame against panorama region
 */
export async function matchAgainstPanorama(
  cv: any,
  newFrameImage: HTMLImageElement,
  panoramaCanvas: HTMLCanvasElement,
  estimatedPosition: { x: number; y: number },
  featureConfig: FeatureDetectorConfig,
  useRatioTest: boolean = true
): Promise<{
  success: boolean;
  confidence: number;
  homography: any;
  matchCount: number;
  reprojectionError: number;
  translation: { x: number; y: number };
} | null> {
  try {
    // Get frame features
    const frameMat = cv.imread(newFrameImage);
    const frameGray = new cv.Mat();
    cv.cvtColor(frameMat, frameGray, cv.COLOR_RGBA2GRAY);
    const frameFeatures = detectFeatures(cv, frameGray, featureConfig);

    // Get panorama region around estimated position
    const ctx = panoramaCanvas.getContext('2d')!;
    const regionSize = {
      width: newFrameImage.width * 1.5, // Slightly larger than frame
      height: newFrameImage.height * 1.5
    };

    const regionX = Math.max(0, estimatedPosition.x - regionSize.width * 0.25);
    const regionY = Math.max(0, estimatedPosition.y - regionSize.height * 0.25);

    const panoramaRegion = ctx.getImageData(
      regionX,
      regionY,
      Math.min(regionSize.width, panoramaCanvas.width - regionX),
      Math.min(regionSize.height, panoramaCanvas.height - regionY)
    );

    const panoramaMat = cv.matFromImageData(panoramaRegion);
    const panoramaGray = new cv.Mat();
    cv.cvtColor(panoramaMat, panoramaGray, cv.COLOR_RGBA2GRAY);
    const panoramaFeatures = detectFeatures(cv, panoramaGray, featureConfig);

    // Match features
    let goodMatches;

    if (useRatioTest) {
      const result = matchFeaturesRatioTest(
        cv,
        panoramaFeatures.descriptors,
        frameFeatures.descriptors,
        featureConfig.type || 'ORB',
        0.75
      );
      goodMatches = result.goodMatches;
    } else {
      const result = matchFeatures(
        cv,
        panoramaFeatures.descriptors,
        frameFeatures.descriptors,
        featureConfig.type || 'ORB'
      );
      goodMatches = result.goodMatches;
    }

    if (goodMatches.length < 4) {
      // Cleanup
      frameMat.delete();
      frameGray.delete();
      frameFeatures.keypoints.delete();
      frameFeatures.descriptors.delete();
      frameFeatures.detector.delete();
      panoramaMat.delete();
      panoramaGray.delete();
      panoramaFeatures.keypoints.delete();
      panoramaFeatures.descriptors.delete();
      panoramaFeatures.detector.delete();

      return null;
    }

    // Calculate homography
    const srcPoints = [];
    const dstPoints = [];

    for (const match of goodMatches) {
      const framePt = frameFeatures.keypoints.get(match.trainIdx).pt;
      const panoramaPt = panoramaFeatures.keypoints.get(match.queryIdx).pt;

      srcPoints.push(framePt);
      dstPoints.push(panoramaPt);
    }

    const srcMat = cv.matFromArray(srcPoints.length, 1, cv.CV_32FC2, [
      ...srcPoints.flatMap((p) => [p.x, p.y])
    ]);
    const dstMat = cv.matFromArray(dstPoints.length, 1, cv.CV_32FC2, [
      ...dstPoints.flatMap((p) => [p.x, p.y])
    ]);

    const homography = cv.findHomography(
      srcMat,
      dstMat,
      cv.RANSAC,
      5.0 // Reprojection threshold
    );

    // Calculate reprojection error
    let reprojectionError = 0;
    let inliers = 0;

    for (let i = 0; i < srcPoints.length; i++) {
      const src = srcPoints[i];
      const dst = dstPoints[i];

      // Apply homography
      const transformed = transformPoint(homography, src);

      const error = Math.sqrt(
        Math.pow(transformed.x - dst.x, 2) + Math.pow(transformed.y - dst.y, 2)
      );

      if (error < 5.0) {
        // Inlier threshold
        reprojectionError += error;
        inliers++;
      }
    }

    reprojectionError = inliers > 0 ? reprojectionError / inliers : 999;

    // Extract translation from homography
    const translation = {
      x: homography.data64F[2] + regionX,
      y: homography.data64F[5] + regionY
    };

    // Calculate confidence
    const confidence = Math.min(100, (inliers / goodMatches.length) * 100);

    // Cleanup
    frameMat.delete();
    frameGray.delete();
    frameFeatures.keypoints.delete();
    frameFeatures.descriptors.delete();
    frameFeatures.detector.delete();
    panoramaMat.delete();
    panoramaGray.delete();
    panoramaFeatures.keypoints.delete();
    panoramaFeatures.descriptors.delete();
    panoramaFeatures.detector.delete();
    srcMat.delete();
    dstMat.delete();

    return {
      success: true,
      confidence,
      homography,
      matchCount: inliers,
      reprojectionError,
      translation
    };
  } catch (error) {
    console.error('Error in matchAgainstPanorama:', error);
    return null;
  }
}

/**
 * Transform a point using homography matrix
 */
function transformPoint(
  homography: any,
  point: { x: number; y: number }
): { x: number; y: number } {
  const h = homography.data64F;

  const w = h[6] * point.x + h[7] * point.y + h[8];
  const x = (h[0] * point.x + h[1] * point.y + h[2]) / w;
  const y = (h[3] * point.x + h[4] * point.y + h[5]) / w;

  return { x, y };
}

/**
 * Calculate translation distance from homography
 */
export function extractTranslation(homography: any): {
  x: number;
  y: number;
  distance: number;
} {
  const h = homography.data64F;
  const x = h[2];
  const y = h[5];
  const distance = Math.sqrt(x * x + y * y);

  return { x, y, distance };
}

/**
 * Calculate rotation angle from homography (in degrees)
 */
export function extractRotation(homography: any): number {
  const h = homography.data64F;
  const angle = Math.atan2(h[3], h[0]);
  return (angle * 180) / Math.PI;
}

/**
 * Calculate scale from homography
 */
export function extractScale(homography: any): { x: number; y: number } {
  const h = homography.data64F;

  const scaleX = Math.sqrt(h[0] * h[0] + h[3] * h[3]);
  const scaleY = Math.sqrt(h[1] * h[1] + h[4] * h[4]);

  return { x: scaleX, y: scaleY };
}

/**
 * Check if homography represents a valid rigid transformation
 * (minimal rotation, minimal scale change, reasonable translation)
 */
export function isValidRigidTransform(
  homography: any,
  maxRotation: number = 5, // degrees
  maxScaleChange: number = 0.1, // 10%
  maxTranslation: number = 1000 // pixels
): { valid: boolean; reason?: string } {
  const rotation = Math.abs(extractRotation(homography));

  if (rotation > maxRotation) {
    return { valid: false, reason: `Excessive rotation: ${rotation.toFixed(1)}°` };
  }

  const scale = extractScale(homography);
  const scaleChangeX = Math.abs(scale.x - 1.0);
  const scaleChangeY = Math.abs(scale.y - 1.0);

  if (scaleChangeX > maxScaleChange || scaleChangeY > maxScaleChange) {
    return {
      valid: false,
      reason: `Excessive scale change: ${(Math.max(scaleChangeX, scaleChangeY) * 100).toFixed(1)}%`
    };
  }

  const translation = extractTranslation(homography);

  if (translation.distance > maxTranslation) {
    return {
      valid: false,
      reason: `Excessive translation: ${translation.distance.toFixed(1)}px`
    };
  }

  return { valid: true };
}

/**
 * Merge multiple alignment candidates using weighted average
 */
export function mergeAlignments(
  candidates: AlignmentCandidate[]
): AlignmentCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Weight by confidence
  const totalWeight = candidates.reduce((sum, c) => sum + c.confidence, 0);

  let avgX = 0;
  let avgY = 0;
  let avgConfidence = 0;

  for (const candidate of candidates) {
    const weight = candidate.confidence / totalWeight;
    const translation = extractTranslation(candidate.homography);

    avgX += translation.x * weight;
    avgY += translation.y * weight;
    avgConfidence += candidate.confidence * weight;
  }

  // Use best candidate as base, but adjust translation
  const best = candidates[0];

  return {
    ...best,
    confidence: avgConfidence,
    translationDistance: Math.sqrt(avgX * avgX + avgY * avgY)
  };
}
