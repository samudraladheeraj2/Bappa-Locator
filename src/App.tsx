import React, { useState, useEffect, useMemo } from 'react';
import { WifiOff, Radio } from 'lucide-react';
import { Pandal, ViewMode } from './types';
import { PANDALS_DATA } from './data/pandals';
import { Navbar } from './components/Navbar';
import { SearchFilter } from './components/SearchFilter';
import { MapView } from './components/MapView';
import { PandalList } from './components/PandalList';
import { AnnadanamView } from './components/AnnadanamView';
import { PandalDetailModal } from './components/PandalDetailModal';
import { NewSubmissionForm } from './components/NewSubmissionForm';
import { SubmitAnnadanamModal } from './components/SubmitAnnadanamModal';
import { AdminPanel } from './components/AdminPanel';
import { UserProfileModal } from './components/UserProfileModal';
import { VisitorPandalNotification } from './components/VisitorPandalNotification';
import { AppUpdaterNotifier } from './components/AppUpdaterNotifier';
import { AndroidInAppUpdateChecker } from './components/AndroidInAppUpdateChecker';
import { NavigationDrawer } from './components/NavigationDrawer';
import { calculateDistance } from './utils/geo';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ensureAdminExists, checkIsAdminUser } from './utils/adminInit';

export default function App() {
  const [pandals, setPandals] = useState<Pandal[]>(() => {
    try {
      const cached = localStorage.getItem('bappa_pandals_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return PANDALS_DATA;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [sortByDistance, setSortByDistance] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    try {
      const saved = localStorage.getItem('bappa_last_user_location');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [selectedPandal, setSelectedPandal] = useState<Pandal | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(() => {
    try {
      return (
        window.location.hash === '#suggest' ||
        window.location.hash === '#suggest-pandal' ||
        sessionStorage.getItem('bappa_active_modal') === 'suggest'
      );
    } catch {
      return false;
    }
  });
  const [isAnnadanamModalOpen, setIsAnnadanamModalOpen] = useState<boolean>(() => {
    try {
      return (
        window.location.hash === '#annadanam-submit' ||
        sessionStorage.getItem('bappa_active_modal') === 'annadanam'
      );
    } catch {
      return false;
    }
  });
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(() => {
    try {
      return (
        window.location.hash === '#admin' ||
        sessionStorage.getItem('bappa_active_modal') === 'admin'
      );
    } catch {
      return false;
    }
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(() => {
    try {
      return (
        window.location.hash === '#profile' ||
        sessionStorage.getItem('bappa_active_modal') === 'profile'
      );
    } catch {
      return false;
    }
  });
  const [isNavigationDrawerOpen, setIsNavigationDrawerOpen] = useState<boolean>(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return checkIsAdminUser(auth.currentUser, null);
  });

  // Track Admin authentication state and initialize Admin ID in Firestore
  useEffect(() => {
    ensureAdminExists().catch((err) => console.warn('Admin initialization warning:', err));

    const checkAdminState = () => {
      const isAdm = checkIsAdminUser(auth.currentUser, null);
      setIsAdmin(isAdm);
    };

    checkAdminState();

    const unsubscribe = onAuthStateChanged(auth, () => {
      checkAdminState();
    });

    const handleAuthChange = () => {
      checkAdminState();
    };

    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('bappa_auth_change', handleAuthChange);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('bappa_auth_change', handleAuthChange);
    };
  }, []);

  // Track online/offline status and wake-up recovery
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Save pandals cache
  useEffect(() => {
    try {
      if (pandals && pandals.length > 0) {
        localStorage.setItem('bappa_pandals_cache', JSON.stringify(pandals));
      }
    } catch (e) {}
  }, [pandals]);

  // Save user location cache
  useEffect(() => {
    try {
      if (userLocation) {
        localStorage.setItem('bappa_last_user_location', JSON.stringify(userLocation));
      }
    } catch (e) {}
  }, [userLocation]);

  // Sync isSubmitModalOpen with sessionStorage and hash
  useEffect(() => {
    try {
      if (isSubmitModalOpen) {
        sessionStorage.setItem('bappa_active_modal', 'suggest');
        if (window.location.hash !== '#suggest-pandal' && window.location.hash !== '#suggest') {
          window.history.replaceState(null, '', '#suggest-pandal');
        }
      } else if (sessionStorage.getItem('bappa_active_modal') === 'suggest') {
        sessionStorage.removeItem('bappa_active_modal');
        if (window.location.hash === '#suggest-pandal' || window.location.hash === '#suggest') {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
    } catch (e) {}
  }, [isSubmitModalOpen]);

  // Sync isAnnadanamModalOpen
  useEffect(() => {
    try {
      if (isAnnadanamModalOpen) {
        sessionStorage.setItem('bappa_active_modal', 'annadanam');
      } else if (sessionStorage.getItem('bappa_active_modal') === 'annadanam') {
        sessionStorage.removeItem('bappa_active_modal');
      }
    } catch (e) {}
  }, [isAnnadanamModalOpen]);

  // Sync isAdminModalOpen
  useEffect(() => {
    try {
      if (isAdminModalOpen) {
        sessionStorage.setItem('bappa_active_modal', 'admin');
      } else if (sessionStorage.getItem('bappa_active_modal') === 'admin') {
        sessionStorage.removeItem('bappa_active_modal');
      }
    } catch (e) {}
  }, [isAdminModalOpen]);

  // Sync isProfileModalOpen
  useEffect(() => {
    try {
      if (isProfileModalOpen) {
        sessionStorage.setItem('bappa_active_modal', 'profile');
      } else if (sessionStorage.getItem('bappa_active_modal') === 'profile') {
        sessionStorage.removeItem('bappa_active_modal');
      }
    } catch (e) {}
  }, [isProfileModalOpen]);

  // Listen to browser hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#suggest' || hash === '#suggest-pandal') {
        setIsSubmitModalOpen(true);
      } else if (hash === '#annadanam-submit') {
        setIsAnnadanamModalOpen(true);
      } else if (hash === '#admin') {
        setIsAdminModalOpen(true);
      } else if (hash === '#profile') {
        setIsProfileModalOpen(true);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Favorites state persisted in localStorage
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bappa_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('bappa_favorites', JSON.stringify(favorites));
    } catch (e) {}
  }, [favorites]);

  const handleToggleFavorite = (pandalId: string) => {
    setFavorites((prev) =>
      prev.includes(pandalId) ? prev.filter((id) => id !== pandalId) : [...prev, pandalId]
    );
  };

  // Fetch approved submissions from Firestore
  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('status', '==', 'approved'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const approvedSubmissions: Pandal[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          const coverImg = data.ganeshaImage || data.image || data.photos?.[0] || '';
          return {
            id: data.id || doc.id,
            name: data.name,
            committeeName: data.committeeName || data.associationName,
            associationName: data.associationName || data.committeeName,
            address: data.address,
            area: data.area,
            city: data.city || 'Hyderabad',
            state: data.state || 'Telangana',
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            timings: data.timings,
            description: data.description,
            ganeshaImage: data.ganeshaImage || coverImg,
            pandalImage: data.pandalImage || '',
            image: coverImg, // Ganesha idol is the primary cover photo
            photos: data.photos || (coverImg ? [coverImg] : []),
            extraImages: data.extraImages || [],
            contactInfo: data.contactInfo || data.phone || data.contactNumber,
            phone: data.phone || data.contactNumber || data.contactInfo,
            contactPerson: data.contactPerson,
            annadanamDate: data.annadanamDate,
            servingTime: data.servingTime,
            nimajjanamDate: data.nimajjanamDate,
            popular: !!data.popular,
            status: 'approved',
          };
        });

        // Combine static PANDALS_DATA with approved user submissions
        const combined = [...PANDALS_DATA, ...approvedSubmissions];
        setPandals((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(combined)) {
            return prev;
          }
          return combined;
        });
      },
      (error) => {
        console.error('Error fetching submissions:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Handle Geolocation with offline cache fallback
  const handleGetLocation = (onSuccess?: (coords: { latitude: number; longitude: number }) => void) => {
    if (!navigator.geolocation) {
      if (userLocation && onSuccess) {
        onSuccess(userLocation);
      }
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserLocation(coords);
        setSortByDistance(true);
        setIsLocating(false);
        if (onSuccess) {
          onSuccess(coords);
        }
      },
      (error) => {
        console.warn('Geolocation warning (using offline fallback if present):', error.message);
        // If we have cached location, seamlessly use it
        if (userLocation) {
          setSortByDistance(true);
          if (onSuccess) onSuccess(userLocation);
        } else {
          // If completely offline and no cached location
          if (!navigator.onLine) {
            console.log('Device is offline; continuing with default central view');
          }
        }
        setIsLocating(false);
      },
      { timeout: 8000, maximumAge: 300000, enableHighAccuracy: false }
    );
  };

  const handlePandalsNearMe = () => {
    setViewMode('list');
    setSortByDistance(true);
    handleGetLocation();
  };

  const handleAnnadanamNearMe = () => {
    setViewMode('annadanam');
    handleGetLocation();
  };

  // Calculate distances for all pandals if user location is available
  const distances = useMemo(() => {
    if (!userLocation) return {};
    const distMap: { [id: string]: number } = {};
    pandals.forEach((p) => {
      distMap[p.id] = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        p.latitude,
        p.longitude
      );
    });
    return distMap;
  }, [userLocation, pandals]);

  // Filtered and sorted pandals
  const filteredPandals = useMemo(() => {
    let result = pandals.filter((pandal) => {
      // Favorites filter
      if (showFavoritesOnly && !favorites.includes(pandal.id)) {
        return false;
      }

      // City filter (Default Hyderabad)
      if (selectedCity !== 'All' && pandal.city.toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }

      // Search query filter (name, area, city, address)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = pandal.name.toLowerCase().includes(query);
        const matchArea = pandal.area.toLowerCase().includes(query);
        const matchCity = pandal.city.toLowerCase().includes(query);
        const matchAddress = pandal.address.toLowerCase().includes(query);
        const matchCommittee = pandal.committeeName?.toLowerCase().includes(query) || false;
        return matchName || matchArea || matchCity || matchAddress || matchCommittee;
      }

      return true;
    });

    // Sort by distance if enabled and user location exists
    if (sortByDistance && userLocation) {
      result.sort((a, b) => {
        const distA = distances[a.id] ?? Infinity;
        const distB = distances[b.id] ?? Infinity;
        return distA - distB;
      });
    }

    return result;
  }, [pandals, selectedCity, searchQuery, sortByDistance, userLocation, distances, showFavoritesOnly, favorites]);

  const handleGetDirections = (pandal: Pandal) => {
    const originParam = userLocation ? `&origin=${userLocation.latitude},${userLocation.longitude}` : '';
    const url = `https://www.google.com/maps/dir/?api=1&destination=${pandal.latitude},${pandal.longitude}${originParam}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePandalUpdated = (updated: Pandal) => {
    setPandals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPandal(updated);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col font-sans select-none relative">
      {/* Permanent Header Controls Container */}
      <div className="z-40 p-2 sm:p-3 space-y-2 max-w-4xl mx-auto w-full shrink-0">
        {!isOnline && (
          <div className="bg-amber-950/95 text-amber-200 border border-amber-500/50 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Offline Mode — Running from local cache</span>
            </div>
            <span className="text-[10px] bg-amber-800/80 text-amber-100 font-bold px-2 py-0.5 rounded-full">
              {pandals.length} Pandals Cached
            </span>
          </div>
        )}
        <Navbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onGetLocation={handleGetLocation}
          onPandalsNearMe={handlePandalsNearMe}
          onAnnadanamNearMe={handleAnnadanamNearMe}
          isLocating={isLocating}
          hasLocation={!!userLocation}
          onOpenSubmit={() => setIsSubmitModalOpen(true)}
          onOpenAnnadanamModal={() => setIsAnnadanamModalOpen(true)}
          onOpenAdmin={() => setIsAdminModalOpen(true)}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenDrawer={() => setIsNavigationDrawerOpen(true)}
          isAdmin={isAdmin}
        />
        {viewMode !== 'annadanam' && (
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortByDistance={sortByDistance}
            onSortToggle={() => setSortByDistance(!sortByDistance)}
            hasLocation={!!userLocation}
            totalCount={pandals.length}
            filteredCount={filteredPandals.length}
            showFavoritesOnly={showFavoritesOnly}
            onFavoritesToggle={() => setShowFavoritesOnly(!showFavoritesOnly)}
            favoritesCount={favorites.length}
          />
        )}
      </div>

      {/* Main Viewport Content Area */}
      <div className="flex-1 w-full relative overflow-hidden">
        {/* Map View Layer */}
        <div className={viewMode === 'map' ? 'absolute inset-0 z-0' : 'hidden'}>
          <MapView
            pandals={filteredPandals}
            selectedPandal={selectedPandal}
            onSelectPandal={setSelectedPandal}
            userLocation={userLocation}
            distances={distances}
            onGetDirections={handleGetDirections}
            onGetLocation={handleGetLocation}
            isLocating={isLocating}
          />
        </div>

        {/* List & Annadanam Scrollable Layer */}
        {viewMode !== 'map' && (
          <div className="h-full w-full overflow-y-auto pb-24">
            <main className="max-w-4xl mx-auto w-full px-2 sm:px-4 py-2">
              {viewMode === 'list' ? (
                <PandalList
                  pandals={filteredPandals}
                  distances={distances}
                  onSelectPandal={setSelectedPandal}
                  onGetDirections={handleGetDirections}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  showFavoritesOnly={showFavoritesOnly}
                  hasLocation={!!userLocation}
                />
              ) : (
                <AnnadanamView
                  onOpenSuggestAnnadanam={() => setIsAnnadanamModalOpen(true)}
                  userLocation={userLocation}
                  onGetLocation={handleAnnadanamNearMe}
                  isLocating={isLocating}
                />
              )}
            </main>
          </div>
        )}
      </div>

      {/* Pandal Detail Modal */}
      <PandalDetailModal
        pandal={selectedPandal}
        onClose={() => setSelectedPandal(null)}
        userLocation={userLocation}
        distance={selectedPandal ? distances[selectedPandal.id] : undefined}
        isFavorite={selectedPandal ? favorites.includes(selectedPandal.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onPandalUpdated={handlePandalUpdated}
      />

      {/* Submit Pandal Modal */}
      <NewSubmissionForm
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSuccess={() => {}}
        livePandals={pandals}
      />

      {/* Submit Annadanam Modal */}
      <SubmitAnnadanamModal
        isOpen={isAnnadanamModalOpen}
        onClose={() => setIsAnnadanamModalOpen(false)}
        onSuccess={() => {}}
      />

      {/* Admin Panel Modal */}
      <AdminPanel
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />

      {/* User Profile & Pandal Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onOpenAdmin={() => {
          setIsProfileModalOpen(false);
          setIsAdminModalOpen(true);
        }}
      />

      {/* Visitor Proximity Idol Update Notification */}
      <VisitorPandalNotification
        userLocation={userLocation}
        pandals={pandals}
        onPandalUpdated={handlePandalUpdated}
      />

      {/* Capgo Over-the-Air Live Web Bundle App Updater */}
      <AppUpdaterNotifier />

      {/* Android In-App APK Update Checker */}
      <AndroidInAppUpdateChecker />

      {/* 3-Bar Slide-over Drawer with Details & Dedicated Update Checker */}
      <NavigationDrawer
        isOpen={isNavigationDrawerOpen}
        onClose={() => setIsNavigationDrawerOpen(false)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onGetLocation={handleGetLocation}
        onPandalsNearMe={handlePandalsNearMe}
        onAnnadanamNearMe={handleAnnadanamNearMe}
        isLocating={isLocating}
        hasLocation={!!userLocation}
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onOpenAnnadanamModal={() => setIsAnnadanamModalOpen(true)}
        onOpenAdmin={() => setIsAdminModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        isAdmin={isAdmin}
        totalPandals={pandals.length}
        favoritesCount={favorites.length}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavoritesOnly={() => setShowFavoritesOnly(!showFavoritesOnly)}
        isOnline={isOnline}
      />
    </div>
  );
}
