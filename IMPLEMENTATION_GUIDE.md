# Microscope Scanner - Professional Implementation Guide

## 📋 Overview

This guide outlines the implementation of professional-grade microscope stitching features based on research of industry-leading software (MIST, MicroVisioneer, FRMIS 2024).

## 🎯 Goals

1. **Improve overlap detection** - Detect when returning to previously scanned areas (95%+ accuracy)
2. **Eliminate false positives** - Static camera should not trigger movement (<1% false positive rate)
3. **Real-time performance** - 10-15 FPS stitching with live preview
4. **Professional UX** - Split-screen preview, quality indicators, progress tracking
5. **Sub-pixel accuracy** - Professional-grade alignment quality

## 📊 Research Findings

### Key Algorithms from Professional Software

#### MIST (NIST 2017) - Scientific Standard
- **Stage Modeling**: Estimates mechanical stage parameters (backlash, repeatability 'r')
- **Translation Optimization**: Hill Climbing bounded to (4r)² search area
- **Error Minimization**: Global optimization across all translations
- **Performance**: 15-100x faster using CPU/GPU hybrid

#### FRMIS (2024) - Latest Research
- Uses **SURF** instead of ORB for microscopy
- Pairwise + Global alignment
- Feature detection in **overlap regions only** (more efficient)
- Improved blending compensation

#### MicroVisioneer/BioStitch - Commercial Success
- **Real-time stitching** during manual movement
- Split-screen: live camera + building panorama
- "Unprecedented smoothness" user feedback
- Instant visual feedback

### Feature Detector Comparison

| Algorithm | Speed | Accuracy | Best for Microscopy |
|-----------|-------|----------|---------------------|
| SIFT | 116ms | ⭐⭐⭐⭐⭐ | ✅ Very common |
| SURF | 112ms | ⭐⭐⭐⭐ | ✅ **Preferred in 2024 papers** |
| ORB | 11ms | ⭐⭐⭐ | ⚠️ Fast but less robust |

**Recommendation**: SURF for microscopy because:
- 64-dim vectors vs 128-dim SIFT (more efficient)
- More robust than ORB for lighting changes
- Perfect speed/accuracy balance

## 🏗️ Implementation Phases

### Phase 1: Foundation & Structure (Days 1-2)

#### Task 1.1: Translation Database System
Create spatial indexing for all captured frames.

```typescript
// src/utils/translationDatabase.ts

interface FrameRecord {
  id: string;
  position: { x: number; y: number; width: number; height: number };
  timestamp: number;
  features: {
    keypoints: number;
    descriptors: any; // Store for later matching
  };
  quality: {
    confidence: number;
    sharpness: number;
    brightness: number;
  };
  thumbnail?: string; // Small preview for UI
}

export class TranslationDatabase {
  private frames: Map<string, FrameRecord> = new Map();
  private spatialIndex: Map<string, Set<string>> = new Map();
  private readonly gridSize = 200; // pixels per grid cell

  addFrame(frame: FrameRecord): void;
  findNearbyFrames(x: number, y: number, radius: number): FrameRecord[];
  findOverlappingFrames(bounds: Rectangle): FrameRecord[];
  getFrameById(id: string): FrameRecord | undefined;
  clear(): void;
}
```

**Purpose**: Allow comparing new frames against ALL previous frames, not just last one.

#### Task 1.2: Quality Metrics System
Comprehensive frame quality assessment.

```typescript
// src/utils/qualityMetrics.ts

export interface QualityMetrics {
  featureCount: number;       // More features = better texture
  matchRatio: number;         // % of good matches
  homographyError: number;    // RANSAC reprojection error
  overlapRatio: number;       // % overlap with panorama
  brightness: number;         // Mean intensity (0-255)
  sharpness: number;          // Laplacian variance
  contrast: number;           // Standard deviation of intensity
  score: number;              // Overall quality score 0-100
}

export function calculateQualityMetrics(
  cv: any,
  imageMat: any,
  featureCount: number,
  matchRatio: number,
  homographyError: number
): QualityMetrics;
```

### Phase 2: Feature Detection Improvements (Days 3-4)

#### Task 2.1: SURF Feature Detector
Implement SURF as better alternative to ORB for microscopy.

```typescript
// src/utils/featureDetectors.ts

export type FeatureDetectorType = 'ORB' | 'SURF' | 'SIFT';

export interface FeatureDetectorConfig {
  type: FeatureDetectorType;
  nFeatures: number;
  hessianThreshold?: number; // For SURF
  nOctaves?: number;
  nOctaveLayers?: number;
}

export function createFeatureDetector(
  cv: any,
  config: FeatureDetectorConfig
): any {
  switch (config.type) {
    case 'SURF':
      // SURF: 64-dim descriptors, better for microscopy
      return new cv.SURF(config.hessianThreshold || 400);
    case 'ORB':
      return new cv.ORB(config.nFeatures);
    case 'SIFT':
      return new cv.SIFT(config.nFeatures);
  }
}
```

#### Task 2.2: Partial Overlap Matching
Only detect features in expected overlap regions (CRITICAL for performance and accuracy).

```typescript
// src/utils/overlapDetection.ts

export interface OverlapRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function estimateOverlapRegion(
  lastFramePos: { x: number; y: number; width: number; height: number },
  expectedOverlap: number = 0.3 // 30% overlap typical
): OverlapRegion {
  // If moving right, overlap is on left side of new frame
  // If moving left, overlap is on right side
  // etc.
}

export function detectFeaturesInRegion(
  cv: any,
  imageMat: any,
  region: OverlapRegion,
  nFeatures: number
): FeatureSet {
  // Create ROI (Region of Interest)
  const roi = imageMat.roi(new cv.Rect(
    region.x,
    region.y,
    region.width,
    region.height
  ));

  // Detect features only in ROI
  const features = detectFeatures(cv, roi, nFeatures);

  roi.delete();
  return features;
}
```

#### Task 2.3: Adaptive Feature Count
Adjust feature count based on image texture.

```typescript
// src/utils/adaptiveFeatures.ts

export function calculateImageTexture(cv: any, grayMat: any): number {
  // Use Laplacian variance as texture measure
  const laplacian = new cv.Mat();
  cv.Laplacian(grayMat, laplacian, cv.CV_64F);

  const mean = cv.mean(laplacian);
  const variance = calculateVariance(laplacian);

  laplacian.delete();
  return variance[0];
}

export function adaptiveFeatureCount(
  baseCount: number,
  textureScore: number
): number {
  // Low texture (< 100) = increase features
  if (textureScore < 100) {
    return Math.min(baseCount * 2, 3000);
  }
  // Medium texture (100-500) = normal
  else if (textureScore < 500) {
    return baseCount;
  }
  // High texture (> 500) = can reduce features
  else {
    return Math.max(baseCount * 0.7, 1000);
  }
}
```

### Phase 3: Alignment Improvements (Days 5-6)

#### Task 3.1: Global Alignment
Compare against multiple previous frames, not just last one.

```typescript
// src/utils/globalAlignment.ts

export interface AlignmentCandidate {
  frameId: string;
  confidence: number;
  homography: any;
  translationDistance: number;
  matchCount: number;
}

export async function findBestAlignment(
  cv: any,
  newFrame: HTMLImageElement,
  database: TranslationDatabase,
  estimatedPosition: { x: number; y: number }
): Promise<AlignmentCandidate> {
  // Find nearby frames (within 500px radius)
  const candidates = database.findNearbyFrames(
    estimatedPosition.x,
    estimatedPosition.y,
    500
  );

  // Try to match against top 5 candidates
  const results: AlignmentCandidate[] = [];

  for (const candidate of candidates.slice(0, 5)) {
    const result = await matchFrames(cv, newFrame, candidate);
    if (result.confidence > 50) {
      results.push(result);
    }
  }

  // Return best match
  return results.sort((a, b) => b.confidence - a.confidence)[0];
}
```

#### Task 3.2: Translation Optimization (MIST Approach)
Bounded search space optimization.

```typescript
// src/utils/translationOptimization.ts

export function estimateStageRepeatability(
  database: TranslationDatabase
): number {
  // Analyze variance in translations between consecutive frames
  // This gives us the mechanical repeatability 'r'
  const translations = [];

  // Calculate standard deviation of translations
  const stdDev = calculateStdDev(translations);

  return stdDev;
}

export function optimizeTranslation(
  cv: any,
  initialTranslation: { x: number; y: number },
  searchRadius: number,
  errorFunction: (x: number, y: number) => number
): { x: number; y: number } {
  // Bounded search within (4r)² area
  const bounds = {
    minX: initialTranslation.x - searchRadius,
    maxX: initialTranslation.x + searchRadius,
    minY: initialTranslation.y - searchRadius,
    maxY: initialTranslation.y + searchRadius
  };

  // Hill climbing within bounds
  return hillClimbing(initialTranslation, bounds, errorFunction);
}
```

#### Task 3.3: Hill Climbing Optimization

```typescript
// src/utils/hillClimbing.ts

export function hillClimbing(
  start: { x: number; y: number },
  bounds: Rectangle,
  errorFunction: (x: number, y: number) => number,
  maxIterations: number = 100,
  stepSize: number = 1.0
): { x: number; y: number } {
  let current = { ...start };
  let currentError = errorFunction(current.x, current.y);

  for (let i = 0; i < maxIterations; i++) {
    // Try neighbors in 8 directions
    const neighbors = [
      { x: current.x + stepSize, y: current.y },
      { x: current.x - stepSize, y: current.y },
      { x: current.x, y: current.y + stepSize },
      { x: current.x, y: current.y - stepSize },
      { x: current.x + stepSize, y: current.y + stepSize },
      { x: current.x - stepSize, y: current.y - stepSize },
      { x: current.x + stepSize, y: current.y - stepSize },
      { x: current.x - stepSize, y: current.y + stepSize }
    ];

    let bestNeighbor = current;
    let bestError = currentError;

    for (const neighbor of neighbors) {
      // Check bounds
      if (!isInBounds(neighbor, bounds)) continue;

      const error = errorFunction(neighbor.x, neighbor.y);
      if (error < bestError) {
        bestNeighbor = neighbor;
        bestError = error;
      }
    }

    // If no improvement, we're at local minimum
    if (bestError >= currentError) {
      break;
    }

    current = bestNeighbor;
    currentError = bestError;
  }

  return current;
}
```

### Phase 4: Visual Improvements (Days 7-8)

#### Task 4.1: Split-Screen Live Preview

```typescript
// src/components/SplitScreenView.tsx

export const SplitScreenView: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement>;
  panoramaDataUrl: string;
  currentStats: StitchingStats;
}> = ({ videoRef, panoramaDataUrl, currentStats }) => {
  return (
    <div className="split-screen-container">
      <div className="live-camera-panel">
        <h3>Live Camera Feed</h3>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="camera-preview"
        />
        <div className="camera-overlay">
          <div className="crosshair" />
          <div className="status-indicator">
            {currentStats.isStitching ? '🔴 Capturing' : '⚪ Paused'}
          </div>
        </div>
      </div>

      <div className="panorama-panel">
        <h3>Building Panorama</h3>
        {panoramaDataUrl ? (
          <img
            src={panoramaDataUrl}
            alt="Panorama"
            className="panorama-preview"
          />
        ) : (
          <div className="empty-state">
            No panorama yet - start capturing
          </div>
        )}
        <div className="panorama-stats">
          <span>Frames: {currentStats.framesAccepted}</span>
          <span>Coverage: {currentStats.coveragePercent}%</span>
          <span>Quality: {currentStats.avgQuality}/100</span>
        </div>
      </div>
    </div>
  );
};
```

#### Task 4.2: Enhanced Minimap

```typescript
// src/components/EnhancedMinimap.tsx

export const EnhancedMinimap: React.FC<{
  regionMap: RegionMap;
  panoramaDataUrl: string;
  currentPosition: { x: number; y: number };
  onZoom: (level: number) => void;
  onPan: (dx: number, dy: number) => void;
}> = ({ regionMap, panoramaDataUrl, currentPosition, onZoom, onPan }) => {
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  return (
    <div className="enhanced-minimap">
      <div className="minimap-controls">
        <button onClick={() => handleZoom(1.2)}>🔍+</button>
        <button onClick={() => handleZoom(0.8)}>🔍-</button>
        <button onClick={handleReset}>⟲ Reset</button>
        <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
      </div>

      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      <div className="minimap-legend">
        <div className="legend-item">
          <span className="color-box poor" />
          <span>Poor Quality</span>
        </div>
        <div className="legend-item">
          <span className="color-box fair" />
          <span>Fair Quality</span>
        </div>
        <div className="legend-item">
          <span className="color-box good" />
          <span>Good Quality</span>
        </div>
        <div className="legend-item">
          <span className="color-box excellent" />
          <span>Excellent Quality</span>
        </div>
      </div>
    </div>
  );
};
```

#### Task 4.3: Detailed Quality Indicators

```typescript
// src/components/QualityIndicator.tsx

export const QualityIndicator: React.FC<{
  metrics: QualityMetrics;
}> = ({ metrics }) => {
  return (
    <div className="quality-indicator">
      <div className="quality-header">
        <h4>Frame Quality Analysis</h4>
        <div className="overall-score">
          <CircularProgress value={metrics.score} />
          <span className="score-value">{metrics.score}/100</span>
        </div>
      </div>

      <div className="quality-metrics">
        <MetricBar
          label="Features Detected"
          value={metrics.featureCount}
          max={3000}
          color="blue"
        />
        <MetricBar
          label="Match Quality"
          value={metrics.matchRatio * 100}
          max={100}
          color="green"
        />
        <MetricBar
          label="Sharpness"
          value={metrics.sharpness}
          max={1000}
          color="purple"
        />
        <MetricBar
          label="Brightness"
          value={metrics.brightness}
          max={255}
          color="orange"
        />
        <MetricBar
          label="Contrast"
          value={metrics.contrast}
          max={100}
          color="cyan"
        />
      </div>

      <div className="quality-recommendations">
        {metrics.sharpness < 100 && (
          <Alert type="warning">
            ⚠️ Image is blurry - adjust focus
          </Alert>
        )}
        {metrics.brightness < 50 && (
          <Alert type="warning">
            ⚠️ Image is too dark - increase illumination
          </Alert>
        )}
        {metrics.brightness > 200 && (
          <Alert type="warning">
            ⚠️ Image is overexposed - reduce illumination
          </Alert>
        )}
      </div>
    </div>
  );
};
```

### Phase 5: Performance Optimization (Days 9-10)

#### Task 5.1: WebGL Acceleration

```typescript
// src/utils/webglAcceleration.ts

export class WebGLProcessor {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, WebGLProgram>;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl2')!;
    this.programs = new Map();
    this.initializeShaders();
  }

  // Accelerate color conversion
  async rgbaToGray(input: ImageData): Promise<ImageData> {
    const shader = `
      precision mediump float;
      uniform sampler2D u_image;
      varying vec2 v_texCoord;

      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(vec3(gray), 1.0);
      }
    `;

    return this.executeShader('grayscale', input);
  }

  // Accelerate image warping
  async warpPerspective(
    input: ImageData,
    homography: number[][]
  ): Promise<ImageData> {
    // WebGL shader for perspective transform
    const shader = `
      precision mediump float;
      uniform sampler2D u_image;
      uniform mat3 u_homography;
      varying vec2 v_texCoord;

      void main() {
        vec3 coord = u_homography * vec3(v_texCoord, 1.0);
        vec2 transformedCoord = coord.xy / coord.z;
        gl_FragColor = texture2D(u_image, transformedCoord);
      }
    `;

    return this.executeShader('warp', input, { homography });
  }
}
```

#### Task 5.2: Web Workers for Parallel Processing

```typescript
// src/workers/stitchingWorker.ts

// Worker thread for heavy computation
self.addEventListener('message', async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'DETECT_FEATURES':
      const features = await detectFeatures(data.image, data.nFeatures);
      self.postMessage({ type: 'FEATURES_DETECTED', features });
      break;

    case 'MATCH_FEATURES':
      const matches = await matchFeatures(data.desc1, data.desc2);
      self.postMessage({ type: 'FEATURES_MATCHED', matches });
      break;

    case 'CALCULATE_HOMOGRAPHY':
      const homography = await calculateHomography(data.points1, data.points2);
      self.postMessage({ type: 'HOMOGRAPHY_CALCULATED', homography });
      break;
  }
});

// Main thread usage
// src/utils/workerPool.ts

export class WorkerPool {
  private workers: Worker[];
  private taskQueue: Task[];

  constructor(numWorkers: number = 4) {
    this.workers = Array.from(
      { length: numWorkers },
      () => new Worker(new URL('../workers/stitchingWorker.ts', import.meta.url))
    );
  }

  async executeTask(task: Task): Promise<any> {
    // Find available worker or queue task
    const worker = this.getAvailableWorker();
    return new Promise((resolve, reject) => {
      worker.postMessage(task);
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(e);
    });
  }
}
```

## 🎯 Success Metrics

After implementation, we should achieve:

- ✅ **Overlap Detection**: 95%+ accuracy when revisiting areas
- ✅ **False Positives**: <1% with MSE + quality checks
- ✅ **Real-time Performance**: 10-15 FPS during capture
- ✅ **Alignment Accuracy**: Sub-pixel accuracy (<0.5px error)
- ✅ **User Experience**: Instant visual feedback, smooth preview
- ✅ **Quality**: Professional-grade stitching comparable to MIST/MicroVisioneer

## 📦 File Structure

```
src/
├── components/
│   ├── SplitScreenView.tsx         # NEW: Split-screen preview
│   ├── EnhancedMinimap.tsx         # NEW: Enhanced minimap with zoom
│   ├── QualityIndicator.tsx        # NEW: Detailed quality metrics
│   └── ContinuousStitching.tsx     # UPDATED: Integrate new features
├── utils/
│   ├── translationDatabase.ts      # NEW: Spatial frame indexing
│   ├── qualityMetrics.ts           # NEW: Quality assessment
│   ├── featureDetectors.ts         # NEW: SURF/SIFT/ORB support
│   ├── overlapDetection.ts         # NEW: Partial region matching
│   ├── adaptiveFeatures.ts         # NEW: Dynamic feature count
│   ├── globalAlignment.ts          # NEW: Multi-frame matching
│   ├── translationOptimization.ts  # NEW: MIST-style optimization
│   ├── hillClimbing.ts             # NEW: Optimization algorithm
│   ├── webglAcceleration.ts        # NEW: GPU acceleration
│   └── smartStitching.ts           # UPDATED: Integrate improvements
├── workers/
│   └── stitchingWorker.ts          # NEW: Parallel processing
└── hooks/
    └── useContinuousStitching.ts   # UPDATED: Use new systems
```

## 🚀 Deployment Checklist

- [ ] All TypeScript compiles without errors
- [ ] All unit tests pass
- [ ] Performance benchmarks meet targets
- [ ] Browser compatibility tested (Chrome, Firefox, Safari)
- [ ] Memory leaks checked and fixed
- [ ] User documentation updated
- [ ] Example workflows created

## 📚 References

- MIST: https://www.nature.com/articles/s41598-017-04567-y
- FRMIS 2024: https://www.nature.com/articles/s41598-024-61970-y
- OpenCV.js Documentation: https://docs.opencv.org/4.x/
- WebGL Fundamentals: https://webglfundamentals.org/
