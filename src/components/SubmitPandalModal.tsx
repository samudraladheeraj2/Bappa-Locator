import React, { useState, useEffect } from 'react';
import { X, PlusCircle, MapPin, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth, signInWithGoogle, logoutUser, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LocationPicker } from './LocationPicker';
import { PhotoUploader } from './PhotoUploader';

interface SubmitPandalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubmitPandalModal: React.FC<SubmitPandalModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [mobileUser, setMobileUser] = useState<{ mobile: string; name: string } | null>(() => {
    try {
      const saved = localStorage.getItem('bappa_mobile_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [committeeName, setCommitteeName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [annadanamDate, setAnnadanamDate] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [latitude, setLatitude] = useState<number>(17.3850);
  const [longitude, setLongitude] = useState<number>(78.4867);
  const [timings, setTimings] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user && !mobileUser) {
      setErrorMsg('Please sign in with Google or Mobile Number to submit a pandal.');
      return;
    }

    setLoading(true);
    try {
      const submissionId = 'sub_' + Date.now();
      await setDoc(doc(db, 'submissions', submissionId), {
        id: submissionId,
        name,
        committeeName,
        contactPerson,
        contactNumber,
        address,
        photos,
        annadanamDate,
        area,
        city,
        latitude,
        longitude,
        timings,
        description,
        status: 'pending',
        submittedBy: user ? user.uid : (mobileUser ? ('mob_' + mobileUser.mobile) : (contactNumber ? ('mob_' + contactNumber.replace(/\D/g, '')) : ('sub_' + Date.now()))),
        createdAt: new Date().toISOString(),
      });
      setSuccessMsg(true);
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="bg-amber-800 text-white p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Suggest Pandal</h2>
          <button onClick={onClose} className="text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-sm">
          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h3 className="font-bold text-amber-900 border-b pb-2">Pandal Details</h3>
            <input type="text" placeholder="Pandal / Mandal Name *" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500" value={name} onChange={e => setName(e.target.value)} required />
            <input type="text" placeholder="Committee / Organizer Name" className="w-full p-3 border border-gray-300 rounded-xl" value={committeeName} onChange={e => setCommitteeName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Contact Person (Optional)" className="w-full p-3 border border-gray-300 rounded-xl" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
              <input type="tel" placeholder="Contact Number (Optional)" className="w-full p-3 border border-gray-300 rounded-xl" value={contactNumber} onChange={e => setContactNumber(e.target.value)} />
            </div>
            <input type="text" placeholder="Address *" className="w-full p-3 border border-gray-300 rounded-xl" value={address} onChange={e => setAddress(e.target.value)} required />
          </div>

          {/* Section 2: Media */}
          <div className="space-y-2">
            <h3 className="font-bold text-amber-900 border-b pb-2">Photos</h3>
            <PhotoUploader photos={photos} onPhotosChange={setPhotos} />
          </div>

          {/* Section 3: Annadanam */}
          <div className="space-y-3">
            <h3 className="font-bold text-amber-900 border-b pb-2">Annadanam</h3>
            <label className="text-xs text-gray-500 font-semibold uppercase">Annadanam Date</label>
            <input type="date" className="w-full p-3 border border-gray-300 rounded-xl" value={annadanamDate} onChange={e => setAnnadanamDate(e.target.value)} />
          </div>

          {/* Section 4: Location */}
          <div className="space-y-3">
            <h3 className="font-bold text-amber-900 border-b pb-2">Location</h3>
            <LocationPicker latitude={latitude} longitude={longitude} address={address} onLocationChange={(lat, lng, addr) => { setLatitude(lat); setLongitude(lng); setAddress(addr); }} />
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Area *" className="w-full p-3 border border-gray-300 rounded-xl" value={area} onChange={e => setArea(e.target.value)} required />
              <input type="text" placeholder="City *" className="w-full p-3 border border-gray-300 rounded-xl" value={city} onChange={e => setCity(e.target.value)} required />
            </div>
          </div>

          {/* Section 5: Extra */}
          <div className="space-y-3">
            <h3 className="font-bold text-amber-900 border-b pb-2">Additional Info</h3>
            <input type="text" placeholder="Timings (e.g., 6AM - 10PM)" className="w-full p-3 border border-gray-300 rounded-xl" value={timings} onChange={e => setTimings(e.target.value)} />
            <textarea placeholder="Description" className="w-full p-3 border border-gray-300 rounded-xl h-24" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="w-full p-4 bg-amber-700 text-white rounded-2xl font-bold text-base hover:bg-amber-800 transition-colors shadow-lg">
            {loading ? 'Submitting...' : 'Submit Suggestion'}
          </button>
        </form>
      </div>
    </div>
  );
};
