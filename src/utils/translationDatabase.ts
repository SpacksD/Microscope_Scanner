/**
 * Translation Database - Spatial indexing system for captured frames
 *
 * This system allows efficient spatial queries to find frames near a given position,
 * enabling global alignment (comparing against multiple previous frames).
 *
 * Based on MIST algorithm approach for maintaining translation history.
 */

export interface FrameRecord {
  id: string;
  position: { x: number; y: number; width: number; height: number };
  timestamp: number;
  features: {
    keypoints: number;
    descriptorData?: string; // Base64 encoded descriptor data for later matching
  };
  quality: {
    confidence: number;
    sharpness: number;
    brightness: number;
    contrast: number;
    score: number;
  };
  thumbnail?: string; // Small preview image for UI (base64)
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Spatial database for frame translations
 * Uses grid-based spatial indexing for O(1) nearby frame queries
 */
export class TranslationDatabase {
  private frames: Map<string, FrameRecord> = new Map();
  private spatialIndex: Map<string, Set<string>> = new Map();
  private readonly gridSize: number;
  private frameCount = 0;

  constructor(gridSize: number = 200) {
    this.gridSize = gridSize;
  }

  /**
   * Add a frame to the database
   */
  addFrame(frame: FrameRecord): void {
    // Store frame
    this.frames.set(frame.id, frame);
    this.frameCount++;

    // Update spatial index
    const gridCells = this.getGridCells(frame.position);
    for (const cellKey of gridCells) {
      if (!this.spatialIndex.has(cellKey)) {
        this.spatialIndex.set(cellKey, new Set());
      }
      this.spatialIndex.get(cellKey)!.add(frame.id);
    }
  }

  /**
   * Find frames within a radius of a point
   */
  findNearbyFrames(x: number, y: number, radius: number): FrameRecord[] {
    const results: FrameRecord[] = [];
    const seen = new Set<string>();

    // Calculate grid cells that intersect with search circle
    const minGridX = Math.floor((x - radius) / this.gridSize);
    const maxGridX = Math.floor((x + radius) / this.gridSize);
    const minGridY = Math.floor((y - radius) / this.gridSize);
    const maxGridY = Math.floor((y + radius) / this.gridSize);

    // Check all potentially intersecting grid cells
    for (let gx = minGridX; gx <= maxGridX; gx++) {
      for (let gy = minGridY; gy <= maxGridY; gy++) {
        const cellKey = `${gx},${gy}`;
        const frameIds = this.spatialIndex.get(cellKey);

        if (frameIds) {
          for (const frameId of frameIds) {
            if (seen.has(frameId)) continue;
            seen.add(frameId);

            const frame = this.frames.get(frameId)!;
            const distance = this.calculateDistance(
              x,
              y,
              frame.position.x + frame.position.width / 2,
              frame.position.y + frame.position.height / 2
            );

            if (distance <= radius) {
              results.push(frame);
            }
          }
        }
      }
    }

    // Sort by distance (closest first)
    results.sort((a, b) => {
      const distA = this.calculateDistance(
        x,
        y,
        a.position.x + a.position.width / 2,
        a.position.y + a.position.height / 2
      );
      const distB = this.calculateDistance(
        x,
        y,
        b.position.x + b.position.width / 2,
        b.position.y + b.position.height / 2
      );
      return distA - distB;
    });

    return results;
  }

  /**
   * Find frames that overlap with a given rectangle
   */
  findOverlappingFrames(bounds: Rectangle): FrameRecord[] {
    const results: FrameRecord[] = [];
    const seen = new Set<string>();

    const gridCells = this.getGridCells(bounds);
    for (const cellKey of gridCells) {
      const frameIds = this.spatialIndex.get(cellKey);

      if (frameIds) {
        for (const frameId of frameIds) {
          if (seen.has(frameId)) continue;
          seen.add(frameId);

          const frame = this.frames.get(frameId)!;
          if (this.rectanglesOverlap(bounds, frame.position)) {
            results.push(frame);
          }
        }
      }
    }

    // Sort by overlap area (largest first)
    results.sort((a, b) => {
      const overlapA = this.calculateOverlapArea(bounds, a.position);
      const overlapB = this.calculateOverlapArea(bounds, b.position);
      return overlapB - overlapA;
    });

    return results;
  }

  /**
   * Get a specific frame by ID
   */
  getFrameById(id: string): FrameRecord | undefined {
    return this.frames.get(id);
  }

  /**
   * Get all frames (for iteration)
   */
  getAllFrames(): FrameRecord[] {
    return Array.from(this.frames.values());
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Remove a frame from the database
   */
  removeFrame(id: string): boolean {
    const frame = this.frames.get(id);
    if (!frame) return false;

    // Remove from frames map
    this.frames.delete(id);
    this.frameCount--;

    // Remove from spatial index
    const gridCells = this.getGridCells(frame.position);
    for (const cellKey of gridCells) {
      const frameIds = this.spatialIndex.get(cellKey);
      if (frameIds) {
        frameIds.delete(id);
        if (frameIds.size === 0) {
          this.spatialIndex.delete(cellKey);
        }
      }
    }

    return true;
  }

  /**
   * Clear all frames
   */
  clear(): void {
    this.frames.clear();
    this.spatialIndex.clear();
    this.frameCount = 0;
  }

  /**
   * Calculate stage repeatability (standard deviation of translations)
   * Used for MIST-style bounded search optimization
   */
  estimateStageRepeatability(): number {
    const frames = this.getAllFrames();
    if (frames.length < 2) return 50; // Default 50px if not enough data

    const translations: { dx: number; dy: number }[] = [];

    // Calculate translations between consecutive frames (by timestamp)
    const sortedFrames = frames.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedFrames.length; i++) {
      const prev = sortedFrames[i - 1];
      const curr = sortedFrames[i];

      const dx = curr.position.x - prev.position.x;
      const dy = curr.position.y - prev.position.y;

      translations.push({ dx, dy });
    }

    // Calculate standard deviation
    const meanDx =
      translations.reduce((sum, t) => sum + t.dx, 0) / translations.length;
    const meanDy =
      translations.reduce((sum, t) => sum + t.dy, 0) / translations.length;

    const varianceDx =
      translations.reduce((sum, t) => sum + Math.pow(t.dx - meanDx, 2), 0) /
      translations.length;
    const varianceDy =
      translations.reduce((sum, t) => sum + Math.pow(t.dy - meanDy, 2), 0) /
      translations.length;

    const stdDev = Math.sqrt((varianceDx + varianceDy) / 2);

    // Return bounded value (minimum 10px, maximum 100px)
    return Math.max(10, Math.min(100, stdDev));
  }

  /**
   * Get statistics about the database
   */
  getStatistics(): {
    frameCount: number;
    spatialCells: number;
    avgFramesPerCell: number;
    coverageBounds: Rectangle | null;
    stageRepeatability: number;
  } {
    const coverageBounds = this.calculateCoverageBounds();
    const repeatability = this.estimateStageRepeatability();

    return {
      frameCount: this.frameCount,
      spatialCells: this.spatialIndex.size,
      avgFramesPerCell:
        this.spatialIndex.size > 0
          ? this.frameCount / this.spatialIndex.size
          : 0,
      coverageBounds,
      stageRepeatability: repeatability
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Get grid cells that a rectangle occupies
   */
  private getGridCells(rect: Rectangle): string[] {
    const cells: string[] = [];

    const minGridX = Math.floor(rect.x / this.gridSize);
    const maxGridX = Math.floor((rect.x + rect.width) / this.gridSize);
    const minGridY = Math.floor(rect.y / this.gridSize);
    const maxGridY = Math.floor((rect.y + rect.height) / this.gridSize);

    for (let gx = minGridX; gx <= maxGridX; gx++) {
      for (let gy = minGridY; gy <= maxGridY; gy++) {
        cells.push(`${gx},${gy}`);
      }
    }

    return cells;
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private calculateDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Check if two rectangles overlap
   */
  private rectanglesOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
    return !(
      rect1.x + rect1.width < rect2.x ||
      rect2.x + rect2.width < rect1.x ||
      rect1.y + rect1.height < rect2.y ||
      rect2.y + rect2.height < rect1.y
    );
  }

  /**
   * Calculate overlap area between two rectangles
   */
  private calculateOverlapArea(rect1: Rectangle, rect2: Rectangle): number {
    if (!this.rectanglesOverlap(rect1, rect2)) return 0;

    const overlapX = Math.max(
      0,
      Math.min(rect1.x + rect1.width, rect2.x + rect2.width) -
        Math.max(rect1.x, rect2.x)
    );
    const overlapY = Math.max(
      0,
      Math.min(rect1.y + rect1.height, rect2.y + rect2.height) -
        Math.max(rect1.y, rect2.y)
    );

    return overlapX * overlapY;
  }

  /**
   * Calculate bounding box of all frames
   */
  private calculateCoverageBounds(): Rectangle | null {
    if (this.frameCount === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const frame of this.frames.values()) {
      minX = Math.min(minX, frame.position.x);
      minY = Math.min(minY, frame.position.y);
      maxX = Math.max(maxX, frame.position.x + frame.position.width);
      maxY = Math.max(maxY, frame.position.y + frame.position.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}

/**
 * Create a frame ID from timestamp and position
 */
export function createFrameId(timestamp: number, x: number, y: number): string {
  return `frame_${timestamp}_${Math.round(x)}_${Math.round(y)}`;
}

/**
 * Create a thumbnail from an image element
 */
export function createThumbnail(
  image: HTMLImageElement,
  maxSize: number = 100
): string {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));

  canvas.width = image.width * scale;
  canvas.height = image.height * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.7);
}
