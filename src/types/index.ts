export interface CapturedImage {
  id: string;
  dataUrl: string;
  timestamp: number;
  position?: { x: number; y: number };
  blob?: Blob;
}

export interface StitchSettings {
  overlapThreshold: number;
  featureMatchThreshold: number;
  blendingMode: 'linear' | 'multiband';
}

export interface CameraSettings {
  deviceId?: string;
  width: number;
  height: number;
  facingMode?: 'user' | 'environment';
}

export interface ViewerSettings {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  showNavigator: boolean;
}
