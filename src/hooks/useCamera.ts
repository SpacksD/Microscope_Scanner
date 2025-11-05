import { useEffect, useRef, useState, useCallback } from 'react';
import type { CameraSettings, CapturedImage } from '../types';

export const useCamera = (settings: CameraSettings) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available camera devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = deviceList.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
      } catch (err) {
        setError('Failed to enumerate devices: ' + (err as Error).message);
      }
    };
    getDevices();
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
          width: { ideal: settings.width },
          height: { ideal: settings.height },
          facingMode: settings.facingMode
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setStream(mediaStream);
      setIsStreaming(true);
      setError(null);
    } catch (err) {
      setError('Failed to access camera: ' + (err as Error).message);
      setIsStreaming(false);
    }
  }, [settings]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
  }, [stream]);

  // Capture image from video stream
  const captureImage = useCallback(async (): Promise<CapturedImage | null> => {
    if (!videoRef.current || !canvasRef.current || !isStreaming) {
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return null;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and dataUrl
    const dataUrl = canvas.toDataURL('image/png');

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve({
          id: crypto.randomUUID(),
          dataUrl,
          timestamp: Date.now(),
          blob: blob || undefined
        });
      }, 'image/png');
    });
  }, [isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    devices,
    isStreaming,
    error,
    startCamera,
    stopCamera,
    captureImage
  };
};
