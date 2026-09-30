import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Utensils, Calendar, Clock, MapPin, Camera, AlertCircle, CheckCircle2, Loader2, Phone, Plus, AlertTriangle, Sparkles } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LocationPicker } from './LocationPicker';
import { PhotoUploader } from './PhotoUploader';
import { ANNADANAM_DATA } from '../data/annadanam';
import { checkDuplicateAnnadanamLocation } from '../utils/duplicateDetector';
import { isAnnadanamExpired, cleanupExpiredAnnadanam } from '../utils/annadanamExpiry';

interface SubmitAnnadanamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubmitAnnadanamModal: React.FC<SubmitAnnadanamModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [submittedPandalName, setSubmittedPandalName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingAnnadanam, setExistingAnnadanam] = useState<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isBackdropMouseDownRef = useRef(false);

  // Mandatory Form fields
  const [pandalName, setPandalName] = useState('');
  const [date, setDate] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number>(17.3850);
  const [longitude, setLongitude] = useState<number>(78.4867);
  const [hasPickedLocation, setHasPickedLocation] = useState(false);

  // Other fields
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [startTime, setStartTime] = useState('12:30');
  const [endTime, setEndTime] = useState('15:30');
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  // Real-time Duplicate Pin Location Detection for Annadanam
  const duplicateCheck = useMemo(() => {
    if (!hasPickedLocation && latitude === 17.3850 && longitude === 78.4867) {
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
    return checkDuplicateAnnadanamLocation(
      latitude,
      longitude,
      ANNADANAM_DATA.filter((a) => !isAnnadanamExpired(a.date, a.createdAt)),
      existingAnnadanam
    );
  }, [latitude, longitude, hasPickedLocation, existingAnnadanam]);

  const resetForm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPandalName('');
    setDate('');
    setAddress('');
    setLatitude(17.3850);
    setLongitude(78.4867);
    setHasPickedLocation(false);
    setArea('');
    setCity('Hyderabad');
    setStartTime('12:30');
    setEndTime('15:30');
    setPhotos([]);
    setDescription('');
    setContactInfo('');
    setSuccessMsg(false);
    setErrorMsg(null);
    setSubmittedPandalName('');
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Listen to existing Annadanam and perform automatic background expiry cleanup
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = onSnapshot(collection(db, 'annadanam'), (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
      // Background cleanup of expired records (>1 day after event date)
      cleanupExpiredAnnadanam(items).catch(() => {});
      // Keep active non-expired records in state
      const activeItems = items.filter((it: any) => !isAnnadanamExpired(it.date, it.createdAt));
      setExistingAnnadanam(activeItems);
    }, (err) => {
      console.warn('Annadanam Firestore snapshot error:', err);
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSuccessMsg(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Mandatory Validation: Pandal Name
    if (!pandalName.trim()) {
      setErrorMsg('Pandal / Temple name is mandatory. Please enter a name.');
      return;
    }

    // 2. Mandatory Validation: Date
    if (!date) {
      setErrorMsg('Annadanam date is mandatory. Please select the date.');
      return;
    }

    // 3. Mandatory Validation: Location (Address and coordinates)
    if (!address.trim()) {
      setErrorMsg('Location / Address is mandatory. Please enter an address or choose a location on the map.');
      return;
    }

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      setErrorMsg('Valid location coordinates on the map are mandatory.');
      return;
    }

    setLoading(true);
    try {
      const annadanamId = 'anna_' + Date.now();
      const payload = {
        id: annadanamId,
        pandalName: pandalName.trim(),
        date,
        startTime: startTime.trim() || '12:00 PM',
        endTime: endTime.trim() || '',
        address: address.trim(),
        area: area.trim() || 'Hyderabad',
        city: city || 'Hyderabad',
        latitude,
        longitude,
        photos: photos || [],
        image: photos.length > 0 ? photos[0] : '',
        description: description.trim(),
        contactInfo: contactInfo.trim(),
        status: 'pending',
        submittedBy: user?.uid || 'anonymous',
        submittedByEmail: user?.email || '',
        createdAt: new Date().toISOString(),
        // Duplicate detection metadata
        isDuplicate: duplicateCheck.isDuplicate,
        duplicateType: duplicateCheck.type || null,
        duplicateMessage: duplicateCheck.message || '',
        duplicateOfId: duplicateCheck.matchedAnnadanam?.id || '',
        duplicateOfName: duplicateCheck.matchedAnnadanam?.pandalName || '',
        duplicateDistanceMeters: duplicateCheck.matchedAnnadanam?.distanceMeters || 0,
      };

      await setDoc(doc(db, 'annadanam', annadanamId), payload);
      setSubmittedPandalName(pandalName.trim());
      setSuccessMsg(true);

      // Reset form fields immediately so next schedule entry is fresh
      setPandalName('');
      setDate('');
      setAddress('');
      setLatitude(17.3850);
      setLongitude(78.4867);
      setHasPickedLocation(false);
      setArea('');
      setCity('Hyderabad');
      setStartTime('12:30');
      setEndTime('15:30');
      setPhotos([]);
      setDescription('');
      setContactInfo('');
      setErrorMsg(null);

      onSuccess();

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSuccessMsg(false);
        onClose();
      }, 6000);
    } catch (err: any) {
      console.error('Error submitting Annadanam:', err);
      setErrorMsg(err.message || 'Failed to submit Annadanam schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        isBackdropMouseDownRef.current = (e.target === e.currentTarget);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropMouseDownRef.current) {
          resetForm();
          onClose();
        }
      }}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-amber-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900 to-amber-950 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-800/80 rounded-xl text-yellow-300">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Suggest Annadanam Schedule</h2>
              <p className="text-xs text-amber-200">Help devotees find free Maha Prasadam & food distribution</p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-1.5 text-amber-200 hover:text-white hover:bg-amber-800/50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Banner */}
        {successMsg ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 my-auto">
            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900">Annadanam Submitted Successfully!</h3>
              <p className="text-xs text-gray-600 max-w-sm mx-auto">
                Thank you for contributing{submittedPandalName ? ` for "${submittedPandalName}"` : ''}. It will appear on the public Annadanam schedules list once approved.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5 w-full justify-center">
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Suggest Another Schedule</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Back to Map
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            
            {/* Error Message Alert */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. MANDATORY: PANDAL NAME */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                <span>
                  Pandal / Temple Name <span className="text-red-500 font-black">*</span>
                </span>
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  Mandatory
                </span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Khairatabad Ganesh Utsav Samithi"
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs font-medium"
                value={pandalName}
                onChange={(e) => setPandalName(e.target.value)}
              />
            </div>

            {/* 2. MANDATORY: DATE & TIMINGS */}
            <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-700" />
                  <span>Date & Serving Timings</span>
                </span>
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  Date is Mandatory *
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Date (Mandatory) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700">
                    Annadanam Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                {/* Start Time */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-700" />
                    <span>Start Time</span>
                  </label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>

                {/* End Time */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span>End Time (optional)</span>
                  </label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 3. MANDATORY: LOCATION (Address & Interactive Map Picker) */}
            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-300/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span>Location & Interactive Map <span className="text-red-500 font-black">*</span></span>
                </label>
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  Mandatory *
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700">
                    Area / Locality <span className="text-gray-400 font-normal">(e.g. Khairatabad)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Somajiguda, Khairatabad"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700">
                    Full Address / Landmark <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Near Bustop, Main Road"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      if (e.target.value.trim()) setHasPickedLocation(true);
                    }}
                  />
                </div>
              </div>

              {/* Map Location Picker */}
              <div className="space-y-1">
                <p className="text-[11px] text-gray-600">
                  Tap <strong>"Your Location"</strong> inside the map or move the pin to set precise coordinates:
                </p>
                <LocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  address={address}
                  onLocationChange={(lat, lng, addr, detectedArea, detectedCity) => {
                    setLatitude(lat);
                    setLongitude(lng);
                    if (addr) setAddress(addr);
                    if (detectedArea && !area) setArea(detectedArea);
                    if (detectedCity) setCity(detectedCity);
                    setHasPickedLocation(true);
                  }}
                />

                {/* Real-time Duplicate Annadanam Notice */}
                {duplicateCheck.isDuplicate && (
                  <div className="mt-2.5 p-3 rounded-xl border bg-amber-50 border-amber-300 text-amber-950 flex items-start gap-2.5 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 animate-pulse" />
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-amber-950">
                          {duplicateCheck.message}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          duplicateCheck.type === 'live' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-amber-900'
                        }`}>
                          {duplicateCheck.type === 'live' ? 'Live on Annadanam List' : 'Under Review'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        An Annadanam schedule for <strong>"{duplicateCheck.matchedAnnadanam?.pandalName}"</strong> already shares this exact pin location (~{Math.round(duplicateCheck.matchedAnnadanam?.distanceMeters || 0)}m).
                      </p>
                      <p className="text-[10px] text-amber-700 font-medium">
                        {duplicateCheck.type === 'live'
                          ? 'Devotees can already see this food schedule. If submitted, this entry will show as duplicate to admin.'
                          : 'Our team is already reviewing this schedule. Any new submission with the same coordinates will show as duplicate to admin.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. PHOTO SECTION: BELOW MAPS & ABOVE DESCRIPTION */}
            <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-amber-700" />
                  <span>Photos (Maha Prasadam, Food Menu & Pandal)</span>
                </label>
                <span className="text-[10px] text-gray-500 font-semibold bg-white border border-amber-200 px-2 py-0.5 rounded-full">
                  Below Maps • Max 4
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Upload photos of the prasadam preparation, banners, or pandal. (PNG, JPG, WEBP)
              </p>
              <PhotoUploader photos={photos} onPhotosChange={setPhotos} maxPhotos={4} />
            </div>

            {/* 5. DESCRIPTION: AT THE BOTTOM ABOVE SUBMIT (BELOW PHOTOS) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-800 flex items-center justify-between">
                <span>Description & Prasadam Menu Details</span>
                <span className="text-[10px] text-gray-400 font-normal">Optional</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Mahaprasadam served to 2,000+ devotees. Menu: Pulihora, Veg Dum Biryani, Sweet Pongal & Laddu..."
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* 6. Contact Info (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-amber-700" />
                <span>Contact Number / Organizer Details <span className="text-gray-400 font-normal">(optional)</span></span>
              </label>
              <input
                type="text"
                placeholder="e.g. 9876543210 (Pandal Organizer)"
                className="w-full px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Annadanam Schedule...</span>
                  </>
                ) : (
                  <>
                    <Utensils className="w-4 h-4" />
                    <span>Submit Annadanam Schedule</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
