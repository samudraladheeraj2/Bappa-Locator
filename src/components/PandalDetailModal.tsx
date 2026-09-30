import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MapPin,
  Clock,
  Navigation,
  Sparkles,
  Heart,
  Share2,
  Check,
  Edit2,
  Camera,
  Image as ImageIcon,
  Maximize2,
  Loader2,
  Utensils,
  Calendar,
  Phone,
  ThumbsUp,
  Award,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import { Pandal, YearlyPandalPhoto } from '../types';
import { formatDistance } from '../utils/geo';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { compressImageFile, getInstantPreviewUrl } from '../utils/imageCompressor';
import {
  CURRENT_FESTIVAL_YEAR,
  getCoverPhotoMetadata,
  hasUserVotedForPhoto,
  toggleYearlyPhotoVote,
} from '../utils/yearlyPhotos';
import { UpdateIdolModal } from './UpdateIdolModal';

interface PandalDetailModalProps {
  pandal: Pandal | null;
  onClose: () => void;
  userLocation: { latitude: number; longitude: number } | null;
  distance?: number;
  isFavorite: boolean;
  onToggleFavorite: (pandalId: string) => void;
  onPandalUpdated?: (updatedPandal: Pandal) => void;
}

export const PandalDetailModal: React.FC<PandalDetailModalProps> = ({
  pandal,
  onClose,
  userLocation,
  distance,
  isFavorite,
  onToggleFavorite,
  onPandalUpdated,
}) => {
  const currentYear = CURRENT_FESTIVAL_YEAR;
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [mobileUser, setMobileUser] = useState<{ mobile: string; name: string } | null>(() => {
    try {
      const saved = localStorage.getItem('bappa_mobile_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [showUpdateIdolModal, setShowUpdateIdolModal] = useState(false);
  const [votingPhotoId, setVotingPhotoId] = useState<string | null>(null);

  // Direct photo upload state for admin edit modal
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const ganeshaFileInputRef = useRef<HTMLInputElement | null>(null);
  const pandalFileInputRef = useRef<HTMLInputElement | null>(null);

  const ADMIN_EMAIL = 'samudraladheeraj2@gmail.com';
  const isAdmin = (user && user.email === ADMIN_EMAIL) || (mobileUser && mobileUser.mobile === '7702583629');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (pandal) {
      setEditForm({ ...pandal });
    }
  }, [pandal]);

  if (!pandal) return null;

  // Yearly Crowdsourced Idol Photo Cover resolution
  const coverMetadata = getCoverPhotoMetadata(pandal, currentYear);
  const coverPhoto = coverMetadata.coverUrl;
  const pandalPhoto = pandal.pandalImage || (pandal.photos && pandal.photos.length > 1 ? pandal.photos[1] : null);
  const extraPhotos = (pandal.photos || []).filter((p) => p !== coverPhoto && p !== pandalPhoto);
  const yearlyPhotos: YearlyPandalPhoto[] = pandal.yearlyPhotos || [];

  const handleGetDirections = () => {
    const originParam = userLocation ? `&origin=${userLocation.latitude},${userLocation.longitude}` : '';
    const url = `https://www.google.com/maps/dir/?api=1&destination=${pandal.latitude},${pandal.longitude}${originParam}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async () => {
    const shareText = `🚩 Check out ${pandal.name} located at ${pandal.address}, ${pandal.area}, ${pandal.city}! Found via Bappa Locator.`;
    const shareUrl = window.location.origin;

    if (navigator.share) {
      try {
        await navigator.share({
          title: pandal.name,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {}
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      alert('Unable to copy share link');
    }
  };

  const handleVotePhoto = async (photo: YearlyPandalPhoto) => {
    if (votingPhotoId) return;
    setVotingPhotoId(photo.id);

    const userIdentifier = user?.uid || (mobileUser ? `mob_${mobileUser.mobile}` : 'guest_devotee');
    const isVoted = hasUserVotedForPhoto(photo.id);
    const newCount = isVoted ? Math.max(0, photo.votesCount - 1) : photo.votesCount + 1;

    // Optimistically update local photos array
    const updatedPhotos = yearlyPhotos.map((p) => {
      if (p.id === photo.id) {
        return {
          ...p,
          votesCount: newCount,
        };
      }
      return p;
    });

    // Re-determine top cover for current year
    const currentYearPhotos = updatedPhotos.filter((p) => p.year === currentYear);
    currentYearPhotos.sort((a, b) => b.votesCount - a.votesCount);
    const newTopCover = currentYearPhotos[0]?.url || coverPhoto;

    const updatedPandal: Pandal = {
      ...pandal,
      yearlyPhotos: updatedPhotos,
      image: newTopCover,
      ganeshaImage: newTopCover,
    };

    if (onPandalUpdated) {
      onPandalUpdated(updatedPandal);
    }

    try {
      await toggleYearlyPhotoVote(pandal.id, photo.id, userIdentifier);
    } catch (e) {
      console.warn('Vote toggle note:', e);
    } finally {
      setVotingPhotoId(null);
    }
  };

  const handleUploadPhoto = async (file: File, type: 'ganesha' | 'pandal') => {
    const instantUrl = getInstantPreviewUrl(file);
    if (type === 'ganesha') {
      setEditForm((prev: any) => ({
        ...prev,
        ganeshaImage: instantUrl,
        image: instantUrl,
      }));
    } else {
      setEditForm((prev: any) => ({
        ...prev,
        pandalImage: instantUrl,
      }));
    }

    try {
      setIsUploadingPhoto(true);
      const { blob, dataUrl } = await compressImageFile(file, {
        maxDimension: 1400,
        quality: 0.82,
      });

      let finalUrl = dataUrl;
      try {
        const storageRef = ref(storage, `pandals/${pandal.id || 'new'}_${type}_${Date.now()}.jpg`);
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

      if (type === 'ganesha') {
        setEditForm((prev: any) => ({
          ...prev,
          ganeshaImage: finalUrl,
          image: finalUrl,
        }));
      } else {
        setEditForm((prev: any) => ({
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

  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editForm) return;

    setSaving(true);
    try {
      const ganeshaImg = editForm.ganeshaImage || editForm.image || '';
      const pandalImg = editForm.pandalImage || '';
      const docRef = doc(db, 'submissions', editForm.id);
      await updateDoc(docRef, {
        name: editForm.name,
        committeeName: editForm.committeeName || '',
        address: editForm.address,
        area: editForm.area,
        city: editForm.city || 'Hyderabad',
        state: editForm.state || 'Telangana',
        latitude: Number(editForm.latitude),
        longitude: Number(editForm.longitude),
        timings: editForm.timings || '',
        description: editForm.description || '',
        ganeshaImage: ganeshaImg,
        pandalImage: pandalImg,
        image: ganeshaImg,
        contactInfo: editForm.contactInfo || '',
        ownerInfo: editForm.ownerInfo || '',
        status: editForm.status || 'approved',
      });

      if (onPandalUpdated) {
        onPandalUpdated({
          ...editForm,
          ganeshaImage: ganeshaImg,
          pandalImage: pandalImg,
          image: ganeshaImg,
        });
      }
      setSaving(false);
      setIsEditingAdmin(false);
    } catch (err: any) {
      console.error('Error saving admin edit:', err);
      if (onPandalUpdated) {
        onPandalUpdated(editForm);
      }
      setSaving(false);
      setIsEditingAdmin(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
          {/* Header Image & Actions — Displays Current Year Lord Ganesha Idol or Fallback */}
          <div className="relative h-56 sm:h-64 bg-amber-950 overflow-hidden flex-shrink-0">
            {coverPhoto ? (
              <img
                src={coverPhoto}
                alt={pandal.name}
                onClick={() => setLightboxImage({ url: coverPhoto, title: `${pandal.name} — Lord Ganesha Idol (${coverMetadata.year})` })}
                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-700 to-amber-950 flex flex-col items-center justify-center text-amber-200">
                <span className="text-4xl mb-1">🚩</span>
                <Sparkles className="w-8 h-8 text-yellow-300/60" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />

            {/* Top Badges: Current Year or Fallback Badge */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
              {coverMetadata.isCurrentYear ? (
                <div className="bg-emerald-900/90 text-emerald-200 text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow backdrop-blur-xs flex items-center gap-1.5 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>🚩 {currentYear} Verified Idol</span>
                </div>
              ) : (
                <div className="bg-amber-900/90 text-yellow-300 text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow backdrop-blur-xs flex items-center gap-1 border border-yellow-400/40">
                  <span>{coverMetadata.fallbackBadge || `2025 Photo - Awaiting ${currentYear} Update`}</span>
                </div>
              )}

              {/* Contributor Credit Badge */}
              <div className="bg-black/60 text-white/90 text-[9px] font-semibold px-2 py-0.5 rounded backdrop-blur-xs">
                Photo by {coverMetadata.uploaderName} ({coverMetadata.year})
              </div>
            </div>

            {/* Top Control Buttons */}
            <div className="absolute top-3 right-3 flex items-center space-x-2">
              <button
                onClick={() => onToggleFavorite(pandal.id)}
                className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md cursor-pointer ${
                  isFavorite
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-black/50 text-white hover:bg-black/70'
                }`}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-white' : ''}`} />
              </button>
              <button
                onClick={handleShare}
                className="p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all shadow-md relative cursor-pointer"
                title="Share Pandal"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-all shadow-md cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom Header Info with Quick Update Action */}
            <div className="absolute bottom-3 left-4 right-4 text-white">
              {pandal.popular && (
                <span className="inline-block bg-yellow-500 text-amber-950 text-xs font-bold px-2.5 py-0.5 rounded-full mb-1 shadow">
                  ★ Prominent Pandal
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl sm:text-2xl font-bold leading-tight drop-shadow-sm">
                  {pandal.name}
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => setIsEditingAdmin(true)}
                    className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg backdrop-blur-md transition-all shadow-md flex items-center space-x-1 px-2 text-[10px] font-bold cursor-pointer"
                    title="Admin Edit Info"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-amber-200 flex items-center gap-1 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span>{pandal.area}, {pandal.city}</span>
                {distance !== undefined && (
                  <span className="ml-2 bg-amber-900/80 text-yellow-300 px-2 py-0.5 rounded text-[11px]">
                    {formatDistance(distance)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action Bar: "Update Idol for 2026" Banner */}
          <div className="bg-gradient-to-r from-amber-700 to-amber-800 text-white px-4 py-2.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-yellow-300" />
              <span className="text-xs font-bold">Visited this Pandal?</span>
            </div>
            <button
              type="button"
              onClick={() => setShowUpdateIdolModal(true)}
              className="bg-yellow-400 hover:bg-yellow-300 active:scale-95 text-amber-950 text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Update Idol for {currentYear}</span>
            </button>
          </div>

          {/* Content body */}
          <div className="p-5 overflow-y-auto space-y-4 text-gray-700 flex-1 text-xs">
            {copied && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-xl text-xs text-center font-medium animate-pulse">
                ✓ Share details copied to clipboard!
              </div>
            )}

            {/* Yearly Crowdsourced Photos & Community Upvoting Section */}
            {yearlyPhotos.length > 0 && (
              <div className="space-y-2.5 bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span>Crowdsourced Idol Gallery & Confirmations</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowUpdateIdolModal(true)}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Add Photo</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {yearlyPhotos.map((item) => {
                    const hasVoted = hasUserVotedForPhoto(item.id);
                    const isTopCover = item.url === coverPhoto;

                    return (
                      <div
                        key={item.id}
                        className={`relative rounded-xl overflow-hidden border bg-white shadow-xs p-2 space-y-2 flex flex-col justify-between transition-all ${
                          isTopCover ? 'border-amber-400 ring-2 ring-amber-300/60 bg-amber-50/40' : 'border-amber-200'
                        }`}
                      >
                        <div
                          className="relative aspect-video rounded-lg overflow-hidden bg-black/5 cursor-pointer group"
                          onClick={() =>
                            setLightboxImage({
                              url: item.url,
                              title: `${pandal.name} — Photo by ${item.uploaderName} (${item.year})`,
                            })
                          }
                        >
                          <img src={item.url} alt="Idol" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1">
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Zoom</span>
                          </div>

                          <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                            {item.year} Idol
                          </span>

                          {isTopCover && (
                            <span className="absolute bottom-1.5 left-1.5 bg-amber-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                              <span>👑 Main Cover Photo</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-1">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-900 truncate">
                              Photo by {item.uploaderName || 'Devotee'}
                            </p>
                            <p className="text-[9px] text-gray-500">
                              {item.year} Darshan • {item.votesCount || 0} Confirmations
                            </p>
                          </div>

                          {/* Upvote / Confirm Button */}
                          <button
                            type="button"
                            onClick={() => handleVotePhoto(item)}
                            disabled={votingPhotoId === item.id}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 ${
                              hasVoted
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            }`}
                            title={hasVoted ? 'Remove Confirmation' : 'Confirm / Like this Photo'}
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${hasVoted ? 'fill-white' : ''}`} />
                            <span>{item.votesCount || 0}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos Showcase (Pandal Setup & Additional Photos directly displayed) */}
            {(pandalPhoto || extraPhotos.length > 0) && (
              <div className="space-y-2 bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200">
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-amber-700" />
                  <span>Pandal Setup & Stage Photos</span>
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  {pandalPhoto && (
                    <div
                      onClick={() => setLightboxImage({ url: pandalPhoto, title: `${pandal.name} — Pandal Setup` })}
                      className="relative aspect-video rounded-xl overflow-hidden border border-amber-300 group cursor-pointer shadow-2xs hover:shadow-md transition-all bg-black/5"
                    >
                      <img src={pandalPhoto} alt="Pandal Setup" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Zoom</span>
                      </div>
                      <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                        🎪 Setup View
                      </span>
                    </div>
                  )}

                  {extraPhotos.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setLightboxImage({ url: imgUrl, title: `${pandal.name} — Photo ${idx + 1}` })}
                      className="relative aspect-video rounded-xl overflow-hidden border border-amber-200 group cursor-pointer shadow-2xs hover:shadow-md transition-all bg-black/5"
                    >
                      <img src={imgUrl} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Zoom</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Address */}
            <div>
              <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                Address / Location
              </h3>
              <p className="text-sm bg-amber-50/70 p-3 rounded-xl border border-amber-100 text-gray-800">
                {pandal.address}
              </p>
            </div>

            {/* Timings */}
            {pandal.timings && (
              <div>
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Darshan Timings</span>
                </h3>
                <p className="text-sm text-gray-800 font-medium">{pandal.timings}</p>
              </div>
            )}

            {/* Annadanam */}
            {pandal.annadanamDate && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5 text-amber-950">
                <Utensils className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <span className="font-bold block text-xs">Annadanam (Free Meals)</span>
                  <span className="text-xs text-amber-900">{pandal.annadanamDate} {pandal.servingTime ? `(${pandal.servingTime})` : ''}</span>
                </div>
              </div>
            )}

            {/* Nimajjanam */}
            {pandal.nimajjanamDate && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-2.5 text-yellow-950">
                <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <span className="font-bold block text-xs">Nimajjanam (Immersion)</span>
                  <span className="text-xs text-yellow-900">{pandal.nimajjanamDate}</span>
                </div>
              </div>
            )}

            {/* Description */}
            {pandal.description && (
              <div>
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                  About Pandal
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{pandal.description}</p>
              </div>
            )}

            {/* Committee / Organizer */}
            {(pandal.committeeName || pandal.organizerName) && (
              <div>
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                  Committee / Organizer
                </h3>
                <p className="text-xs text-gray-800 font-medium">
                  {pandal.committeeName || pandal.organizerName}
                </p>
              </div>
            )}

            {/* Contact Info */}
            {pandal.contactInfo && (
              <div>
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                  Contact Information
                </h3>
                <a
                  href={`tel:${pandal.contactInfo}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl font-bold text-xs transition-colors border border-amber-300"
                >
                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                  <span>+91 {pandal.contactInfo}</span>
                </a>
              </div>
            )}

            {/* Coordinates info */}
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs text-gray-500 flex items-center justify-between">
              <span>Latitude: <strong>{pandal.latitude}</strong></span>
              <span>Longitude: <strong>{pandal.longitude}</strong></span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center space-x-3 flex-shrink-0">
            <button
              onClick={handleGetDirections}
              className="flex-1 bg-amber-700 hover:bg-amber-800 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer"
            >
              <Navigation className="w-4 h-4 text-yellow-300" />
              <span>Get Directions (Google Maps)</span>
            </button>
          </div>
        </div>

        {/* Admin Edit Modal */}
        {isEditingAdmin && editForm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-yellow-300" />
                  <span>Edit Pandal Details & Photos</span>
                </h3>
                <button onClick={() => setIsEditingAdmin(false)} className="text-amber-200 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveAdminEdit} className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs">
                <input
                  type="file"
                  ref={ganeshaFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadPhoto(e.target.files[0], 'ganesha');
                    }
                  }}
                />
                <input
                  type="file"
                  ref={pandalFileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadPhoto(e.target.files[0], 'pandal');
                    }
                  }}
                />

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Pandal Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Committee Name</label>
                  <input
                    type="text"
                    value={editForm.committeeName || ''}
                    onChange={(e) => setEditForm({ ...editForm, committeeName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Address</label>
                  <input
                    type="text"
                    required
                    value={editForm.address || ''}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">Area</label>
                    <input
                      type="text"
                      required
                      value={editForm.area || ''}
                      onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">City</label>
                    <input
                      type="text"
                      required
                      value={editForm.city || 'Hyderabad'}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">State</label>
                    <input
                      type="text"
                      value={editForm.state || 'Telangana'}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* Visual Photos Section */}
                <div className="space-y-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200">
                  <label className="block font-bold text-amber-950 text-xs">
                    Pandal Images (Direct Photo Upload)
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-900 block">
                        🚩 Ganesha Idol (Cover)
                      </span>
                      <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-amber-300 bg-black/5 flex items-center justify-center">
                        {editForm.ganeshaImage || editForm.image ? (
                          <img
                            src={editForm.ganeshaImage || editForm.image}
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
                          onClick={() => ganeshaFileInputRef.current?.click()}
                          className="absolute bottom-1 right-1 bg-amber-800/90 hover:bg-amber-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow cursor-pointer flex items-center gap-1"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Upload</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-900 block">
                        🎪 Pandal Setup & Stage
                      </span>
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-amber-200 bg-black/5 flex items-center justify-center">
                        {editForm.pandalImage ? (
                          <img
                            src={editForm.pandalImage}
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
                          onClick={() => pandalFileInputRef.current?.click()}
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
                      <span>Uploading new image…</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Timings</label>
                  <input
                    type="text"
                    value={editForm.timings || ''}
                    onChange={(e) => setEditForm({ ...editForm, timings: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={editForm.contactInfo || ''}
                    onChange={(e) => setEditForm({ ...editForm, contactInfo: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Status</label>
                  <select
                    value={editForm.status || 'approved'}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-semibold"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="pt-2 flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingAdmin(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2.5 rounded-lg font-semibold text-gray-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-amber-800 hover:bg-amber-900 py-2.5 rounded-lg font-semibold text-white shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lightbox zoom modal */}
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-zoom-out"
          >
            <div onClick={(e) => e.stopPropagation()} className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
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
      </div>

      {/* Update Idol for Current Year Modal */}
      {showUpdateIdolModal && (
        <UpdateIdolModal
          isOpen={showUpdateIdolModal}
          onClose={() => setShowUpdateIdolModal(false)}
          pandal={pandal}
          onSuccess={(updated) => {
            if (onPandalUpdated) {
              onPandalUpdated(updated);
            }
          }}
        />
      )}
    </>
  );
};
