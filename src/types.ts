/**
 * Image Optimizer and Resizer Type Definitions
 */

export interface ImageFileState {
  file: File;
  name: string;
  type: string; // mime-type, e.g., image/png
  size: number; // in bytes
  width: number;
  height: number;
  aspectRatio: number;
  previewUrl: string;
}

export interface CompressionSettings {
  width: number;
  height: number;
  lockAspectRatio: boolean;
  targetKB: number; // target file size in KB, e.g., 50
  outputFormat: 'auto' | 'jpeg' | 'png' | 'webp';
}

export interface CompressionResult {
  optimizedBlob: Blob;
  optimizedUrl: string;
  width: number;
  height: number;
  size: number; // in bytes
  format: 'jpeg' | 'png' | 'webp';
  quality: number; // 0 to 1
  percentageReduced: number;
  scaleApplied: number; // 1.0 if not downscaled, < 1.0 if we had to scale dimensions
}
