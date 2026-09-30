import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Trash2,
  Camera,
  Image as ImageIcon,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Phone,
  MapPin,
  Utensils,
  ChevronRight,
  Eye,
  Info,
  RotateCcw,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { LocationPicker } from './LocationPicker';
import { compressImageFile, getInstantPreviewUrl } from '../utils/imageCompressor';
import { checkDuplicateLocation, DuplicateCheckResult } from '../utils/duplicateDetector';
import { PANDALS_DATA } from '../data/pandals';
import { Pandal } from '../types';
import { UpdateIdolModal } from './UpdateIdolModal';
import { extractExifDateTime } from '../utils/exifValidator';
import { sanitizeText } from '../utils/sanitizer';
import { checkRateLimit } from '../utils/rateLimiter';

interface NewSubmissionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  livePandals?: Pandal[];
}

const DRAFT_STORAGE_KEY = 'bappa_pandal_submission_draft';

export const NewSubmissionForm: React.FC<NewSubmissionFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  livePandals = [],
}) => {
  // Photo States: Explicit Ganesha Photo (Cover) + Pandal Setup Photo + Additional Photos
  const [ganeshaPhoto, setGaneshaPhoto] = useState<string | null>(null);
  const [pandalPhoto, setPandalPhoto] = useState<string | null>(null);
  const [additionalPhotos, setAdditionalPhotos] = useState<string[]>([]);
  const [isUploadingGanesha, setIsUploadingGanesha] = useState(false);
  const [isUploadingPandal, setIsUploadingPandal] = useState(false);
  const [isUploadingAdditional, setIsUploadingAdditional] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'ganesha' | 'pandal'>('ganesha');

  // Form Fields
  const [name, setName] = useState('');
  const [associationName, setAssociationName] = useState('');
  const [phone, setPhone] = useState('');
  const [latitude, setLatitude] = useState<number>(17.3850);
  const [longitude, setLongitude] = useState<number>(78.4867);
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('Hyderabad Central');
  const [city, setCity] = useState('Hyderabad');

  // Annadhanam & Nimajjanam
  const [isOnlyAnnadanam, setIsOnlyAnnadanam] = useState(false);
  const [annadanamDate, setAnnadanamDate] = useState('');
  const [servingTime, setServingTime] = useState('');
  const [nimajjanamDate, setNimajjanamDate] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submittedPandalName, setSubmittedPandalName] = useState('');
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable File input refs
  const ganeshaGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const ganeshaCameraInputRef = useRef<HTMLInputElement | null>(null);
  const pandalGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const pandalCameraInputRef = useRef<HTMLInputElement | null>(null);
  const additionalGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const additionalCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Guards against camera return click flickering / modal backdrop dismissals
  const lastCameraCloseTimeRef = useRef<number>(0);
  const isBackdropMouseDownRef = useRef<boolean>(false);

  // Duplicate Pin Detection State
  const [existingPandalForPhotoModal, setExistingPandalForPhotoModal] = useState<Pandal | null>(null);
  const [existingSubmissions, setExistingSubmissions] = useState<any[]>([]);
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult>({
    isDuplicate: false,
    type: null,
    message: '',
    matchedPandal: null,
    allMatches: [],
    matchCount: 0,
    liveMatches: [],
    suggestedMatches: [],
  });
  const [submittedDuplicateInfo, setSubmittedDuplicateInfo] = useState<DuplicateCheckResult | null>(null);

  // Fetch pending & approved submissions from Firestore when modal is opened for duplicate checking
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const loadSubmissions = async () => {
      try {
        const snap = await getDocs(collection(db, 'submissions'));
        if (isMounted) {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          setExistingSubmissions(list);
        }
      } catch (e) {
        console.warn('Failed to load submissions for duplicate checking:', e);
      }
    };
    loadSubmissions();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Real-time duplicate coordinate check against live pandals & pending submissions
  useEffect(() => {
    if (!latitude || !longitude) {
      setDuplicateCheck({
        isDuplicate: false,
        type: null,
        message: '',
        matchedPandal: null,
        allMatches: [],
        matchCount: 0,
        liveMatches: [],
        suggestedMatches: [],
      });
      return;
    }
    const result = checkDuplicateLocation(
      latitude,
      longitude,
      livePandals && livePandals.length > 0 ? livePandals : PANDALS_DATA,
      existingSubmissions
    );
    setDuplicateCheck(result);
  }, [latitude, longitude, livePandals, existingSubmissions]);

  // Cleanup auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  // Restore draft from storage whenever modal opens (protects against mobile browser camera refreshes)
  // Always reset submitSuccess and submitError so opening modal is never blocked
  useEffect(() => {
    if (!isOpen) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      setSubmitSuccess(false);
      setSubmitError(null);
      return;
    }

    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    setSubmitSuccess(false);
    setSubmitError(null);

    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.name) setName(draft.name);
        if (draft.associationName) setAssociationName(draft.associationName);
        if (draft.phone) setPhone(draft.phone);
        if (draft.latitude) setLatitude(draft.latitude);
        if (draft.longitude) setLongitude(draft.longitude);
        if (draft.address) setAddress(draft.address);
        if (draft.area) setArea(draft.area);
        if (draft.city) setCity(draft.city);
        if (draft.ganeshaPhoto) setGaneshaPhoto(draft.ganeshaPhoto);
        if (draft.pandalPhoto) setPandalPhoto(draft.pandalPhoto);
        if (draft.additionalPhotos) setAdditionalPhotos(draft.additionalPhotos);
        if (draft.annadanamDate) setAnnadanamDate(draft.annadanamDate);
        if (draft.servingTime) setServingTime(draft.servingTime);
        if (draft.nimajjanamDate) setNimajjanamDate(draft.nimajjanamDate);
        if (draft.additionalDetails) setAdditionalDetails(draft.additionalDetails);
        if (draft.isOnlyAnnadanam) setIsOnlyAnnadanam(draft.isOnlyAnnadanam);
      }
    } catch (e) {
      console.warn('Could not restore draft:', e);
    }
  }, [isOpen]);

  // Save draft whenever important fields change (skip if submission just succeeded)
  useEffect(() => {
    if (submitSuccess) return;
    if (!name && !associationName && !ganeshaPhoto && !pandalPhoto) return;
    try {
      const draft = {
        name,
        associationName,
        phone,
        latitude,
        longitude,
        address,
        area,
        city,
        ganeshaPhoto,
        pandalPhoto,
        additionalPhotos,
        annadanamDate,
        servingTime,
        nimajjanamDate,
        additionalDetails,
        isOnlyAnnadanam,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      // storage full or disabled
    }
  }, [
    submitSuccess,
    name,
    associationName,
    phone,
    latitude,
    longitude,
    address,
    area,
    city,
    ganeshaPhoto,
    pandalPhoto,
    additionalPhotos,
    annadanamDate,
    servingTime,
    nimajjanamDate,
    additionalDetails,
    isOnlyAnnadanam,
  ]);

  const resetForm = () => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (e) {}
    setName('');
    setAssociationName('');
    setPhone('');
    setAddress('');
    setLatitude(17.3850);
    setLongitude(78.4867);
    setArea('Hyderabad Central');
    setCity('Hyderabad');
    setGaneshaPhoto(null);
    setPandalPhoto(null);
    setAdditionalPhotos([]);
    setAnnadanamDate('');
    setServingTime('');
    setNimajjanamDate('');
    setAdditionalDetails('');
    setIsOnlyAnnadanam(false);
    setPhotoError(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmittedPandalName('');
    setSubmittedDuplicateInfo(null);
  };

  const clearDraft = () => {
    resetForm();
  };

  if (!isOpen) return null;

  // Convert File to Base64 Data URL (permanent, works across all browsers and sessions)
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Sanitize image URLs before Firestore save (convert blob: URLs to Base64)
  const sanitizePhotoUrl = async (url: string | null): Promise<string> => {
    if (!url) return '';
    if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('blob:')) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch {
        return '';
      }
    }
    return url;
  };

  // Fast non-blocking background upload to Firebase Storage (with strict 2s timeout, never hangs or throws)
  const uploadCompressedBlob = async (blob: Blob, folder: string): Promise<string | null> => {
    try {
      const fileExt = 'jpg';
      const storageRef = ref(storage, `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${fileExt}`);
      const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timed out')), 2000)
      );
      await Promise.race([uploadTask, timeoutPromise]);
      const storageUrl = await Promise.race([
        getDownloadURL(storageRef),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('URL timed out')), 1500)),
      ]);
      return storageUrl || null;
    } catch {
      return null;
    }
  };

  // Safe camera & gallery openers that always reset value to guarantee change events fire on first click
  const openGaneshaCamera = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (ganeshaCameraInputRef.current) {
      ganeshaCameraInputRef.current.value = '';
      ganeshaCameraInputRef.current.click();
    }
  };

  const openGaneshaGallery = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (ganeshaGalleryInputRef.current) {
      ganeshaGalleryInputRef.current.value = '';
      ganeshaGalleryInputRef.current.click();
    }
  };

  const openPandalCamera = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (pandalCameraInputRef.current) {
      pandalCameraInputRef.current.value = '';
      pandalCameraInputRef.current.click();
    }
  };

  const openPandalGallery = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (pandalGalleryInputRef.current) {
      pandalGalleryInputRef.current.value = '';
      pandalGalleryInputRef.current.click();
    }
  };

  const openAdditionalCamera = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (additionalCameraInputRef.current) {
      additionalCameraInputRef.current.value = '';
      additionalCameraInputRef.current.click();
    }
  };

  const openAdditionalGallery = () => {
    lastCameraCloseTimeRef.current = Date.now();
    if (additionalGalleryInputRef.current) {
      additionalGalleryInputRef.current.value = '';
      additionalGalleryInputRef.current.click();
    }
  };

  // Handle Ganesha Idol Photo Selection (Cover Photo) — Instant preview in 0ms + Rapid In-Browser Compression
  const handleGaneshaPhotoSelect = async (files: FileList | null) => {
    lastCameraCloseTimeRef.current = Date.now();
    if (!files || files.length === 0) return;
    const file = files[0];
    const isImage = !file.type || file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name);
    if (!isImage) {
      setPhotoError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    setPhotoError(null);
    setIsUploadingGanesha(true);

    // 1. Instant 0ms Object URL preview: displays immediately when camera confirms photo!
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      setGaneshaPhoto(objectUrl);
      setPreviewTab('ganesha');
    } catch {
      // Fallback
    }

    try {
      // 2. High-speed in-browser compression (~25ms)
      const compressed = await compressImageFile(file, { maxDimension: 960, quality: 0.75 });
      if (compressed.dataUrl) {
        setGaneshaPhoto(compressed.dataUrl);
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      // 3. Fast non-blocking background cloud upload (never blocks UI)
      uploadCompressedBlob(compressed.blob, 'mandapams')
        .then((cloudUrl) => {
          if (cloudUrl && !cloudUrl.startsWith('blob:')) {
            setGaneshaPhoto(cloudUrl);
          }
        })
        .catch(() => {});
    } catch (err) {
      console.warn('Compression fallback:', err);
      const b64 = await convertFileToBase64(file);
      if (b64) setGaneshaPhoto(b64);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } finally {
      setIsUploadingGanesha(false);
      if (ganeshaGalleryInputRef.current) ganeshaGalleryInputRef.current.value = '';
      if (ganeshaCameraInputRef.current) ganeshaCameraInputRef.current.value = '';
      lastCameraCloseTimeRef.current = Date.now();
    }
  };

  // Handle Pandal Setup Photo Selection — Instant 0ms preview + Rapid In-Browser Compression
  const handlePandalPhotoSelect = async (files: FileList | null) => {
    lastCameraCloseTimeRef.current = Date.now();
    if (!files || files.length === 0) return;
    const file = files[0];
    const isImage = !file.type || file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name);
    if (!isImage) {
      setPhotoError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    setPhotoError(null);
    setIsUploadingPandal(true);

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      setPandalPhoto(objectUrl);
    } catch {}

    try {
      const compressed = await compressImageFile(file, { maxDimension: 960, quality: 0.75 });
      if (compressed.dataUrl) {
        setPandalPhoto(compressed.dataUrl);
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      uploadCompressedBlob(compressed.blob, 'mandapams')
        .then((cloudUrl) => {
          if (cloudUrl && !cloudUrl.startsWith('blob:')) {
            setPandalPhoto(cloudUrl);
          }
        })
        .catch(() => {});
    } catch (err) {
      const b64 = await convertFileToBase64(file);
      if (b64) setPandalPhoto(b64);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } finally {
      setIsUploadingPandal(false);
      if (pandalGalleryInputRef.current) pandalGalleryInputRef.current.value = '';
      if (pandalCameraInputRef.current) pandalCameraInputRef.current.value = '';
      lastCameraCloseTimeRef.current = Date.now();
    }
  };

  // Handle Additional Photos Selection (Max 3) — Parallel fast uploads
  const handleAdditionalPhotosSelect = async (files: FileList | null) => {
    lastCameraCloseTimeRef.current = Date.now();
    if (!files || files.length === 0) return;
    const remainingSlots = 3 - additionalPhotos.length;
    if (remainingSlots <= 0) {
      setPhotoError('You can add up to 3 additional gallery photos only.');
      return;
    }

    setPhotoError(null);
    const validFiles = Array.from(files)
      .filter((f) => !f.type || f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name))
      .slice(0, remainingSlots);

    if (validFiles.length === 0) return;
    setIsUploadingAdditional(true);

    // Instant object URLs for 0ms visual feedback
    const objectUrls = validFiles.map((f) => {
      try {
        return URL.createObjectURL(f);
      } catch {
        return '';
      }
    }).filter(Boolean);

    setAdditionalPhotos((prev) => [...prev, ...objectUrls].slice(0, 3));

    try {
      const compressedList = await Promise.all(
        validFiles.map(async (f) => {
          try {
            return await compressImageFile(f, { maxDimension: 960, quality: 0.75 });
          } catch {
            const b64 = await convertFileToBase64(f);
            return { blob: f, dataUrl: b64, width: 800, height: 600 };
          }
        })
      );

      const base64List = compressedList.map((c) => c.dataUrl).filter(Boolean);

      setAdditionalPhotos((prev) => {
        const withoutObjUrls = prev.filter((p) => !objectUrls.includes(p));
        return [...withoutObjUrls, ...base64List].slice(0, 3);
      });
      objectUrls.forEach((u) => URL.revokeObjectURL(u));

      // Optional background cloud upload
      Promise.all(
        compressedList.map((c) => uploadCompressedBlob(c.blob, 'mandapams'))
      ).then((cloudUrls) => {
        const validUrls = cloudUrls.filter((u): u is string => !!u && !u.startsWith('blob:'));
        if (validUrls.length > 0) {
          setAdditionalPhotos((prev) => {
            const withoutBase64 = prev.filter((p) => !base64List.includes(p));
            return [...withoutBase64, ...validUrls].slice(0, 3);
          });
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('Additional photos compression note:', err);
    } finally {
      setIsUploadingAdditional(false);
      if (additionalGalleryInputRef.current) additionalGalleryInputRef.current.value = '';
      if (additionalCameraInputRef.current) additionalCameraInputRef.current.value = '';
      lastCameraCloseTimeRef.current = Date.now();
    }
  };

  // Drag and Drop handlers for Ganesha photo
  const handleGaneshaDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleGaneshaPhotoSelect(e.dataTransfer.files);
    }
  };

  // Drag and Drop handlers for Pandal photo
  const handlePandalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePandalPhotoSelect(e.dataTransfer.files);
    }
  };

  const handleLocationChange = (
    newLat: number,
    newLng: number,
    newAddress: string,
    newArea?: string,
    newCity?: string
  ) => {
    setLatitude(newLat);
    setLongitude(newLng);
    setAddress(newAddress);
    if (newArea) setArea(newArea);
    if (newCity) setCity(newCity);
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Rate Limit Guard against bot spam
    const rateCheck = checkRateLimit('pandal_submission', 3, 60000);
    if (!rateCheck.allowed) {
      setSubmitError(`Submission rate limit reached. Please wait ${rateCheck.retryAfterSec} seconds before submitting again.`);
      return;
    }

    // Input Sanitization
    const sanitizedName = sanitizeText(name);
    const sanitizedAssoc = sanitizeText(associationName);
    const sanitizedAddr = sanitizeText(address);
    const sanitizedAreaName = sanitizeText(area);
    const sanitizedCityName = sanitizeText(city);
    const sanitizedDesc = sanitizeText(additionalDetails);

    // Validation
    if (!sanitizedName.trim()) {
      setSubmitError('Pandal name is required.');
      return;
    }

    if (!sanitizedAssoc.trim()) {
      setSubmitError('Association / Mandal name is required.');
      return;
    }

    // Optional 10-digit Indian phone number validation
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone && (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone))) {
      setSubmitError('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210), or leave blank.');
      return;
    }

    if (!address.trim() || address.trim().length < 5) {
      setSubmitError('Please set an exact address on the map.');
      return;
    }

    if (isOnlyAnnadanam && !annadanamDate) {
      setSubmitError('Annadhanam date is mandatory when submitting an Annadhanam pandal.');
      return;
    }

    setSubmitting(true);
    try {
      const submissionId = 'pandal_' + Date.now();
      const user = auth.currentUser;
      const savedMobile = (() => {
        try {
          const m = localStorage.getItem('bappa_mobile_user');
          return m ? JSON.parse(m)?.mobile : null;
        } catch {
          return null;
        }
      })();

      const submittedBy = user
        ? user.uid
        : cleanPhone
        ? `mob_${cleanPhone}`
        : savedMobile
        ? `mob_${savedMobile}`
        : `sub_${Date.now()}`;

      // Sanitize all photos (ensure no blob: URLs enter Firestore)
      const sanitizedGanesha = await sanitizePhotoUrl(ganeshaPhoto);
      const sanitizedPandal = await sanitizePhotoUrl(pandalPhoto);
      const sanitizedAdditional = await Promise.all(additionalPhotos.map(p => sanitizePhotoUrl(p)));

      const allPhotos = [
        sanitizedGanesha,
        sanitizedPandal,
        ...sanitizedAdditional,
      ].filter((p): p is string => typeof p === 'string' && p.length > 0);

      const defaultCover = 'https://images.unsplash.com/photo-1567591414240-e2ffad27b3fa?auto=format&fit=crop&w=800&q=80';
      const primaryCover = sanitizedGanesha || sanitizedPandal || (allPhotos.length > 0 ? allPhotos[0] : defaultCover);

      // Verify duplicate pin location at time of submission
      const finalDupCheck = checkDuplicateLocation(
        latitude,
        longitude,
        livePandals && livePandals.length > 0 ? livePandals : PANDALS_DATA,
        existingSubmissions
      );
      setSubmittedDuplicateInfo(finalDupCheck.isDuplicate ? finalDupCheck : null);

      const submissionData = {
        id: submissionId,
        name: sanitizedName.trim(),
        associationName: sanitizedAssoc.trim(),
        committeeName: sanitizedAssoc.trim(),
        phone: cleanPhone,
        contactInfo: cleanPhone,
        contactNumber: cleanPhone,
        address: sanitizedAddr.trim().slice(0, 300),
        area: sanitizedAreaName.trim().slice(0, 100) || 'Hyderabad Central',
        city: sanitizedCityName.trim().slice(0, 50) || 'Hyderabad',
        latitude,
        longitude,
        ganeshaImage: sanitizedGanesha || '',
        pandalImage: sanitizedPandal || '',
        image: primaryCover, // Primary cover photo is the image of Ganesha
        photos: allPhotos.length > 0 ? allPhotos : [defaultCover],
        extraImages: allPhotos.filter((img) => img !== primaryCover),
        annadanamDate: annadanamDate || '',
        servingTime: sanitizeText(servingTime.trim()),
        isOnlyAnnadanam: !!isOnlyAnnadanam,
        nimajjanamDate: nimajjanamDate || '',
        description: sanitizedDesc.trim().slice(0, 1000) || '',
        status: 'pending',
        isDuplicate: finalDupCheck.isDuplicate,
        duplicateType: finalDupCheck.type || null,
        duplicateMessage: finalDupCheck.message || '',
        duplicateOfId: finalDupCheck.matchedPandal?.id || '',
        duplicateOfName: finalDupCheck.matchedPandal?.name || '',
        duplicateDistanceMeters: finalDupCheck.matchedPandal?.distanceMeters ?? 0,
        submittedBy,
        submittedByEmail: user?.email || '',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'submissions', submissionId), submissionData);

      // Save submitted name for thank-you display before clearing state
      setSubmittedPandalName(name.trim());
      setSubmitSuccess(true);

      // Clear draft storage and reset all form inputs so next suggestion starts with a clean slate
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (e) {}
      setName('');
      setAssociationName('');
      setPhone('');
      setAddress('');
      setLatitude(17.3850);
      setLongitude(78.4867);
      setArea('Hyderabad Central');
      setCity('Hyderabad');
      setGaneshaPhoto(null);
      setPandalPhoto(null);
      setAdditionalPhotos([]);
      setAnnadanamDate('');
      setServingTime('');
      setNimajjanamDate('');
      setAdditionalDetails('');
      setIsOnlyAnnadanam(false);
      setPhotoError(null);
      setSubmitError(null);

      onSuccess();

      // Auto close after 6 seconds if no interaction
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        setSubmitSuccess(false);
        onClose();
      }, 6000);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setSubmitError(err.message || 'Failed to submit pandal. Please check network connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto select-auto"
      onMouseDown={(e) => {
        // Track whether user explicitly pressed down on the backdrop (not inside modal or camera dialog)
        isBackdropMouseDownRef.current = (e.target === e.currentTarget);
      }}
      onClick={(e) => {
        // Prevent accidental dismissals within 800ms of camera closing or returning to browser
        if (Date.now() - lastCameraCloseTimeRef.current < 800) {
          return;
        }
        if (e.target === e.currentTarget && isBackdropMouseDownRef.current) {
          if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
          setSubmitSuccess(false);
          onClose();
        }
      }}
    >
      {/* Stable Global Hidden File Inputs (Kept in active DOM without display:none to guarantee change events fire on 1st click on all mobile devices) */}
      <input
        type="file"
        ref={ganeshaGalleryInputRef}
        accept="image/*"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handleGaneshaPhotoSelect(e.target.files);
        }}
      />
      <input
        type="file"
        ref={ganeshaCameraInputRef}
        accept="image/*"
        capture="environment"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handleGaneshaPhotoSelect(e.target.files);
        }}
      />

      <input
        type="file"
        ref={pandalGalleryInputRef}
        accept="image/*"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handlePandalPhotoSelect(e.target.files);
        }}
      />
      <input
        type="file"
        ref={pandalCameraInputRef}
        accept="image/*"
        capture="environment"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handlePandalPhotoSelect(e.target.files);
        }}
      />

      <input
        type="file"
        ref={additionalGalleryInputRef}
        multiple
        accept="image/*"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handleAdditionalPhotosSelect(e.target.files);
        }}
      />
      <input
        type="file"
        ref={additionalCameraInputRef}
        accept="image/*"
        capture="environment"
        className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none -z-50 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          handleAdditionalPhotosSelect(e.target.files);
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col relative"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-800 via-amber-700 to-amber-800 text-white px-6 py-4 flex items-center justify-between border-b border-amber-600/40 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-900/60 rounded-xl border border-amber-500/40 text-yellow-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-yellow-100">
                Add Your Mandapam
              </h2>
              <p className="text-xs text-amber-200">
                Free listing on Bappa Locator • Reaching thousands of devotees
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(name || associationName || ganeshaPhoto || pandalPhoto) && (
              <button
                type="button"
                onClick={clearDraft}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-amber-200 hover:text-white hover:bg-amber-700/60 transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear form"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                setSubmitSuccess(false);
                onClose();
              }}
              className="p-2 rounded-xl text-amber-200 hover:text-white hover:bg-amber-700/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Screen */}
        {submitSuccess ? (
          <div className="p-8 sm:p-12 text-center space-y-6 my-auto max-w-lg mx-auto">
            {submittedDuplicateInfo?.isDuplicate ? (
              <>
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce ${
                    submittedDuplicateInfo.type === 'live'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-amber-700'
                  }`}
                >
                  {submittedDuplicateInfo.type === 'live' ? (
                    <AlertTriangle className="w-10 h-10" />
                  ) : (
                    <Clock className="w-10 h-10" />
                  )}
                </div>
                <div className="space-y-2">
                  <span
                    className={`inline-block text-xs font-black uppercase px-3 py-1 rounded-full shadow-2xs ${
                      submittedDuplicateInfo.type === 'live'
                        ? 'bg-red-600 text-white'
                        : 'bg-yellow-400 text-amber-950'
                    }`}
                  >
                    {submittedDuplicateInfo.type === 'live'
                      ? '🚩 This pandal is already live'
                      : '⏳ This pandal is already suggested'}
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                    {submittedDuplicateInfo.type === 'live'
                      ? 'Pandal Already Live!'
                      : 'Pandal Already Suggested!'}
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Ganpati Bappa Morya! {submittedDuplicateInfo.type === 'live'
                      ? `A pandal at this exact pin location is already live on Bappa Locator as `
                      : `A pandal at this pin location is already suggested and under review as `}
                    <strong className="text-amber-950 font-bold underline decoration-amber-400">
                      "{submittedDuplicateInfo.matchedPandal?.name}"
                    </strong>.
                  </p>
                  <p className="text-xs text-gray-600 bg-amber-50/80 p-3 rounded-xl border border-amber-200/80 leading-relaxed">
                    Your request for <strong>"{submittedPandalName || 'pandal'}"</strong> has been saved and flagged as a <strong>duplicate</strong> to the admin team for review.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Mandapam Submitted!</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Ganpati Bappa Morya! Your mandapam{' '}
                    <span className="font-bold text-amber-900">
                      {submittedPandalName || 'entry'}
                    </span>{' '}
                    has been submitted for review. It will go live once verified by our team.
                  </p>
                </div>
              </>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                  resetForm();
                }}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Suggest Another Pandal/Mandap</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
                  resetForm();
                  onClose();
                }}
                className="w-full sm:w-auto px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Back to Map
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Column */}
              <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
                {/* 1. PANDAL INFORMATION */}
                <div className="space-y-4 bg-amber-50/30 p-5 rounded-2xl border border-amber-200/60">
                  <h3 className="text-sm font-bold text-amber-950">Pandal Information</h3>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Secunderabad Ka Raja"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                      required
                    />
                  </div>

                  {/* Association Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700">
                      Association name *
                    </label>
                    <input
                      type="text"
                      value={associationName}
                      onChange={(e) => setAssociationName(e.target.value)}
                      placeholder="e.g. Balapur Youth Ganesh Mandal"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                      required
                    />
                  </div>

                  {/* Contact Phone (Optional) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-700">
                        Contact phone
                      </label>
                      <span className="text-[11px] font-medium text-gray-400">Optional</span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-sm font-semibold text-gray-500">
                        +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="10-digit mobile number (optional)"
                        className="w-full pl-12 pr-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Optional: Devotees can contact for queries and darshan timings.
                    </p>
                  </div>
                </div>

                {/* 2. LOCATION & MAP PICKER */}
                <LocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  address={address}
                  onLocationChange={handleLocationChange}
                />

                {/* Duplicate Pin Location Warning Banner */}
                {duplicateCheck.isDuplicate && (
                  <div
                    className={`p-4 rounded-2xl border-2 flex items-start gap-3 shadow-xs transition-all animate-in fade-in duration-200 ${
                      duplicateCheck.type === 'live'
                        ? 'bg-red-50/95 border-red-300 text-red-950'
                        : 'bg-amber-50/95 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        duplicateCheck.type === 'live'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {duplicateCheck.type === 'live' ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-2xs ${
                            duplicateCheck.type === 'live'
                              ? 'bg-red-600 text-white'
                              : 'bg-yellow-400 text-amber-950'
                          }`}
                        >
                          {duplicateCheck.type === 'live'
                            ? '🚩 This pandal is already live'
                            : '⏳ This pandal is already suggested'}
                        </span>
                        <span className="text-[11px] font-bold text-gray-700">
                          {duplicateCheck.matchedPandal?.distanceMeters === 0
                            ? 'Exact pin match'
                            : `Within ~${duplicateCheck.matchedPandal?.distanceMeters}m of existing pin`}
                        </span>
                      </div>
                      <p className="font-extrabold text-sm text-gray-900 leading-snug">
                        "{duplicateCheck.matchedPandal?.name}" {duplicateCheck.type === 'live' ? 'is already live and active on Bappa Locator!' : 'has already been suggested and is pending approval.'}
                      </p>
                      {duplicateCheck.matchedPandal?.address && (
                        <p className="text-gray-600 truncate">
                          Address: {duplicateCheck.matchedPandal.address}
                        </p>
                      )}
                      <p className="text-gray-700 font-medium">
                        {duplicateCheck.type === 'live'
                          ? 'Devotees can already locate this pandal on the map. You can add your photo directly to this live pandal or confirm this is a distinct mandapam.'
                          : 'Our team is already reviewing this location. You can update photo or proceed if this is a distinct mandapam.'}
                      </p>

                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        {duplicateCheck.matchedPandal && (
                          <button
                            type="button"
                            onClick={() => {
                              const matched = duplicateCheck.matchedPandal;
                              if (!matched) return;
                              const p = (livePandals && livePandals.find(x => x.id === matched.id)) || (PANDALS_DATA.find(x => x.id === matched.id)) || {
                                id: matched.id,
                                name: matched.name,
                                address: matched.address || '',
                                area: matched.area || '',
                                city: 'Hyderabad',
                                latitude: matched.latitude,
                                longitude: matched.longitude,
                              } as Pandal;
                              setExistingPandalForPhotoModal(p);
                            }}
                            className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Add Photo to Existing Pandal</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setDuplicateCheck(prev => ({ ...prev, isDuplicate: false }));
                          }}
                          className="px-3.5 py-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-xl font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Confirm it is a distinct new entry</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. PHOTOS SECTION: Ganesha Idol (Cover) + Pandal Setup + Gallery */}
                <div className="space-y-4">
                  {/* Photo 1: Lord Ganesha Idol (Cover Photo) */}
                  <div className="space-y-3 bg-amber-50/40 p-5 rounded-2xl border-2 border-amber-300/80 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                          <span>🚩</span>
                          <span>Image of Lord Ganesha (Idol / Murti) *</span>
                          <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Cover Photo
                          </span>
                        </h3>
                        <p className="text-xs text-amber-900/80 mt-0.5">
                          Main picture of Lord Ganesh displayed on cards, map pins & search results.
                        </p>
                      </div>

                      {!ganeshaPhoto && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaCamera();
                            }}
                            disabled={isUploadingGanesha}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaGallery();
                            }}
                            disabled={isUploadingGanesha}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Gallery</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {ganeshaPhoto ? (
                      <div className="relative w-full h-56 rounded-2xl overflow-hidden border-2 border-amber-400 group shadow-md bg-black/5">
                        <img
                          src={ganeshaPhoto}
                          alt="Lord Ganesha Idol Cover Preview"
                          className="w-full h-full object-cover"
                        />
                        {/* Hover Overlay for Desktop */}
                        <div className="hidden sm:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaCamera();
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Retake</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaGallery();
                            }}
                            className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-bold shadow hover:bg-gray-100 flex items-center gap-1 cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Change</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setGaneshaPhoto(null);
                            }}
                            className="p-1.5 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 cursor-pointer"
                            title="Remove photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Direct Mobile Touch Buttons (Always easily accessible on phones) */}
                        <div className="sm:hidden absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-xs p-1 rounded-xl shadow-lg">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaCamera();
                            }}
                            className="px-2.5 py-1 bg-amber-600 active:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Retake</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openGaneshaGallery();
                            }}
                            className="px-2.5 py-1 bg-white text-gray-800 rounded-lg text-[11px] font-bold shadow active:bg-gray-100 flex items-center gap-1 cursor-pointer"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>Change</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setGaneshaPhoto(null);
                            }}
                            className="p-1.5 bg-red-600 active:bg-red-700 text-white rounded-lg shadow cursor-pointer"
                            title="Remove photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="absolute top-2 left-2 bg-amber-900/90 text-yellow-300 text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow flex items-center gap-1">
                          <span>🚩 Cover Photo: Lord Ganesha Idol</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={handleGaneshaDrop}
                        className="border-2 border-dashed border-amber-400/90 rounded-2xl p-5 flex flex-col items-center justify-center bg-white/80 text-center hover:bg-amber-50/50 transition-colors"
                      >
                        {isUploadingGanesha ? (
                          <div className="flex flex-col items-center py-4">
                            <Loader2 className="w-8 h-8 text-amber-700 animate-spin" />
                            <span className="text-xs font-medium text-amber-800 mt-2">
                              Uploading Ganesha picture…
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3 mb-2.5">
                              <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-xs">
                                <Camera className="w-5 h-5" />
                              </div>
                              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl border border-amber-200 shadow-xs">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            </div>
                            <span className="text-sm font-bold text-amber-950">
                              Upload Lord Ganesha Idol Photo
                            </span>
                            <p className="text-xs text-gray-500 mt-1 mb-3.5 max-w-xs">
                              Snap Lord Ganesh at the pandal or choose a clear idol photo from gallery.
                            </p>
                            <div className="flex items-center justify-center gap-2.5 w-full max-w-xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openGaneshaCamera();
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                              >
                                <Camera className="w-4 h-4" />
                                <span>Take Photo</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openGaneshaGallery();
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                              >
                                <ImageIcon className="w-4 h-4" />
                                <span>From Gallery</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Photo 2: Pandal / Stage / Decoration Photo */}
                  <div className="space-y-3 bg-amber-50/20 p-5 rounded-2xl border border-amber-200/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                          <span>🎪</span>
                          <span>Image of Pandal (Setup, Lighting & Stage)</span>
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                            Recommended
                          </span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Show the grand entrance, theme, stage decoration, or lighting architecture.
                        </p>
                      </div>

                      {!pandalPhoto && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalCamera();
                            }}
                            disabled={isUploadingPandal}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalGallery();
                            }}
                            disabled={isUploadingPandal}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Gallery</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {pandalPhoto ? (
                      <div className="relative w-full h-48 rounded-2xl overflow-hidden border border-amber-300 group shadow-sm bg-black/5">
                        <img
                          src={pandalPhoto}
                          alt="Pandal Setup Preview"
                          className="w-full h-full object-cover"
                        />
                        {/* Hover Overlay for Desktop */}
                        <div className="hidden sm:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalCamera();
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Retake</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalGallery();
                            }}
                            className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-bold shadow hover:bg-gray-100 flex items-center gap-1 cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Change</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPandalPhoto(null);
                            }}
                            className="p-1.5 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 cursor-pointer"
                            title="Remove photo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Direct Mobile Touch Buttons */}
                        <div className="sm:hidden absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-xs p-1 rounded-xl shadow-lg">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalCamera();
                            }}
                            className="px-2.5 py-1 bg-amber-600 active:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Retake</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openPandalGallery();
                            }}
                            className="px-2.5 py-1 bg-white text-gray-800 rounded-lg text-[11px] font-bold shadow active:bg-gray-100 flex items-center gap-1 cursor-pointer"
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span>Change</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPandalPhoto(null);
                            }}
                            className="p-1.5 bg-red-600 active:bg-red-700 text-white rounded-lg shadow cursor-pointer"
                            title="Remove photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                          🎪 Pandal Setup & Stage
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={handlePandalDrop}
                        className="border-2 border-dashed border-amber-200 rounded-2xl p-4 flex flex-col items-center justify-center bg-white/60 text-center hover:bg-amber-50/40 transition-colors"
                      >
                        {isUploadingPandal ? (
                          <div className="flex flex-col items-center py-3">
                            <Loader2 className="w-7 h-7 text-amber-700 animate-spin" />
                            <span className="text-xs font-medium text-amber-800 mt-1">
                              Uploading pandal photo…
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-bold text-gray-700 mb-1">
                              Add Photo of Pandal Stage or Entrance (Optional)
                            </span>
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openPandalCamera();
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Camera</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openPandalGallery();
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Gallery</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Photo 3: More gallery photos (optional, up to 3) */}
                  <div className="space-y-2 bg-amber-50/20 p-4 rounded-2xl border border-amber-200/60">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
                          <span>More photos (optional, max 3)</span>
                        </label>
                        <span className="text-[11px] text-gray-500 block">
                          {additionalPhotos.length}/3 added
                        </span>
                      </div>

                      {additionalPhotos.length < 3 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openAdditionalCamera();
                            }}
                            disabled={isUploadingAdditional}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openAdditionalGallery();
                            }}
                            disabled={isUploadingAdditional}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Gallery</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {additionalPhotos.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl overflow-hidden border border-amber-200 group shadow-xs"
                        >
                          <img
                            src={url}
                            alt={`Additional ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setAdditionalPhotos((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full opacity-90 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {additionalPhotos.length < 3 && (
                        <button
                          type="button"
                          disabled={isUploadingAdditional}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAdditionalGallery();
                          }}
                          className="border-2 border-dashed border-amber-300 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-amber-100/60 transition-colors text-amber-800 bg-white/70 cursor-pointer disabled:opacity-50"
                          title="Add more photos"
                        >
                          <ImageIcon className="w-4 h-4 text-amber-600 mb-0.5" />
                          <span className="text-[10px] font-bold">+ Add</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {photoError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {photoError}
                    </p>
                  )}
                </div>

                {/* 4. ANNADHANAM DETAILS */}
                <div className="space-y-4 bg-amber-50/30 p-5 rounded-2xl border border-amber-200/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                        <Utensils className="w-4 h-4 text-amber-700" />
                        Annadhanam (Free Meals)
                      </h3>
                      <p className="text-xs text-gray-500">
                        Let devotees know when free prasadam/meals are served.
                      </p>
                    </div>

                    {/* Only serving free meals toggle */}
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={isOnlyAnnadanam}
                        onChange={(e) => setIsOnlyAnnadanam(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-amber-950">
                        Only Annadhanam
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Annadhanam Date */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-700" />
                        Annadhanam date
                      </label>
                      <input
                        type="date"
                        value={annadanamDate}
                        onChange={(e) => setAnnadanamDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                      />
                    </div>

                    {/* Serving Time */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        Serving time
                      </label>
                      <input
                        type="text"
                        value={servingTime}
                        onChange={(e) => setServingTime(e.target.value)}
                        placeholder="e.g. 12 PM – 3 PM"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. NIMAJJANAM DATE */}
                <div className="space-y-1 bg-amber-50/30 p-5 rounded-2xl border border-amber-200/60">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-700" />
                    Nimajjanam date (optional)
                  </label>
                  <input
                    type="date"
                    value={nimajjanamDate}
                    onChange={(e) => setNimajjanamDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                  />
                  <p className="text-[11px] text-gray-500">
                    Day of immersion / procession.
                  </p>
                </div>

                {/* 6. ADDITIONAL DETAILS */}
                <div className="space-y-1 bg-amber-50/30 p-5 rounded-2xl border border-amber-200/60">
                  <label className="text-xs font-bold text-gray-700">
                    Additional details (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={additionalDetails}
                    onChange={(e) => setAdditionalDetails(e.target.value)}
                    placeholder="Special idol attractions, daily aarti timings, cultural programs, parking info…"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                  />
                </div>

                {/* Error Banner */}
                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || isUploadingGanesha || isUploadingPandal || isUploadingAdditional}
                  className="w-full py-4 px-6 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 active:scale-[0.99] text-white rounded-2xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting Mandapam…</span>
                    </>
                  ) : (
                    <>
                      <span>Submit — it's free</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              {/* Live Preview Column */}
              <div className="lg:col-span-5">
                <div className="sticky top-24 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                      <Eye className="w-4 h-4 text-amber-700" />
                      <span>This is how it'll look</span>
                    </div>

                    {/* Preview Switcher if multiple photos */}
                    {(ganeshaPhoto || pandalPhoto) && (
                      <div className="flex items-center gap-1 bg-amber-100 p-0.5 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPreviewTab('ganesha');
                          }}
                          className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                            previewTab === 'ganesha'
                              ? 'bg-amber-800 text-white shadow-2xs'
                              : 'text-amber-900 hover:text-amber-950'
                          }`}
                        >
                          🚩 Idol
                        </button>
                        {pandalPhoto && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPreviewTab('pandal');
                            }}
                            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                              previewTab === 'pandal'
                                ? 'bg-amber-800 text-white shadow-2xs'
                                : 'text-amber-900 hover:text-amber-950'
                            }`}
                          >
                            🎪 Pandal
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Preview */}
                  <div className="bg-white rounded-2xl border border-amber-200/90 shadow-xl overflow-hidden hover:shadow-2xl transition-shadow">
                    {/* Image Preview */}
                    <div className="relative h-52 bg-amber-100 overflow-hidden">
                      {(previewTab === 'pandal' && pandalPhoto ? pandalPhoto : ganeshaPhoto || pandalPhoto) ? (
                        <img
                          src={previewTab === 'pandal' && pandalPhoto ? pandalPhoto : (ganeshaPhoto || pandalPhoto)!}
                          alt="Mandapam preview"
                          className="w-full h-full object-cover transition-all duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-amber-800/60 p-4 text-center">
                          <span className="text-4xl mb-2">🚩</span>
                          <span className="text-xs font-bold text-amber-900">Lord Ganesha Cover Photo</span>
                          <span className="text-[11px] text-gray-500 mt-0.5">Uploaded idol photo will reflect here</span>
                        </div>
                      )}

                      {/* Photo Type Indicator Badge */}
                      <div className="absolute top-2 left-2 bg-amber-900/90 backdrop-blur-xs text-yellow-300 text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow flex items-center gap-1">
                        {previewTab === 'pandal' && pandalPhoto ? (
                          <span>🎪 Pandal Setup</span>
                        ) : ganeshaPhoto ? (
                          <span>🚩 Cover: Lord Ganesha Idol</span>
                        ) : (
                          <span>{city || 'Hyderabad'}</span>
                        )}
                      </div>

                      {/* City Badge Top Right */}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                        {city || 'Hyderabad'}
                      </div>

                      {/* Photo count badge */}
                      {(additionalPhotos.length > 0 || (ganeshaPhoto && pandalPhoto)) && (
                        <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                          <Camera className="w-3 h-3 text-yellow-400" />
                          <span>
                            {1 + additionalPhotos.length + (ganeshaPhoto && pandalPhoto ? 1 : 0)} photos
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="p-4 space-y-2.5">
                      <div>
                        <h4 className="font-extrabold text-base text-gray-900 leading-tight">
                          {name.trim() || 'Secunderabad Ka Raja'}
                        </h4>
                        <p className="text-xs font-semibold text-amber-800">
                          {associationName.trim() || 'Balapur Youth Ganesh Mandal'}
                        </p>
                      </div>

                      {/* Address */}
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {address.trim() || 'Address detected from map pin will appear here.'}
                        </span>
                      </div>

                      {/* Annadhanam pill */}
                      {annadanamDate && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs flex items-center gap-2 text-amber-900">
                          <Utensils className="w-4 h-4 text-amber-700 shrink-0" />
                          <div className="leading-tight">
                            <span className="font-bold">Annadhanam: </span>
                            <span>{annadanamDate}</span>
                            {servingTime && (
                              <span className="text-gray-600"> ({servingTime})</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Nimajjanam pill */}
                      {nimajjanamDate && (
                        <div className="bg-yellow-50/80 border border-yellow-200 rounded-lg p-2 text-xs flex items-center gap-2 text-yellow-950">
                          <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                          <span className="leading-tight">
                            <span className="font-bold">Nimajjanam: </span>
                            {nimajjanamDate}
                          </span>
                        </div>
                      )}

                      {/* Contact button preview */}
                      {phone && (
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                          <span className="text-gray-500 flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-amber-700" />
                            +91 {phone}
                          </span>
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                            Verified
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Informational Note */}
                  <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      After submitting, your mandapam goes into review. Once approved by the administrator, it will be visible on the interactive map and directory for all devotees.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Update Photo for Existing Duplicate Pandal Modal */}
      {existingPandalForPhotoModal && (
        <UpdateIdolModal
          isOpen={!!existingPandalForPhotoModal}
          onClose={() => setExistingPandalForPhotoModal(null)}
          pandal={existingPandalForPhotoModal}
          onSuccess={() => {
            setExistingPandalForPhotoModal(null);
            onSuccess();
            onClose();
          }}
        />
      )}
    </div>
  );
};
