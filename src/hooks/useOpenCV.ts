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
      setCvLoaded(true);
      return;
    }

    const loadOpenCV = async () => {
      try {
        // Import the OpenCV.js module
        await import('@techstark/opencv-js');

        // Wait for OpenCV to be ready
        await new Promise<void>((resolve, reject) => {
          const checkCV = setInterval(() => {
            if (window.cv && window.cv.Mat) {
              clearInterval(checkCV);
              resolve();
            }
          }, 100);

          // Timeout after 10 seconds
          setTimeout(() => {
            clearInterval(checkCV);
            reject(new Error('OpenCV loading timeout'));
          }, 10000);
        });

        setCvLoaded(true);
        console.log('OpenCV.js loaded successfully');
      } catch (err) {
        setError('Failed to load OpenCV: ' + (err as Error).message);
        console.error('OpenCV loading error:', err);
      }
    };

    loadOpenCV();
  }, []);

  return { cvLoaded, error, cv: window.cv };
};
