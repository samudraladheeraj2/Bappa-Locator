import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  Calendar,
  ThumbsUp,
  Info,
} from 'lucide-react';
import { Pandal, YearlyPandalPhoto } from '../types';
import { db, storage, auth } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImageFile, getInstantPreviewUrl } from '../utils/imageCompressor';
import { extractExifDateTime, ExifValidationResult } from '../utils/exifValidator';
import { CURRENT_FESTIVAL_YEAR, recordUserVote } from '../utils/yearlyPhotos';
import { LiveCameraModal } from './LiveCameraModal';
import { sanitizeText } from '../utils/sanitizer';
import { checkRateLimit } from '../utils/rateLimiter';

interface ExtendedFile extends File {
  isLiveCapture?: boolean;
}

interface UpdateIdolModalProps {
  isOpen: boolean;
  onClose: () => void;
  pandal: Pandal;
  onSuccess: (updatedPandal: Pandal) => void;
}

export const UpdateIdolModal: React.FC<UpdateIdolModalProps> = ({
  isOpen,
  onClose,
  pandal,
  onSuccess,
}) => {
  const currentYear = CURRENT_FESTIVAL_YEAR;
  const user = auth.currentUser;
  const mobileUser = (() => {
    try {
      const raw = localStorage.getItem('bappa_mobile_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [uploaderName, setUploaderName] = useState(() => {
    return user?.displayName || mobileUser?.name || 'Devotee';
  });
  const [selectedFile, setSelectedFile] = useState<ExtendedFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exifResult, setExifResult] = useState<ExifValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showLiveCamera, setShowLiveCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);

  // Clean up object URLs and auto-close timers on unmount or reset
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleProcessFile = async (file: ExtendedFile) => {
    setErrorMessage(null);
    setIsProcessing(true);

    // Revoke previous object URL if present
    if (activeObjectUrlRef.current && activeObjectUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }

    // Instant preview
    const instant = getInstantPreviewUrl(file);
    activeObjectUrlRef.current = instant;
    setPreviewUrl(instant);
    setSelectedFile(file);

    try {
      // Run automated EXIF validation
      const exif = await extractExifDateTime(file);
      setExifResult(exif);
    } catch (e) {
      console.warn('EXIF extract error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleLiveCameraCapture = (file: ExtendedFile) => {
    setShowLiveCamera(false);
    handleProcessFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading || isProcessing) return; // Strict double-click guard

    // Rate limit check
    const rateCheck = checkRateLimit('idol_photo_upload', 4, 60000);
    if (!rateCheck.allowed) {
      setErrorMessage(`Upload rate limit reached. Please wait ${rateCheck.retryAfterSec} seconds.`);
      return;
    }

    if (!selectedFile && !previewUrl) {
      setErrorMessage('Please capture or select an idol photo.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      // 1. Asynchronously compress image down to high-performance web size
      const { blob, dataUrl } = await compressImageFile(selectedFile || new Blob(), {
        maxDimension: 1200,
        quality: 0.82,
      });

      let finalUrl = dataUrl;

      // 2. Upload to Firebase Storage with fallback
      try {
        const storageRef = ref(
          storage,
          `yearly_idols/${pandal.id}_${currentYear}_${Date.now()}.jpg`
        );
        const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Storage upload timed out')), 3000)
        );
        await Promise.race([uploadTask, timeoutPromise]);
        const downloadUrl = await Promise.race([
          getDownloadURL(storageRef),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('URL timed out')), 1500)),
        ]);
        if (downloadUrl) finalUrl = downloadUrl;
      } catch (storageErr) {
        console.warn('Storage upload fallback to compressed Data URL:', storageErr);
      }

      const ADMIN_EMAIL = 'samudraladheeraj2@gmail.com';
      const isAdmin = (user && user.email === ADMIN_EMAIL) || (mobileUser && mobileUser.mobile === '7702583629');
      const photoStatus: 'approved' | 'pending' = isAdmin ? 'approved' : 'pending';

      // 3. Construct new YearlyPandalPhoto
      const photoId = 'photo_' + Date.now();
      const currentUserId = user?.uid || (mobileUser ? `mob_${mobileUser.mobile}` : `guest_${Date.now()}`);

      const newYearlyPhoto: YearlyPandalPhoto = {
        id: photoId,
        pandalId: pandal.id,
        pandalName: pandal.name,
        url: finalUrl,
        year: currentYear,
        uploadedBy: currentUserId,
        uploaderName: sanitizeText(uploaderName.trim()) || 'Devotee',
        votesCount: 1, // Creator starts with 1 initial confirmation vote
        votedUserIds: [currentUserId],
        createdAt: new Date().toISOString(),
        exifDate: exifResult?.dateTimeOriginal,
        isLiveCapture: !!(selectedFile as any)?.isLiveCapture || exifResult?.source === 'live_capture',
        isCover: true,
        status: photoStatus,
      };

      // Record creator's vote locally
      recordUserVote(photoId, true);

      // 4. Update Firestore & Local Pandal object
      const existingPhotos: YearlyPandalPhoto[] = pandal.yearlyPhotos || [];
      const updatedYearlyPhotos = [newYearlyPhoto, ...existingPhotos];

      // Re-sort approved current year photos to pick top-voted as primary cover
      const approvedCurrentYearPhotos = updatedYearlyPhotos.filter((p) => p.year === currentYear && (!p.status || p.status === 'approved'));
      approvedCurrentYearPhotos.sort((a, b) => b.votesCount - a.votesCount);
      const topCover = approvedCurrentYearPhotos[0]?.url || pandal.ganeshaImage || pandal.image;

      const updatedPandal: Pandal = {
        ...pandal,
        yearlyPhotos: updatedYearlyPhotos,
        ...(topCover ? { image: topCover, ganeshaImage: topCover } : {}),
      };

      try {
        const pandalRef = doc(db, 'submissions', pandal.id);
        const snap = await getDoc(pandalRef);
        if (snap.exists()) {
          await updateDoc(pandalRef, {
            yearlyPhotos: updatedYearlyPhotos,
            ...(topCover ? { image: topCover, ganeshaImage: topCover } : {}),
          });
        }
      } catch (err) {
        console.warn('Firestore update note:', err);
      }

      if (isAdmin) {
        setSuccessMessage(`Ganpati Bappa Morya! Fresh ${currentYear} Idol photo approved and live.`);
      } else {
        setSuccessMessage(`Thank you! Your ${currentYear} Lord Ganesha idol photo has been submitted and is pending admin verification before going live.`);
      }
      onSuccess(updatedPandal);

      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Error uploading yearly idol photo:', err);
      setErrorMessage(err.message || 'Failed to update idol photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-amber-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-amber-700/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-950/60 rounded-xl text-yellow-300 border border-amber-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-yellow-100 leading-snug">
                  Update Idol for {currentYear}
                </h3>
                <p className="text-xs text-amber-200 truncate max-w-[260px] sm:max-w-xs">
                  {pandal.name} • {pandal.area}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-amber-200 hover:text-white hover:bg-amber-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
            {successMessage ? (
              <div className="p-6 text-center space-y-3 bg-emerald-50 rounded-2xl border border-emerald-200 my-auto">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
                <h4 className="text-lg font-bold text-emerald-950">{successMessage}</h4>
                <p className="text-xs text-emerald-800">
                  Contributor Credit: <strong>Photo by {uploaderName} ({currentYear})</strong>
                </p>
              </div>
            ) : (
              <>
                {/* Contributor Name */}
                <div className="space-y-1">
                  <label className="block font-bold text-amber-950">
                    Your Name (Contributor Credit) *
                  </label>
                  <input
                    type="text"
                    required
                    value={uploaderName}
                    onChange={(e) => setUploaderName(e.target.value)}
                    placeholder="e.g. Rahul Sharma / Devotee"
                    className="w-full px-3.5 py-2.5 bg-amber-50/40 border border-amber-300 rounded-xl text-xs sm:text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  />
                  <p className="text-[11px] text-gray-500">
                    Will be credited as: "Photo by {uploaderName || 'Devotee'} ({currentYear})"
                  </p>
                </div>

                {/* Photo Capture & Upload Box */}
                <div className="space-y-3 bg-amber-50/40 p-4 rounded-2xl border-2 border-amber-300/80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-amber-700" />
                      <span>Lord Ganesha Idol Photo ({currentYear})</span>
                    </span>
                    <span className="bg-amber-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Live Darshan
                    </span>
                  </div>

                  {previewUrl ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-amber-400 bg-black/5 group shadow-sm">
                      <img
                        src={previewUrl}
                        alt="Idol Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowLiveCamera(true)}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold text-xs shadow flex items-center gap-1 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Retake Live</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-white text-gray-800 rounded-lg font-bold text-xs shadow flex items-center gap-1 cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Gallery</span>
                        </button>
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs text-white text-[10px] px-2 py-1 rounded-md">
                        Photo for {currentYear}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Option 1: Live Camera Safeguard (Recommended) */}
                      <button
                        type="button"
                        onClick={() => setShowLiveCamera(true)}
                        className="p-4 bg-gradient-to-br from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-2xl flex flex-col items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer text-center group"
                      >
                        <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-sm">Take Live Photo</span>
                        <span className="text-[10px] text-amber-200">
                          Use Camera (Verified Fresh)
                        </span>
                      </button>

                      {/* Option 2: Upload with EXIF Timestamp check */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-4 bg-white hover:bg-amber-100/60 border-2 border-dashed border-amber-300 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer text-center text-amber-950 group"
                      >
                        <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 group-hover:scale-110 transition-transform">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-sm">Upload from Gallery</span>
                        <span className="text-[10px] text-gray-500">
                          Automated EXIF Date Check
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* EXIF Validation Safeguard Card */}
                {exifResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                      exifResult.isValidForCurrentFestival
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-amber-50 border-amber-200 text-amber-950'
                    }`}
                  >
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        exifResult.isValidForCurrentFestival ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    />
                    <div className="space-y-0.5 text-[11px]">
                      <span className="font-bold block">
                        {exifResult.isValidForCurrentFestival
                          ? '✅ Safeguard Passed: Active Festival Photo'
                          : 'ℹ️ Photo Validation Notice'}
                      </span>
                      <p className="text-gray-700">{exifResult.message}</p>
                    </div>
                  </div>
                )}

                {/* Upvote & Crowdsource Explainer */}
                <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-950 flex items-start gap-2">
                  <ThumbsUp className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Community Confirmation:</strong> Uploaded photos can be upvoted by visitors. The photo with the most confirmations automatically becomes the main cover photo for {currentYear}.
                  </p>
                </div>

                {errorMessage && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}

                {/* Submit Action */}
                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading || isProcessing || !previewUrl}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Publishing Photo…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-yellow-300" />
                        <span>Submit {currentYear} Idol</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>

      {/* Live Camera Modal */}
      <LiveCameraModal
        isOpen={showLiveCamera}
        onClose={() => setShowLiveCamera(false)}
        onCapture={handleLiveCameraCapture}
        title={`Live Darshan Capture (${currentYear})`}
      />
    </>
  );
};
