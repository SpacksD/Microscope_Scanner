import { useState, useCallback, useRef } from 'react';
import { useOpenCV } from './useOpenCV';
import {
  initPanorama,
  exportPanorama,
  stitchFrameV2,
  type PanoramaState,
  type StitchingConfig
} from '../utils/smartStitching';
import {
  initRegionMap,
  updateRegions,
  getCoverageStats,
  type RegionMap,
  type CoverageStats
} from '../utils/regionTracking';
import { TranslationDatabase } from '../utils/translationDatabase';
import type { QualityMetrics } from '../utils/qualityMetrics';

export interface StitchingStats {
  framesProcessed: number;
  framesAccepted: number;
  lastConfidence: number;
  lastMatchedFeatures: number;
  isProcessing: boolean;
  lastError?: string;
  overlapDetected: boolean;
  lastMovement: number;
  lastFramePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  currentQualityMetrics?: QualityMetrics;
  avgQuality: number;
  currentFPS: number;
}

export const useContinuousStitching = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const { cvLoaded, cv } = useOpenCV();
  const [isStitching, setIsStitching] = useState(false);
  const [panoramaDataUrl, setPanoramaDataUrl] = useState<string | undefined>();
  const [stats, setStats] = useState<StitchingStats>({
    framesProcessed: 0,
    framesAccepted: 0,
    lastConfidence: 0,
    lastMatchedFeatures: 0,
    isProcessing: false,
    overlapDetected: false,
    lastMovement: 0,
    avgQuality: 0,
    currentFPS: 0
  });
  const [regionMap, setRegionMap] = useState<RegionMap>(initRegionMap(200));
  const [coverageStats, setCoverageStats] = useState<CoverageStats>({
    totalRegions: 0,
    poorRegions: 0,
    fairRegions: 0,
    goodRegions: 0,
    excellentRegions: 0,
    overallQuality: 0,
    avgCapturesPerRegion: 0
  });

  // NEW: Translation database for frame tracking
  const [database] = useState(() => new TranslationDatabase(200));
  const [currentQualityMetrics, setCurrentQualityMetrics] = useState<QualityMetrics | null>(null);
  const [stitchingConfig, setStitchingConfig] = useState<Partial<StitchingConfig>>({
    featureDetector: 'ORB',
    nFeatures: 1500,
    useQualityMetrics: true,
    useAdaptiveFeatures: true
  });

  const panoramaStateRef = useRef<PanoramaState | null>(null);
  const processingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  /**
   * Start continuous stitching from video stream
   */
  const startStitching = useCallback(
    async (minConfidence: number = 30, captureIntervalMs: number = 500, nFeatures: number = 1500) => {
      if (!cvLoaded || !cv) {
        console.error('OpenCV not loaded');
        return;
      }

      if (!videoRef.current || videoRef.current.videoWidth === 0) {
        console.error('Video not ready');
        return;
      }

      setIsStitching(true);

      // Capture first frame as base
      const firstFrame = await captureFrameFromVideo(videoRef.current);
      if (!firstFrame) {
        console.error('Failed to capture first frame');
        setIsStitching(false);
        return;
      }

      // Initialize panorama
      panoramaStateRef.current = initPanorama(firstFrame);
      // Export only the content area, not the full 3x canvas
      const initialPanorama = exportPanorama(panoramaStateRef.current);
      setPanoramaDataUrl(initialPanorama);

      setStats({
        framesProcessed: 1,
        framesAccepted: 1,
        lastConfidence: 100,
        lastMatchedFeatures: 0,
        isProcessing: false,
        overlapDetected: false,
        lastMovement: 0,
        avgQuality: 100,
        currentFPS: 1000 / captureIntervalMs
      });

      // Start continuous capture and stitching
      intervalRef.current = window.setInterval(async () => {
        if (processingRef.current || !panoramaStateRef.current) return;

        processingRef.current = true;
        setStats(prev => ({ ...prev, isProcessing: true }));

        try {
          const frame = await captureFrameFromVideo(videoRef.current!);
          if (!frame) {
            processingRef.current = false;
            setStats(prev => ({ ...prev, isProcessing: false }));
            return;
          }

          // Use V2 stitching with professional features
          const result = await stitchFrameV2(
            cv,
            panoramaStateRef.current,
            frame,
            {
              ...stitchingConfig,
              minConfidence,
              nFeatures
            },
            database
          );

          // Update quality metrics if available
          if (result.qualityMetrics) {
            setCurrentQualityMetrics(result.qualityMetrics);
          }

          // Update region map if frame was successfully stitched
          let overlapDetected = false;
          if (result.success && result.framePosition) {
            const { overlapDetected: overlap } = updateRegions(
              regionMap,
              result.framePosition.x,
              result.framePosition.y,
              result.framePosition.width,
              result.framePosition.height,
              result.confidence
            );

            overlapDetected = overlap;

            // Update coverage stats
            const newCoverageStats = getCoverageStats(regionMap);
            setCoverageStats(newCoverageStats);
            setRegionMap({ ...regionMap }); // Trigger re-render
          }

          setStats(prev => ({
            framesProcessed: prev.framesProcessed + 1,
            framesAccepted: result.success
              ? prev.framesAccepted + 1
              : prev.framesAccepted,
            lastConfidence: result.confidence,
            lastMatchedFeatures: result.matchedFeatures || 0,
            isProcessing: false,
            lastError: result.error,
            overlapDetected,
            lastMovement: result.translationDistance || 0,
            lastFramePosition: result.framePosition,
            currentQualityMetrics: result.qualityMetrics,
            avgQuality: result.qualityMetrics?.score || prev.avgQuality,
            currentFPS: 1000 / captureIntervalMs
          }));

          if (result.success && result.panorama) {
            setPanoramaDataUrl(result.panorama);
          }

          // Cleanup homography if present
          if (result.homography) {
            result.homography.delete();
          }
        } catch (error) {
          console.error('Stitching error:', error);
          setStats(prev => ({
            ...prev,
            isProcessing: false,
            lastError: (error as Error).message
          }));
        }

        processingRef.current = false;
      }, captureIntervalMs);
    },
    [cvLoaded, cv, videoRef]
  );

  /**
   * Stop continuous stitching
   */
  const stopStitching = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsStitching(false);
    setStats(prev => ({ ...prev, isProcessing: false }));
  }, []);

  /**
   * Export final panorama
   */
  const exportFinalPanorama = useCallback((): string | null => {
    if (!panoramaStateRef.current) return null;
    return exportPanorama(panoramaStateRef.current);
  }, []);

  /**
   * Reset panorama
   */
  const reset = useCallback(() => {
    stopStitching();
    panoramaStateRef.current = null;
    setPanoramaDataUrl(undefined);
    setStats({
      framesProcessed: 0,
      framesAccepted: 0,
      lastConfidence: 0,
      lastMatchedFeatures: 0,
      isProcessing: false,
      overlapDetected: false,
      lastMovement: 0,
      avgQuality: 0,
      currentFPS: 0
    });
    setCurrentQualityMetrics(null);
    database.clear(); // Clear translation database
    setRegionMap(initRegionMap(200));
    setCoverageStats({
      totalRegions: 0,
      poorRegions: 0,
      fairRegions: 0,
      goodRegions: 0,
      excellentRegions: 0,
      overallQuality: 0,
      avgCapturesPerRegion: 0
    });
  }, [stopStitching, database]);

  return {
    isStitching,
    panoramaDataUrl,
    stats,
    cvLoaded,
    regionMap,
    coverageStats,
    startStitching,
    stopStitching,
    exportFinalPanorama,
    reset,
    // NEW: Export V2 enhancements
    database,
    currentQualityMetrics,
    stitchingConfig,
    setStitchingConfig
  };
};

/**
 * Capture current frame from video element
 */
const captureFrameFromVideo = async (video: HTMLVideoElement): Promise<HTMLImageElement | null> => {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/png');

  // Wait for image to load completely
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load frame image'));
    img.src = dataUrl;
  });
};
