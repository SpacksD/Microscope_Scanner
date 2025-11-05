/**
 * Region tracking system for panorama quality management
 * Divides the panorama into a grid and tracks coverage and quality per region
 */

export interface RegionData {
  x: number;
  y: number;
  width: number;
  height: number;
  captureCount: number;
  totalConfidence: number;
  avgConfidence: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  lastCaptureTime: number;
}

export interface RegionMap {
  gridSize: number; // Size of each grid cell in pixels
  regions: Map<string, RegionData>; // Key is "x,y"
  panoramaBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Initialize region map
 */
export const initRegionMap = (gridSize: number = 200): RegionMap => {
  return {
    gridSize,
    regions: new Map(),
    panoramaBounds: {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    }
  };
};

/**
 * Get region key from coordinates
 */
const getRegionKey = (x: number, y: number, gridSize: number): string => {
  const gridX = Math.floor(x / gridSize);
  const gridY = Math.floor(y / gridSize);
  return `${gridX},${gridY}`;
};

/**
 * Get or create a region
 */
const getOrCreateRegion = (
  regionMap: RegionMap,
  x: number,
  y: number
): RegionData => {
  const key = getRegionKey(x, y, regionMap.gridSize);

  if (regionMap.regions.has(key)) {
    return regionMap.regions.get(key)!;
  }

  const gridX = Math.floor(x / regionMap.gridSize);
  const gridY = Math.floor(y / regionMap.gridSize);

  const newRegion: RegionData = {
    x: gridX * regionMap.gridSize,
    y: gridY * regionMap.gridSize,
    width: regionMap.gridSize,
    height: regionMap.gridSize,
    captureCount: 0,
    totalConfidence: 0,
    avgConfidence: 0,
    quality: 'poor',
    lastCaptureTime: 0
  };

  regionMap.regions.set(key, newRegion);
  return newRegion;
};

/**
 * Calculate quality level based on captures and confidence
 */
const calculateQuality = (
  captureCount: number,
  avgConfidence: number
): 'poor' | 'fair' | 'good' | 'excellent' => {
  if (captureCount === 0) return 'poor';

  // Need at least 2 captures for good quality
  if (captureCount < 2) {
    if (avgConfidence >= 70) return 'fair';
    return 'poor';
  }

  // With 2+ captures, use confidence to determine quality
  if (avgConfidence >= 80) return 'excellent';
  if (avgConfidence >= 60) return 'good';
  if (avgConfidence >= 40) return 'fair';
  return 'poor';
};

/**
 * Update regions based on new frame position and confidence
 * Returns list of affected region keys and whether overlap was detected
 */
export const updateRegions = (
  regionMap: RegionMap,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number,
  confidence: number
): { affectedRegions: string[]; overlapDetected: boolean } => {
  const affectedRegions: string[] = [];
  let overlapDetected = false;

  // Update panorama bounds
  regionMap.panoramaBounds.minX = Math.min(regionMap.panoramaBounds.minX, frameX);
  regionMap.panoramaBounds.minY = Math.min(regionMap.panoramaBounds.minY, frameY);
  regionMap.panoramaBounds.maxX = Math.max(regionMap.panoramaBounds.maxX, frameX + frameWidth);
  regionMap.panoramaBounds.maxY = Math.max(regionMap.panoramaBounds.maxY, frameY + frameHeight);

  // Find all regions that intersect with the frame
  const startGridX = Math.floor(frameX / regionMap.gridSize);
  const startGridY = Math.floor(frameY / regionMap.gridSize);
  const endGridX = Math.floor((frameX + frameWidth) / regionMap.gridSize);
  const endGridY = Math.floor((frameY + frameHeight) / regionMap.gridSize);

  for (let gridX = startGridX; gridX <= endGridX; gridX++) {
    for (let gridY = startGridY; gridY <= endGridY; gridY++) {
      const x = gridX * regionMap.gridSize;
      const y = gridY * regionMap.gridSize;
      const region = getOrCreateRegion(regionMap, x, y);

      // Check if this is an overlap (region was previously captured)
      if (region.captureCount > 0) {
        overlapDetected = true;
      }

      // Update region data
      region.captureCount++;
      region.totalConfidence += confidence;
      region.avgConfidence = region.totalConfidence / region.captureCount;
      region.quality = calculateQuality(region.captureCount, region.avgConfidence);
      region.lastCaptureTime = Date.now();

      const key = getRegionKey(x, y, regionMap.gridSize);
      affectedRegions.push(key);
    }
  }

  return { affectedRegions, overlapDetected };
};

/**
 * Get regions that need more captures
 * Returns regions with quality 'poor' or 'fair'
 */
export const getRegionsNeedingCapture = (regionMap: RegionMap): RegionData[] => {
  const needsCapture: RegionData[] = [];

  regionMap.regions.forEach(region => {
    if (region.quality === 'poor' || region.quality === 'fair') {
      needsCapture.push(region);
    }
  });

  return needsCapture;
};

/**
 * Get overall coverage statistics
 */
export interface CoverageStats {
  totalRegions: number;
  poorRegions: number;
  fairRegions: number;
  goodRegions: number;
  excellentRegions: number;
  overallQuality: number; // 0-100
  avgCapturesPerRegion: number;
}

export const getCoverageStats = (regionMap: RegionMap): CoverageStats => {
  let poorCount = 0;
  let fairCount = 0;
  let goodCount = 0;
  let excellentCount = 0;
  let totalCaptures = 0;

  regionMap.regions.forEach(region => {
    switch (region.quality) {
      case 'poor': poorCount++; break;
      case 'fair': fairCount++; break;
      case 'good': goodCount++; break;
      case 'excellent': excellentCount++; break;
    }
    totalCaptures += region.captureCount;
  });

  const totalRegions = regionMap.regions.size;

  // Calculate overall quality (weighted by quality level)
  const qualityScore = (
    (poorCount * 25) +
    (fairCount * 50) +
    (goodCount * 75) +
    (excellentCount * 100)
  ) / (totalRegions || 1);

  return {
    totalRegions,
    poorRegions: poorCount,
    fairRegions: fairCount,
    goodRegions: goodCount,
    excellentRegions: excellentCount,
    overallQuality: qualityScore,
    avgCapturesPerRegion: totalCaptures / (totalRegions || 1)
  };
};

/**
 * Get all regions within bounds for visualization
 */
export const getRegionsInBounds = (
  regionMap: RegionMap,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): RegionData[] => {
  const regions: RegionData[] = [];

  regionMap.regions.forEach(region => {
    if (
      region.x + region.width >= minX &&
      region.x <= maxX &&
      region.y + region.height >= minY &&
      region.y <= maxY
    ) {
      regions.push(region);
    }
  });

  return regions;
};

/**
 * Calculate frame position in panorama space using homography
 */
export const calculateFramePosition = (
  _cv: any,
  homography: any,
  frameWidth: number,
  frameHeight: number,
  panoramaBounds: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | null => {
  try {
    if (!homography || homography.empty()) return null;

    // Get homography matrix data
    const H: number[] = [];
    for (let i = 0; i < homography.rows; i++) {
      for (let j = 0; j < homography.cols; j++) {
        H.push(homography.doubleAt(i, j));
      }
    }

    // Transform frame corners to panorama space
    const corners = [
      [0, 0],
      [frameWidth, 0],
      [frameWidth, frameHeight],
      [0, frameHeight]
    ];

    const transformedCorners = corners.map(([x, y]) => {
      const w = H[6] * x + H[7] * y + H[8];
      return {
        x: (H[0] * x + H[1] * y + H[2]) / w + panoramaBounds.x,
        y: (H[3] * x + H[4] * y + H[5]) / w + panoramaBounds.y
      };
    });

    // Calculate bounding box of transformed frame
    const xs = transformedCorners.map(c => c.x);
    const ys = transformedCorners.map(c => c.y);

    const minXPos = Math.min(...xs);
    const minYPos = Math.min(...ys);
    const maxXPos = Math.max(...xs);
    const maxYPos = Math.max(...ys);

    return {
      x: minXPos,
      y: minYPos,
      width: maxXPos - minXPos,
      height: maxYPos - minYPos
    };
  } catch (error) {
    console.error('Error calculating frame position:', error);
    return null;
  }
};
