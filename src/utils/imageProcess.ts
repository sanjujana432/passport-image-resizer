import { CompressionSettings, CompressionResult } from '../types';

/**
 * Loads an image from a native URL or data URI and returns an HTMLImageElement
 */
export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image. The file may be damaged or in an unsupported format.'));
    img.src = url;
  });
};

/**
 * Helper to convert canvas contents to an image blob
 */
const getCanvasBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to render the image canvas to standard format.'));
        }
      },
      mimeType,
      mimeType === 'image/png' ? undefined : quality
    );
  });
};

/**
 * Intelligently resizes and compresses an image to fit strictly under a target KB limit.
 * It first resizes to the specified width and height.
 * Then searches for the maximum quality factor that keeps the file under targetKB.
 * If PNG is requested (lossless), or if even lowest lossy quality exceeds targetKB,
 * it dynamically downscales the pixel dimensions by small ratios to meet the size constraints.
 */
export const processImageCompression = async (
  img: HTMLImageElement,
  settings: CompressionSettings,
  originalFileName: string,
  originalFileSize: number
): Promise<CompressionResult> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize the canvas context. Image processing is not supported in this browser environment.');
  }

  // Determine target output format
  let mimeType = 'image/jpeg';
  let targetFormat: 'jpeg' | 'png' | 'webp' = 'jpeg';

  if (settings.outputFormat === 'png') {
    mimeType = 'image/png';
    targetFormat = 'png';
  } else if (settings.outputFormat === 'webp') {
    mimeType = 'image/webp';
    targetFormat = 'webp';
  } else if (settings.outputFormat === 'jpeg') {
    mimeType = 'image/jpeg';
    targetFormat = 'jpeg';
  } else {
    // Mode is 'auto'. Try to maintain PNG if it fits; otherwise use JPEG for better compression.
    // Also respect WebP if original was WebP.
    const ext = originalFileName.split('.').pop()?.toLowerCase();
    if (ext === 'webp') {
      mimeType = 'image/webp';
      targetFormat = 'webp';
    } else if (ext === 'png') {
      mimeType = 'image/png';
      targetFormat = 'png';
    } else {
      mimeType = 'image/jpeg';
      targetFormat = 'jpeg';
    }
  }

  const maxTargetBytes = settings.targetKB * 1024;
  
  let finalWidth = settings.width;
  let finalHeight = settings.height;
  let finalQuality = 0.85;
  let finalScale = 1.0;
  let finalBlob: Blob | null = null;

  // Render photo function with a scale modifier on dimension size
  const renderAndTest = async (scale: number, quality: number, formatMime: string): Promise<Blob> => {
    const w = Math.round(settings.width * scale);
    const h = Math.round(settings.height * scale);
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw high quality Scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    return await getCanvasBlob(canvas, formatMime, quality);
  };

  // 1. Handling PNG format
  if (mimeType === 'image/png') {
    // Try original target dimensions
    let blob = await renderAndTest(1.0, 1.0, 'image/png');
    
    if (blob.size <= maxTargetBytes) {
      finalBlob = blob;
      finalScale = 1.0;
      finalQuality = 1.0;
    } else {
      // If we are in 'auto' format mode, fallback to JPEG for better compression
      if (settings.outputFormat === 'auto') {
        mimeType = 'image/jpeg';
        targetFormat = 'jpeg';
        // Fall through to JPEG lossy search below
      } else {
        // Force PNG: We must scale down dimensions to fit the target KB
        let lowScale = 0.05;
        let highScale = 1.0;
        let bestBlob = blob;
        let bestScale = 0.05;

        // Binary search 7 iterations on scale
        for (let i = 0; i < 7; i++) {
          const midScale = (lowScale + highScale) / 2;
          const currentBlob = await renderAndTest(midScale, 1.0, 'image/png');
          
          if (currentBlob.size <= maxTargetBytes) {
            bestBlob = currentBlob;
            bestScale = midScale;
            lowScale = midScale; // try larger scale
          } else {
            highScale = midScale; // try smaller scale
          }
        }
        
        finalBlob = bestBlob;
        finalScale = bestScale;
        finalQuality = 1.0;
        finalWidth = Math.round(settings.width * finalScale);
        finalHeight = Math.round(settings.height * finalScale);
      }
    }
  }

  // 2. Handling lossy formats (JPEG or WebP, including auto-converted PNG)
  if (mimeType !== 'image/png') {
    let bestBlob: Blob | null = null;
    let bestQuality = 0.85;
    
    let lowQ = 0.02;
    let highQ = 0.98;

    // Test max possible quality (0.98 is generally visually identical to 1.0 but significantly smaller)
    const maxQBlob = await renderAndTest(1.0, 0.98, mimeType);
    if (maxQBlob.size <= maxTargetBytes) {
      bestBlob = maxQBlob;
      bestQuality = 0.98;
    } else {
      // Binary search 7 iterations on JPEG/WebP quality factor
      for (let i = 0; i < 7; i++) {
        const midQ = (lowQ + highQ) / 2;
        const currentBlob = await renderAndTest(1.0, midQ, mimeType);
        
        if (currentBlob.size <= maxTargetBytes) {
          bestBlob = currentBlob;
          bestQuality = midQ;
          lowQ = midQ; // try higher quality
        } else {
          highQ = midQ; // try lower quality
        }
      }
    }

    if (bestBlob) {
      finalBlob = bestBlob;
      finalQuality = bestQuality;
      finalScale = 1.0;
    } else {
      // Even at lowest quality (0.02), base dimensions are too large for target KB limit.
      // We must scale down the output width/height dimensions.
      let lowScale = 0.05;
      let highScale = 1.0;
      let bestScale = 0.05;
      let bestScaledBlob = await renderAndTest(0.05, 0.4, mimeType); // fallback minimum

      // Search for maximum scale factor that can fit at a reasonable base quality (e.g., 0.4)
      for (let i = 0; i < 7; i++) {
        const midScale = (lowScale + highScale) / 2;
        const currentBlob = await renderAndTest(midScale, 0.4, mimeType);
        
        if (currentBlob.size <= maxTargetBytes) {
          bestScaledBlob = currentBlob;
          bestScale = midScale;
          lowScale = midScale; // try larger scaling
        } else {
          highScale = midScale; // try smaller scaling
        }
      }

      // Now maximize quality factor at our optimal scaled dimensions
      let subLowQ = 0.02;
      let subHighQ = 0.95;
      let subBestQ = 0.4;
      let subBestBlob = bestScaledBlob;

      for (let j = 0; j < 5; j++) {
        const midQ = (subLowQ + subHighQ) / 2;
        const currentBlob = await renderAndTest(bestScale, midQ, mimeType);
        
        if (currentBlob.size <= maxTargetBytes) {
          subBestBlob = currentBlob;
          subBestQ = midQ;
          subLowQ = midQ; // try higher quality
        } else {
          subHighQ = midQ; // try lower quality
        }
      }

      finalBlob = subBestBlob;
      finalScale = bestScale;
      finalQuality = subBestQ;
      finalWidth = Math.round(settings.width * finalScale);
      finalHeight = Math.round(settings.height * finalScale);
    }
  }

  if (!finalBlob) {
    // Safe ultimate fallback: 100% scale, 0.1 quality
    finalBlob = await renderAndTest(1.0, 0.1, mimeType);
    finalQuality = 0.1;
    finalScale = 1.0;
  }

  // Calculate percentage reduction using the original file size in bytes
  const percentageReduced = ((originalFileSize - finalBlob.size) / originalFileSize) * 100;

  return {
    optimizedBlob: finalBlob,
    optimizedUrl: URL.createObjectURL(finalBlob),
    width: finalWidth,
    height: finalHeight,
    size: finalBlob.size,
    format: targetFormat,
    quality: finalQuality,
    scaleApplied: finalScale,
    percentageReduced: Math.max(0, parseFloat(percentageReduced.toFixed(1))),
  };
};
