import type { CapturedImage } from '../types';

/**
 * Simple image stitching implementation
 * This is a basic version - can be replaced with WASM module for better performance
 */

export const stitchImages = async (images: CapturedImage[]): Promise<string> => {
  if (images.length === 0) {
    throw new Error('No images to stitch');
  }

  if (images.length === 1) {
    return images[0].dataUrl;
  }

  // Create canvas for stitching
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Load all images
  const loadedImages = await Promise.all(
    images.map(img => loadImage(img.dataUrl))
  );

  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / cols);

  // Get dimensions from first image
  const imgWidth = loadedImages[0].width;
  const imgHeight = loadedImages[0].height;

  // Set canvas size (simple grid layout for now)
  canvas.width = imgWidth * cols;
  canvas.height = imgHeight * rows;

  // Draw images in grid
  loadedImages.forEach((img, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = col * imgWidth;
    const y = row * imgHeight;

    ctx.drawImage(img, x, y, imgWidth, imgHeight);
  });

  return canvas.toDataURL('image/png');
};

/**
 * Advanced stitching with overlap detection
 * This will be moved to WASM for performance
 */
export const stitchImagesAdvanced = async (
  images: CapturedImage[],
  overlapPercent: number = 0.1
): Promise<string> => {
  if (images.length === 0) {
    throw new Error('No images to stitch');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Load all images
  const loadedImages = await Promise.all(
    images.map(img => loadImage(img.dataUrl))
  );

  const imgWidth = loadedImages[0].width;
  const imgHeight = loadedImages[0].height;
  const overlap = imgWidth * overlapPercent;

  // Calculate dimensions with overlap
  const cols = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / cols);

  canvas.width = imgWidth * cols - overlap * (cols - 1);
  canvas.height = imgHeight * rows - overlap * (rows - 1);

  // Draw images with overlap and blending
  loadedImages.forEach((img, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = col * (imgWidth - overlap);
    const y = row * (imgHeight - overlap);

    // Use alpha blending for overlapping areas
    if (col > 0 || row > 0) {
      ctx.globalAlpha = 0.5;
    }

    ctx.drawImage(img, x, y, imgWidth, imgHeight);
    ctx.globalAlpha = 1.0;
  });

  return canvas.toDataURL('image/png');
};

/**
 * Load image from data URL
 */
const loadImage = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
};

/**
 * Export image with custom quality
 */
export const exportImage = (
  dataUrl: string,
  filename: string = 'microscope-scan.png'
): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

/**
 * Convert data URL to blob
 */
export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

/**
 * Get image dimensions
 */
export const getImageDimensions = async (
  dataUrl: string
): Promise<{ width: number; height: number }> => {
  const img = await loadImage(dataUrl);
  return {
    width: img.width,
    height: img.height
  };
};
