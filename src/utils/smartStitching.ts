/**
 * Smart image stitching using OpenCV.js with feature detection
 */

import { calculateFramePosition } from './regionTracking';

export interface StitchResult {
  success: boolean;
  panorama?: string;
  confidence: number;
  matchedFeatures?: number;
  error?: string;
  homography?: any; // OpenCV Mat object for frame position calculation
  framePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  translationDistance?: number; // Movement in pixels
}

export interface PanoramaState {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
  frameCount: number;
  lastAcceptedFrame?: HTMLImageElement; // Last successfully stitched frame for comparison
}

/**
 * Initialize a new panorama canvas
 */
export const initPanorama = (initialImage: HTMLImageElement): PanoramaState => {
  const canvas = document.createElement('canvas');
  canvas.width = initialImage.width * 3; // Start with 3x space
  canvas.height = initialImage.height * 3;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  // Draw first image in center
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
 * Detect and compute ORB features
 */
export const detectFeatures = (cv: any, imgMat: any, nFeatures: number = 1500) => {
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();

  // Use ORB detector (faster than SIFT/SURF and patent-free)
  // Increased from 500 to 1500+ for better overlap detection
  const orb = new cv.ORB(nFeatures);
  orb.detectAndCompute(imgMat, new cv.Mat(), keypoints, descriptors);

  return { keypoints, descriptors, orb };
};

/**
 * Match features between two images
 */
export const matchFeatures = (
  cv: any,
  descriptors1: any,
  descriptors2: any
): { matches: any; goodMatches: any[] } => {
  // Use BFMatcher with Hamming distance (for ORB)
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const matches = new cv.DMatchVector();

  if (descriptors1.rows >= 2 && descriptors2.rows >= 2) {
    bf.match(descriptors1, descriptors2, matches);
  }

  // Filter good matches (Lowe's ratio test adaptation)
  const goodMatches: any[] = [];
  const matchesArray = [];

  for (let i = 0; i < matches.size(); i++) {
    matchesArray.push(matches.get(i));
  }

  // Sort by distance (lower distance = better match)
  matchesArray.sort((a, b) => a.distance - b.distance);

  // Take top 40% of matches, increased limit for better overlap detection
  // With 1500 features, we can get more matches for robust detection
  const numGoodMatches = Math.min(150, Math.floor(matchesArray.length * 0.4));
  for (let i = 0; i < numGoodMatches; i++) {
    goodMatches.push(matchesArray[i]);
  }

  bf.delete();
  return { matches, goodMatches };
};

/**
 * Calculate translation distance from homography matrix
 * Returns the amount of movement in pixels
 */
export const calculateTranslationDistance = (homography: any): number => {
  if (!homography || homography.empty()) return 0;

  try {
    // Get translation components from homography matrix
    // H = [h00 h01 tx]
    //     [h10 h11 ty]
    //     [h20 h21 1 ]
    const tx = homography.doubleAt(0, 2); // Translation in X
    const ty = homography.doubleAt(1, 2); // Translation in Y

    // Calculate Euclidean distance
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

  // Extract matched points with validation
  const srcPoints = [];
  const dstPoints = [];
  const validMatches = [];

  for (const match of goodMatches) {
    const kp1 = keypoints1.get(match.queryIdx);
    const kp2 = keypoints2.get(match.trainIdx);

    // Validate keypoints exist and have pt property
    if (kp1 && kp2 && kp1.pt && kp2.pt) {
      srcPoints.push(kp1.pt.x, kp1.pt.y);
      dstPoints.push(kp2.pt.x, kp2.pt.y);
      validMatches.push(match);
    }
  }

  // Check if we still have enough valid matches
  if (validMatches.length < 4) {
    return { homography: null, confidence: 0, translationDistance: 0 };
  }

  const srcMat = cv.matFromArray(validMatches.length, 1, cv.CV_32FC2, srcPoints);
  const dstMat = cv.matFromArray(validMatches.length, 1, cv.CV_32FC2, dstPoints);

  // Find homography with RANSAC
  const homography = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0);

  // Calculate confidence based on number of valid matches
  // Adjusted for increased feature count (up to 150 matches now)
  const confidence = Math.min(100, (validMatches.length / 100) * 100);

  // Calculate translation distance
  const translationDistance = calculateTranslationDistance(homography);

  srcMat.delete();
  dstMat.delete();

  return { homography, confidence, translationDistance };
};

/**
 * Stitch new frame to existing panorama
 */
export const stitchFrame = async (
  cv: any,
  panoramaState: PanoramaState,
  newFrame: HTMLImageElement,
  minConfidence: number = 30,
  nFeatures: number = 1500
): Promise<StitchResult> => {
  try {
    // Validate new frame dimensions
    if (!newFrame.width || !newFrame.height || newFrame.width === 0 || newFrame.height === 0) {
      return {
        success: false,
        confidence: 0,
        error: 'Invalid frame dimensions'
      };
    }

    // Convert images to cv.Mat
    const panoramaCanvas = panoramaState.canvas;
    const ctx = panoramaCanvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get canvas context');

    // Use last accepted frame for comparison instead of full panorama
    // This prevents false movement detection as panorama grows
    const referenceFrame = panoramaState.lastAcceptedFrame;
    if (!referenceFrame) {
      return {
        success: false,
        confidence: 0,
        error: 'No reference frame available'
      };
    }

    // Create cv.Mat from reference frame (last accepted frame)
    const refCanvas = document.createElement('canvas');
    refCanvas.width = referenceFrame.width;
    refCanvas.height = referenceFrame.height;
    const refCtx = refCanvas.getContext('2d');
    if (!refCtx) throw new Error('Cannot get reference context');
    refCtx.drawImage(referenceFrame, 0, 0);

    const refImageData = refCtx.getImageData(0, 0, referenceFrame.width, referenceFrame.height);
    const refMat = cv.matFromImageData(refImageData);

    // Create temporary canvas for new frame
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = newFrame.width;
    frameCanvas.height = newFrame.height;
    const frameCtx = frameCanvas.getContext('2d');
    if (!frameCtx) throw new Error('Cannot get frame context');
    frameCtx.drawImage(newFrame, 0, 0);

    const frameImageData = frameCtx.getImageData(0, 0, newFrame.width, newFrame.height);
    const frameMat = cv.matFromImageData(frameImageData);

    // Convert to grayscale for feature detection
    const gray1 = new cv.Mat();
    const gray2 = new cv.Mat();
    cv.cvtColor(refMat, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(frameMat, gray2, cv.COLOR_RGBA2GRAY);

    // Detect features with configurable feature count
    const features1 = detectFeatures(cv, gray1, nFeatures);
    const features2 = detectFeatures(cv, gray2, nFeatures);

    if (features1.keypoints.size() < 10 || features2.keypoints.size() < 10) {
      // Not enough features
      features1.keypoints.delete();
      features1.descriptors.delete();
      features1.orb.delete();
      features2.keypoints.delete();
      features2.descriptors.delete();
      features2.orb.delete();
      refMat.delete();
      frameMat.delete();
      gray1.delete();
      gray2.delete();

      return {
        success: false,
        confidence: 0,
        error: 'Not enough features detected'
      };
    }

    // Match features
    const { matches, goodMatches } = matchFeatures(
      cv,
      features1.descriptors,
      features2.descriptors
    );

    if (goodMatches.length < 4) {
      // Not enough matches
      matches.delete();
      features1.keypoints.delete();
      features1.descriptors.delete();
      features1.orb.delete();
      features2.keypoints.delete();
      features2.descriptors.delete();
      features2.orb.delete();
      refMat.delete();
      frameMat.delete();
      gray1.delete();
      gray2.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: 0,
        error: 'Not enough feature matches'
      };
    }

    // Calculate homography
    const { homography, confidence, translationDistance } = calculateHomography(
      cv,
      features2.keypoints, // new frame keypoints
      features1.keypoints, // panorama keypoints
      goodMatches
    );

    if (!homography || confidence === 0) {
      if (homography) homography.delete();
      matches.delete();
      features1.keypoints.delete();
      features1.descriptors.delete();
      features1.orb.delete();
      features2.keypoints.delete();
      features2.descriptors.delete();
      features2.orb.delete();
      refMat.delete();
      frameMat.delete();
      gray1.delete();
      gray2.delete();

      return {
        success: false,
        confidence: 0,
        matchedFeatures: goodMatches.length,
        error: 'Invalid keypoints or homography'
      };
    }

    // Check for minimum movement (reject if camera hasn't moved significantly)
    const minMovementPixels = 30; // Minimum 30 pixels of movement to avoid false positives
    if (translationDistance < minMovementPixels) {
      if (homography) homography.delete();
      matches.delete();
      features1.keypoints.delete();
      features1.descriptors.delete();
      features1.orb.delete();
      features2.keypoints.delete();
      features2.descriptors.delete();
      features2.orb.delete();
      refMat.delete();
      frameMat.delete();
      gray1.delete();
      gray2.delete();

      return {
        success: false,
        confidence,
        matchedFeatures: goodMatches.length,
        error: `Insufficient movement (${translationDistance.toFixed(1)}px < ${minMovementPixels}px)`
      };
    }

    if (homography.empty() || confidence < minConfidence) {
      if (homography) homography.delete();
      matches.delete();
      features1.keypoints.delete();
      features1.descriptors.delete();
      features1.orb.delete();
      features2.keypoints.delete();
      features2.descriptors.delete();
      features2.orb.delete();
      refMat.delete();
      frameMat.delete();
      gray1.delete();
      gray2.delete();

      return {
        success: false,
        confidence,
        matchedFeatures: goodMatches.length,
        error: `Low confidence (${confidence.toFixed(1)}%)`
      };
    }

    // Warp new frame to align with panorama
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

    // Convert warped frame back to canvas
    const warpedCanvas = document.createElement('canvas');
    warpedCanvas.width = panoramaCanvas.width;
    warpedCanvas.height = panoramaCanvas.height;
    cv.imshow(warpedCanvas, warped);

    // Blend warped frame with existing panorama
    ctx.globalAlpha = 0.5;
    ctx.drawImage(warpedCanvas, 0, 0);
    ctx.globalAlpha = 1.0;

    // Update bounds (simplified - expand bounds if needed)
    const expandMargin = 100;
    const newBounds = {
      x: Math.max(0, panoramaState.bounds.x - expandMargin),
      y: Math.max(0, panoramaState.bounds.y - expandMargin),
      width: Math.min(panoramaCanvas.width, panoramaState.bounds.width + expandMargin * 2),
      height: Math.min(panoramaCanvas.height, panoramaState.bounds.height + expandMargin * 2)
    };

    panoramaState.bounds = newBounds;
    panoramaState.frameCount++;

    // Update last accepted frame for next comparison
    panoramaState.lastAcceptedFrame = newFrame;

    // Calculate frame position in panorama space
    const framePosition = calculateFramePosition(
      cv,
      homography,
      newFrame.width,
      newFrame.height,
      panoramaState.bounds
    );

    // Clone homography for external use (before cleanup)
    const homographyClone = homography.clone();

    // Cleanup
    homography.delete();
    matches.delete();
    features1.keypoints.delete();
    features1.descriptors.delete();
    features1.orb.delete();
    features2.keypoints.delete();
    features2.descriptors.delete();
    features2.orb.delete();
    refMat.delete();
    frameMat.delete();
    gray1.delete();
    gray2.delete();
    warped.delete();

    return {
      success: true,
      panorama: panoramaCanvas.toDataURL('image/png'),
      confidence,
      matchedFeatures: goodMatches.length,
      homography: homographyClone,
      framePosition: framePosition || undefined,
      translationDistance
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
