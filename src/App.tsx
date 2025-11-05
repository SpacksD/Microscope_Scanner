import { useState, useCallback } from 'react'
import { CameraCapture } from './components/CameraCapture'
import { ContinuousStitching } from './components/ContinuousStitching'
import { ImageViewer } from './components/ImageViewer'
import { ControlPanel } from './components/ControlPanel'
import type { CapturedImage, CameraSettings, ViewerSettings } from './types'
import { stitchImagesAdvanced, exportImage } from './utils/imageProcessing'
import './App.css'

type CaptureMode = 'manual' | 'continuous';

function App() {
  const [mode, setMode] = useState<CaptureMode>('continuous');
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [compositeImage, setCompositeImage] = useState<string | undefined>();
  const [isStitching, setIsStitching] = useState(false);

  const cameraSettings: CameraSettings = {
    width: 1280,
    height: 720,
    facingMode: 'environment'
  };

  const viewerSettings: ViewerSettings = {
    minZoom: 0.5,
    maxZoom: 10,
    defaultZoom: 1,
    showNavigator: true
  };

  const handleCapture = useCallback((image: CapturedImage) => {
    setImages(prev => [...prev, image]);
  }, []);

  const handlePanoramaUpdate = useCallback((dataUrl: string) => {
    setCompositeImage(dataUrl);
  }, []);

  const handleClearImages = useCallback(() => {
    setImages([]);
    setCompositeImage(undefined);
  }, []);

  const handleStitchImages = useCallback(async () => {
    if (images.length < 2) return;

    setIsStitching(true);
    try {
      const stitched = await stitchImagesAdvanced(images, 0.1);
      setCompositeImage(stitched);
    } catch (error) {
      console.error('Failed to stitch images:', error);
      alert('Failed to stitch images. Please try again.');
    } finally {
      setIsStitching(false);
    }
  }, [images]);

  const handleExportImage = useCallback(() => {
    const imageToExport = compositeImage || (images.length > 0 ? images[images.length - 1].dataUrl : null);

    if (imageToExport) {
      const filename = `microscope-scan-${Date.now()}.png`;
      exportImage(imageToExport, filename);
    }
  }, [images, compositeImage]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🔬 Microscope Scanner</h1>

        <div className="mode-selector">
          <button
            className={`mode-btn ${mode === 'continuous' ? 'active' : ''}`}
            onClick={() => setMode('continuous')}
          >
            🎥 Continuous
          </button>
          <button
            className={`mode-btn ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            📸 Manual
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <ControlPanel
            images={images}
            onClearImages={handleClearImages}
            onStitchImages={handleStitchImages}
            onExportImage={handleExportImage}
            isStitching={isStitching}
          />
        </aside>

        <main className="main-content">
          <section className="capture-section">
            {mode === 'continuous' ? (
              <ContinuousStitching
                settings={cameraSettings}
                onPanoramaUpdate={handlePanoramaUpdate}
              />
            ) : (
              <CameraCapture
                onCapture={handleCapture}
                settings={cameraSettings}
              />
            )}
          </section>

          <section className="viewer-section">
            <ImageViewer
              images={mode === 'manual' ? images : []}
              settings={viewerSettings}
              compositeImage={compositeImage}
            />
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
