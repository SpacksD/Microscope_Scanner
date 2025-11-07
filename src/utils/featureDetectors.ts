/**
 * Feature Detectors - Support for multiple feature detection algorithms
 *
 * Provides unified interface for ORB, SURF, and SIFT feature detectors.
 * SURF is preferred for microscopy based on 2024 research (FRMIS paper).
 *
 * Performance comparison:
 * - SIFT: 116ms, 128-dim descriptors, most accurate
 * - SURF: 112ms, 64-dim descriptors, best for microscopy
 * - ORB: 11ms, 256-bit binary descriptors, fastest but less robust
 */

export type FeatureDetectorType = 'ORB' | 'SURF' | 'SIFT' | 'AUTO';

export interface FeatureDetectorConfig {
  type: FeatureDetectorType;
  nFeatures: number;
  // SURF-specific
  hessianThreshold?: number;
  nOctaves?: number;
  nOctaveLayers?: number;
  extended?: boolean;
  upright?: boolean;
  // ORB-specific
  scaleFactor?: number;
  nLevels?: number;
  edgeThreshold?: number;
  // SIFT-specific
  contrastThreshold?: number;
  edgeThresholdSift?: number;
  sigma?: number;
}

export interface FeatureSet {
  keypoints: any; // cv.KeyPointVector
  descriptors: any; // cv.Mat
  detector: any; // The detector object (for cleanup)
  detectorType: FeatureDetectorType;
}

// Default configurations based on research
export const DEFAULT_CONFIGS: Record<FeatureDetectorType, Partial<FeatureDetectorConfig>> = {
  ORB: {
    nFeatures: 1500,
    scaleFactor: 1.2,
    nLevels: 8,
    edgeThreshold: 31
  },
  SURF: {
    hessianThreshold: 400,
    nOctaves: 4,
    nOctaveLayers: 3,
    extended: false, // Use 64-dim descriptors (false) or 128-dim (true)
    upright: false // Rotation invariant
  },
  SIFT: {
    nFeatures: 1500,
    contrastThreshold: 0.04,
    edgeThresholdSift: 10,
    sigma: 1.6
  },
  AUTO: {
    // Will auto-select based on availability
  }
};

/**
 * Create a feature detector based on configuration
 */
export function createFeatureDetector(
  cv: any,
  config: FeatureDetectorConfig
): any {
  const type = config.type === 'AUTO' ? autoSelectDetector(cv) : config.type;

  switch (type) {
    case 'SURF':
      return createSURFDetector(cv, config);

    case 'SIFT':
      return createSIFTDetector(cv, config);

    case 'ORB':
    default:
      return createORBDetector(cv, config);
  }
}

/**
 * Create SURF detector (preferred for microscopy)
 */
function createSURFDetector(cv: any, config: FeatureDetectorConfig): any {
  if (!cv.xfeatures2d || !cv.xfeatures2d.SURF) {
    console.warn('SURF not available, falling back to ORB');
    return createORBDetector(cv, config);
  }

  const defaults = DEFAULT_CONFIGS.SURF;

  return cv.xfeatures2d.SURF.create(
    config.hessianThreshold ?? defaults.hessianThreshold,
    config.nOctaves ?? defaults.nOctaves,
    config.nOctaveLayers ?? defaults.nOctaveLayers,
    config.extended ?? defaults.extended,
    config.upright ?? defaults.upright
  );
}

/**
 * Create SIFT detector (most accurate but slower)
 */
function createSIFTDetector(cv: any, config: FeatureDetectorConfig): any {
  if (!cv.SIFT) {
    console.warn('SIFT not available, falling back to ORB');
    return createORBDetector(cv, config);
  }

  const defaults = DEFAULT_CONFIGS.SIFT;

  return cv.SIFT.create(
    config.nFeatures,
    config.nOctaveLayers ?? defaults.nOctaveLayers,
    config.contrastThreshold ?? defaults.contrastThreshold,
    config.edgeThresholdSift ?? defaults.edgeThresholdSift,
    config.sigma ?? defaults.sigma
  );
}

/**
 * Create ORB detector (fastest, current default)
 */
function createORBDetector(cv: any, config: FeatureDetectorConfig): any {
  const defaults = DEFAULT_CONFIGS.ORB;

  return new cv.ORB(
    config.nFeatures,
    config.scaleFactor ?? defaults.scaleFactor,
    config.nLevels ?? defaults.nLevels,
    config.edgeThreshold ?? defaults.edgeThreshold
  );
}

/**
 * Auto-select best available detector
 * Priority: SURF > SIFT > ORB
 */
function autoSelectDetector(cv: any): FeatureDetectorType {
  if (cv.xfeatures2d?.SURF) {
    return 'SURF';
  }
  if (cv.SIFT) {
    return 'SIFT';
  }
  return 'ORB';
}

/**
 * Detect features in an image
 */
export function detectFeatures(
  cv: any,
  imageMat: any,
  config: FeatureDetectorConfig
): FeatureSet {
  const detector = createFeatureDetector(cv, config);

  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();

  detector.detectAndCompute(
    imageMat,
    new cv.Mat(),
    keypoints,
    descriptors
  );

  return {
    keypoints,
    descriptors,
    detector,
    detectorType: config.type === 'AUTO' ? autoSelectDetector(cv) : config.type
  };
}

/**
 * Detect features in a specific region of interest (ROI)
 * This is critical for performance - only detect features in overlap areas
 */
export function detectFeaturesInRegion(
  cv: any,
  imageMat: any,
  region: { x: number; y: number; width: number; height: number },
  config: FeatureDetectorConfig
): FeatureSet {
  // Ensure region is within image bounds
  const validRegion = {
    x: Math.max(0, Math.floor(region.x)),
    y: Math.max(0, Math.floor(region.y)),
    width: Math.min(imageMat.cols - region.x, Math.floor(region.width)),
    height: Math.min(imageMat.rows - region.y, Math.floor(region.height))
  };

  // Create ROI
  const rect = new cv.Rect(
    validRegion.x,
    validRegion.y,
    validRegion.width,
    validRegion.height
  );

  const roi = imageMat.roi(rect);

  // Detect features in ROI
  const features = detectFeatures(cv, roi, config);

  // Adjust keypoint coordinates to global image space
  for (let i = 0; i < features.keypoints.size(); i++) {
    const kp = features.keypoints.get(i);
    kp.pt.x += validRegion.x;
    kp.pt.y += validRegion.y;
    features.keypoints.set(i, kp);
  }

  roi.delete();

  return features;
}

/**
 * Match features between two descriptor sets
 */
export function matchFeatures(
  cv: any,
  descriptors1: any,
  descriptors2: any,
  detectorType: FeatureDetectorType
): { matches: any; goodMatches: any[] } {
  // Choose appropriate distance metric
  const normType =
    detectorType === 'ORB' ? cv.NORM_HAMMING : cv.NORM_L2;

  const matcher = new cv.BFMatcher(normType, true);
  const matches = new cv.DMatchVector();

  if (descriptors1.rows >= 2 && descriptors2.rows >= 2) {
    matcher.match(descriptors1, descriptors2, matches);
  }

  // Convert to array and sort by distance
  const matchesArray: any[] = [];
  for (let i = 0; i < matches.size(); i++) {
    matchesArray.push(matches.get(i));
  }
  matchesArray.sort((a, b) => a.distance - b.distance);

  // Filter good matches (top 40%, max 150 matches)
  const numGoodMatches = Math.min(
    150,
    Math.floor(matchesArray.length * 0.4)
  );
  const goodMatches = matchesArray.slice(0, numGoodMatches);

  matcher.delete();

  return { matches, goodMatches };
}

/**
 * Match features with ratio test (Lowe's ratio test)
 * More robust than simple distance threshold
 */
export function matchFeaturesRatioTest(
  cv: any,
  descriptors1: any,
  descriptors2: any,
  detectorType: FeatureDetectorType,
  ratioThreshold: number = 0.75
): { matches: any[]; goodMatches: any[] } {
  const normType =
    detectorType === 'ORB' ? cv.NORM_HAMMING : cv.NORM_L2;

  const matcher = new cv.BFMatcher(normType, false); // crossCheck = false for knnMatch
  const knnMatches = new cv.DMatchVectorVector();

  if (descriptors1.rows >= 2 && descriptors2.rows >= 2) {
    matcher.knnMatch(descriptors1, descriptors2, knnMatches, 2); // k=2 nearest neighbors
  }

  // Apply ratio test
  const goodMatches: any[] = [];
  const allMatches: any[] = [];

  for (let i = 0; i < knnMatches.size(); i++) {
    const match = knnMatches.get(i);

    if (match.size() >= 2) {
      const m = match.get(0);
      const n = match.get(1);

      allMatches.push(m);

      // Ratio test: best match should be significantly better than second best
      if (m.distance < ratioThreshold * n.distance) {
        goodMatches.push(m);
      }
    } else if (match.size() === 1) {
      const m = match.get(0);
      allMatches.push(m);
      goodMatches.push(m);
    }
  }

  matcher.delete();
  knnMatches.delete();

  return { matches: allMatches, goodMatches };
}

/**
 * Calculate adaptive feature count based on image texture
 */
export function calculateAdaptiveFeatureCount(
  cv: any,
  grayMat: any,
  baseCount: number = 1500
): number {
  // Calculate Laplacian variance as texture measure
  const laplacian = new cv.Mat();
  cv.Laplacian(grayMat, laplacian, cv.CV_64F);

  const mean = cv.mean(laplacian);
  const meanSquare = new cv.Mat();
  cv.multiply(laplacian, laplacian, meanSquare);
  const meanOfSquares = cv.mean(meanSquare);

  const textureScore = meanOfSquares[0] - mean[0] * mean[0];

  laplacian.delete();
  meanSquare.delete();

  // Adapt feature count based on texture
  // Low texture (< 100) = increase features to 2x
  // Medium texture (100-500) = normal
  // High texture (> 500) = can reduce to 0.7x

  if (textureScore < 100) {
    return Math.min(baseCount * 2, 3000);
  } else if (textureScore < 500) {
    return baseCount;
  } else {
    return Math.max(Math.floor(baseCount * 0.7), 1000);
  }
}

/**
 * Cleanup feature set to prevent memory leaks
 */
export function cleanupFeatures(features: FeatureSet): void {
  features.keypoints?.delete();
  features.descriptors?.delete();
  features.detector?.delete();
}

/**
 * Get detector info for UI display
 */
export function getDetectorInfo(detectorType: FeatureDetectorType): {
  name: string;
  description: string;
  speed: 'Fast' | 'Medium' | 'Slow';
  accuracy: 'Good' | 'Better' | 'Best';
  recommended: boolean;
} {
  switch (detectorType) {
    case 'SURF':
      return {
        name: 'SURF',
        description: 'Speeded-Up Robust Features - Best for microscopy',
        speed: 'Medium',
        accuracy: 'Better',
        recommended: true
      };

    case 'SIFT':
      return {
        name: 'SIFT',
        description: 'Scale-Invariant Feature Transform - Most accurate',
        speed: 'Medium',
        accuracy: 'Best',
        recommended: false
      };

    case 'ORB':
    default:
      return {
        name: 'ORB',
        description: 'Oriented FAST and Rotated BRIEF - Fastest',
        speed: 'Fast',
        accuracy: 'Good',
        recommended: false
      };
  }
}
