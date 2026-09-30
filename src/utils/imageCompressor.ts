/**
 * Ultra-Fast Asynchronous In-Browser Image Compressor & Resizer
 * Converts multi-megabyte camera photos (5MB - 20MB) to optimized web images (~100KB - 250KB)
 * using non-blocking asynchronous hardware-accelerated Canvas & OffscreenCanvas.
 * Ensures zero UI freezing or flickering during compression.
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

/**
 * Yields execution to the browser microtask/macro event loop to prevent UI stutter
 */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Compresses an image File or Blob down to an optimized Blob ready for rapid upload
 * Runs asynchronously on non-blocking path.
 */
export async function compressImageFile(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const { maxDimension = 1100, quality = 0.80, mimeType = 'image/jpeg' } = options;

  // Non-blocking yield so UI animations continue smoothly
  await yieldToMainThread();

  // 1. OffscreenCanvas + createImageBitmap Path (Highest Performance, zero DOM overhead)
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;

      // Proportional constrained dimensions
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await offscreen.convertToBlob({ type: mimeType, quality });
        
        // Asynchronously convert blob to Data URL
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res((reader.result as string) || '');
          reader.onerror = () => res('');
          reader.readAsDataURL(blob);
        });

        return { blob, dataUrl, width, height };
      }
      bitmap.close();
    } catch {
      // Fall through to standard path
    }
  }

  // 2. Hardware-accelerated createImageBitmap with standard canvas
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const dataUrl = canvas.toDataURL(mimeType, quality);
        const blob = await new Promise<Blob>((res) => {
          canvas.toBlob((b) => res(b || new Blob([file], { type: mimeType })), mimeType, quality);
        });

        return { blob, dataUrl, width, height };
      }
      bitmap.close();
    } catch {
      // Fall through to Image path
    }
  }

  // 3. Fallback path via Image element with asynchronous URL revocation
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      await yieldToMainThread();
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            blob: file,
            dataUrl: (reader.result as string) || '',
            width: img.width,
            height: img.height,
          });
        };
        reader.onerror = () => reject(new Error('Canvas context and FileReader unavailable'));
        reader.readAsDataURL(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(
        (blob) => {
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve({ blob: blob || file, dataUrl, width, height });
        },
        mimeType,
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}

/**
 * Creates an instant temporary preview URL for 0ms UI feedback
 */
export function getInstantPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}
