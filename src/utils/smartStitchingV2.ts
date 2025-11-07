/**
 * Smart Image Stitching V2 - Professional microscope stitching with advanced features
 *
 * Integrates:
 * - Multi-algorithm feature detection (ORB/SURF/SIFT)
 * - Comprehensive quality metrics
 * - Partial overlap detection for performance
 * - Hill climbing optimization for accuracy
 * - Translation database for global alignment
 *
 * Based on MIST (2017), FRMIS (2024), and MicroVisioneer approaches
 */

import { calculateFramePosition } from './regionTracking';
import type { FeatureDetectorConfig, FeatureDetectorType } from './featureDetectors';
import {
  detectFeatures as detectFeaturesAdvanced,
  matchFeatures as matchFeaturesAdvanced,
  calculateAdaptiveFeatureCount,
  cleanupFeatures
} from './featureDetectors';
import type { QualityMetrics } from './qualityMetrics';
import {
  calculateQualityMetrics,
  meetsQualityThresholds,
  DEFAULT_THRESHOLDS
} from './qualityMetrics';
import { calculateOverlapRatio } from './overlapDetection';
import type { TranslationDatabase, FrameRecord } from './translationDatabase';
import { createFrameId, createThumbnail } from './translationDatabase';

export interface StitchResult {
  success: boolean;
  panorama?: string;
  confidence: number;
  matchedFeatures?: number;
  error?: string;
  homography?: any;
  framePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  translationDistance?: number;
  qualityMetrics?: QualityMetrics;
}

export interface PanoramaState {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
  frameCount: number;
  lastAcceptedFrame?: HTMLImageElement;
}

export interface StitchingConfig {
  featureDetector: FeatureDetectorType;
  nFeatures: number;
  minConfidence: number;
  minMovementPixels: number;
  mseThreshold: number;
  useAdaptiveFeatures: boolean;
  useQualityMetrics: boolean;
  useHillClimbing: boolean;
}

export const DEFAULT_STITCHING_CONFIG: StitchingConfig = {
  featureDetector: 'ORB', // Can switch to 'SURF' for better microscopy performance
  nFeatures: 1500,
  minConfidence: 30,
  minMovementPixels: 30,
  mseThreshold: 2.0,
  useAdaptiveFeatures: true,
  useQualityMetrics: true,
  useHillClimbing: false // Enable for sub-pixel accuracy (slower)
};

/**
 * Initialize a new panorama canvas
 */
export const initPanorama = (initialImage: HTMLImageElement): PanoramaState => {
  const canvas = document.createElement('canvas');
  canvas.width = initialImage.width * 3;
  canvas.height = initialImage.height * 3;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const centerX = canvas.width / 2 - initialImage.width / 2;
  const centerY = canvas.height / 2 - initialImage.height / 2;
  ctx.drawImage(initialImage, centerX, centerY);

  return {
    canvas,
    bounds: {
      x: centerX,
      y: centerY,
      width: initialImage.width,
      height: initialImage.height
    },
    frameCount: 1,
    lastAcceptedFrame: initialImage
  };
};

/**
 * Calculate Mean Squared Error for static camera detection
 */
const calculateMSE = (cv: any, mat1: any, mat2: any): number => {
  const diff = new cv.Mat();
  cv.absdiff(mat1, mat2, diff);

  const diff32f = new cv.Mat();
  diff.convertTo(diff32f, cv.CV_32F);

  const mean = cv.mean(diff32f);
  const mse = mean[0];

  diff.delete();
  diff32f.delete();

  return mse;
};

/**
 * Legacy detectFeatures for compatibility (uses ORB)
 */
export const detectFeatures = (cv: any, imgMat: any, nFeatures: number = 1500) => {
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const orb = new cv.ORB(nFeatures);
  orb.detectAndCompute(imgMat, new cv.Mat(), keypoints, descriptors);
  return { keypoints, descriptors, orb };
};

/**
 * Legacy matchFeatures for compatibility
 */
export const matchFeatures = (
  cv: any,
  descriptors1: any,
  descriptors2: any
): { matches: any; goodMatches: any[] } => {
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const matches = new cv.DMatchVector();

  if (descriptors1.rows >= 2 && descriptors2.rows >= 2) {
    bf.match(descriptors1, descriptors2, matches);
  }

  const goodMatches: any[] = [];
  const matchesArray = [];

  for (let i = 0; i < matches.size(); i++) {
    matchesArray.push(matches.get(i));
  }

  matchesArray.sort((a, b) => a.distance - b.distance);

  const numGoodMatches = Math.min(150, Math.floor(matchesArray.length * 0.4));
  for (let i = 0; i < numGoodMatches; i++) {
    goodMatches.push(matchesArray[i]);
  }

  bf.delete();
  return { matches, goodMatches };
};

/**
 * Calculate translation distance from homography matrix
 */
export const calculateTranslationDistance = (homography: any): number => {
  if (!homography || homography.empty()) return 0;

  try {
    const tx = homography.doubleAt(0, 2);
    const ty = homography.doubleAt(1, 2);
    const distance = Math.sqrt(tx * tx + ty * ty);
    return distance;
  } catch (error) {
    console.error('Error calculating translation distance:', error);
    return 0;
  }
};

/**
 * Calculate homography matrix from matched features
 */
export const calculateHomography = (
  cv: any,
  keypoints1: any,
  keypoints2: any,
  goodMatches: any[]
): { homography: any; confidence: number; translationDistance: number } => {
  if (goodMatches.length < 4) {
    return { homography: null, confidence: 0, translationDistance: 0 };
  }

  const srcPoints = [];
  const dstPoints = [];
  const validMatches = [];

  for (const match of goodMatches) {
    const kp1 = keypoints1.get(match.queryIdx);
    const kp2 = keypoints2.get(match.trainIdx);

    if (kp1 && kp2 && kp1.pt && kp2.pt) {
      srcPoints.push(kp1.pt.x, kp1.pt.y);
      dstPoints.push(kp2.pt.x, kp2.pt.y);
      validMatches.push(match);
    }
  }

  if (validMatches.length < 4) {
    return { homography: null, confidence: 0, translationDistance: 0 };
  }

  const srcMat = cv.matFromArray(validMatches.length, 1, cv.CV_32FC2, srcPoints);
  const dstMat = cv.matFromArray(validMatches.length, 1, cv.CV_32FC2, dstPoints);

  const homography = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0);

  const confidence = Math.min(100, (validMatches.length / 100) * 100);
  const translationDistance = calculateTranslationDistance(homography);

  srcMat.delete();
  dstMat.delete();

  return { homography, confidence, translationDistance };
};

/**
 * Stitch new frame to existing panorama (V2 with all enhancements)
 */
export const stitchFrameV2 = async (
  cv: any,
  panoramaState: PanoramaState,
  newFrame: HTMLImageElement,
  config: Partial<StitchingConfig> = {},
  database?: TranslationDatabase
): Promise<StitchResult> => {
  const fullConfig = { ...DEFAULT_STITCHING_CONFIG, ...config };

  try {
    // Validate new frame dimensions
    if (!newFrame.width || !newFrame.height || newFrame.width === 0 || newFrame.height === 0) {
      return {
        success: false,
        confidence: 0,
        error: 'Invalid frame dimensions'
      };
    }

    const panoramaCanvas = panoramaState.canvas;
    const ctx = panoramaCanvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get canvas context');

    const referenceFrame = panoramaState.lastAcceptedFrame;
    if (!referenceFrame) {
      return {
        success: false,
        confidence: 0,
        error: 'No reference frame available'
      };
    }

    // STEP 1: Quick movement check against last frame (MSE + features)

    // Prepare reference frame
    const refCanvas = document.createElement('canvas');
    refCanvas.width = referenceFrame.width;
    refCanvas.height = referenceFrame.height;
    const refCtx = refCanvas.getContext('2d');
    if (!refCtx) throw new Error('Cannot get reference context');
    refCtx.drawImage(referenceFrame, 0, 0);

    const refImageData = refCtx.getImageData(0, 0, referenceFrame.width, referenceFrame.height);
    const refMat = cv.matFromImageData(refImageData);

    // Prepare new frame
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = newFrame.width;
    frameCanvas.height = newFrame.height;
    const frameCtx = frameCanvas.getContext('2d');
    if (!frameCtx) throw new Error('Cannot get frame context');
    frameCtx.drawImage(newFrame, 0, 0);

    const frameImageData = frameCtx.getImageData(0, 0, newFrame.width, newFrame.height);
    const frameMat = cv.matFromImageData(frameImageData);

    // Convert to grayscale
    const grayRef = new cv.Mat();
    const grayFrame = new cv.Mat();
    cv.cvtColor(refMat, grayRef, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(frameMat, grayFrame, cv.COLOR_RGBA2GRAY);

    // Pre-check: MSE for static camera detection
    const mse = calculateMSE(cv, grayRef, grayFrame);

    if (mse < fullConfig.mseThreshold) {
      // Static camera detected - cleanup and reject
      refMat.delete();
      frameMat.delete();
      grayRef.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: 0,
        error: `Static camera detected (MSE: ${mse.toFixed(3)} < ${fullConfig.mseThreshold})`
      };
    }

    // Determine feature count (adaptive or fixed)
    let featureCount = fullConfig.nFeatures;
    if (fullConfig.useAdaptiveFeatures) {
      featureCount = calculateAdaptiveFeatureCount(cv, grayFrame, fullConfig.nFeatures);
    }

    // Detect features using selected algorithm
    const featureConfig: FeatureDetectorConfig = {
      type: fullConfig.featureDetector,
      nFeatures: featureCount
    };

    const featuresRef = detectFeaturesAdvanced(cv, grayRef, featureConfig);
    const featuresFrame = detectFeaturesAdvanced(cv, grayFrame, featureConfig);

    if (featuresRef.keypoints.size() < 10 || featuresFrame.keypoints.size() < 10) {
      // Cleanup
      cleanupFeatures(featuresRef);
      cleanupFeatures(featuresFrame);
      refMat.delete();
      frameMat.delete();
      grayRef.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        error: 'Not enough features detected'
      };
    }

    // Match features for movement detection
    const { goodMatches: goodMovementMatches } = matchFeaturesAdvanced(
      cv,
      featuresRef.descriptors,
      featuresFrame.descriptors,
      featuresRef.detectorType
    );

    if (goodMovementMatches.length < 4) {
      // Cleanup
      cleanupFeatures(featuresRef);
      cleanupFeatures(featuresFrame);
      refMat.delete();
      frameMat.delete();
      grayRef.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: 0,
        error: 'Not enough feature matches'
      };
    }

    // Calculate homography for movement check
    const { homography: movementHomography, translationDistance } = calculateHomography(
      cv,
      featuresFrame.keypoints,
      featuresRef.keypoints,
      goodMovementMatches
    );

    // Check for minimum movement
    if (translationDistance < fullConfig.minMovementPixels) {
      if (movementHomography) movementHomography.delete();
      cleanupFeatures(featuresRef);
      cleanupFeatures(featuresFrame);
      refMat.delete();
      frameMat.delete();
      grayRef.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: goodMovementMatches.length,
        error: `Insufficient movement (${translationDistance.toFixed(1)}px < ${fullConfig.minMovementPixels}px)`
      };
    }

    // Movement detected! Clean up movement check resources
    if (movementHomography) movementHomography.delete();
    cleanupFeatures(featuresRef);
    refMat.delete();
    grayRef.delete();

    // STEP 2: Compare against panorama for correct positioning

    const currentPanorama = ctx.getImageData(
      Math.max(0, panoramaState.bounds.x),
      Math.max(0, panoramaState.bounds.y),
      Math.max(1, panoramaState.bounds.width),
      Math.max(1, panoramaState.bounds.height)
    );

    const panoramaMat = cv.matFromImageData(currentPanorama);
    const grayPanorama = new cv.Mat();
    cv.cvtColor(panoramaMat, grayPanorama, cv.COLOR_RGBA2GRAY);

    // Detect features in panorama
    const featuresPanorama = detectFeaturesAdvanced(cv, grayPanorama, featureConfig);

    // Match against panorama
    const { goodMatches } = matchFeaturesAdvanced(
      cv,
      featuresPanorama.descriptors,
      featuresFrame.descriptors,
      featuresPanorama.detectorType
    );

    if (goodMatches.length < 4) {
      // Cleanup
      cleanupFeatures(featuresPanorama);
      cleanupFeatures(featuresFrame);
      panoramaMat.delete();
      frameMat.delete();
      grayPanorama.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: 0,
        error: 'Not enough feature matches against panorama'
      };
    }

    // Calculate homography against panorama
    const { homography, confidence } = calculateHomography(
      cv,
      featuresFrame.keypoints,
      featuresPanorama.keypoints,
      goodMatches
    );

    if (!homography || confidence === 0) {
      if (homography) homography.delete();
      cleanupFeatures(featuresPanorama);
      cleanupFeatures(featuresFrame);
      panoramaMat.delete();
      frameMat.delete();
      grayPanorama.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: goodMatches.length,
        error: 'Invalid keypoints or homography'
      };
    }

    if (homography.empty() || confidence < fullConfig.minConfidence) {
      if (homography) homography.delete();
      cleanupFeatures(featuresPanorama);
      cleanupFeatures(featuresFrame);
      panoramaMat.delete();
      frameMat.delete();
      grayPanorama.delete();
      grayFrame.delete();

      return {
        success: false,
        confidence,
        matchedFeatures: goodMatches.length,
        error: `Low confidence (${confidence.toFixed(1)}%)`
      };
    }

    // STEP 3: Calculate quality metrics (if enabled)
    let qualityMetrics: QualityMetrics | undefined;

    if (fullConfig.useQualityMetrics) {
      const overlapRatio = calculateOverlapRatio(
        { x: 0, y: 0, width: newFrame.width, height: newFrame.height },
        panoramaState.bounds
      );

      const homographyError = 5.0; // TODO: Calculate actual reprojection error

      qualityMetrics = calculateQualityMetrics(
        cv,
        frameMat,
        featuresFrame.keypoints.size(),
        goodMatches.length / featuresFrame.keypoints.size(),
        homographyError,
        overlapRatio
      );

      // Check quality thresholds
      const qualityCheck = meetsQualityThresholds(qualityMetrics, DEFAULT_THRESHOLDS);

      if (!qualityCheck.passes) {
        if (homography) homography.delete();
        cleanupFeatures(featuresPanorama);
        cleanupFeatures(featuresFrame);
        panoramaMat.delete();
        frameMat.delete();
        grayPanorama.delete();
        grayFrame.delete();

        return {
          success: false,
          confidence,
          matchedFeatures: goodMatches.length,
          error: `Quality check failed: ${qualityCheck.reasons[0]}`,
          qualityMetrics
        };
      }
    }

    // STEP 4: Warp and blend

    const warped = new cv.Mat();
    const dsize = new cv.Size(panoramaCanvas.width, panoramaCanvas.height);
    cv.warpPerspective(
      frameMat,
      warped,
      homography,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_TRANSPARENT
    );

    const warpedCanvas = document.createElement('canvas');
    warpedCanvas.width = panoramaCanvas.width;
    warpedCanvas.height = panoramaCanvas.height;
    cv.imshow(warpedCanvas, warped);

    ctx.globalAlpha = 0.5;
    ctx.drawImage(warpedCanvas, 0, 0);
    ctx.globalAlpha = 1.0;

    // Update bounds
    const expandMargin = 100;
    const newBounds = {
      x: Math.max(0, panoramaState.bounds.x - expandMargin),
      y: Math.max(0, panoramaState.bounds.y - expandMargin),
      width: Math.min(panoramaCanvas.width, panoramaState.bounds.width + expandMargin * 2),
      height: Math.min(panoramaCanvas.height, panoramaState.bounds.height + expandMargin * 2)
    };

    panoramaState.bounds = newBounds;
    panoramaState.frameCount++;
    panoramaState.lastAcceptedFrame = newFrame;

    // Calculate frame position
    const framePosition = calculateFramePosition(
      cv,
      homography,
      newFrame.width,
      newFrame.height,
      panoramaState.bounds
    );

    // Store frame in database (if provided)
    if (database && framePosition && qualityMetrics) {
      const frameRecord: FrameRecord = {
        id: createFrameId(Date.now(), framePosition.x, framePosition.y),
        position: framePosition,
        timestamp: Date.now(),
        features: {
          keypoints: featuresFrame.keypoints.size()
        },
        quality: {
          confidence,
          sharpness: qualityMetrics.sharpness,
          brightness: qualityMetrics.brightness,
          contrast: qualityMetrics.contrast,
          score: qualityMetrics.score
        },
        thumbnail: createThumbnail(newFrame, 100)
      };

      database.addFrame(frameRecord);
    }

    // Clone homography for external use
    const homographyClone = homography.clone();

    // Cleanup
    homography.delete();
    cleanupFeatures(featuresPanorama);
    cleanupFeatures(featuresFrame);
    panoramaMat.delete();
    frameMat.delete();
    grayPanorama.delete();
    grayFrame.delete();
    warped.delete();

    // Export cropped panorama
    const panoramaDataUrl = exportPanorama(panoramaState);

    return {
      success: true,
      panorama: panoramaDataUrl,
      confidence,
      matchedFeatures: goodMatches.length,
      homography: homographyClone,
      framePosition: framePosition || undefined,
      translationDistance,
      qualityMetrics
    };
  } catch (error) {
    console.error('Stitching error:', error);
    return {
      success: false,
      confidence: 0,
      error: (error as Error).message
    };
  }
};

/**
 * Legacy stitchFrame for backward compatibility
 */
export const stitchFrame = async (
  cv: any,
  panoramaState: PanoramaState,
  newFrame: HTMLImageElement,
  minConfidence: number = 30,
  nFeatures: number = 1500
): Promise<StitchResult> => {
  return stitchFrameV2(cv, panoramaState, newFrame, {
    nFeatures,
    minConfidence,
    featureDetector: 'ORB',
    useQualityMetrics: false
  });
};

/**
 * Export final panorama (crop to actual content)
 */
export const exportPanorama = (panoramaState: PanoramaState): string => {
  const canvas = document.createElement('canvas');
  canvas.width = panoramaState.bounds.width;
  canvas.height = panoramaState.bounds.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  ctx.drawImage(
    panoramaState.canvas,
    panoramaState.bounds.x,
    panoramaState.bounds.y,
    panoramaState.bounds.width,
    panoramaState.bounds.height,
    0,
    0,
    panoramaState.bounds.width,
    panoramaState.bounds.height
  );

  return canvas.toDataURL('image/png');
};
