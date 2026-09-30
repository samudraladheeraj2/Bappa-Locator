import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User as UserIcon,
  Edit2,
  ShieldAlert,
  LogIn,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  MapPin,
  Phone,
  Camera,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { auth, signInWithGoogle, logoutUser, db, storage } from '../firebase';
import { onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MobileAuthModal } from './MobileAuthModal';
import { compressImageFile, getInstantPreviewUrl } from '../utils/imageCompressor';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, onOpenAdmin }) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [mobileUser, setMobileUser] = useState<{ mobile: string; name: string } | null>(() => {
    try {
      const saved = localStorage.getItem('bappa_mobile_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [myPandals, setMyPandals] = useState<any[]>([]);
  const [editingPandal, setEditingPandal] = useState<any | null>(null);
  const [loadingPandals, setLoadingPandals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Direct photo upload for editing pandal
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const userGaneshaInputRef = useRef<HTMLInputElement | null>(null);
  const userPandalInputRef = useRef<HTMLInputElement | null>(null);

  const ADMIN_EMAIL = 'samudraladheeraj2@gmail.com';
  const isAdmin = (user && user.email === ADMIN_EMAIL) || (mobileUser && mobileUser.mobile === '7702583629');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setDisplayName(currentUser.displayName || '');
        setPhotoURL(currentUser.photoURL || '');
        fetchMyPandals(currentUser.uid);
      } else if (mobileUser) {
        fetchMyPandals('mob_' + mobileUser.mobile);
      }
    });
    return () => unsubscribe();
  }, [isOpen, mobileUser]);

  const fetchMyPandals = async (uid: string) => {
    try {
      setLoadingPandals(true);
      const q = query(collection(db, 'submissions'), where('submittedBy', '==', uid));
      const snap = await getDocs(q);
      const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setMyPandals(items);
    } catch (err) {
      console.error('Error fetching user pandals:', err);
    } finally {
      setLoadingPandals(false);
    }
  };

  if (!isOpen) return null;

  const handleLogin = async () => {
    try {
      setErrorMsg(null);
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sign in');
    }
  };

  const handleMobileSuccess = (data: { mobile: string; name: string }) => {
    setMobileUser(data);
    localStorage.setItem('bappa_mobile_user', JSON.stringify(data));
    fetchMyPandals('mob_' + data.mobile);
  };

  const handleSignOutAll = async () => {
    try {
      await logoutUser();
    } catch (e) {}
    localStorage.removeItem('bappa_mobile_user');
    setMobileUser(null);
    setUser(null);
    setMyPandals([]);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateProfile(user, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
      });
      setSaving(false);
      setIsEditingProfile(false);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setSaving(false);
      setErrorMsg(err.message || 'Failed to update profile');
    }
  };

  const handleUploadPandalPhoto = async (file: File, type: 'ganesha' | 'pandal') => {
    if (!editingPandal) return;

    // 1. Instant optimistic 0ms preview
    const instantUrl = getInstantPreviewUrl(file);
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

    try {
      setIsUploadingPhoto(true);
      // 2. High-speed client-side canvas compression (~150KB)
      const { blob, dataUrl } = await compressImageFile(file, {
        maxDimension: 1400,
        quality: 0.82,
      });

      let finalUrl = dataUrl;
      try {
        const storageRef = ref(storage, `pandals/${editingPandal.id || 'user'}_${type}_${Date.now()}.jpg`);
        const snap = await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        finalUrl = await getDownloadURL(snap.ref);
      } catch (storageErr) {
        console.warn('Storage fallback to compressed Data URL:', storageErr);
      }

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
    } catch (err: any) {
      console.warn('Photo processing note:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveMyPandal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPandal || (!user && !mobileUser)) return;

    setSaving(true);
    try {
      const ganeshaImg = editingPandal.ganeshaImage || editingPandal.image || '';
      const pandalImg = editingPandal.pandalImage || '';
      const docRef = doc(db, 'submissions', editingPandal.id);
      await updateDoc(docRef, {
        name: editingPandal.name,
        committeeName: editingPandal.committeeName || '',
        address: editingPandal.address,
        area: editingPandal.area,
        city: editingPandal.city || 'Hyderabad',
        state: editingPandal.state || 'Telangana',
        latitude: Number(editingPandal.latitude),
        longitude: Number(editingPandal.longitude),
        timings: editingPandal.timings || '',
        description: editingPandal.description || '',
        ganeshaImage: ganeshaImg,
        pandalImage: pandalImg,
        image: ganeshaImg, // Ganesha idol is the cover photo
        contactInfo: editingPandal.contactInfo || '',
        status: isAdmin ? editingPandal.status : 'pending',
      });
      setSaving(false);
      setEditingPandal(null);
      if (user) fetchMyPandals(user.uid);
      else if (mobileUser) fetchMyPandals('mob_' + mobileUser.mobile);
      setSuccessMsg('Pandal updated successfully! (Submitted for review if modified).');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setSaving(false);
      alert('Failed to update pandal: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserIcon className="w-6 h-6 text-yellow-300" />
            <h2 className="text-lg font-bold">My Profile & Pandal Manager</h2>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white p-1 rounded-full cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!user && !mobileUser ? (
          <div className="p-10 text-center space-y-4 flex-1 flex flex-col items-center justify-center">
            <UserIcon className="w-16 h-16 text-amber-600 mx-auto" />
            <h3 className="text-xl font-bold text-gray-800">Sign In Required</h3>
            <p className="text-sm text-gray-600 max-w-sm">
              Sign in with Google or Mobile Number & 4-digit PIN to view your profile and manage your pandals.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm justify-center pt-2">
              <button
                onClick={handleLogin}
                className="flex-1 flex items-center justify-center space-x-2 bg-amber-700 hover:bg-amber-800 text-white px-4 py-3 rounded-xl font-bold shadow-md text-xs transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Google Sign In</span>
              </button>
              <button
                onClick={() => setIsMobileModalOpen(true)}
                className="flex-1 flex items-center justify-center space-x-2 bg-amber-900 hover:bg-amber-950 text-white px-4 py-3 rounded-xl font-bold shadow-md text-xs transition-all cursor-pointer"
              >
                <Phone className="w-4 h-4" />
                <span>Mobile Login / Signup</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 overflow-y-auto space-y-5 flex-1 text-gray-700">
            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-xl text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Profile Card */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-14 h-14 rounded-full object-cover border-2 border-amber-600 shadow-sm" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-amber-700 text-white flex items-center justify-center font-bold text-xl shadow-sm">
                    {user?.email?.[0].toUpperCase() || mobileUser?.mobile?.[0] || 'U'}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-gray-900">{user?.displayName || mobileUser?.name || 'Bappa Devotee'}</h3>
                  <p className="text-xs text-gray-600">{user?.email || `+91 ${mobileUser?.mobile}`}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-800 text-white' : myPandals.length > 0 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                      {isAdmin ? '★ Single Admin' : myPandals.length > 0 ? 'Pandal Owner' : 'Registered User'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                {user && (
                  <button
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    className="flex items-center space-x-1 bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                )}
                <button
                  onClick={handleSignOutAll}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Admin Quick Access Bar */}
            {isAdmin && onOpenAdmin && (
              <div className="bg-gradient-to-r from-amber-950 to-amber-900 text-white p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-md border border-amber-700">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-yellow-500/20 text-yellow-300 rounded-xl">
                    <ShieldAlert className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-yellow-100">Administrator Console</h4>
                    <p className="text-[11px] text-amber-200">Review pending pandals & Annadanam approvals</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-amber-950 rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
                >
                  Open Approvals
                </button>
              </div>
            )}

            {/* Edit Profile Form */}
            {isEditingProfile && user && (
              <form onSubmit={handleSaveProfile} className="bg-white border border-gray-200 p-4 rounded-2xl space-y-3 text-xs shadow-sm">
                <h4 className="font-bold text-amber-900 text-sm">Edit My Profile</h4>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    required
                  />
                </div>
                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 py-2 rounded-xl font-semibold text-gray-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-amber-800 hover:bg-amber-900 py-2 rounded-xl font-semibold text-white shadow-xs cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            )}

            {/* My Pandals / Owner Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span>My Pandal Submissions ({myPandals.length})</span>
                </h4>
              </div>

              {loadingPandals ? (
                <div className="text-center py-6 text-xs text-gray-400">Loading your pandals...</div>
              ) : myPandals.length === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 p-6 rounded-2xl text-center space-y-2">
                  <p className="text-xs text-gray-500">You have not submitted any pandals yet.</p>
                  <span className="text-[11px] text-amber-700 font-medium">Use 'Suggest Pandals/Mandap' in the header to register your pandal!</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {myPandals.map((pandal) => (
                    <div key={pandal.id} className="bg-white border border-gray-200 p-4 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-amber-100 flex-shrink-0 border border-amber-200">
                          {pandal.ganeshaImage || pandal.image ? (
                            <img src={pandal.ganeshaImage || pandal.image} alt={pandal.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg">🚩</div>
                          )}
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-gray-900 text-sm truncate">{pandal.name}</h5>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pandal.status === 'approved' ? 'bg-green-100 text-green-800' : pandal.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                              {pandal.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{pandal.address}, {pandal.area}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingPandal(pandal)}
                        className="flex items-center space-x-1 bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border border-amber-300 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit & Photos</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Pandal Modal (For Owner) — Direct Photo Upload, NO Image URL string */}
        {editingPandal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
                <h3 className="font-bold text-base">Edit Pandal Info & Photos</h3>
                <button onClick={() => setEditingPandal(null)} className="text-amber-200 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveMyPandal} className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
                {/* Hidden photo inputs */}
                <input
                  type="file"
                  ref={userGaneshaInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadPandalPhoto(e.target.files[0], 'ganesha');
                    }
                  }}
                />
                <input
                  type="file"
                  ref={userPandalInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadPandalPhoto(e.target.files[0], 'pandal');
                    }
                  }}
                />

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

                {/* Visual Photos Section — Lord Ganesha (Cover) & Pandal Setup */}
                <div className="space-y-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200">
                  <label className="block font-bold text-amber-950 text-xs">
                    Pandal Images (Direct Photo Upload)
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Ganesha Idol Cover */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-900 block">🚩 Ganesha Idol (Cover)</span>
                      <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-amber-300 bg-black/5 flex items-center justify-center">
                        {editingPandal.ganeshaImage || editingPandal.image ? (
                          <img src={editingPandal.ganeshaImage || editingPandal.image} alt="Ganesha Idol" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-2 text-gray-400">
                            <span className="text-2xl block mb-1">🚩</span>
                            <span className="text-[10px]">No idol photo</span>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={isUploadingPhoto}
                          onClick={() => userGaneshaInputRef.current?.click()}
                          className="absolute bottom-1 right-1 bg-amber-800/90 hover:bg-amber-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow cursor-pointer flex items-center gap-1"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Upload</span>
                        </button>
                      </div>
                    </div>

                    {/* Pandal Setup */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-900 block">🎪 Pandal Setup</span>
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-amber-200 bg-black/5 flex items-center justify-center">
                        {editingPandal.pandalImage ? (
                          <img src={editingPandal.pandalImage} alt="Pandal Setup" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-2 text-gray-400">
                            <span className="text-2xl block mb-1">🎪</span>
                            <span className="text-[10px]">No pandal photo</span>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={isUploadingPhoto}
                          onClick={() => userPandalInputRef.current?.click()}
                          className="absolute bottom-1 right-1 bg-amber-800/90 hover:bg-amber-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow cursor-pointer flex items-center gap-1"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Upload</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {isUploadingPhoto && (
                    <div className="text-xs text-amber-800 flex items-center gap-1.5 font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading picture…</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Timings</label>
                  <input
                    type="text"
                    value={editingPandal.timings || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, timings: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingPandal.description || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={editingPandal.contactInfo || ''}
                    onChange={(e) => setEditingPandal({ ...editingPandal, contactInfo: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div className="bg-amber-50 p-3 rounded-lg text-amber-800 text-[11px] font-medium">
                  Note: Updating your pandal info will submit changes for Admin review to maintain community standards.
                </div>
                <div className="pt-2 flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingPandal(null)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2.5 rounded-lg font-semibold text-gray-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-amber-800 hover:bg-amber-900 py-2.5 rounded-lg font-semibold text-white shadow-md cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Pandal Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <MobileAuthModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        onSuccess={handleMobileSuccess}
      />
    </div>
  );
};
