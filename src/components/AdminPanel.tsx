import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  XCircle,
  Trash2,
  Edit2,
  ShieldAlert,
  Sparkles,
  MapPin,
  Clock,
  Utensils,
  Navigation,
  RefreshCw,
  LogIn,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Eye,
  Phone,
  Calendar,
  ExternalLink,
  Maximize2,
  User as UserIcon,
  AlertTriangle,
  History,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Layers,
  Lock,
} from 'lucide-react';
import { Pandal, Annadanam } from '../types';
import { auth, db, signInWithGoogle, storage } from '../firebase';
import { ensureAdminExists, checkIsAdminUser, setInMemoryAdmin, ADMIN_MOBILE, ADMIN_PIN, ADMIN_EMAIL } from '../utils/adminInit';
import { withTimeout } from '../utils/asyncHelper';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { compressImageFile, getInstantPreviewUrl } from '../utils/imageCompressor';
import { checkDuplicateLocation, checkDuplicateAnnadanamLocation, DuplicateCheckResult, DuplicateAnnadanamCheckResult } from '../utils/duplicateDetector';
import { PANDALS_DATA } from '../data/pandals';
import { ANNADANAM_DATA } from '../data/annadanam';
import { isAnnadanamExpired, cleanupExpiredAnnadanam } from '../utils/annadanamExpiry';
import { compareSubmissionChronology, formatFriendlyDateTime, buildMultiSubmissionTimeline } from '../utils/chronologyHelper';
import { CURRENT_FESTIVAL_YEAR } from '../utils/yearlyPhotos';

export const extractAllPhotos = (item: any): string[] => {
  if (!item) return [];
  const urls: string[] = [];

  const addValue = (val: any) => {
    if (!val) return;
    if (typeof val === 'string' && val.trim().length > 0) {
      const trimmed = val.trim();
      if (!trimmed.startsWith('blob:')) {
        urls.push(trimmed);
      }
    } else if (Array.isArray(val)) {
      val.forEach((subVal) => addValue(subVal));
    } else if (typeof val === 'object') {
      if (val.url) addValue(val.url);
      if (val.src) addValue(val.src);
      if (val.image) addValue(val.image);
    }
  };

  addValue(item.ganeshaImage);
  addValue(item.ganeshaPhoto);
  addValue(item.pandalImage);
  addValue(item.pandalPhoto);
  addValue(item.image);
  addValue(item.imageUrl);
  addValue(item.photo);
  addValue(item.picture);
  addValue(item.photos);
  addValue(item.extraImages);
  addValue(item.additionalPhotos);
  addValue(item.pictures);

  return Array.from(new Set(urls));
};

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [activeMainTab, setActiveMainTab] = useState<'pandals' | 'annadanam' | 'photo_updates'>('pandals');
  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const [pandals, setPandals] = useState<any[]>([]);
  const [duplicateComparisonTarget, setDuplicateComparisonTarget] = useState<{
    currentPandal: any;
    duplicateInfo: DuplicateCheckResult;
  } | null>(null);
  const [selectedPandalMatchIndex, setSelectedPandalMatchIndex] = useState<number>(0);

  const [duplicateAnnadanamComparisonTarget, setDuplicateAnnadanamComparisonTarget] = useState<{
    currentAnnadanam: any;
    duplicateInfo: DuplicateAnnadanamCheckResult;
  } | null>(null);
  const [selectedAnnadanamMatchIndex, setSelectedAnnadanamMatchIndex] = useState<number>(0);

  // Detect duplicate pin location for pandals
  const getPandalDuplicateInfo = (item: any): DuplicateCheckResult => {
    if (!item) {
      return {
        isDuplicate: false,
        type: null,
        message: '',
        matchedPandal: null,
        allMatches: [],
        matchCount: 0,
        liveMatches: [],
        suggestedMatches: [],
      };
    }

    // 1. Fresh location check against live database and submissions
    const liveCheck = checkDuplicateLocation(
      Number(item.latitude),
      Number(item.longitude),
      PANDALS_DATA,
      pandals,
      item.id,
      45
    );

    if (liveCheck.isDuplicate) {
      return liveCheck;
    }

    // 2. If already flagged at submission time
    if (item.isDuplicate) {
      const matchedFromLive = PANDALS_DATA.find((p) => p.id === item.duplicateOfId || p.name === item.duplicateOfName);
      const matchedFromSubmissions = pandals.find((p) => p.id === item.duplicateOfId || (p.id !== item.id && p.name === item.duplicateOfName));
      const matchedRecord = matchedFromLive || matchedFromSubmissions;
      const matchedPhotos = matchedRecord ? extractAllPhotos(matchedRecord) : [];

      const singleMatch = {
        id: item.duplicateOfId || matchedRecord?.id || '',
        name: item.duplicateOfName || matchedRecord?.name || 'Existing Pandal',
        address: matchedRecord?.address || item.address,
        area: matchedRecord?.area || item.area,
        committeeName: (matchedRecord as any)?.committeeName,
        status: (item.duplicateType === 'live' ? 'approved' : 'pending') as 'approved' | 'pending',
        latitude: Number(matchedRecord?.latitude || item.latitude),
        longitude: Number(matchedRecord?.longitude || item.longitude),
        distanceMeters: item.duplicateDistanceMeters || 0,
        photos: matchedPhotos,
        image: matchedPhotos[0] || (matchedRecord as any)?.image,
        ganeshaPhoto: (matchedRecord as any)?.ganeshaPhoto,
        pandalPhoto: (matchedRecord as any)?.pandalPhoto,
        submittedBy: (matchedRecord as any)?.submittedBy,
        submittedByPhone: (matchedRecord as any)?.submittedByPhone,
        createdAt: (matchedRecord as any)?.createdAt,
        rawItem: matchedRecord,
      };

      return {
        isDuplicate: true,
        type: item.duplicateType || 'suggested',
        message: item.duplicateMessage || (item.duplicateType === 'live' ? 'This pandal is already live' : 'This pandal is already suggested'),
        matchedPandal: singleMatch,
        allMatches: [singleMatch],
        matchCount: 1,
        liveMatches: singleMatch.status === 'approved' ? [singleMatch] : [],
        suggestedMatches: singleMatch.status !== 'approved' ? [singleMatch] : [],
      };
    }

    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedPandal: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  };

  // Detect duplicate pin location for Annadanam
  const getAnnadanamDuplicateInfo = (item: any): DuplicateAnnadanamCheckResult => {
    if (!item) {
      return {
        isDuplicate: false,
        type: null,
        message: '',
        matchedAnnadanam: null,
        allMatches: [],
        matchCount: 0,
        liveMatches: [],
        suggestedMatches: [],
      };
    }

    // 1. Fresh location check against live active Annadanam and submissions
    const liveCheck = checkDuplicateAnnadanamLocation(
      Number(item.latitude),
      Number(item.longitude),
      ANNADANAM_DATA.filter((a) => !isAnnadanamExpired(a.date, a.createdAt)),
      annadanamList,
      item.id,
      45
    );

    if (liveCheck.isDuplicate) {
      return liveCheck;
    }

    // 2. If already flagged at submission time
    if (item.isDuplicate) {
      const matchedFromLive = ANNADANAM_DATA.find((a) => a.id === item.duplicateOfId || a.pandalName === item.duplicateOfName);
      const matchedFromSubmissions = annadanamList.find((a) => a.id === item.duplicateOfId || (a.id !== item.id && a.pandalName === item.duplicateOfName));
      const matchedRecord = matchedFromLive || matchedFromSubmissions;
      const matchedPhotos = matchedRecord ? extractAllPhotos(matchedRecord) : [];

      const singleMatch = {
        id: item.duplicateOfId || matchedRecord?.id || '',
        pandalName: item.duplicateOfName || matchedRecord?.pandalName || 'Existing Annadanam',
        date: matchedRecord?.date || item.date,
        startTime: matchedRecord?.startTime || item.startTime,
        endTime: matchedRecord?.endTime || item.endTime,
        address: matchedRecord?.address || item.address,
        area: matchedRecord?.area || item.area,
        city: matchedRecord?.city || item.city || 'Hyderabad',
        status: (item.duplicateType === 'live' ? 'approved' : 'pending') as 'approved' | 'pending',
        latitude: Number(matchedRecord?.latitude || item.latitude),
        longitude: Number(matchedRecord?.longitude || item.longitude),
        distanceMeters: item.duplicateDistanceMeters || 0,
        photos: matchedPhotos,
        image: matchedPhotos[0] || (matchedRecord as any)?.image,
        description: matchedRecord?.description || item.description,
        contactInfo: matchedRecord?.contactInfo || item.contactInfo,
        submittedBy: (matchedRecord as any)?.submittedBy,
        submittedByEmail: (matchedRecord as any)?.submittedByEmail,
        createdAt: (matchedRecord as any)?.createdAt,
        rawItem: matchedRecord,
      };

      return {
        isDuplicate: true,
        type: item.duplicateType || 'suggested',
        message: item.duplicateMessage || (item.duplicateType === 'live' ? 'This Annadanam is already live' : 'This Annadanam is already suggested'),
        matchedAnnadanam: singleMatch,
        allMatches: [singleMatch],
        matchCount: 1,
        liveMatches: singleMatch.status === 'approved' ? [singleMatch] : [],
        suggestedMatches: singleMatch.status !== 'approved' ? [singleMatch] : [],
      };
    }

    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedAnnadanam: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  };
  const [annadanamList, setAnnadanamList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Full Details View Modals
  const [viewingPandal, setViewingPandal] = useState<any | null>(null);
  const [viewingAnnadanam, setViewingAnnadanam] = useState<any | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Edit Modals
  const [editingPandal, setEditingPandal] = useState<any | null>(null);
  const [editingAnnadanam, setEditingAnnadanam] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // In-app Delete Confirmation state (no window.confirm which is blocked in iframes)
  const [deleteModalTarget, setDeleteModalTarget] = useState<{ id: string; type: 'pandal' | 'annadanam'; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Uploading state inside edit modal
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const editGaneshaInputRef = useRef<HTMLInputElement | null>(null);
  const editPandalInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Map Picker refs for Admin editing
  const pickerMapRef = useRef<L.Map | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  const annadMapRef = useRef<L.Map | null>(null);
  const annadContainerRef = useRef<HTMLDivElement | null>(null);

  const [adminMobileInput, setAdminMobileInput] = useState('7702583629');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [isAuthenticatingAdmin, setIsAuthenticatingAdmin] = useState(false);
  const [authenticatedAdmin, setAuthenticatedAdmin] = useState<boolean>(() => {
    return checkIsAdminUser(auth.currentUser, null);
  });

  const isAdmin = authenticatedAdmin || checkIsAdminUser(user, null);

  useEffect(() => {
    const checkState = () => {
      const isAdm = checkIsAdminUser(auth.currentUser, null);
      if (isAdm) {
        setAuthenticatedAdmin(true);
      }
    };

    checkState();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      checkState();
    });

    const handleAuthChange = () => {
      checkState();
    };

    window.addEventListener('bappa_auth_change', handleAuthChange);

    return () => {
      unsubscribe();
      window.removeEventListener('bappa_auth_change', handleAuthChange);
    };
  }, []);

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);

    const cleanMobile = adminMobileInput.replace(/\D/g, '').slice(-10);
    const cleanPin = adminPinInput.trim();

    console.log(`[AdminAuth Stage 1/5] Validating credentials format (Mobile: ${cleanMobile}, PIN length: ${cleanPin.length})...`);

    if (cleanMobile !== ADMIN_MOBILE) {
      console.warn(`[AdminAuth Stage 2/5 REJECTED] Mobile ${cleanMobile} is not authorized.`);
      setAdminAuthError(`Access Denied: Mobile ${cleanMobile} is not an authorized Admin.`);
      return;
    }

    if (cleanPin !== ADMIN_PIN) {
      console.warn(`[AdminAuth Stage 2/5 REJECTED] Incorrect PIN entered.`);
      setAdminAuthError('Access Denied: Incorrect 4-digit Admin PIN.');
      return;
    }

    console.log(`[AdminAuth Stage 2/5 PASSED] Credentials match preset Admin.`);
    setIsAuthenticatingAdmin(true);

    try {
      await withTimeout(
        (async () => {
          console.log(`[AdminAuth Stage 3/5] Activating in-memory Admin session...`);
          setInMemoryAdmin(true);
          setAuthenticatedAdmin(true);

          console.log(`[AdminAuth Stage 4/5] Storing session in LocalStorage (with iframe fallback)...`);
          const adminData = { mobile: ADMIN_MOBILE, name: 'Admin (7702583629)' };
          try {
            localStorage.setItem('bappa_mobile_user', JSON.stringify(adminData));
          } catch (storageErr) {
            console.warn('[AdminAuth Stage 4/5] LocalStorage unavailable in iframe context, using memory session:', storageErr);
          }
          window.dispatchEvent(new Event('bappa_auth_change'));

          console.log(`[AdminAuth Stage 5/5] Unlocking Admin Console UI & refreshing records...`);
          showToast('Admin Console Unlocked Successfully!', 'success');
          fetchData();

          // Ensure Firestore admin document exists asynchronously in background
          ensureAdminExists()
            .then(() => console.log('[AdminAuth SUCCESS] Admin document confirmed in Firestore.'))
            .catch((err) => console.warn('[AdminAuth NOTICE] Firestore background sync notice:', err));
        })(),
        7000,
        'Admin login timed out after 7 seconds. Please verify your connection.'
      );
    } catch (err: any) {
      console.error('[AdminAuth ERROR]', err);
      setAdminAuthError(err.message || 'Authentication failed. Please try again.');
      showToast(err.message || 'Login failed. Please try again.', 'error');
    } finally {
      setIsAuthenticatingAdmin(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Fetch pandal submissions (with client-side sort fallback)
      let pItems: any[] = [];
      try {
        const pQuery = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
        const pSnap = await getDocs(pQuery);
        pItems = pSnap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
      } catch (pErr) {
        console.warn('Fallback fetching submissions without orderBy:', pErr);
        const pSnap = await getDocs(collection(db, 'submissions'));
        pItems = pSnap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
        pItems.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }
      setPandals(pItems);

      // Fetch annadanam (with client-side sort fallback)
      let aItems: any[] = [];
      try {
        const aQuery = query(collection(db, 'annadanam'), orderBy('createdAt', 'desc'));
        const aSnap = await getDocs(aQuery);
        aItems = aSnap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
      } catch (aErr) {
        console.warn('Fallback fetching annadanam without orderBy:', aErr);
        const aSnap = await getDocs(collection(db, 'annadanam'));
        aItems = aSnap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
        aItems.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }

      // Background automatic cleanup of expired Annadanam records
      cleanupExpiredAnnadanam(aItems).catch((err) => console.warn('Admin Annadanam cleanup warning:', err));
      
      // Filter expired records from admin view
      const activeAnnadanam = aItems.filter((item) => !isAnnadanamExpired(item.date, item.createdAt));
      setAnnadanamList(activeAnnadanam);

      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      setErrorMsg(err.message || 'Failed to load admin data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    console.log('[AdminPanel] Initializing real-time Firestore listeners for single database...');

    // 1. Real-time Submissions stream (All pending, approved, and rejected pandals)
    const unsubSubmissions = onSnapshot(
      collection(db, 'submissions'),
      (snap) => {
        const items: any[] = snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        console.log(`[AdminPanel RealTime] Received ${items.length} submissions from Firestore.`);
        setPandals(items);
        setLoading(false);
      },
      (err) => {
        console.error('[AdminPanel RealTime ERROR] Submissions stream:', err);
        setErrorMsg('Error syncing real-time submissions: ' + err.message);
        setLoading(false);
      }
    );

    // 2. Real-time Annadanam stream
    const unsubAnnadanam = onSnapshot(
      collection(db, 'annadanam'),
      (snap) => {
        const items: any[] = snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        console.log(`[AdminPanel RealTime] Received ${items.length} annadanam from Firestore.`);
        const activeAnnadanam = items.filter((item: any) => !isAnnadanamExpired(item.date, item.createdAt));
        setAnnadanamList(activeAnnadanam);
      },
      (err) => {
        console.warn('[AdminPanel RealTime ERROR] Annadanam stream:', err);
      }
    );

    return () => {
      unsubSubmissions();
      unsubAnnadanam();
    };
  }, [isOpen, isAdmin]);

  // Initialize Pandal Edit Map
  useEffect(() => {
    if (!editingPandal) {
      if (pickerMapRef.current) {
        pickerMapRef.current.remove();
        pickerMapRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!pickerContainerRef.current) return;
      if (pickerMapRef.current) return;

      const lat = editingPandal.latitude || 17.3850;
      const lng = editingPandal.longitude || 78.4867;

      const map = L.map(pickerContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        touchZoom: true,
      }).setView([lat, lng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Touch shielding for scrollable modal
      const pickerEl = pickerContainerRef.current;
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) map.dragging.disable();
        else if (e.touches.length >= 2) map.dragging.enable();
      };
      const onTouchEnd = () => map.dragging.enable();
      const onMouseDown = () => map.dragging.enable();

      pickerEl.addEventListener('touchstart', onTouchStart, { passive: true });
      pickerEl.addEventListener('touchend', onTouchEnd, { passive: true });
      pickerEl.addEventListener('mousedown', onMouseDown);

      // Fix for blank map in modal
      setTimeout(() => {
        map.invalidateSize();
      }, 100);

      map.on('moveend', () => {
        const center = map.getCenter();
        setEditingPandal((prev: any) => prev ? {
          ...prev,
          latitude: Number(center.lat.toFixed(6)),
          longitude: Number(center.lng.toFixed(6)),
        } : null);
      });

      // Tap to center
      map.on('click', (e: L.LeafletMouseEvent) => {
        map.panTo(e.latlng, { animate: true });
      });

      pickerMapRef.current = map;
    }, 200);

    return () => {
      clearTimeout(timer);
      if (pickerMapRef.current) {
        pickerMapRef.current.remove();
        pickerMapRef.current = null;
      }
    };
  }, [editingPandal?.id]);

  // Initialize Annadanam Edit Map
  useEffect(() => {
    if (!editingAnnadanam) {
      if (annadMapRef.current) {
        annadMapRef.current.remove();
        annadMapRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!annadContainerRef.current) return;
      if (annadMapRef.current) return;

      const lat = editingAnnadanam.latitude || 17.3850;
      const lng = editingAnnadanam.longitude || 78.4867;

      const map = L.map(annadContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        touchZoom: true,
      }).setView([lat, lng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Touch shielding for scrollable modal
      const annadEl = annadContainerRef.current;
      const onAnnadTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) map.dragging.disable();
        else if (e.touches.length >= 2) map.dragging.enable();
      };
      const onAnnadTouchEnd = () => map.dragging.enable();
      const onAnnadMouseDown = () => map.dragging.enable();

      annadEl.addEventListener('touchstart', onAnnadTouchStart, { passive: true });
      annadEl.addEventListener('touchend', onAnnadTouchEnd, { passive: true });
      annadEl.addEventListener('mousedown', onAnnadMouseDown);

      // Fix for blank map in modal
      setTimeout(() => {
        map.invalidateSize();
      }, 100);

      map.on('moveend', () => {
        const center = map.getCenter();
        setEditingAnnadanam((prev: any) => prev ? {
          ...prev,
          latitude: Number(center.lat.toFixed(6)),
          longitude: Number(center.lng.toFixed(6)),
        } : null);
      });

      // Tap to center
      map.on('click', (e: L.LeafletMouseEvent) => {
        map.panTo(e.latlng, { animate: true });
      });

      annadMapRef.current = map;
    }, 200);

    return () => {
      clearTimeout(timer);
      if (annadMapRef.current) {
        annadMapRef.current.remove();
        annadMapRef.current = null;
      }
    };
  }, [editingAnnadanam?.id]);

  const handleAdminUseMyLocation = async (type: 'pandal' | 'annadanam') => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        if (type === 'pandal' && editingPandal) {
          setEditingPandal({ ...editingPandal, latitude: lat, longitude: lng });
          if (pickerMapRef.current) pickerMapRef.current.setView([lat, lng], 16);
        } else if (type === 'annadanam' && editingAnnadanam) {
          setEditingAnnadanam({ ...editingAnnadanam, latitude: lat, longitude: lng });
          if (annadMapRef.current) annadMapRef.current.setView([lat, lng], 16);
        }

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          if (data && data.display_name) {
            if (type === 'pandal' && editingPandal) {
              setEditingPandal((prev: any) => prev ? { ...prev, address: data.display_name } : null);
            } else if (type === 'annadanam' && editingAnnadanam) {
              setEditingAnnadanam((prev: any) => prev ? { ...prev, address: data.display_name } : null);
            }
          }
        } catch (e) {}
      },
      () => alert('Unable to retrieve current location')
    );
  };

  if (!isOpen) return null;

  // Execute Permanent Deletion (Called from custom modal)
  const executeDelete = async () => {
    if (!deleteModalTarget) return;
    setIsDeleting(true);
    try {
      const collectionName = deleteModalTarget.type === 'pandal' ? 'submissions' : 'annadanam';
      await deleteDoc(doc(db, collectionName, deleteModalTarget.id));
      if (deleteModalTarget.type === 'pandal') {
        setPandals((prev) => prev.filter((p) => p.id !== deleteModalTarget.id));
      } else {
        setAnnadanamList((prev) => prev.filter((a) => a.id !== deleteModalTarget.id));
      }
      showToast(`Deleted "${deleteModalTarget.name}" successfully`, 'success');
      setDeleteModalTarget(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast('Failed to delete: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Pandal Handlers
  const handleUpdatePandalStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'submissions', id), { status: newStatus });
      setPandals((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
      showToast(`Pandal marked as ${newStatus}`, 'success');
    } catch (err: any) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  // Admin direct photo uploader — Instant 0ms Preview + Rapid Compressed Upload
  const handleAdminPhotoUpload = async (file: File, type: 'ganesha' | 'pandal') => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    // 1. Instant 0ms local preview
    const instantUrl = getInstantPreviewUrl(file);
    if (editingPandal) {
      if (type === 'ganesha') {
        setEditingPandal((prev: any) => ({
          ...prev,
          ganeshaImage: instantUrl,
          image: instantUrl,
        }));
      } else {
        setEditingPandal((prev: any) => ({
          ...prev,
          pandalImage: instantUrl,
        }));
      }
    }

    setIsUploadingPhoto(true);
    try {
      // 2. High-speed client-side canvas compression (~150KB)
      const { blob, dataUrl } = await compressImageFile(file, {
        maxDimension: 1400,
        quality: 0.82,
      });

      let finalUrl = dataUrl;
      try {
        const fileExt = 'jpg';
        const storageRef = ref(storage, `admin_uploads/${Date.now()}_${type}.${fileExt}`);
        const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Storage upload timed out')), 2500)
        );
        await Promise.race([uploadTask, timeoutPromise]);
        const downloadUrl = await Promise.race([
          getDownloadURL(storageRef),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('URL timed out')), 1500)),
        ]);
        if (downloadUrl) finalUrl = downloadUrl;
      } catch (storageErr) {
        console.warn('Storage fallback to compressed Data URL:', storageErr);
      }

      if (editingPandal) {
        if (type === 'ganesha') {
          setEditingPandal((prev: any) => ({
            ...prev,
            ganeshaImage: finalUrl,
            image: finalUrl,
          }));
        } else {
          setEditingPandal((prev: any) => ({
            ...prev,
            pandalImage: finalUrl,
          }));
        }
        showToast(`Uploaded ${type === 'ganesha' ? 'Ganesha Idol' : 'Pandal'} photo`, 'success');
      }
    } catch (err: any) {
      showToast('Upload note: ' + err.message, 'error');
    } finally {
      setIsUploadingPhoto(false);
      if (editGaneshaInputRef.current) editGaneshaInputRef.current.value = '';
      if (editPandalInputRef.current) editPandalInputRef.current.value = '';
    }
  };

  // Admin direct photo uploader for viewing / approval modal
  const handleUploadPhotoForSubmission = async (file: File, submissionId: string, type: 'ganesha' | 'pandal') => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const { blob, dataUrl } = await compressImageFile(file, { maxDimension: 1400, quality: 0.82 });
      let finalUrl = dataUrl;
      try {
        const fileExt = 'jpg';
        const storageRef = ref(storage, `admin_uploads/${Date.now()}_${type}.${fileExt}`);
        const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Storage upload timed out')), 2500)
        );
        await Promise.race([uploadTask, timeoutPromise]);
        const downloadUrl = await Promise.race([
          getDownloadURL(storageRef),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('URL timed out')), 1500)),
        ]);
        if (downloadUrl) finalUrl = downloadUrl;
      } catch (storageErr) {
        console.warn('Storage fallback to compressed Data URL:', storageErr);
      }

      const fieldToUpdate =
        type === 'ganesha'
          ? { ganeshaImage: finalUrl, image: finalUrl }
          : { pandalImage: finalUrl };

      await updateDoc(doc(db, 'submissions', submissionId), fieldToUpdate);

      setPandals((prev) =>
        prev.map((p) => {
          if (p.id === submissionId) {
            const updatedPhotos = Array.from(new Set([finalUrl, ...(p.photos || [])]));
            return { ...p, ...fieldToUpdate, photos: updatedPhotos };
          }
          return p;
        })
      );

      if (viewingPandal && viewingPandal.id === submissionId) {
        setViewingPandal((prev: any) => {
          if (!prev) return null;
          const updatedPhotos = Array.from(new Set([finalUrl, ...(prev.photos || [])]));
          return { ...prev, ...fieldToUpdate, photos: updatedPhotos };
        });
      }

      showToast(`Uploaded ${type === 'ganesha' ? 'Ganesha Idol' : 'Pandal Setup'} photo!`, 'success');
    } catch (err: any) {
      showToast('Upload error: ' + err.message, 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSavePandalEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPandal) return;
    try {
      const docRef = doc(db, 'submissions', editingPandal.id);
      const coverImg = editingPandal.ganeshaImage || editingPandal.image || editingPandal.pandalImage || '';
      const allPhotos = [
        editingPandal.ganeshaImage,
        editingPandal.pandalImage,
        ...(editingPandal.extraImages || []),
      ].filter((p): p is string => typeof p === 'string' && p.length > 0);

      const updateData = {
        name: editingPandal.name,
        committeeName: editingPandal.committeeName || '',
        associationName: editingPandal.committeeName || '',
        address: editingPandal.address,
        area: editingPandal.area,
        city: editingPandal.city || 'Hyderabad',
        state: editingPandal.state || 'Telangana',
        latitude: Number(editingPandal.latitude),
        longitude: Number(editingPandal.longitude),
        timings: editingPandal.timings || '',
        description: editingPandal.description || '',
        ganeshaImage: editingPandal.ganeshaImage || coverImg,
        pandalImage: editingPandal.pandalImage || '',
        image: coverImg, // Primary cover photo is Ganesha idol
        photos: allPhotos.length > 0 ? allPhotos : (coverImg ? [coverImg] : []),
        contactInfo: editingPandal.contactInfo || '',
        contactPerson: editingPandal.contactPerson || '',
        phone: editingPandal.contactInfo || '',
        ownerInfo: editingPandal.ownerInfo || '',
        annadanamDate: editingPandal.annadanamDate || '',
        servingTime: editingPandal.servingTime || '',
        nimajjanamDate: editingPandal.nimajjanamDate || '',
        status: editingPandal.status || 'pending',
      };

      await updateDoc(docRef, updateData);
      setPandals((prev) =>
        prev.map((p) => (p.id === editingPandal.id ? { ...p, ...updateData } : p))
      );
      if (viewingPandal && viewingPandal.id === editingPandal.id) {
        setViewingPandal({ ...viewingPandal, ...updateData });
      }
      setEditingPandal(null);
      showToast('Pandal details, photos & coordinates updated', 'success');
    } catch (err: any) {
      showToast('Failed to save edit: ' + err.message, 'error');
    }
  };

  // Annadanam Handlers
  const handleUpdateAnnadanamStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'annadanam', id), { status: newStatus });
      setAnnadanamList((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
      showToast(`Annadanam marked as ${newStatus}`, 'success');
    } catch (err: any) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  const handleSaveAnnadanamEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnnadanam) return;
    try {
      const docRef = doc(db, 'annadanam', editingAnnadanam.id);
      await updateDoc(docRef, {
        pandalName: editingAnnadanam.pandalName,
        date: editingAnnadanam.date,
        startTime: editingAnnadanam.startTime,
        endTime: editingAnnadanam.endTime || '',
        address: editingAnnadanam.address,
        area: editingAnnadanam.area,
        latitude: editingAnnadanam.latitude ? Number(editingAnnadanam.latitude) : null,
        longitude: editingAnnadanam.longitude ? Number(editingAnnadanam.longitude) : null,
        description: editingAnnadanam.description || '',
        contactInfo: editingAnnadanam.contactInfo || '',
        status: editingAnnadanam.status || 'pending',
      });
      setAnnadanamList((prev) => prev.map((a) => (a.id === editingAnnadanam.id ? editingAnnadanam : a)));
      setEditingAnnadanam(null);
      showToast('Annadanam details updated', 'success');
    } catch (err: any) {
      showToast('Failed to save edit: ' + err.message, 'error');
    }
  };

  const handleApprovePhotoUpdate = async (pandalId: string, photoId: string) => {
    try {
      const pandal = pandals.find((p) => p.id === pandalId);
      if (!pandal || !Array.isArray(pandal.yearlyPhotos)) return;

      const updatedPhotos = pandal.yearlyPhotos.map((photo: any) => {
        if (photo.id === photoId) {
          return { ...photo, status: 'approved' };
        }
        return photo;
      });

      // Calculate top-voted approved current year cover photo
      const approvedCurrentYear = updatedPhotos.filter((p: any) => p.year === CURRENT_FESTIVAL_YEAR && p.status === 'approved');
      approvedCurrentYear.sort((a: any, b: any) => (b.votesCount || 0) - (a.votesCount || 0));
      const topCover = approvedCurrentYear[0]?.url || pandal.ganeshaImage || pandal.image;

      await updateDoc(doc(db, 'submissions', pandalId), {
        yearlyPhotos: updatedPhotos,
        ...(topCover ? { image: topCover, ganeshaImage: topCover } : {}),
      });

      setPandals((prev) =>
        prev.map((p) =>
          p.id === pandalId
            ? { ...p, yearlyPhotos: updatedPhotos, ...(topCover ? { image: topCover, ganeshaImage: topCover } : {}) }
            : p
        )
      );

      showToast(`${CURRENT_FESTIVAL_YEAR} Idol photo approved & published live!`, 'success');
    } catch (err: any) {
      showToast('Failed to approve photo: ' + err.message, 'error');
    }
  };

  const handleRejectPhotoUpdate = async (pandalId: string, photoId: string) => {
    try {
      const pandal = pandals.find((p) => p.id === pandalId);
      if (!pandal || !Array.isArray(pandal.yearlyPhotos)) return;

      const updatedPhotos = pandal.yearlyPhotos.filter((photo: any) => photo.id !== photoId);

      await updateDoc(doc(db, 'submissions', pandalId), {
        yearlyPhotos: updatedPhotos,
      });

      setPandals((prev) =>
        prev.map((p) => (p.id === pandalId ? { ...p, yearlyPhotos: updatedPhotos } : p))
      );

      showToast('Pending idol photo submission rejected', 'success');
    } catch (err: any) {
      showToast('Failed to reject photo: ' + err.message, 'error');
    }
  };

  const pendingPhotoUpdates: { pandal: any; photo: any }[] = [];
  pandals.forEach((p) => {
    if (Array.isArray(p.yearlyPhotos)) {
      p.yearlyPhotos.forEach((photo: any) => {
        if (photo.status === 'pending') {
          pendingPhotoUpdates.push({ pandal: p, photo });
        }
      });
    }
  });

  const currentPandals = pandals.filter((p) => p.status === statusTab);
  const currentAnnadanam = annadanamList.filter((a) => a.status === statusTab);

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border-2 border-amber-400 p-6 space-y-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl border border-amber-300">
              <ShieldAlert className="w-8 h-8 text-amber-800" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-amber-950">Restricted Admin Access</h2>
              <p className="text-xs text-gray-600 font-medium">Authentication required to view Admin Console</p>
            </div>
          </div>

          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 font-medium leading-relaxed">
            🔒 The Admin Console is restricted to authorized moderators only. Please sign in with your Admin phone number (7702583629) and 4-digit PIN.
          </div>

          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            {adminAuthError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{adminAuthError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Admin Mobile Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  maxLength={10}
                  value={adminMobileInput}
                  onChange={(e) => setAdminMobileInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="7702583629"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">4-Digit Admin PIN</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  maxLength={4}
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold tracking-widest text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthenticatingAdmin}
              className="w-full py-3 bg-amber-900 hover:bg-amber-800 text-yellow-300 font-bold text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isAuthenticatingAdmin ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating Admin...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Unlock Admin Console</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-6 h-6 text-yellow-300" />
            <h2 className="text-lg font-bold">Single Admin Dashboard & Coordinate Corrector</h2>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Main Category Tabs */}
          <div className="flex border-b border-gray-200 bg-amber-50 px-4 pt-3 gap-2">
            <button
              onClick={() => setActiveMainTab('pandals')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeMainTab === 'pandals'
                  ? 'bg-amber-800 text-white shadow-sm'
                  : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pandals ({pandals.length})</span>
            </button>
            <button
              onClick={() => setActiveMainTab('annadanam')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeMainTab === 'annadanam'
                  ? 'bg-amber-800 text-white shadow-sm'
                  : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Annadanam ({annadanamList.length})</span>
            </button>
            <button
              onClick={() => setActiveMainTab('photo_updates')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeMainTab === 'photo_updates'
                  ? 'bg-amber-800 text-white shadow-sm'
                  : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-yellow-300" />
              <span>Pending Idol Photos ({pendingPhotoUpdates.length})</span>
              {pendingPhotoUpdates.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Status Sub-Tabs (Shown for Pandals and Annadanam) */}
          {activeMainTab !== 'photo_updates' && (
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2">
              {(['pending', 'approved', 'rejected'] as const).map((tab) => {
                const count =
                  activeMainTab === 'pandals'
                    ? pandals.filter((p) => p.status === tab).length
                    : annadanamList.filter((a) => a.status === tab).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusTab(tab)}
                    className={`px-4 py-2.5 text-xs font-semibold capitalize border-b-2 transition-all flex items-center space-x-1.5 ${
                      statusTab === tab
                        ? 'border-amber-700 text-amber-900 bg-white shadow-xs rounded-t-lg'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span>{tab}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        statusTab === tab ? 'bg-amber-100 text-amber-900' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Content List */}
          <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-50/50">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-700 mb-2" />
                <p>Loading records...</p>
              </div>
            ) : errorMsg ? (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm space-y-3">
                <div className="flex items-center gap-2 font-bold text-red-900">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => fetchData()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Loading</span>
                  </button>
                  {(!user || user.email !== ADMIN_EMAIL) && (
                    <button
                      onClick={async () => {
                        try {
                          await signInWithGoogle();
                          fetchData();
                        } catch (e: any) {
                          alert(e.message || 'Google Sign-in failed');
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign in with Google (Admin)</span>
                    </button>
                  )}
                </div>
              </div>
            ) : activeMainTab === 'photo_updates' ? (
              pendingPhotoUpdates.length === 0 ? (
                <div className="text-center py-16 text-gray-400 space-y-2">
                  <Camera className="w-10 h-10 mx-auto text-amber-300" />
                  <p className="font-bold text-gray-700">No Pending Idol Photo Submissions</p>
                  <p className="text-xs text-gray-500">All submitted 2026 idol photos have been reviewed and verified.</p>
                </div>
              ) : (
                pendingPhotoUpdates.map(({ pandal, photo }) => (
                  <div
                    key={photo.id}
                    className="bg-white rounded-2xl p-4 border border-amber-300 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-amber-400"
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Photo Thumbnail */}
                      <div
                        onClick={() =>
                          setLightboxImage({
                            url: photo.url,
                            title: `${pandal.name} — Submitted by ${photo.uploaderName || 'Devotee'} (${photo.year})`,
                          })
                        }
                        className="w-20 h-20 rounded-2xl overflow-hidden bg-amber-900 shrink-0 border-2 border-amber-400 shadow-sm cursor-pointer relative group"
                      >
                        <img src={photo.url} alt="Submitted Idol" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/80 text-yellow-300 text-[8px] font-extrabold text-center py-0.5">
                          {photo.year} Idol
                        </span>
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900 truncate">
                            {pandal.name}
                          </h3>
                          <span className="bg-yellow-100 text-amber-900 border border-yellow-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                            Pending Verification
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{pandal.address || pandal.area}</span>
                        </p>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap pt-0.5">
                          <span>Contributor: <strong className="text-amber-900 font-bold">{photo.uploaderName || 'Devotee'}</strong></span>
                          <span>•</span>
                          <span>Uploaded: {photo.createdAt ? new Date(photo.createdAt).toLocaleDateString('en-IN') : 'Recent'}</span>
                          {photo.isLiveCapture && (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                              📸 Live Camera Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Approve / Reject Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                      <button
                        type="button"
                        onClick={() => handleRejectPhotoUpdate(pandal.id, photo.id)}
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors border border-red-200 flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span>Reject</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovePhotoUpdate(pandal.id, photo.id)}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4 text-yellow-300" />
                        <span>Approve & Set Live</span>
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : activeMainTab === 'pandals' ? (
              currentPandals.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No {statusTab} pandals found.</div>
              ) : (
                currentPandals.map((item) => {
                  const itemPhotos = extractAllPhotos(item);
                  const itemCover = itemPhotos[0] || '';
                  const duplicateInfo = getPandalDuplicateInfo(item);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setViewingPandal(item)}
                      className={`bg-white hover:bg-amber-50/40 rounded-2xl p-4 border shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all cursor-pointer group relative ${
                        duplicateInfo.isDuplicate
                          ? 'border-red-300 ring-1 ring-red-400/50 bg-red-50/20'
                          : 'border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      {/* Thumbnail + Details */}
                      <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                        {/* Visual Thumbnail */}
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-amber-900/90 overflow-hidden flex-shrink-0 relative border border-amber-300 shadow-2xs">
                          {itemCover ? (
                            <>
                              <img
                                src={itemCover}
                                alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                              {itemPhotos.length > 1 && (
                                <span className="absolute bottom-0 inset-x-0 bg-black/85 text-yellow-300 text-[9px] font-bold text-center py-0.5">
                                  {itemPhotos.length} Photos
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-yellow-300 text-[10px] font-bold text-center p-1">
                              <span>🚩</span>
                              <span className="text-[8px] text-yellow-200/80">No photo</span>
                            </div>
                          )}
                        </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900 group-hover:text-amber-900 transition-colors truncate">
                            {item.name}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              item.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : item.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        {item.committeeName && (
                          <p className="text-xs font-semibold text-amber-800 truncate">
                            {item.committeeName}
                          </p>
                        )}
                        <p className="text-xs text-gray-600 flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{item.address}, {item.area} ({item.city || 'Hyderabad'})</span>
                        </p>

                        {/* Red Indication for Duplicate Pin Suggestion with Chronology */}
                        {duplicateInfo.isDuplicate && (() => {
                          const isLive = duplicateInfo.type === 'live';
                          const matched = duplicateInfo.matchedPandal;
                          const matchCount = duplicateInfo.matchCount || (matched ? 1 : 0);
                          const chronology = compareSubmissionChronology(item, matched || {});
                          const hasMultiple = matchCount > 1;

                          return (
                            <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPandalMatchIndex(0);
                                  setDuplicateComparisonTarget({ currentPandal: item, duplicateInfo });
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all border ${
                                  isLive
                                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-700 hover:shadow-red-200'
                                    : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 hover:shadow-amber-200'
                                }`}
                                title="Click to view duplicate timeline & comparison"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-300 animate-pulse shrink-0" />
                                <span>
                                  {hasMultiple
                                    ? `Duplicate of ${matchCount} Entries`
                                    : isLive
                                    ? 'Duplicate of Live Pandal'
                                    : 'Duplicate of Earlier Suggestion'}
                                </span>
                                {hasMultiple && (
                                  <span className="bg-black/30 text-yellow-200 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Layers className="w-2.5 h-2.5" />
                                    <span>{matchCount} Matches</span>
                                  </span>
                                )}
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  isLive ? 'bg-green-700 text-white' : 'bg-amber-800 text-white'
                                }`}>
                                  {isLive ? 'Live on Map' : 'Suggested 1st'}
                                </span>
                                <span className="underline text-yellow-200 text-[11px] font-semibold ml-0.5 flex items-center gap-0.5">
                                  <span>{hasMultiple ? 'Compare All' : 'Compare'}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </span>
                              </button>
                              <span className="text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/60 flex items-center gap-1">
                                <span>📍 Matches &quot;{matched?.name || 'Existing Pandal'}&quot;</span>
                                {hasMultiple && (
                                  <span className="font-bold text-red-900 bg-red-200/80 px-1 rounded text-[10px]">
                                    +{matchCount - 1} more
                                  </span>
                                )}
                                {chronology.timeDifferenceText && (
                                  <span>({chronology.timeDifferenceText} earlier)</span>
                                )}
                              </span>
                            </div>
                          );
                        })()}

                        <p className="text-[11px] text-amber-700/80 font-medium flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>Click banner to view all photos & submitted details</span>
                        </p>
                      </div>
                    </div>

                    {/* Direct Actions */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100"
                    >
                      {item.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdatePandalStatus(item.id, 'approved')}
                            className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleUpdatePandalStatus(item.id, 'rejected')}
                            className="flex items-center space-x-1 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {item.status === 'approved' && (
                        <button
                          onClick={() => handleUpdatePandalStatus(item.id, 'rejected')}
                          className="flex items-center space-x-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                          title="Reject and unpublish from map"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject / Unpublish</span>
                        </button>
                      )}

                      <button
                        onClick={() => setEditingPandal(item)}
                        className="flex items-center space-x-1 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        title="Review & Correct Coordinates"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit & Coordinates</span>
                      </button>
                      <button
                        onClick={() => setDeleteModalTarget({ id: item.id, type: 'pandal', name: item.name })}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                        title="Delete Pandal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )
            ) : currentAnnadanam.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No {statusTab} Annadanam found.</div>
            ) : (
              currentAnnadanam.map((item) => {
                const duplicateInfo = getAnnadanamDuplicateInfo(item);
                return (
                  <div
                    key={item.id}
                    onClick={() => setViewingAnnadanam(item)}
                    className={`bg-white hover:bg-amber-50/40 rounded-2xl p-4 border shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all cursor-pointer group relative ${
                      duplicateInfo.isDuplicate
                        ? 'border-red-300 ring-1 ring-red-400/50 bg-red-50/20'
                        : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-gray-900 group-hover:text-amber-900 transition-colors truncate">
                          {item.pandalName}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            item.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Date: <strong>{item.date}</strong> | Time: <strong>{item.startTime}</strong> ({item.area})
                      </p>

                      {/* Red Indication for Duplicate Annadanam Pin Suggestion */}
                      {duplicateInfo.isDuplicate && (() => {
                        const isLive = duplicateInfo.type === 'live';
                        const matched = duplicateInfo.matchedAnnadanam;
                        const matchCount = duplicateInfo.matchCount || (matched ? 1 : 0);
                        const chronology = compareSubmissionChronology(item, matched || {});
                        const hasMultiple = matchCount > 1;

                        return (
                          <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAnnadanamMatchIndex(0);
                                setDuplicateAnnadanamComparisonTarget({ currentAnnadanam: item, duplicateInfo });
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all border ${
                                isLive
                                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-700 hover:shadow-red-200'
                                  : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 hover:shadow-amber-200'
                              }`}
                              title="Click to view duplicated Annadanam comparison"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-yellow-300 animate-pulse shrink-0" />
                              <span>
                                {hasMultiple
                                  ? `Duplicate of ${matchCount} Entries`
                                  : isLive
                                  ? 'Duplicate of Live Annadanam'
                                  : 'Duplicate of Earlier Suggestion'}
                              </span>
                              {hasMultiple && (
                                <span className="bg-black/30 text-yellow-200 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Layers className="w-2.5 h-2.5" />
                                  <span>{matchCount} Matches</span>
                                </span>
                              )}
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                isLive ? 'bg-green-700 text-white' : 'bg-amber-800 text-white'
                              }`}>
                                {isLive ? 'Live on Map' : 'Suggested 1st'}
                              </span>
                              <span className="underline text-yellow-200 text-[11px] font-semibold ml-0.5 flex items-center gap-0.5">
                                <span>{hasMultiple ? 'Compare All' : 'Compare'}</span>
                                <ArrowRight className="w-3 h-3" />
                              </span>
                            </button>
                            <span className="text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/60 flex items-center gap-1">
                              <span>📍 Matches &quot;{matched?.pandalName || 'Existing Annadanam'}&quot;</span>
                              {hasMultiple && (
                                <span className="font-bold text-red-900 bg-red-200/80 px-1 rounded text-[10px]">
                                  +{matchCount - 1} more
                                </span>
                              )}
                              {chronology.timeDifferenceText && (
                                <span>({chronology.timeDifferenceText} earlier)</span>
                              )}
                            </span>
                          </div>
                        );
                      })()}

                      <p className="text-[11px] text-amber-700/80 font-medium flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span>Click to view full details</span>
                      </p>
                    </div>

                    {/* Actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100"
                  >
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateAnnadanamStatus(item.id, 'approved')}
                          className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleUpdateAnnadanamStatus(item.id, 'rejected')}
                          className="flex items-center space-x-1 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    {item.status === 'approved' && (
                      <button
                        onClick={() => handleUpdateAnnadanamStatus(item.id, 'rejected')}
                        className="flex items-center space-x-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                        title="Reject and unpublish schedule"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject / Unpublish</span>
                      </button>
                    )}

                    <button
                      onClick={() => setEditingAnnadanam(item)}
                      className="flex items-center space-x-1 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      title="Edit Info & Coordinates"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit & Coordinates</span>
                    </button>
                    <button
                      onClick={() => setDeleteModalTarget({ id: item.id, type: 'annadanam', name: item.pandalName || 'Annadanam Schedule' })}
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Delete Annadanam Schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* Pandal Edit & Coordinate Picker Modal */}
      {editingPandal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-base">Review & Correct Pandal Coordinates & Info</h3>
              <button onClick={() => setEditingPandal(null)} className="text-amber-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePandalEdit} className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
              {/* Map Coordinate Picker */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-amber-900 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-700" />
                    <span>Move Map Marker or Enter Coordinates</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAdminUseMyLocation('pandal')}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 border border-amber-300"
                  >
                    <Navigation className="w-3 h-3 text-amber-700" />
                    <span>Use My Location</span>
                  </button>
                </div>

                <div className="relative w-full h-44 rounded-xl overflow-hidden border border-amber-300 shadow-inner">
                  <div ref={pickerContainerRef} className="w-full h-full z-10" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 pb-4">
                    <div className="bg-amber-600 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-md border-2 border-white animate-bounce">
                      📍
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdminUseMyLocation('pandal')}
                    className="absolute bottom-2 right-2 z-30 bg-white/95 backdrop-blur-xs hover:bg-amber-50 active:scale-95 text-amber-950 font-bold text-xs px-2.5 py-1.5 rounded-lg shadow-md border border-amber-300 flex items-center gap-1.5 cursor-pointer"
                    title="Center on your location"
                  >
                    <Navigation className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                    <span>Your Location</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingPandal.latitude || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEditingPandal({ ...editingPandal, latitude: val });
                      if (!isNaN(val) && pickerMapRef.current) {
                        pickerMapRef.current.setView([val, editingPandal.longitude || 78.4867], pickerMapRef.current.getZoom());
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingPandal.longitude || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEditingPandal({ ...editingPandal, longitude: val });
                      if (!isNaN(val) && pickerMapRef.current) {
                        pickerMapRef.current.setView([editingPandal.latitude || 17.3850, val], pickerMapRef.current.getZoom());
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Pandal Name</label>
                <input
                  type="text"
                  required
                  value={editingPandal.name || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Committee Name</label>
                <input
                  type="text"
                  value={editingPandal.committeeName || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, committeeName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Address</label>
                <input
                  type="text"
                  required
                  value={editingPandal.address || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Area</label>
                  <input
                    type="text"
                    required
                    value={editingPandal.area || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, area: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={editingPandal.city || 'Hyderabad'}
                    onChange={(e) => setEditingPandal({ ...editingPandal, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">State</label>
                <input
                  type="text"
                  value={editingPandal.state || 'Telangana'}
                  onChange={(e) => setEditingPandal({ ...editingPandal, state: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Timings (e.g. 6:00 AM - 10:00 PM)</label>
                <input
                  type="text"
                  value={editingPandal.timings || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, timings: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Description / History / Significance</label>
                <textarea
                  rows={3}
                  value={editingPandal.description || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              {/* Visual Photo Management (Ganesha Idol & Pandal Setup) */}
              <div className="space-y-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200">
                <label className="block font-bold text-amber-950 text-xs">
                  Pandal Photos (Lord Ganesha Idol & Setup)
                </label>

                {/* Hidden File Inputs for Admin */}
                <input
                  type="file"
                  ref={editGaneshaInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleAdminPhotoUpload(e.target.files[0], 'ganesha');
                    }
                  }}
                />
                <input
                  type="file"
                  ref={editPandalInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleAdminPhotoUpload(e.target.files[0], 'pandal');
                    }
                  }}
                />

                <div className="grid grid-cols-2 gap-3">
                  {/* Ganesha Idol Photo Preview */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-900 block">
                      🚩 Ganesha Idol (Cover)
                    </span>
                    <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-amber-300 bg-black/5 flex items-center justify-center">
                      {editingPandal.ganeshaImage || editingPandal.image ? (
                        <img
                          src={editingPandal.ganeshaImage || editingPandal.image}
                          alt="Ganesha Idol"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2 text-gray-400">
                          <span className="text-2xl block mb-1">🚩</span>
                          <span className="text-[10px]">No idol photo</span>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={isUploadingPhoto}
                        onClick={() => editGaneshaInputRef.current?.click()}
                        className="absolute bottom-1 right-1 bg-amber-800/90 hover:bg-amber-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow cursor-pointer flex items-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Change</span>
                      </button>
                    </div>
                  </div>

                  {/* Pandal Setup Photo Preview */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-900 block">
                      🎪 Pandal Setup / Stage
                    </span>
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-amber-200 bg-black/5 flex items-center justify-center">
                      {editingPandal.pandalImage ? (
                        <img
                          src={editingPandal.pandalImage}
                          alt="Pandal Setup"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2 text-gray-400">
                          <span className="text-2xl block mb-1">🎪</span>
                          <span className="text-[10px]">No pandal photo</span>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={isUploadingPhoto}
                        onClick={() => editPandalInputRef.current?.click()}
                        className="absolute bottom-1 right-1 bg-amber-800/90 hover:bg-amber-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow cursor-pointer flex items-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Change</span>
                      </button>
                    </div>
                  </div>
                </div>

                {isUploadingPhoto && (
                  <div className="text-xs text-amber-800 flex items-center gap-1.5 font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading new image…</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editingPandal.contactPerson || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Contact Phone / Info</label>
                  <input
                    type="text"
                    value={editingPandal.contactInfo || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, contactInfo: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Owner / Organizer Info</label>
                <input
                  type="text"
                  value={editingPandal.ownerInfo || ''}
                  onChange={(e) => setEditingPandal({ ...editingPandal, ownerInfo: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Status</label>
                <select
                  value={editingPandal.status || 'pending'}
                  onChange={(e) => setEditingPandal({ ...editingPandal, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-semibold"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved (Makes live)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingPandal(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 py-2.5 rounded-lg font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-800 hover:bg-amber-900 py-2.5 rounded-lg font-semibold text-white shadow-md"
                >
                  Save & Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Annadanam Edit & Coordinate Picker Modal */}
      {editingAnnadanam && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-base">Review & Correct Annadanam Location & Info</h3>
              <button onClick={() => setEditingAnnadanam(null)} className="text-amber-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAnnadanamEdit} className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
              {/* Map Coordinate Picker for Annadanam */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-amber-900 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-700" />
                    <span>Move Map Marker or Enter Coordinates</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAdminUseMyLocation('annadanam')}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 border border-amber-300"
                  >
                    <Navigation className="w-3 h-3 text-amber-700" />
                    <span>Use My Location</span>
                  </button>
                </div>

                <div className="relative w-full h-44 rounded-xl overflow-hidden border border-amber-300 shadow-inner">
                  <div ref={annadContainerRef} className="w-full h-full z-10" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 pb-4">
                    <div className="bg-amber-600 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-md border-2 border-white animate-bounce">
                      📍
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editingAnnadanam.latitude || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEditingAnnadanam({ ...editingAnnadanam, latitude: val });
                      if (!isNaN(val) && annadMapRef.current) {
                        annadMapRef.current.setView([val, editingAnnadanam.longitude || 78.4867], annadMapRef.current.getZoom());
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={editingAnnadanam.longitude || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEditingAnnadanam({ ...editingAnnadanam, longitude: val });
                      if (!isNaN(val) && annadMapRef.current) {
                        annadMapRef.current.setView([editingAnnadanam.latitude || 17.3850, val], annadMapRef.current.getZoom());
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Pandal / Venue Name</label>
                <input
                  type="text"
                  required
                  value={editingAnnadanam.pandalName || ''}
                  onChange={(e) => setEditingAnnadanam({ ...editingAnnadanam, pandalName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Address</label>
                <input
                  type="text"
                  required
                  value={editingAnnadanam.address || ''}
                  onChange={(e) => setEditingAnnadanam({ ...editingAnnadanam, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editingAnnadanam.date || ''}
                    onChange={(e) => setEditingAnnadanam({ ...editingAnnadanam, date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={editingAnnadanam.startTime || ''}
                    onChange={(e) => setEditingAnnadanam({ ...editingAnnadanam, startTime: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Status</label>
                <select
                  value={editingAnnadanam.status || 'pending'}
                  onChange={(e) => setEditingAnnadanam({ ...editingAnnadanam, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-semibold"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved (Makes live)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingAnnadanam(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 py-2.5 rounded-lg font-semibold text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-800 hover:bg-amber-900 py-2.5 rounded-lg font-semibold text-white shadow-md cursor-pointer"
                >
                  Save & Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL SUBMISSION DETAILS MODAL FOR PANDAL */}
      {viewingPandal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-amber-900 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-amber-800 rounded-xl">
                  <Eye className="w-5 h-5 text-yellow-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base sm:text-lg leading-tight truncate">
                    {viewingPandal.name}
                  </h3>
                  {viewingPandal.committeeName && (
                    <p className="text-xs text-amber-200 truncate">
                      {viewingPandal.committeeName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    viewingPandal.status === 'approved'
                      ? 'bg-green-500 text-white'
                      : viewingPandal.status === 'rejected'
                      ? 'bg-red-500 text-white'
                      : 'bg-yellow-400 text-amber-950'
                  }`}
                >
                  {viewingPandal.status}
                </span>
                <button
                  onClick={() => setViewingPandal(null)}
                  className="p-1 text-amber-200 hover:text-white rounded-lg hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Duplicate Pin Location Warning Banner */}
              {(() => {
                const duplicateInfo = getPandalDuplicateInfo(viewingPandal);
                if (!duplicateInfo.isDuplicate) return null;
                const matchCount = duplicateInfo.matchCount || (duplicateInfo.matchedPandal ? 1 : 0);
                const hasMultiple = matchCount > 1;

                return (
                  <div className="bg-red-50 border-2 border-red-400 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-100 text-red-700 rounded-xl shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-red-950 text-xs uppercase tracking-wide">
                            {hasMultiple ? `Duplicate Pin Suggestion (${matchCount} Matches Found)` : 'Duplicate Pin Suggestion'}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            duplicateInfo.type === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                          }`}>
                            Matches {duplicateInfo.type === 'live' ? 'Live Pandal' : 'Pending Suggestion'}
                          </span>
                        </div>
                        <p className="text-xs text-red-900 font-medium">
                          Shares exact pin location with: <strong>{duplicateInfo.matchedPandal?.name}</strong>
                          {hasMultiple && ` and ${matchCount - 1} other record(s)`} (~{Math.round(duplicateInfo.matchedPandal?.distanceMeters || 0)}m distance)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPandalMatchIndex(0);
                        setDuplicateComparisonTarget({ currentPandal: viewingPandal, duplicateInfo });
                      }}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{hasMultiple ? `Compare All (${matchCount})` : 'Compare Duplicates'}</span>
                    </button>
                  </div>
                );
              })()}

              {/* Photos Showcase Section */}
              {(() => {
                const allPhotos = Array.from(
                  new Set(
                    [
                      viewingPandal.ganeshaImage,
                      viewingPandal.pandalImage,
                      viewingPandal.image,
                      ...(Array.isArray(viewingPandal.photos) ? viewingPandal.photos : []),
                      ...(Array.isArray(viewingPandal.extraImages) ? viewingPandal.extraImages : []),
                      viewingPandal.photo,
                      viewingPandal.imageUrl,
                    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
                  )
                );

                const ganeshaCover = viewingPandal.ganeshaImage || viewingPandal.image || (allPhotos.length > 0 ? allPhotos[0] : '');
                const pandalSetup = viewingPandal.pandalImage || (allPhotos.length > 1 ? allPhotos[1] : (allPhotos.length > 0 && allPhotos[0] !== ganeshaCover ? allPhotos[0] : ''));
                const additionalPhotos = allPhotos.filter((p) => p !== ganeshaCover && p !== pandalSetup);

                return (
                  <div className="space-y-3 bg-amber-50/30 p-4 rounded-2xl border border-amber-200/80">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-amber-700" />
                        <span>Submitted Photos ({allPhotos.length}) — Click to Enlarge</span>
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="file"
                          id={`admin-upload-ganesha-${viewingPandal.id}`}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleUploadPhotoForSubmission(e.target.files[0], viewingPandal.id, 'ganesha');
                            }
                          }}
                        />
                        <input
                          type="file"
                          id={`admin-upload-pandal-${viewingPandal.id}`}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleUploadPhotoForSubmission(e.target.files[0], viewingPandal.id, 'pandal');
                            }
                          }}
                        />
                        <label
                          htmlFor={`admin-upload-ganesha-${viewingPandal.id}`}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>+ Ganesha Photo</span>
                        </label>
                        <label
                          htmlFor={`admin-upload-pandal-${viewingPandal.id}`}
                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>+ Pandal Photo</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Ganesha Idol Photo (Cover) */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                          <span>🚩</span>
                          <span>Lord Ganesha Idol (Cover Photo)</span>
                        </span>
                        <div
                          onClick={() => {
                            if (ganeshaCover) setLightboxImage({ url: ganeshaCover, title: `${viewingPandal.name} - Lord Ganesha Idol` });
                          }}
                          className={`relative h-48 rounded-xl overflow-hidden border-2 border-amber-400 bg-amber-50 shadow-sm transition-all ${
                            ganeshaCover ? 'group cursor-pointer hover:shadow-md' : ''
                          }`}
                        >
                          {ganeshaCover ? (
                            <>
                              <img
                                src={ganeshaCover}
                                alt="Lord Ganesha Idol"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-bold text-xs backdrop-blur-2xs">
                                <Maximize2 className="w-4 h-4" />
                                <span>Click to Zoom</span>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-amber-700/60 p-4 text-center">
                              <span className="text-3xl mb-1">🚩</span>
                              <span className="text-xs font-semibold">No Ganesha idol photo uploaded</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 bg-amber-900/90 text-yellow-300 text-[10px] font-extrabold px-2 py-0.5 rounded shadow">
                            Cover Photo
                          </div>
                        </div>
                      </div>

                      {/* Pandal Setup & Stage View */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                          <span>🎪</span>
                          <span>Pandal Setup & Stage View</span>
                        </span>
                        <div
                          onClick={() => {
                            if (pandalSetup) setLightboxImage({ url: pandalSetup, title: `${viewingPandal.name} - Pandal Setup` });
                          }}
                          className={`relative h-48 rounded-xl overflow-hidden border border-amber-300 bg-amber-50 shadow-sm transition-all ${
                            pandalSetup ? 'group cursor-pointer hover:shadow-md' : ''
                          }`}
                        >
                          {pandalSetup ? (
                            <>
                              <img
                                src={pandalSetup}
                                alt="Pandal Setup"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 font-bold text-xs backdrop-blur-2xs">
                                <Maximize2 className="w-4 h-4" />
                                <span>Click to Zoom</span>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-amber-700/60 p-4 text-center">
                              <span className="text-3xl mb-1">🎪</span>
                              <span className="text-xs font-semibold">No separate pandal setup photo</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                            Pandal Setup
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional photos gallery if any */}
                    {additionalPhotos.length > 0 && (
                      <div className="pt-2 border-t border-amber-200/60">
                        <span className="text-[11px] font-bold text-amber-950 mb-1.5 block">
                          Additional Gallery Images ({additionalPhotos.length})
                        </span>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {additionalPhotos.map((imgUrl: string, idx: number) => (
                            <div
                              key={idx}
                              onClick={() => setLightboxImage({ url: imgUrl, title: `${viewingPandal.name} - Photo ${idx + 3}` })}
                              className="relative aspect-square rounded-lg overflow-hidden border border-amber-200 group cursor-pointer hover:border-amber-400"
                            >
                              <img src={imgUrl} alt={`Additional ${idx + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="w-3.5 h-3.5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Submission Information Grid */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5 border-t border-amber-200/60 pt-3">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span>Submitted Details & Coordinates</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Address & Location Card */}
                  <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-900 uppercase">📍 Location & Address</span>
                    <p className="font-semibold text-gray-900 text-xs">{viewingPandal.address}</p>
                    <p className="text-gray-600">
                      Area: <strong>{viewingPandal.area}</strong> | City: <strong>{viewingPandal.city || 'Hyderabad'}</strong>, {viewingPandal.state || 'Telangana'}
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-gray-500 flex items-center justify-between">
                      <span>Lat: {viewingPandal.latitude} | Lng: {viewingPandal.longitude}</span>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${viewingPandal.latitude},${viewingPandal.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-800 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <span>Open Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Contact & Organizer Card */}
                  <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-900 uppercase">📞 Organizer & Contact</span>
                    <p className="font-semibold text-gray-900 text-xs">
                      {viewingPandal.committeeName || viewingPandal.associationName || 'Mandal Committee'}
                    </p>
                    {viewingPandal.contactPerson && (
                      <p className="text-gray-600">Person: <strong>{viewingPandal.contactPerson}</strong></p>
                    )}
                    {viewingPandal.phone || viewingPandal.contactInfo || viewingPandal.contactNumber ? (
                      <div className="pt-1 flex items-center gap-2">
                        <a
                          href={`tel:${viewingPandal.phone || viewingPandal.contactInfo || viewingPandal.contactNumber}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs"
                        >
                          <Phone className="w-3 h-3" />
                          <span>+91 {viewingPandal.phone || viewingPandal.contactInfo || viewingPandal.contactNumber}</span>
                        </a>
                      </div>
                    ) : (
                      <p className="text-gray-400 italic">No phone number provided</p>
                    )}
                  </div>
                </div>

                {/* Event Schedule & Timings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Darshan Timings</span>
                    </span>
                    <p className="font-semibold text-gray-900 mt-1">
                      {viewingPandal.timings || 'Not specified'}
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-900 uppercase flex items-center gap-1">
                      <Utensils className="w-3 h-3 text-amber-700" />
                      <span>Annadhanam</span>
                    </span>
                    <p className="font-semibold text-amber-950 mt-1">
                      {viewingPandal.annadanamDate
                        ? `${viewingPandal.annadanamDate} ${viewingPandal.servingTime ? `(${viewingPandal.servingTime})` : ''}`
                        : 'No free meals listed'}
                    </p>
                  </div>

                  <div className="p-3 bg-yellow-50/50 rounded-xl border border-yellow-200">
                    <span className="text-[10px] font-bold text-yellow-900 uppercase flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-700" />
                      <span>Nimajjanam Date</span>
                    </span>
                    <p className="font-semibold text-yellow-950 mt-1">
                      {viewingPandal.nimajjanamDate || 'Not specified'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {viewingPandal.description && (
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Description / Special Highlights</span>
                    <p className="text-gray-800 leading-relaxed whitespace-pre-line text-xs">
                      {viewingPandal.description}
                    </p>
                  </div>
                )}

                {/* Submission Audit Metadata */}
                <div className="p-3 bg-gray-100/70 rounded-xl text-[11px] text-gray-500 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Submitted by: <strong>{viewingPandal.submittedByEmail || viewingPandal.submittedBy || 'Devotee'}</strong></span>
                  </div>
                  {viewingPandal.createdAt && (
                    <span>Date: {new Date(viewingPandal.createdAt).toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {viewingPandal.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdatePandalStatus(viewingPandal.id, 'approved');
                      setViewingPandal((prev: any) => prev ? { ...prev, status: 'approved' } : null);
                    }}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve & Publish</span>
                  </button>
                )}
                {viewingPandal.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdatePandalStatus(viewingPandal.id, 'rejected');
                      setViewingPandal((prev: any) => prev ? { ...prev, status: 'rejected' } : null);
                    }}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>{viewingPandal.status === 'approved' ? 'Reject / Unpublish' : 'Reject'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPandal(viewingPandal);
                    setViewingPandal(null);
                  }}
                  className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Info & Coordinates</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalTarget({ id: viewingPandal.id, type: 'pandal', name: viewingPandal.name });
                    setViewingPandal(null);
                  }}
                  className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors cursor-pointer"
                  title="Delete submission"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewingPandal(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL SUBMISSION DETAILS MODAL FOR ANNADANAM */}
      {viewingAnnadanam && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-amber-900 text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-amber-800 rounded-xl">
                  <Utensils className="w-5 h-5 text-yellow-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base leading-tight truncate">
                    {viewingAnnadanam.pandalName}
                  </h3>
                  <p className="text-xs text-amber-200">Annadanam Free Meals Schedule</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    viewingAnnadanam.status === 'approved'
                      ? 'bg-green-500 text-white'
                      : viewingAnnadanam.status === 'rejected'
                      ? 'bg-red-500 text-white'
                      : 'bg-yellow-400 text-amber-950'
                  }`}
                >
                  {viewingAnnadanam.status}
                </span>
                <button
                  onClick={() => setViewingAnnadanam(null)}
                  className="p-1 text-amber-200 hover:text-white rounded-lg hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Duplicate Pin Location Warning Banner for Annadanam */}
              {(() => {
                const duplicateInfo = getAnnadanamDuplicateInfo(viewingAnnadanam);
                if (!duplicateInfo.isDuplicate) return null;
                const matchCount = duplicateInfo.matchCount || (duplicateInfo.matchedAnnadanam ? 1 : 0);
                const hasMultiple = matchCount > 1;

                return (
                  <div className="bg-red-50 border-2 border-red-400 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-100 text-red-700 rounded-xl shrink-0 mt-0.5">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-red-950 text-xs uppercase tracking-wide">
                            {hasMultiple ? `Duplicate Pin Suggestion (${matchCount} Schedules Found)` : 'Duplicate Pin Suggestion'}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            duplicateInfo.type === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                          }`}>
                            Matches {duplicateInfo.type === 'live' ? 'Live Annadanam' : 'Pending Suggestion'}
                          </span>
                        </div>
                        <p className="text-xs text-red-900 font-medium">
                          Shares exact pin location with: <strong>{duplicateInfo.matchedAnnadanam?.pandalName}</strong>
                          {hasMultiple && ` and ${matchCount - 1} other schedule(s)`} (~{Math.round(duplicateInfo.matchedAnnadanam?.distanceMeters || 0)}m distance)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAnnadanamMatchIndex(0);
                        setDuplicateAnnadanamComparisonTarget({ currentAnnadanam: viewingAnnadanam, duplicateInfo });
                      }}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{hasMultiple ? `Compare All (${matchCount})` : 'Compare Duplicates'}</span>
                    </button>
                  </div>
                );
              })()}

              {/* Timing & Date banner */}
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase">📅 Date</span>
                  <p className="font-extrabold text-sm text-amber-950">{viewingAnnadanam.date}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase">⏰ Serving Hours</span>
                  <p className="font-extrabold text-sm text-amber-950">
                    {viewingAnnadanam.startTime} {viewingAnnadanam.endTime ? `– ${viewingAnnadanam.endTime}` : ''}
                  </p>
                </div>
              </div>

              {/* Location Card */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">📍 Venue & Address</span>
                <p className="font-semibold text-gray-900 text-xs">{viewingAnnadanam.address}</p>
                <p className="text-gray-600">Area: <strong>{viewingAnnadanam.area}</strong></p>
                {viewingAnnadanam.latitude && viewingAnnadanam.longitude && (
                  <p className="text-[11px] font-mono text-gray-500 pt-1">
                    Coordinates: {viewingAnnadanam.latitude}, {viewingAnnadanam.longitude}
                  </p>
                )}
              </div>

              {/* Contact info */}
              {viewingAnnadanam.contactInfo && (
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">📞 Contact Information</span>
                  <p className="font-bold text-amber-900 text-xs">{viewingAnnadanam.contactInfo}</p>
                </div>
              )}

              {/* Description */}
              {viewingAnnadanam.description && (
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Notes / Menu</span>
                  <p className="text-gray-800 text-xs whitespace-pre-line">{viewingAnnadanam.description}</p>
                </div>
              )}

              {/* Photos Showcase Section for Annadanam */}
              {(() => {
                const annadPhotos = Array.from(
                  new Set(
                    [
                      viewingAnnadanam.image,
                      ...(Array.isArray(viewingAnnadanam.photos) ? viewingAnnadanam.photos : []),
                      ...(Array.isArray(viewingAnnadanam.extraImages) ? viewingAnnadanam.extraImages : []),
                      viewingAnnadanam.photo,
                      viewingAnnadanam.imageUrl,
                    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
                  )
                );

                if (annadPhotos.length === 0) return null;

                return (
                  <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2">
                    <span className="text-[10px] font-bold text-amber-900 uppercase flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-amber-700" />
                      <span>Uploaded Prasadam & Food Menu Photos ({annadPhotos.length})</span>
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {annadPhotos.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          onClick={() => setLightboxImage({ url: imgUrl, title: `${viewingAnnadanam.pandalName} - Prasadam Photo ${idx + 1}` })}
                          className="relative h-28 rounded-lg overflow-hidden border border-amber-300 group cursor-pointer hover:shadow-md"
                        >
                          <img src={imgUrl} alt={`Annadanam ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                            <Maximize2 className="w-4 h-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {viewingAnnadanam.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateAnnadanamStatus(viewingAnnadanam.id, 'approved');
                      setViewingAnnadanam((prev: any) => prev ? { ...prev, status: 'approved' } : null);
                    }}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                )}
                {viewingAnnadanam.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateAnnadanamStatus(viewingAnnadanam.id, 'rejected');
                      setViewingAnnadanam((prev: any) => prev ? { ...prev, status: 'rejected' } : null);
                    }}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnnadanam(viewingAnnadanam);
                    setViewingAnnadanam(null);
                  }}
                  className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingAnnadanam(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN LIGHTBOX IMAGE MODAL */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white/90 hover:text-white p-1.5 bg-black/60 rounded-full cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            {lightboxImage.title && (
              <p className="text-white text-xs font-bold mt-2 bg-black/60 px-3 py-1 rounded-full">
                {lightboxImage.title}
              </p>
            )}
          </div>
        </div>
      )}
      {/* DUPLICATE PIN LOCATION COMPARISON MODAL (PANDAL) */}
      {duplicateComparisonTarget && (() => {
        const current = duplicateComparisonTarget.currentPandal;
        const allMatches = duplicateComparisonTarget.duplicateInfo.allMatches && duplicateComparisonTarget.duplicateInfo.allMatches.length > 0
          ? duplicateComparisonTarget.duplicateInfo.allMatches
          : duplicateComparisonTarget.duplicateInfo.matchedPandal
          ? [duplicateComparisonTarget.duplicateInfo.matchedPandal]
          : [];
        const activeMatchIndex = Math.min(selectedPandalMatchIndex, Math.max(0, allMatches.length - 1));
        const matched = allMatches[activeMatchIndex] || duplicateComparisonTarget.duplicateInfo.matchedPandal;
        const isLive = matched?.status === 'approved';
        const multiTimeline = buildMultiSubmissionTimeline(current, allMatches);
        const matchCount = allMatches.length;

        return (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-red-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-900 via-red-800 to-amber-950 text-white p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-red-950/80 border border-red-500/50 rounded-2xl shrink-0">
                    <AlertTriangle className="w-6 h-6 text-yellow-300 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                        Duplicate Pin Location Detected
                      </h3>
                      {matchCount > 1 ? (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-400 shadow-xs flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>{matchCount} Matching Entries Found</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-400 shadow-xs">
                          {isLive ? 'Matches Live Pandal' : 'Matches Pending Suggestion'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-red-200 truncate mt-0.5">
                      Coordinates match within ~{Math.round(matched?.distanceMeters || 0)}m · {multiTimeline.totalCount} total records recorded at this pin
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateComparisonTarget(null)}
                  className="p-1.5 text-red-200 hover:text-white rounded-xl hover:bg-red-800/80 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Sub-header Notice */}
              <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2 text-xs text-red-900">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>
                  <strong>Admin Review Notice:</strong>{' '}
                  {matchCount > 1
                    ? `Found ${matchCount} matching entries at this exact pin location (${duplicateComparisonTarget.duplicateInfo.liveMatches.length} Live, ${duplicateComparisonTarget.duplicateInfo.suggestedMatches.length} Suggestions). Review the submission sequence timeline below and click tabs to compare against each record.`
                    : 'Both submissions point to the same pin location. Compare the submitted details and photos below.'}
                </span>
              </div>

              {/* Comparison Cards Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-gray-50/50">
                {/* CHRONOLOGY & TIMELINE BREAKDOWN BANNER */}
                <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-amber-950 text-white rounded-2xl p-4 sm:p-5 border border-amber-500/30 shadow-md">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-yellow-400 shrink-0" />
                      <h4 className="font-extrabold text-sm sm:text-base text-yellow-300 uppercase tracking-wide">
                        Submission Sequence & Origin Timeline ({multiTimeline.totalCount} Total Entries)
                      </h4>
                    </div>
                    <span className="text-[11px] text-gray-300">
                      Sorted chronologically (1st = Earliest)
                    </span>
                  </div>

                  {/* Multi-item Timeline Flow */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {multiTimeline.entries.map((entry, idx) => {
                        const isSelectedForComparison = matched && entry.id === matched.id;
                        const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;

                        return (
                          <div
                            key={entry.id || idx}
                            onClick={() => {
                              if (!entry.isCurrent) {
                                const matchIdx = allMatches.findIndex((m) => m.id === entry.id);
                                if (matchIdx >= 0) setSelectedPandalMatchIndex(matchIdx);
                              }
                            }}
                            className={`p-3 rounded-xl border text-xs transition-all relative ${
                              entry.isCurrent
                                ? 'bg-red-950/60 border-red-500 ring-2 ring-red-400/80 shadow-md'
                                : isSelectedForComparison
                                ? 'bg-amber-950/60 border-yellow-400 ring-2 ring-yellow-400/60 shadow-md cursor-pointer'
                                : 'bg-white/10 border-white/15 hover:bg-white/15 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-black text-yellow-300 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <span>{rankEmoji}</span> #{entry.rank} {entry.rank === 1 ? '(Original)' : entry.timeDifferenceFromFirst ? `(+${entry.timeDifferenceFromFirst})` : ''}
                              </span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                entry.isLive
                                  ? 'bg-emerald-600 text-white'
                                  : entry.isCurrent
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-600 text-white'
                              }`}>
                                {entry.isLive ? 'Live on Map' : entry.isCurrent ? 'Under Review' : 'Suggestion'}
                              </span>
                            </div>

                            <p className="font-bold text-white text-xs truncate" title={entry.name}>
                              {entry.name}
                            </p>

                            <p className="text-[10px] text-gray-300 flex items-center gap-1 mt-1 truncate">
                              <Clock className="w-3 h-3 text-yellow-400 shrink-0" />
                              <span>{entry.formattedDate}</span>
                            </p>

                            {entry.submittedBy && (
                              <p className="text-[10px] text-amber-200/80 truncate mt-0.5">
                                By: {entry.submittedBy}
                              </p>
                            )}

                            {entry.isCurrent && (
                              <div className="mt-1.5 pt-1 border-t border-red-500/40 text-[10px] font-extrabold text-red-300 flex items-center gap-1">
                                <span>👉 Current Pending Submission</span>
                              </div>
                            )}

                            {!entry.isCurrent && isSelectedForComparison && (
                              <div className="mt-1.5 pt-1 border-t border-yellow-500/40 text-[10px] font-extrabold text-yellow-300 flex items-center gap-1">
                                <span>👁️ Viewing in Comparison Card</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-2.5 text-xs text-amber-200/95 font-medium leading-relaxed bg-white/5 p-2.5 rounded-xl border border-white/10">
                      💡 <strong>Chronology Insight:</strong> {multiTimeline.summarySentence}
                    </p>
                  </div>
                </div>

                {/* MATCH SELECTOR TABS (WHEN MULTIPLE MATCHES EXIST) */}
                {allMatches.length > 1 && (
                  <div className="bg-white rounded-2xl p-3 border border-amber-300/80 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-700" />
                        <span>Select Matching Record to Compare Against ({activeMatchIndex + 1} of {allMatches.length}):</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={activeMatchIndex === 0}
                          onClick={() => setSelectedPandalMatchIndex((prev) => Math.max(0, prev - 1))}
                          className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
                          title="Previous Match"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={activeMatchIndex === allMatches.length - 1}
                          onClick={() => setSelectedPandalMatchIndex((prev) => Math.min(allMatches.length - 1, prev + 1))}
                          className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
                          title="Next Match"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {allMatches.map((m, idx) => {
                        const isMatchLive = m.status === 'approved';
                        const isSelected = idx === activeMatchIndex;
                        return (
                          <button
                            key={m.id || idx}
                            type="button"
                            onClick={() => setSelectedPandalMatchIndex(idx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all border cursor-pointer ${
                              isSelected
                                ? 'bg-amber-800 text-white border-amber-900 shadow-sm ring-2 ring-amber-500/50'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
                            }`}
                          >
                            <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #{idx + 1}</span>
                            <span className="truncate max-w-[140px]">{m.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full uppercase font-black ${
                              isMatchLive
                                ? isSelected ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'
                                : isSelected ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isMatchLive ? 'Live' : 'Pending'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SIDE-BY-SIDE COMPARISON CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* LEFT CARD: Current Suggestion (Under Review) */}
                  {(() => {
                    const currentPhotos = extractAllPhotos(current);
                    return (
                      <div className="bg-white rounded-2xl border-2 border-red-300 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-red-100/70 border-b border-red-200 px-4 py-2.5 flex items-center justify-between">
                          <span className="text-xs font-black text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-600"></span>
                            🥈 #{multiTimeline.currentEntry?.rank || 2} of {multiTimeline.totalCount} (Under Review)
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400 text-amber-950">
                            {current.status || 'pending'}
                          </span>
                        </div>

                        <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between text-xs">
                          <div className="space-y-3">
                            {/* Name & Committee */}
                            <div>
                              <h4 className="text-base font-extrabold text-gray-900">
                                {current.name}
                              </h4>
                              {current.committeeName && (
                                <p className="text-xs font-bold text-amber-800">
                                  {current.committeeName}
                                </p>
                              )}
                            </div>

                            {/* Address & GPS */}
                            <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 border border-gray-200 text-gray-700">
                              <p className="flex items-start gap-1.5 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                <span>{current.address}, {current.area} ({current.city || 'Hyderabad'})</span>
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono">
                                GPS: {Number(current.latitude).toFixed(5)}, {Number(current.longitude).toFixed(5)}
                              </p>
                            </div>

                            {/* Submitter Details */}
                            <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/60 text-amber-950 space-y-1">
                              <p className="font-semibold">
                                Submitted By: <strong>{current.submittedBy || 'Devotee / Anonymous'}</strong>
                              </p>
                              {current.submittedByPhone && (
                                <p className="text-[11px] text-amber-900">
                                  Contact: <strong>{current.submittedByPhone}</strong>
                                </p>
                              )}
                              {current.description && (
                                <p className="text-[11px] text-gray-600 line-clamp-2">
                                  Notes: {current.description}
                                </p>
                              )}
                              <p className="text-[10px] text-gray-400 pt-0.5">
                                Submitted: {formatFriendlyDateTime(current.createdAt)}
                              </p>
                            </div>

                            {/* Photos */}
                            <div>
                              <p className="font-bold text-gray-800 mb-1.5 text-[11px] uppercase tracking-wider">
                                Submitted Photos ({currentPhotos.length})
                              </p>
                              {currentPhotos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {currentPhotos.slice(0, 4).map((pUrl, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => setLightboxImage({ url: pUrl, title: `${current.name} - Photo ${idx + 1}` })}
                                      className="h-28 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                                    >
                                      <img
                                        src={pUrl}
                                        alt={`Photo ${idx + 1}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                                        {idx === 0 ? 'Idol' : `Photo ${idx + 1}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-24 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs italic">
                                  No photos attached
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* RIGHT CARD: Existing Matched Pandal */}
                  {(() => {
                    const matchedPhotos = matched?.photos || (matched?.image ? [matched.image] : []);

                    return (
                      <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col ${
                        isLive ? 'border-green-400' : 'border-amber-400'
                      }`}>
                        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
                          isLive ? 'bg-green-100/80 border-green-200 text-green-950' : 'bg-amber-100/80 border-amber-200 text-amber-950'
                        }`}>
                          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-600' : 'bg-amber-600'}`}></span>
                            {isLive
                              ? `🥇 Match #${activeMatchIndex + 1} (Approved & Live on Map)`
                              : `🥇 Match #${activeMatchIndex + 1} (Earlier Suggestion)`}
                          </span>
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isLive ? 'bg-green-600 text-white' : 'bg-amber-600 text-white'
                          }`}>
                            {isLive ? 'LIVE / APPROVED' : `PENDING (#${activeMatchIndex + 1})`}
                          </span>
                        </div>

                        <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between text-xs">
                          <div className="space-y-3">
                            {/* Name & Committee */}
                            <div>
                              <h4 className="text-base font-extrabold text-gray-900">
                                {matched?.name || 'Matched Pandal'}
                              </h4>
                              {matched?.committeeName && (
                                <p className="text-xs font-bold text-amber-800">
                                  {matched.committeeName}
                                </p>
                              )}
                            </div>

                            {/* Address & GPS */}
                            <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 border border-gray-200 text-gray-700">
                              <p className="flex items-start gap-1.5 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                <span>{matched?.address || 'Same Pin Location'} {matched?.area ? `, ${matched.area}` : ''}</span>
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono">
                                GPS: {matched?.latitude?.toFixed(5)}, {matched?.longitude?.toFixed(5)}
                              </p>
                            </div>

                            {/* Match Proximity Badge */}
                            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-950 space-y-1">
                              <p className="font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Exact Pin Match (~{Math.round(matched?.distanceMeters || 0)} meters apart)</span>
                              </p>
                              <p className="text-[11px] text-emerald-800">
                                Status: {isLive ? 'Already verified and visible to devotees on the live map.' : 'Submitted earlier and awaiting admin review.'}
                              </p>
                              <p className="text-[10px] text-emerald-900">
                                Submitted: {formatFriendlyDateTime(matched?.createdAt)}
                              </p>
                            </div>

                            {/* Matched Photos */}
                            <div>
                              <p className="font-bold text-gray-800 mb-1.5 text-[11px] uppercase tracking-wider">
                                Existing Pandal Photos ({matchedPhotos.length})
                              </p>
                              {matchedPhotos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {matchedPhotos.slice(0, 4).map((pUrl, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => setLightboxImage({ url: pUrl, title: `${matched?.name} - Existing Photo ${idx + 1}` })}
                                      className="h-28 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                                    >
                                      <img
                                        src={pUrl}
                                        alt={`Existing ${idx + 1}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                                        {idx === 0 ? 'Cover' : `Photo ${idx + 1}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-24 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs italic">
                                  No existing photo
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="bg-gray-100 border-t border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdatePandalStatus(duplicateComparisonTarget.currentPandal.id, 'rejected');
                      setDuplicateComparisonTarget(null);
                      if (viewingPandal?.id === duplicateComparisonTarget.currentPandal.id) {
                        setViewingPandal((prev: any) => prev ? { ...prev, status: 'rejected' } : null);
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Current Submission as Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdatePandalStatus(duplicateComparisonTarget.currentPandal.id, 'approved');
                      setDuplicateComparisonTarget(null);
                      if (viewingPandal?.id === duplicateComparisonTarget.currentPandal.id) {
                        setViewingPandal((prev: any) => prev ? { ...prev, status: 'approved' } : null);
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve Anyway</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPandal(duplicateComparisonTarget.currentPandal);
                      setDuplicateComparisonTarget(null);
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Location / Pin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateComparisonTarget(null)}
                    className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DUPLICATE ANNADANAM PIN LOCATION COMPARISON MODAL */}
      {duplicateAnnadanamComparisonTarget && (() => {
        const current = duplicateAnnadanamComparisonTarget.currentAnnadanam;
        const allMatches = duplicateAnnadanamComparisonTarget.duplicateInfo.allMatches && duplicateAnnadanamComparisonTarget.duplicateInfo.allMatches.length > 0
          ? duplicateAnnadanamComparisonTarget.duplicateInfo.allMatches
          : duplicateAnnadanamComparisonTarget.duplicateInfo.matchedAnnadanam
          ? [duplicateAnnadanamComparisonTarget.duplicateInfo.matchedAnnadanam]
          : [];
        const activeMatchIndex = Math.min(selectedAnnadanamMatchIndex, Math.max(0, allMatches.length - 1));
        const matched = allMatches[activeMatchIndex] || duplicateAnnadanamComparisonTarget.duplicateInfo.matchedAnnadanam;
        const isLive = matched?.status === 'approved';
        const multiTimeline = buildMultiSubmissionTimeline(current, allMatches);
        const matchCount = allMatches.length;

        return (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-red-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-900 via-red-800 to-amber-950 text-white p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-red-950/80 border border-red-500/50 rounded-2xl shrink-0">
                    <Utensils className="w-6 h-6 text-yellow-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                        Duplicate Annadanam Pin Location Detected
                      </h3>
                      {matchCount > 1 ? (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-400 shadow-xs flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>{matchCount} Matching Schedules Found</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-400 shadow-xs">
                          {isLive ? 'Matches Live Annadanam' : 'Matches Pending Suggestion'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-red-200 truncate mt-0.5">
                      Coordinates match within ~{Math.round(matched?.distanceMeters || 0)}m · {multiTimeline.totalCount} total schedules recorded at this pin
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateAnnadanamComparisonTarget(null)}
                  className="p-1.5 text-red-200 hover:text-white rounded-xl hover:bg-red-800/80 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Sub-header Notice */}
              <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2 text-xs text-red-900">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>
                  <strong>Admin Review Notice:</strong>{' '}
                  {matchCount > 1
                    ? `Found ${matchCount} Annadanam food schedule submissions sharing the same pin coordinates (${duplicateAnnadanamComparisonTarget.duplicateInfo.liveMatches.length} Live, ${duplicateAnnadanamComparisonTarget.duplicateInfo.suggestedMatches.length} Suggestions). Review the schedule timeline below and click tabs to compare against each.`
                    : 'Both Annadanam food schedule submissions share the same pin coordinates. Compare details and photos below.'}
                </span>
              </div>

              {/* Comparison Cards Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-gray-50/50">
                {/* CHRONOLOGY & TIMELINE BREAKDOWN BANNER FOR ANNADANAM */}
                <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-amber-950 text-white rounded-2xl p-4 sm:p-5 border border-amber-500/30 shadow-md">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-yellow-400 shrink-0" />
                      <h4 className="font-extrabold text-sm sm:text-base text-yellow-300 uppercase tracking-wide">
                        Annadanam Schedule Sequence & Origin Timeline ({multiTimeline.totalCount} Total Entries)
                      </h4>
                    </div>
                    <span className="text-[11px] text-gray-300">
                      Sorted chronologically (1st = Earliest)
                    </span>
                  </div>

                  {/* Multi-item Timeline Flow */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {multiTimeline.entries.map((entry, idx) => {
                        const isSelectedForComparison = matched && entry.id === matched.id;
                        const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;

                        return (
                          <div
                            key={entry.id || idx}
                            onClick={() => {
                              if (!entry.isCurrent) {
                                const matchIdx = allMatches.findIndex((m) => m.id === entry.id);
                                if (matchIdx >= 0) setSelectedAnnadanamMatchIndex(matchIdx);
                              }
                            }}
                            className={`p-3 rounded-xl border text-xs transition-all relative ${
                              entry.isCurrent
                                ? 'bg-red-950/60 border-red-500 ring-2 ring-red-400/80 shadow-md'
                                : isSelectedForComparison
                                ? 'bg-amber-950/60 border-yellow-400 ring-2 ring-yellow-400/60 shadow-md cursor-pointer'
                                : 'bg-white/10 border-white/15 hover:bg-white/15 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-black text-yellow-300 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <span>{rankEmoji}</span> #{entry.rank} {entry.rank === 1 ? '(Original)' : entry.timeDifferenceFromFirst ? `(+${entry.timeDifferenceFromFirst})` : ''}
                              </span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                entry.isLive
                                  ? 'bg-emerald-600 text-white'
                                  : entry.isCurrent
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-600 text-white'
                              }`}>
                                {entry.isLive ? 'Live on Map' : entry.isCurrent ? 'Under Review' : 'Suggestion'}
                              </span>
                            </div>

                            <p className="font-bold text-white text-xs truncate" title={entry.name}>
                              {entry.name}
                            </p>

                            <p className="text-[10px] text-gray-300 flex items-center gap-1 mt-1 truncate">
                              <Clock className="w-3 h-3 text-yellow-400 shrink-0" />
                              <span>{entry.formattedDate}</span>
                            </p>

                            {entry.submittedBy && (
                              <p className="text-[10px] text-amber-200/80 truncate mt-0.5">
                                By: {entry.submittedBy}
                              </p>
                            )}

                            {entry.isCurrent && (
                              <div className="mt-1.5 pt-1 border-t border-red-500/40 text-[10px] font-extrabold text-red-300 flex items-center gap-1">
                                <span>👉 Current Pending Submission</span>
                              </div>
                            )}

                            {!entry.isCurrent && isSelectedForComparison && (
                              <div className="mt-1.5 pt-1 border-t border-yellow-500/40 text-[10px] font-extrabold text-yellow-300 flex items-center gap-1">
                                <span>👁️ Viewing in Comparison Card</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-2.5 text-xs text-amber-200/95 font-medium leading-relaxed bg-white/5 p-2.5 rounded-xl border border-white/10">
                      💡 <strong>Chronology Insight:</strong> {multiTimeline.summarySentence}
                    </p>
                  </div>
                </div>

                {/* MATCH SELECTOR TABS (WHEN MULTIPLE ANNADANAM MATCHES EXIST) */}
                {allMatches.length > 1 && (
                  <div className="bg-white rounded-2xl p-3 border border-amber-300/80 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-700" />
                        <span>Select Annadanam Record to Compare Against ({activeMatchIndex + 1} of {allMatches.length}):</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={activeMatchIndex === 0}
                          onClick={() => setSelectedAnnadanamMatchIndex((prev) => Math.max(0, prev - 1))}
                          className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
                          title="Previous Match"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={activeMatchIndex === allMatches.length - 1}
                          onClick={() => setSelectedAnnadanamMatchIndex((prev) => Math.min(allMatches.length - 1, prev + 1))}
                          className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700"
                          title="Next Match"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {allMatches.map((m, idx) => {
                        const isMatchLive = m.status === 'approved';
                        const isSelected = idx === activeMatchIndex;
                        return (
                          <button
                            key={m.id || idx}
                            type="button"
                            onClick={() => setSelectedAnnadanamMatchIndex(idx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all border cursor-pointer ${
                              isSelected
                                ? 'bg-amber-800 text-white border-amber-900 shadow-sm ring-2 ring-amber-500/50'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
                            }`}
                          >
                            <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} #{idx + 1}</span>
                            <span className="truncate max-w-[140px]">{m.pandalName}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full uppercase font-black ${
                              isMatchLive
                                ? isSelected ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'
                                : isSelected ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isMatchLive ? 'Live' : 'Pending'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SIDE-BY-SIDE ANNADANAM CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* LEFT CARD: Current Annadanam Suggestion (Under Review) */}
                  {(() => {
                    const currentPhotos = extractAllPhotos(current);
                    return (
                      <div className="bg-white rounded-2xl border-2 border-red-300 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-red-100/70 border-b border-red-200 px-4 py-2.5 flex items-center justify-between">
                          <span className="text-xs font-black text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-600"></span>
                            🥈 #{multiTimeline.currentEntry?.rank || 2} of {multiTimeline.totalCount} (Under Review)
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400 text-amber-950">
                            {current.status || 'pending'}
                          </span>
                        </div>

                        <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between text-xs">
                          <div className="space-y-3">
                            {/* Name & Area */}
                            <div>
                              <h4 className="text-base font-extrabold text-gray-900">
                                {current.pandalName}
                              </h4>
                              <p className="text-xs font-bold text-amber-800">
                                Area: {current.area || 'Hyderabad'}
                              </p>
                            </div>

                            {/* Date & Timings */}
                            <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 text-amber-950 space-y-1">
                              <p className="font-bold flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                                <span>Date: <strong>{current.date}</strong></span>
                              </p>
                              <p className="flex items-center gap-1.5 text-[11px] text-gray-700">
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                <span>Timings: {current.startTime} {current.endTime ? `– ${current.endTime}` : ''}</span>
                              </p>
                            </div>

                            {/* Address & GPS */}
                            <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 border border-gray-200 text-gray-700">
                              <p className="flex items-start gap-1.5 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                <span>{current.address}</span>
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono">
                                GPS: {Number(current.latitude).toFixed(5)}, {Number(current.longitude).toFixed(5)}
                              </p>
                            </div>

                            {/* Submitter & Description */}
                            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-gray-800 space-y-1">
                              {current.contactInfo && (
                                <p className="font-semibold text-amber-900">
                                  Contact: <strong>{current.contactInfo}</strong>
                                </p>
                              )}
                              {current.description && (
                                <p className="text-[11px] text-gray-600 line-clamp-2">
                                  Menu/Notes: {current.description}
                                </p>
                              )}
                              <p className="text-[10px] text-gray-400">
                                Submitted: {formatFriendlyDateTime(current.createdAt)}
                              </p>
                            </div>

                            {/* Photos */}
                            <div>
                              <p className="font-bold text-gray-800 mb-1.5 text-[11px] uppercase tracking-wider">
                                Submitted Prasadam Photos ({currentPhotos.length})
                              </p>
                              {currentPhotos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {currentPhotos.slice(0, 4).map((pUrl, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => setLightboxImage({ url: pUrl, title: `${current.pandalName} - Prasadam ${idx + 1}` })}
                                      className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                                    >
                                      <img
                                        src={pUrl}
                                        alt={`Prasadam ${idx + 1}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-20 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs italic">
                                  No photos attached
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* RIGHT CARD: Existing Matched Annadanam */}
                  {(() => {
                    const matchedPhotos = matched?.photos || (matched?.image ? [matched.image] : []);

                    return (
                      <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col ${
                        isLive ? 'border-green-400' : 'border-amber-400'
                      }`}>
                        <div className={`px-4 py-2.5 border-b flex items-center justify-between ${
                          isLive ? 'bg-green-100/80 border-green-200 text-green-950' : 'bg-amber-100/80 border-amber-200 text-amber-950'
                        }`}>
                          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-600' : 'bg-amber-600'}`}></span>
                            {isLive
                              ? `🥇 Match #${activeMatchIndex + 1} (Approved & Live Annadanam)`
                              : `🥇 Match #${activeMatchIndex + 1} (Earlier Suggestion)`}
                          </span>
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isLive ? 'bg-green-600 text-white' : 'bg-amber-600 text-white'
                          }`}>
                            {isLive ? 'LIVE / APPROVED' : `PENDING (#${activeMatchIndex + 1})`}
                          </span>
                        </div>

                        <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between text-xs">
                          <div className="space-y-3">
                            {/* Name & Area */}
                            <div>
                              <h4 className="text-base font-extrabold text-gray-900">
                                {matched?.pandalName || 'Matched Annadanam'}
                              </h4>
                              <p className="text-xs font-bold text-amber-800">
                                Area: {matched?.area || 'Hyderabad'}
                              </p>
                            </div>

                            {/* Date & Timings */}
                            <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 text-amber-950 space-y-1">
                              <p className="font-bold flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                                <span>Date: <strong>{matched?.date}</strong></span>
                              </p>
                              <p className="flex items-center gap-1.5 text-[11px] text-gray-700">
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                <span>Timings: {matched?.startTime} {matched?.endTime ? `– ${matched?.endTime}` : ''}</span>
                              </p>
                            </div>

                            {/* Address & GPS */}
                            <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 border border-gray-200 text-gray-700">
                              <p className="flex items-start gap-1.5 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                <span>{matched?.address || 'Same Location'}</span>
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono">
                                GPS: {matched?.latitude?.toFixed(5)}, {matched?.longitude?.toFixed(5)}
                              </p>
                            </div>

                            {/* Match Proximity Badge */}
                            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-950 space-y-1">
                              <p className="font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Exact Pin Match (~{Math.round(matched?.distanceMeters || 0)} meters apart)</span>
                              </p>
                              <p className="text-[11px] text-emerald-800">
                                Status: {isLive ? 'Already verified and visible to devotees on the Annadanam schedules list.' : 'Submitted earlier and awaiting review.'}
                              </p>
                              <p className="text-[10px] text-emerald-900">
                                Submitted: {formatFriendlyDateTime(matched?.createdAt)}
                              </p>
                            </div>

                            {/* Matched Photos */}
                            <div>
                              <p className="font-bold text-gray-800 mb-1.5 text-[11px] uppercase tracking-wider">
                                Existing Prasadam Photos ({matchedPhotos.length})
                              </p>
                              {matchedPhotos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {matchedPhotos.slice(0, 4).map((pUrl, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => setLightboxImage({ url: pUrl, title: `${matched?.pandalName} - Existing Photo ${idx + 1}` })}
                                      className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                                    >
                                      <img
                                        src={pUrl}
                                        alt={`Existing ${idx + 1}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-20 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs italic">
                                  No existing photo
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="bg-gray-100 border-t border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateAnnadanamStatus(duplicateAnnadanamComparisonTarget.currentAnnadanam.id, 'rejected');
                      setDuplicateAnnadanamComparisonTarget(null);
                      if (viewingAnnadanam?.id === duplicateAnnadanamComparisonTarget.currentAnnadanam.id) {
                        setViewingAnnadanam((prev: any) => prev ? { ...prev, status: 'rejected' } : null);
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Current Submission as Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateAnnadanamStatus(duplicateAnnadanamComparisonTarget.currentAnnadanam.id, 'approved');
                      setDuplicateAnnadanamComparisonTarget(null);
                      if (viewingAnnadanam?.id === duplicateAnnadanamComparisonTarget.currentAnnadanam.id) {
                        setViewingAnnadanam((prev: any) => prev ? { ...prev, status: 'approved' } : null);
                      }
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve Anyway</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnnadanam(duplicateAnnadanamComparisonTarget.currentAnnadanam);
                      setDuplicateAnnadanamComparisonTarget(null);
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Location / Pin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateAnnadanamComparisonTarget(null)}
                    className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom Confirmation Modal for Deletion (No window.confirm!) */}
      {deleteModalTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 border border-red-100 text-center space-y-4">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Delete {deleteModalTarget.type === 'pandal' ? 'Pandal Submission' : 'Annadanam Schedule'}?
              </h3>
              <p className="text-xs text-gray-600 mt-1.5 px-2">
                Are you sure you want to permanently delete <strong className="text-gray-900">"{deleteModalTarget.name}"</strong>? This item will be removed permanently from the database and the public map.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalTarget(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeDelete}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-80 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-bold text-white transition-all transform animate-in slide-in-from-bottom-3 ${
            toast.type === 'success' ? 'bg-green-700 border border-green-500' : 'bg-red-700 border border-red-500'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-green-200" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-200" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
