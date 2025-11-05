import { useState, useEffect } from 'react';

declare global {
  interface Window {
    cv: any;
  }
}

export const useOpenCV = () => {
  const [cvLoaded, setCvLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if OpenCV is already loaded
    if (window.cv && window.cv.Mat) {
      console.log('OpenCV.js already loaded!');
      setCvLoaded(true);
      return;
    }

    // Wait for OpenCV to load from CDN
    const checkOpenCV = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(checkOpenCV);
        console.log('OpenCV.js loaded successfully from CDN!');
        setCvLoaded(true);
      }
    }, 100);

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      clearInterval(checkOpenCV);
      if (!window.cv || !window.cv.Mat) {
        setError('Failed to load OpenCV: timeout after 30 seconds');
        console.error('OpenCV loading timeout');
      }
    }, 30000);

    return () => {
      clearInterval(checkOpenCV);
      clearTimeout(timeout);
    };
  }, []);

  return { cvLoaded, error, cv: window.cv };
};
