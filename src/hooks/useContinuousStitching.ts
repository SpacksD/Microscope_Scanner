import { useState, useCallback, useRef } from 'react';
import { useOpenCV } from './useOpenCV';
import {
  initPanorama,
  stitchFrame,
  exportPanorama,
  type PanoramaState
} from '../utils/smartStitching';

export interface StitchingStats {
  framesProcessed: number;
  framesAccepted: number;
  lastConfidence: number;
  lastMatchedFeatures: number;
  isProcessing: boolean;
  lastError?: string;
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
    isProcessing: false
  });

  const panoramaStateRef = useRef<PanoramaState | null>(null);
  const processingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  /**
   * Start continuous stitching from video stream
   */
  const startStitching = useCallback(
    async (minConfidence: number = 30, captureIntervalMs: number = 500) => {
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
      setPanoramaDataUrl(panoramaStateRef.current.canvas.toDataURL('image/png'));

      setStats({
        framesProcessed: 1,
        framesAccepted: 1,
        lastConfidence: 100,
        lastMatchedFeatures: 0,
        isProcessing: false
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

          const result = await stitchFrame(
            cv,
            panoramaStateRef.current,
            frame,
            minConfidence
          );

          setStats(prev => ({
            framesProcessed: prev.framesProcessed + 1,
            framesAccepted: result.success
              ? prev.framesAccepted + 1
              : prev.framesAccepted,
            lastConfidence: result.confidence,
            lastMatchedFeatures: result.matchedFeatures || 0,
            isProcessing: false,
            lastError: result.error
          }));

          if (result.success && result.panorama) {
            setPanoramaDataUrl(result.panorama);
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
      isProcessing: false
    });
  }, [stopStitching]);

  return {
    isStitching,
    panoramaDataUrl,
    stats,
    cvLoaded,
    startStitching,
    stopStitching,
    exportFinalPanorama,
    reset
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
