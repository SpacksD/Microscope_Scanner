import { useEffect, useRef, useState } from 'react';
import OpenSeadragon from 'openseadragon';
import type { CapturedImage, ViewerSettings } from '../types';
import './ImageViewer.css';

interface ImageViewerProps {
  images: CapturedImage[];
  settings: ViewerSettings;
  compositeImage?: string; // Base64 or URL of the stitched image
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  images,
  settings,
  compositeImage
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const osdViewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  // Initialize OpenSeadragon viewer
  useEffect(() => {
    if (!viewerRef.current) return;

    // Create viewer instance
    const viewer = OpenSeadragon({
      element: viewerRef.current,
      prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@4.1/build/openseadragon/images/',
      animationTime: 0.5,
      blendTime: 0.1,
      constrainDuringPan: false,
      maxZoomPixelRatio: settings.maxZoom,
      minZoomLevel: settings.minZoom,
      visibilityRatio: 0.5,
      zoomPerScroll: 1.2,
      showNavigator: settings.showNavigator,
      navigatorPosition: 'BOTTOM_RIGHT',
      navigatorHeight: '120px',
      navigatorWidth: '160px',
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true
      }
    });

    osdViewerRef.current = viewer;
    setViewerReady(true);

    return () => {
      viewer.destroy();
      osdViewerRef.current = null;
      setViewerReady(false);
    };
  }, [settings]);

  // Update viewer with composite image or individual images
  useEffect(() => {
    if (!viewerReady || !osdViewerRef.current) return;

    const viewer = osdViewerRef.current;

    // Clear existing tiles
    viewer.world.removeAll();

    if (compositeImage) {
      // Display stitched composite image
      viewer.addSimpleImage({
        url: compositeImage,
        index: 0,
        replace: true
      });
    } else if (images.length > 0) {
      // Display individual images in a grid
      const cols = Math.ceil(Math.sqrt(images.length));

      images.forEach((image, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;

        viewer.addTiledImage({
          tileSource: {
            type: 'image',
            url: image.dataUrl,
          },
          x: col * 1.1,
          y: row * 1.1,
          width: 1,
          index: index
        });
      });

      // Fit bounds to show all images
      if (images.length > 0) {
        viewer.viewport.goHome();
      }
    }
  }, [images, compositeImage, viewerReady]);

  return (
    <div className="image-viewer-container">
      <div className="viewer-header">
        <h3>Image Viewer</h3>
        <div className="viewer-info">
          {compositeImage ? (
            <span className="badge badge-success">Composite Image</span>
          ) : (
            <span className="badge badge-info">{images.length} Images</span>
          )}
        </div>
      </div>

      <div
        ref={viewerRef}
        className="openseadragon-viewer"
      />

      {!compositeImage && images.length === 0 && (
        <div className="empty-state">
          <p>No images captured yet</p>
          <p className="empty-state-hint">Start capturing images to see them here</p>
        </div>
      )}
    </div>
  );
};
