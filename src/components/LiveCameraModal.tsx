import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, SwitchCamera, AlertCircle, Sparkles, Check } from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Take Live Idol Darshan Photo',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Stop camera tracks cleanly
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Start camera stream on mount or facingMode change
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      return;
    }

    let isMounted = true;
    const startCamera = async () => {
      stopCameraStream();
      setErrorMessage(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        setErrorMessage('Camera access is not supported on this browser.');
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setHasPermission(true);
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        if (!isMounted) return;
        setHasPermission(false);
        setErrorMessage(
          err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Please allow camera access in your browser settings.'
            : 'Unable to start camera. Please try another device or upload from gallery.'
        );
      }
    };

    startCamera();

    // Clean up event listeners, timers, and camera media streams
    return () => {
      isMounted = false;
      stopCameraStream();
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  const handleTakePhoto = () => {
    if (!videoRef.current || isCapturing) return;

    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const capturedFile = new File(
              [blob],
              `live_idol_${Date.now()}.jpg`,
              { type: 'image/jpeg', lastModified: Date.now() }
            );
            // Mark as live camera capture safeguard
            (capturedFile as any).isLiveCapture = true;

            stopCameraStream();
            onCapture(capturedFile);
            onClose();
          }
          setIsCapturing(false);
        },
        'image/jpeg',
        0.88
      );
    } else {
      setIsCapturing(false);
    }
  };

  const handleToggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-neutral-950 text-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-600 rounded-lg text-white">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-yellow-100">{title}</h3>
              <p className="text-[11px] text-neutral-400">Live Camera Safeguard • Real-time Idol Capture</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Viewport */}
        <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-black overflow-hidden flex items-center justify-center">
          {hasPermission === false ? (
            <div className="p-6 text-center space-y-3 max-w-xs">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-xs text-neutral-300">{errorMessage || 'Camera access error'}</p>
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  onClose();
                }}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold"
              >
                Close & Use File Upload
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Live Overlay Badge */}
              <div className="absolute top-3 left-3 bg-red-600/90 text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 backdrop-blur-xs">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>Live View</span>
              </div>

              {/* Idol Focus Frame / Framing Box */}
              <div className="absolute inset-8 sm:inset-12 border-2 border-amber-400/60 border-dashed rounded-2xl pointer-events-none flex flex-col items-center justify-between p-3">
                <span className="text-[10px] bg-black/60 text-amber-200 px-2 py-0.5 rounded-full font-medium">
                  Center Ganesh Idol in Frame
                </span>
                <span className="text-[10px] text-amber-300/80 font-mono">
                  🚩 Active Festival Season
                </span>
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleFacingMode}
            className="p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-2xl transition-colors cursor-pointer"
            title="Switch Camera (Front/Back)"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {/* Large Shutter Button */}
          <button
            type="button"
            onClick={handleTakePhoto}
            disabled={!hasPermission || isCapturing}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 p-1 shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center"
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-amber-950">
              <Camera className="w-6 h-6" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="text-xs text-neutral-400 hover:text-white px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
