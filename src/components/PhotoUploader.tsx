import React, { useState, useRef } from 'react';
import {
  X,
  Loader2,
  ImagePlus,
  Camera,
  Image as ImageIcon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImageFile } from '../utils/imageCompressor';
import { extractExifDateTime, ExifValidationResult } from '../utils/exifValidator';
import { LiveCameraModal } from './LiveCameraModal';

interface PhotoUploaderProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 4,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [exifStatus, setExifStatus] = useState<ExifValidationResult | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const compressImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve(reader.result as string);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploadError(null);
    const remainingSlots = maxPhotos - photos.length;
    const filesToProcess = files.slice(0, remainingSlots);

    // Run EXIF check on the primary selected file
    try {
      const exif = await extractExifDateTime(filesToProcess[0]);
      setExifStatus(exif);
    } catch (e) {
      console.warn('EXIF check note:', e);
    }

    // Instant compressed Base64 Data URLs
    const base64List = await Promise.all(
      filesToProcess.map(async (f) => {
        try {
          const res = await compressImageFile(f, { maxDimension: 1100, quality: 0.80 });
          return res.dataUrl || (await compressImageToBase64(f));
        } catch {
          return await compressImageToBase64(f);
        }
      })
    );

    const validBase64 = base64List.filter((b) => b && b.length > 0);
    onPhotosChange([...photos, ...validBase64].slice(0, maxPhotos));
    setUploading(true);

    try {
      const uploadedUrls = await Promise.all(
        filesToProcess.map(async (file, idx) => {
          try {
            const { blob, dataUrl } = await compressImageFile(file, {
              maxDimension: 1100,
              quality: 0.80,
            });

            try {
              const storageRef = ref(
                storage,
                `photos/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`
              );
              const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Storage upload timed out')), 3000)
              );
              await Promise.race([uploadTask, timeoutPromise]);
              const storageUrl = await Promise.race([
                getDownloadURL(storageRef),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('URL timed out')), 1500)),
              ]);
              return storageUrl || dataUrl || validBase64[idx];
            } catch (storageErr) {
              return dataUrl || validBase64[idx];
            }
          } catch {
            return validBase64[idx] || (await compressImageToBase64(file));
          }
        })
      );

      const validUploaded = uploadedUrls.filter((u) => u && !u.startsWith('blob:'));
      const withoutBase64 = photos.filter((p) => !validBase64.includes(p));
      onPhotosChange([...withoutBase64, ...validUploaded].slice(0, maxPhotos));
    } catch (err: any) {
      setUploadError('Unable to process some photos.');
    } finally {
      setUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files).filter(
      (f) => !f.type || f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name)
    );
    processFiles(files);
  };

  const handleLiveCameraCapture = (file: File) => {
    setShowLiveCamera(false);
    processFiles([file]);
  };

  const handleRemove = (index: number) => {
    onPhotosChange(photos.filter((_, idx) => idx !== index));
  };

  const openCamera = () => {
    setShowSourcePicker(false);
    setShowLiveCamera(true);
  };

  const openGallery = () => {
    setShowSourcePicker(false);
    galleryInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      {/* Header with status and quick action buttons */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-900">
          Photos ({photos.length}/{maxPhotos})
        </span>
        {photos.length < maxPhotos && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openCamera}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Take a live photo with camera (Safeguard verified)"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Camera</span>
            </button>
            <button
              type="button"
              onClick={openGallery}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Upload photos from gallery (EXIF checked)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Gallery</span>
            </button>
          </div>
        )}
      </div>

      {/* EXIF Timestamp Feedback Badge */}
      {exifStatus && photos.length > 0 && (
        <div
          className={`px-3 py-1.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
            exifStatus.isValidForCurrentFestival
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{exifStatus.message}</span>
          </div>
          <span className="text-[9px] uppercase font-bold text-gray-400">EXIF</span>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {photos.map((url, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-xl overflow-hidden border-2 border-amber-300 shadow-xs group bg-amber-50"
          >
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition-colors cursor-pointer"
              title="Remove photo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="absolute bottom-1 left-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
              Photo {i + 1}
            </span>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => setShowSourcePicker(true)}
            disabled={uploading}
            className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-xl bg-amber-50/50 hover:bg-amber-100/60 transition-colors p-2 text-center group cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-amber-700 animate-spin" />
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-amber-100 group-hover:bg-amber-200 text-amber-800 flex items-center justify-center mb-1 transition-colors">
                  <ImagePlus className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-amber-950 leading-tight">
                  + Add Photo
                </span>
                <span className="text-[9px] text-gray-500 mt-0.5">
                  Camera / Gallery
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleUpload}
        className="hidden"
      />

      {/* Choice Modal when clicking + Add Photo */}
      {showSourcePicker && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl border border-amber-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900 text-sm">Add Photo</h4>
              <button
                type="button"
                onClick={() => setShowSourcePicker(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Choose how you would like to add this photo:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={openCamera}
                className="flex flex-col items-center justify-center gap-2 p-3.5 bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 rounded-xl text-amber-950 font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-xs">
                  <Camera className="w-5 h-5" />
                </div>
                <span>Take Photo</span>
                <span className="text-[10px] text-amber-700 font-normal">Live Camera</span>
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="flex flex-col items-center justify-center gap-2 p-3.5 bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 rounded-xl text-amber-950 font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shadow-xs">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <span>From Gallery</span>
                <span className="text-[10px] text-amber-700 font-normal">EXIF Checked</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}

      {/* Live Camera Modal */}
      <LiveCameraModal
        isOpen={showLiveCamera}
        onClose={() => setShowLiveCamera(false)}
        onCapture={handleLiveCameraCapture}
        title="Live Camera Photo"
      />
    </div>
  );
};
