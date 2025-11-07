/**
 * Overlap Detection - Partial region matching for efficient stitching
 *
 * Instead of detecting features across the entire image, we only look in the
 * expected overlap region. This is CRITICAL for:
 * 1. Performance - 3-5x faster feature detection
 * 2. Accuracy - fewer false matches from non-overlapping areas
 * 3. Robustness - works better when revisiting areas
 *
 * Based on FRMIS 2024 algorithm approach.
 */

export interface OverlapRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: 'left' | 'right' | 'top' | 'bottom' | 'unknown';
  confidence: number; // 0-1, how confident we are about this overlap region
}

export interface OverlapEstimate {
  region: OverlapRegion;
  expectedPosition: { x: number; y: number };
  searchRadius: number;
}

/**
 * Estimate overlap region based on last frame position and current camera movement
 */
export function estimateOverlapRegion(
  lastFramePos: { x: number; y: number; width: number; height: number },
  currentEstimatedPos: { x: number; y: number },
  expectedOverlap: number = 0.3 // 30% overlap typical for microscopy
): OverlapRegion {
  const dx = currentEstimatedPos.x - lastFramePos.x;
  const dy = currentEstimatedPos.y - lastFramePos.y;

  // Determine primary movement direction
  const direction = determineDirection(dx, dy);

  // Calculate overlap region based on direction
  let overlapRegion: OverlapRegion;

  switch (direction) {
    case 'right':
      // Moving right: overlap is on left side of new frame, right side of old frame
      overlapRegion = {
        x: 0,
        y: 0,
        width: lastFramePos.width * expectedOverlap,
        height: lastFramePos.height,
        direction: 'right',
        confidence: 0.8
      };
      break;

    case 'left':
      // Moving left: overlap is on right side of new frame, left side of old frame
      overlapRegion = {
        x: lastFramePos.width * (1 - expectedOverlap),
        y: 0,
        width: lastFramePos.width * expectedOverlap,
        height: lastFramePos.height,
        direction: 'left',
        confidence: 0.8
      };
      break;

    case 'bottom':
      // Moving down: overlap is on top side of new frame, bottom side of old frame
      overlapRegion = {
        x: 0,
        y: 0,
        width: lastFramePos.width,
        height: lastFramePos.height * expectedOverlap,
        direction: 'bottom',
        confidence: 0.8
      };
      break;

    case 'top':
      // Moving up: overlap is on bottom side of new frame, top side of old frame
      overlapRegion = {
        x: 0,
        y: lastFramePos.height * (1 - expectedOverlap),
        width: lastFramePos.width,
        height: lastFramePos.height * expectedOverlap,
        direction: 'top',
        confidence: 0.8
      };
      break;

    default:
      // Unknown direction: use center region
      overlapRegion = {
        x: lastFramePos.width * 0.25,
        y: lastFramePos.height * 0.25,
        width: lastFramePos.width * 0.5,
        height: lastFramePos.height * 0.5,
        direction: 'unknown',
        confidence: 0.5
      };
  }

  return overlapRegion;
}

/**
 * Estimate overlap regions for matching against panorama
 * Returns both frame region and panorama region
 */
export function estimateOverlapRegions(
  frameSize: { width: number; height: number },
  estimatedPanoramaPos: { x: number; y: number },
  panoramaBounds: { x: number; y: number; width: number; height: number }
): {
  frameRegion: OverlapRegion;
  panoramaRegion: OverlapRegion;
} {
  // Calculate which edges of the frame likely overlap with panorama
  const frameRect = {
    x: estimatedPanoramaPos.x,
    y: estimatedPanoramaPos.y,
    width: frameSize.width,
    height: frameSize.height
  };

  // Find intersection with panorama
  const intersection = calculateIntersection(frameRect, panoramaBounds);

  if (!intersection) {
    // No overlap estimated - use full frame
    return {
      frameRegion: {
        x: 0,
        y: 0,
        width: frameSize.width,
        height: frameSize.height,
        direction: 'unknown',
        confidence: 0.3
      },
      panoramaRegion: {
        x: 0,
        y: 0,
        width: panoramaBounds.width,
        height: panoramaBounds.height,
        direction: 'unknown',
        confidence: 0.3
      }
    };
  }

  // Frame region (in frame coordinates)
  const frameRegion: OverlapRegion = {
    x: intersection.x - estimatedPanoramaPos.x,
    y: intersection.y - estimatedPanoramaPos.y,
    width: intersection.width,
    height: intersection.height,
    direction: 'unknown',
    confidence: 0.7
  };

  // Panorama region (in panorama coordinates)
  const panoramaRegion: OverlapRegion = {
    x: intersection.x - panoramaBounds.x,
    y: intersection.y - panoramaBounds.y,
    width: intersection.width,
    height: intersection.height,
    direction: 'unknown',
    confidence: 0.7
  };

  return { frameRegion, panoramaRegion };
}

/**
 * Determine movement direction from delta
 */
function determineDirection(
  dx: number,
  dy: number
): 'left' | 'right' | 'top' | 'bottom' | 'unknown' {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Require minimum movement threshold (10px)
  if (absDx < 10 && absDy < 10) {
    return 'unknown';
  }

  // Determine primary direction
  if (absDx > absDy) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'bottom' : 'top';
  }
}

/**
 * Calculate intersection of two rectangles
 */
function calculateIntersection(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(rect1.x, rect2.x);
  const y = Math.max(rect1.y, rect2.y);
  const maxX = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
  const maxY = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);

  const width = maxX - x;
  const height = maxY - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

/**
 * Calculate overlap ratio between two rectangles
 */
export function calculateOverlapRatio(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  const intersection = calculateIntersection(rect1, rect2);

  if (!intersection) {
    return 0;
  }

  const area1 = rect1.width * rect1.height;
  const area2 = rect2.width * rect2.height;
  const intersectionArea = intersection.width * intersection.height;

  // Return ratio relative to smaller rectangle
  const minArea = Math.min(area1, area2);

  return intersectionArea / minArea;
}

/**
 * Expand region by a margin (for more robust matching)
 */
export function expandRegion(
  region: OverlapRegion,
  marginRatio: number = 0.1,
  maxWidth: number,
  maxHeight: number
): OverlapRegion {
  const margin = {
    x: region.width * marginRatio,
    y: region.height * marginRatio
  };

  return {
    x: Math.max(0, region.x - margin.x),
    y: Math.max(0, region.y - margin.y),
    width: Math.min(maxWidth - region.x, region.width + 2 * margin.x),
    height: Math.min(maxHeight - region.y, region.height + 2 * margin.y),
    direction: region.direction,
    confidence: region.confidence * 0.9 // Slightly lower confidence with expansion
  };
}

/**
 * Check if a point is within a region
 */
export function isPointInRegion(
  point: { x: number; y: number },
  region: OverlapRegion
): boolean {
  return (
    point.x >= region.x &&
    point.x <= region.x + region.width &&
    point.y >= region.y &&
    point.y <= region.y + region.height
  );
}

/**
 * Filter keypoints to only those within a region
 */
export function filterKeypointsInRegion(
  cv: any,
  keypoints: any,
  descriptors: any,
  region: OverlapRegion
): { keypoints: any; descriptors: any; indices: number[] } {
  const filteredKeypoints = new cv.KeyPointVector();
  const filteredDescriptors = new cv.Mat();
  const indices: number[] = [];

  for (let i = 0; i < keypoints.size(); i++) {
    const kp = keypoints.get(i);

    if (isPointInRegion({ x: kp.pt.x, y: kp.pt.y }, region)) {
      filteredKeypoints.push_back(kp);
      indices.push(i);

      // Copy descriptor row
      if (descriptors.rows > 0) {
        const row = descriptors.row(i);
        if (filteredDescriptors.rows === 0) {
          row.copyTo(filteredDescriptors);
        } else {
          const temp = new cv.Mat();
          cv.vconcat(filteredDescriptors, row, temp);
          filteredDescriptors.delete();
          temp.copyTo(filteredDescriptors);
          temp.delete();
        }
      }
    }
  }

  return { keypoints: filteredKeypoints, descriptors: filteredDescriptors, indices };
}

/**
 * Estimate search radius for nearby frame queries
 * Based on typical microscope movement patterns
 */
export function estimateSearchRadius(
  stageRepeatability: number,
  confidenceLevel: 'low' | 'medium' | 'high' = 'medium'
): number {
  const baseRadius = stageRepeatability * 4; // MIST approach: 4r

  switch (confidenceLevel) {
    case 'low':
      return baseRadius * 2; // Larger search area when uncertain
    case 'high':
      return baseRadius * 0.5; // Smaller search area when confident
    case 'medium':
    default:
      return baseRadius;
  }
}

/**
 * Validate overlap region (ensure it's within image bounds)
 */
export function validateOverlapRegion(
  region: OverlapRegion,
  imageWidth: number,
  imageHeight: number
): OverlapRegion {
  return {
    x: Math.max(0, Math.min(region.x, imageWidth)),
    y: Math.max(0, Math.min(region.y, imageHeight)),
    width: Math.max(
      0,
      Math.min(region.width, imageWidth - region.x)
    ),
    height: Math.max(
      0,
      Math.min(region.height, imageHeight - region.y)
    ),
    direction: region.direction,
    confidence: region.confidence
  };
}

/**
 * Merge multiple overlap regions (for complex movement patterns)
 */
export function mergeOverlapRegions(regions: OverlapRegion[]): OverlapRegion {
  if (regions.length === 0) {
    throw new Error('Cannot merge empty region list');
  }

  if (regions.length === 1) {
    return regions[0];
  }

  // Calculate bounding box of all regions
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let totalConfidence = 0;

  for (const region of regions) {
    minX = Math.min(minX, region.x);
    minY = Math.min(minY, region.y);
    maxX = Math.max(maxX, region.x + region.width);
    maxY = Math.max(maxY, region.y + region.height);
    totalConfidence += region.confidence;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    direction: 'unknown',
    confidence: totalConfidence / regions.length
  };
}
