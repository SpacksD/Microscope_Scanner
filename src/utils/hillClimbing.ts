/**
 * Hill Climbing Optimization - Translation refinement algorithm
 *
 * Used for MIST-style bounded search optimization. Refines homography
 * translations within a bounded search space to minimize alignment error.
 *
 * Based on MIST algorithm: optimize translations within (4r)² area where
 * r is the stage repeatability.
 */

export interface OptimizationBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface OptimizationResult {
  x: number;
  y: number;
  error: number;
  iterations: number;
  converged: boolean;
}

export type ErrorFunction = (x: number, y: number) => number;

/**
 * Hill Climbing optimization with bounded search
 *
 * @param start - Starting position {x, y}
 * @param bounds - Search space boundaries
 * @param errorFunction - Function that returns error for a given position
 * @param maxIterations - Maximum number of iterations (default: 100)
 * @param stepSize - Initial step size in pixels (default: 1.0)
 * @param convergenceThreshold - Stop when improvement < threshold (default: 0.01)
 * @returns Optimized position with minimum error
 */
export function hillClimbing(
  start: { x: number; y: number },
  bounds: OptimizationBounds,
  errorFunction: ErrorFunction,
  maxIterations: number = 100,
  stepSize: number = 1.0,
  convergenceThreshold: number = 0.01
): OptimizationResult {
  let current = { ...start };
  let currentError = errorFunction(current.x, current.y);
  let iteration = 0;
  let converged = false;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // Try neighbors in 8 directions (N, S, E, W, NE, NW, SE, SW)
    const neighbors = [
      { x: current.x + stepSize, y: current.y }, // E
      { x: current.x - stepSize, y: current.y }, // W
      { x: current.x, y: current.y + stepSize }, // S
      { x: current.x, y: current.y - stepSize }, // N
      { x: current.x + stepSize, y: current.y + stepSize }, // SE
      { x: current.x - stepSize, y: current.y - stepSize }, // NW
      { x: current.x + stepSize, y: current.y - stepSize }, // NE
      { x: current.x - stepSize, y: current.y + stepSize } // SW
    ];

    let bestNeighbor = current;
    let bestError = currentError;

    // Evaluate all neighbors
    for (const neighbor of neighbors) {
      // Check if neighbor is within bounds
      if (!isInBounds(neighbor, bounds)) {
        continue;
      }

      const error = errorFunction(neighbor.x, neighbor.y);

      if (error < bestError) {
        bestNeighbor = neighbor;
        bestError = error;
      }
    }

    // Check for convergence
    const improvement = currentError - bestError;

    if (improvement < convergenceThreshold) {
      converged = true;
      break;
    }

    // Move to best neighbor
    current = bestNeighbor;
    currentError = bestError;
  }

  return {
    x: current.x,
    y: current.y,
    error: currentError,
    iterations: iteration + 1,
    converged
  };
}

/**
 * Adaptive Hill Climbing with decreasing step size
 * Starts with larger steps, then refines with smaller steps
 */
export function adaptiveHillClimbing(
  start: { x: number; y: number },
  bounds: OptimizationBounds,
  errorFunction: ErrorFunction,
  maxIterations: number = 100,
  initialStepSize: number = 2.0,
  minStepSize: number = 0.1,
  stepDecay: number = 0.8
): OptimizationResult {
  let current = { ...start };
  let currentError = errorFunction(current.x, current.y);
  let stepSize = initialStepSize;
  let iteration = 0;
  let stagnantIterations = 0;
  let converged = false;

  while (iteration < maxIterations && stepSize >= minStepSize) {
    // Try neighbors with current step size
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
      if (!isInBounds(neighbor, bounds)) {
        continue;
      }

      const error = errorFunction(neighbor.x, neighbor.y);

      if (error < bestError) {
        bestNeighbor = neighbor;
        bestError = error;
      }
    }

    iteration++;

    // If no improvement found, reduce step size
    if (bestError >= currentError) {
      stagnantIterations++;

      if (stagnantIterations >= 3) {
        stepSize *= stepDecay;
        stagnantIterations = 0;
      }
    } else {
      // Improvement found
      current = bestNeighbor;
      currentError = bestError;
      stagnantIterations = 0;
    }

    // Check convergence
    if (stepSize < minStepSize) {
      converged = true;
      break;
    }
  }

  return {
    x: current.x,
    y: current.y,
    error: currentError,
    iterations: iteration,
    converged
  };
}

/**
 * Simulated Annealing - Alternative optimization with probabilistic acceptance
 * Can escape local minima better than pure hill climbing
 */
export function simulatedAnnealing(
  start: { x: number; y: number },
  bounds: OptimizationBounds,
  errorFunction: ErrorFunction,
  maxIterations: number = 100,
  initialTemperature: number = 10.0,
  coolingRate: number = 0.95,
  stepSize: number = 1.0
): OptimizationResult {
  let current = { ...start };
  let currentError = errorFunction(current.x, current.y);
  let best = { ...current };
  let bestError = currentError;
  let temperature = initialTemperature;
  let iteration = 0;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // Random neighbor within step size
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * stepSize;

    const neighbor = {
      x: current.x + Math.cos(angle) * distance,
      y: current.y + Math.sin(angle) * distance
    };

    // Clamp to bounds
    neighbor.x = Math.max(bounds.minX, Math.min(bounds.maxX, neighbor.x));
    neighbor.y = Math.max(bounds.minY, Math.min(bounds.maxY, neighbor.y));

    const neighborError = errorFunction(neighbor.x, neighbor.y);

    // Always accept if better
    if (neighborError < currentError) {
      current = neighbor;
      currentError = neighborError;

      // Update best
      if (neighborError < bestError) {
        best = { ...neighbor };
        bestError = neighborError;
      }
    } else {
      // Accept worse solution with probability based on temperature
      const delta = neighborError - currentError;
      const probability = Math.exp(-delta / temperature);

      if (Math.random() < probability) {
        current = neighbor;
        currentError = neighborError;
      }
    }

    // Cool down
    temperature *= coolingRate;
  }

  return {
    x: best.x,
    y: best.y,
    error: bestError,
    iterations: iteration,
    converged: temperature < 0.1
  };
}

/**
 * Multi-start Hill Climbing - Try from multiple starting points
 * More robust to initial position
 */
export function multiStartHillClimbing(
  center: { x: number; y: number },
  bounds: OptimizationBounds,
  errorFunction: ErrorFunction,
  numStarts: number = 5,
  maxIterations: number = 50
): OptimizationResult {
  const results: OptimizationResult[] = [];

  // Try from center
  results.push(
    hillClimbing(center, bounds, errorFunction, maxIterations)
  );

  // Try from random starting points
  for (let i = 1; i < numStarts; i++) {
    const randomStart = {
      x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY)
    };

    results.push(
      hillClimbing(randomStart, bounds, errorFunction, maxIterations)
    );
  }

  // Return best result
  return results.reduce((best, current) =>
    current.error < best.error ? current : best
  );
}

/**
 * Check if a point is within bounds
 */
function isInBounds(
  point: { x: number; y: number },
  bounds: OptimizationBounds
): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

/**
 * Create optimization bounds from center and radius (MIST approach: 4r)
 */
export function createBounds(
  center: { x: number; y: number },
  radius: number
): OptimizationBounds {
  return {
    minX: center.x - radius,
    maxX: center.x + radius,
    minY: center.y - radius,
    maxY: center.y + radius
  };
}

/**
 * Create optimization bounds from stage repeatability (MIST algorithm)
 */
export function createBoundsFromRepeatability(
  center: { x: number; y: number },
  stageRepeatability: number
): OptimizationBounds {
  const radius = stageRepeatability * 4; // MIST: (4r)² search area
  return createBounds(center, radius);
}

/**
 * Grid search within bounds (exhaustive, for comparison)
 */
export function gridSearch(
  bounds: OptimizationBounds,
  errorFunction: ErrorFunction,
  gridSpacing: number = 1.0
): OptimizationResult {
  let bestX = (bounds.minX + bounds.maxX) / 2;
  let bestY = (bounds.minY + bounds.maxY) / 2;
  let bestError = Infinity;
  let iterations = 0;

  for (let x = bounds.minX; x <= bounds.maxX; x += gridSpacing) {
    for (let y = bounds.minY; y <= bounds.maxY; y += gridSpacing) {
      const error = errorFunction(x, y);
      iterations++;

      if (error < bestError) {
        bestX = x;
        bestY = y;
        bestError = error;
      }
    }
  }

  return {
    x: bestX,
    y: bestY,
    error: bestError,
    iterations,
    converged: true
  };
}

/**
 * Create error function from homography and point matches
 * Returns reprojection error at a given translation offset
 */
export function createReprojectionErrorFunction(
  _cv: any,
  srcPoints: any[], // Array of cv.Point
  dstPoints: any[], // Array of cv.Point
  baseHomography: number[][] // 3x3 homography matrix
): ErrorFunction {
  return (dx: number, dy: number): number => {
    // Create translation matrix
    const translation = [
      [1, 0, dx],
      [0, 1, dy],
      [0, 0, 1]
    ];

    // Compose homography with translation
    const adjustedH = multiplyMatrices3x3(baseHomography, translation);

    // Calculate reprojection error
    let totalError = 0;

    for (let i = 0; i < srcPoints.length; i++) {
      const src = srcPoints[i];
      const dst = dstPoints[i];

      // Apply homography to source point
      const projected = applyHomography(adjustedH, src);

      // Calculate Euclidean distance
      const error = Math.sqrt(
        Math.pow(projected.x - dst.x, 2) + Math.pow(projected.y - dst.y, 2)
      );

      totalError += error;
    }

    return totalError / srcPoints.length; // Mean error
  };
}

/**
 * Multiply two 3x3 matrices
 */
function multiplyMatrices3x3(
  a: number[][],
  b: number[][]
): number[][] {
  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = 0;
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }

  return result;
}

/**
 * Apply homography to a point
 */
function applyHomography(
  h: number[][],
  point: { x: number; y: number }
): { x: number; y: number } {
  const w = h[2][0] * point.x + h[2][1] * point.y + h[2][2];

  return {
    x: (h[0][0] * point.x + h[0][1] * point.y + h[0][2]) / w,
    y: (h[1][0] * point.x + h[1][1] * point.y + h[1][2]) / w
  };
}
