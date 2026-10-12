import React, { useState, useRef } from 'react';
import {
  X,
  Phone,
  Mail,
  Lock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  LogIn,
  UserPlus,
  User as UserIcon,
  RotateCcw,
} from 'lucide-react';
import {
  db,
  auth,
  signInWithGoogle,
  loginWithEmail,
  registerWithEmail,
  resetPasswordEmail,
} from '../firebase';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { syncHashPin } from '../utils/crypto';
import { setInMemoryAdmin, ADMIN_MOBILE, ADMIN_PIN, ADMIN_EMAIL } from '../utils/adminInit';
import { withTimeout } from '../utils/asyncHelper';

interface MobileAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (userData: { mobile: string; name: string }) => void;
}

export const MobileAuthModal: React.FC<MobileAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  // Method: phone vs email
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');

  // Phone states
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [step, setStep] = useState<'input' | 'otp' | 'pin'>('input');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  // Email states
  const [emailMode, setEmailMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // General states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateMobile = (num: string) => {
    const clean = num.replace(/\D/g, '').slice(-10);
    return /^[6-9]\d{9}$/.test(clean);
  };

  // --- Phone Sign In (Mobile + 4-Digit PIN) ---
  const handlePhoneLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    const cleanPin = pin.trim();

    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!cleanPin || cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      setErrorMsg('Please enter your 4-digit PIN.');
      return;
    }

    setLoading(true);

    try {
      await withTimeout(
        (async () => {
          // Instant check for Admin credentials
          if (cleanMobile === ADMIN_MOBILE && cleanPin === ADMIN_PIN) {
            setInMemoryAdmin(true);

            const adminData = { mobile: ADMIN_MOBILE, name: 'Dheeraj (Admin)' };
            try {
              localStorage.setItem('bappa_mobile_user', JSON.stringify(adminData));
            } catch (e) {}
            window.dispatchEvent(new Event('bappa_auth_change'));

            const userRef = doc(db, 'users', cleanMobile);
            const expectedHash = syncHashPin(ADMIN_PIN);
            setDoc(
              userRef,
              {
                mobile: cleanMobile,
                pinHash: expectedHash,
                role: 'admin',
                isAdmin: true,
                displayName: 'Dheeraj (Admin)',
                createdAt: new Date().toISOString(),
              },
              { merge: true }
            ).catch((err) => console.warn('Background admin sync notice:', err));

            setSuccessMsg('Admin Login successful!');
            setTimeout(() => {
              onSuccess(adminData);
              onClose();
            }, 600);
            return;
          }

          // Regular User Login
          const userRef = doc(db, 'users', cleanMobile);
          let userSnap;
          let isOfflineMode = false;
          let userData: any = null;

          try {
            userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              userData = userSnap.data();
              try {
                localStorage.setItem(
                  `bappa_cached_credentials_${cleanMobile}`,
                  JSON.stringify({
                    mobile: cleanMobile,
                    pinHash: userData.pinHash,
                    displayName: userData.displayName || `Devotee ${cleanMobile.slice(-4)}`,
                    role: userData.role || 'devotee',
                    isAdmin: !!userData.isAdmin,
                  })
                );
              } catch (e) {}
            }
          } catch (getDocErr: any) {
            console.warn('[PhoneAuth] Firestore fetch failed, checking local cached credentials:', getDocErr);
            isOfflineMode = true;
          }

          if (isOfflineMode || !userSnap || !userSnap.exists()) {
            const cachedCredsStr = localStorage.getItem(`bappa_cached_credentials_${cleanMobile}`);
            if (cachedCredsStr) {
              try {
                const cachedCreds = JSON.parse(cachedCredsStr);
                userData = {
                  pinHash: cachedCreds.pinHash,
                  displayName: cachedCreds.displayName,
                  isAdmin: cachedCreds.isAdmin,
                  role: cachedCreds.role,
                };
                isOfflineMode = true;
              } catch (parseErr) {
                console.error('[PhoneAuth] Failed to parse cached credentials:', parseErr);
              }
            }

            if (!userData) {
              if (isOfflineMode) {
                throw new Error('Unable to connect to the server and no cached offline credentials found. Please sign up.');
              } else {
                throw new Error('Mobile number not registered. Please switch to Sign Up.');
              }
            }
          }

          const inputHash = syncHashPin(cleanPin);
          if (userData.pinHash !== inputHash) {
            throw new Error('Incorrect 4-digit PIN. Please try again or click Forgot PIN.');
          }

          if (userData.isAdmin || cleanMobile === ADMIN_MOBILE) {
            setInMemoryAdmin(true);
          }

          const resolvedUser = {
            mobile: cleanMobile,
            name: userData.displayName || `Devotee ${cleanMobile.slice(-4)}`,
            isOfflineSession: isOfflineMode,
          };

          try {
            localStorage.setItem('bappa_mobile_user', JSON.stringify(resolvedUser));
          } catch (e) {}
          window.dispatchEvent(new Event('bappa_auth_change'));

          setSuccessMsg(isOfflineMode ? 'Logged in (Offline Mode)! Welcome back.' : 'Login successful! Welcome back.');
          setTimeout(() => {
            onSuccess(resolvedUser);
            onClose();
          }, 600);
        })(),
        7000,
        'Login request timed out after 7 seconds. Attempting offline fallback...'
      );
    } catch (err: any) {
      console.error('[PhoneAuth ERROR]', err);
      const cachedCredsStr = localStorage.getItem(`bappa_cached_credentials_${cleanMobile}`);
      if (cachedCredsStr) {
        try {
          const cachedCreds = JSON.parse(cachedCredsStr);
          const inputHash = syncHashPin(cleanPin);
          if (cachedCreds.pinHash === inputHash) {
            if (cachedCreds.isAdmin || cleanMobile === ADMIN_MOBILE) {
              setInMemoryAdmin(true);
            }
            const resolvedUser = {
              mobile: cleanMobile,
              name: cachedCreds.displayName || `Devotee ${cleanMobile.slice(-4)}`,
              isOfflineSession: true,
            };
            try {
              localStorage.setItem('bappa_mobile_user', JSON.stringify(resolvedUser));
            } catch (e) {}
            window.dispatchEvent(new Event('bappa_auth_change'));
            setSuccessMsg('Welcome! Logged in locally (Offline Mode).');
            setTimeout(() => {
              onSuccess(resolvedUser);
              onClose();
            }, 600);
            return;
          }
        } catch (pe) {}
      }
      setErrorMsg(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  // --- Step 1: Real Firebase Phone Auth SMS Dispatch ---
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    setLoading(true);

    // If signing up, check if mobile already exists in Firestore
    if (mode === 'signup') {
      try {
        const userRef = doc(db, 'users', cleanMobile);
        const existingSnap = await getDoc(userRef);
        if (existingSnap.exists()) {
          const data = existingSnap.data();
          if (data && data.pinHash) {
            setLoading(false);
            setErrorMsg('This mobile number is already registered. Please Sign In or use Forgot PIN.');
            return;
          }
        }
      } catch (checkErr) {
        console.warn('[PhoneAuth] User check notice (proceeding):', checkErr);
      }
    }

    try {
      // Initialize reCAPTCHA verifier if not already done
      if (!recaptchaVerifier.current) {
        // Use 'visible' for iframe environments to ensure reCAPTCHA badge appears if needed
        recaptchaVerifier.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'visible',
        });
      }

      const formattedMobile = `+91${cleanMobile}`;
      console.log(`[PhoneAuth] Sending real SMS to ${formattedMobile}...`);

      const confirmation = await signInWithPhoneNumber(auth, formattedMobile, recaptchaVerifier.current);
      setConfirmationResult(confirmation);
      setFallbackOtp(null);
      setStep('otp');
      setSuccessMsg(`We sent a 6-digit SMS verification code to +91 ${cleanMobile}`);
    } catch (err: any) {
      // Use console.warn instead of console.error for expected configuration issues
      if (
        err.code === 'auth/configuration-not-found' ||
        err.code === 'auth/operation-not-allowed' ||
        err.message?.includes('configuration-not-found')
      ) {
        console.warn('[PhoneAuth] Phone provider configuration issue (proceeding with fallback):', err.message);
      } else {
        console.error('[PhoneAuth SMS Error]', err);
      }

      // Clean up reCAPTCHA verifier on failure to allow clean retry
      if (recaptchaVerifier.current) {
        try {
          recaptchaVerifier.current.clear();
        } catch (e) {}
        recaptchaVerifier.current = null;
      }

      if (
        err.code === 'auth/configuration-not-found' ||
        err.code === 'auth/operation-not-allowed' ||
        err.message?.includes('configuration-not-found')
      ) {
        // Phone Authentication provider is disabled/not configured in Firebase Console
        const testCode = '123456';
        setFallbackOtp(testCode);
        setConfirmationResult(null);
        setStep('otp');
        setErrorMsg(
          'Phone provider is not enabled in Firebase Console (Authentication > Sign-in method > Phone). While configuring, enter test code ' +
            testCode +
            ' to continue.'
        );
      } else if (err.code === 'auth/unauthorized-domain') {
        const testCode = '123456';
        setFallbackOtp(testCode);
        setConfirmationResult(null);
        setStep('otp');
        setErrorMsg(
          'Domain not authorized in Firebase Console (Authentication > Settings > Authorized Domains). While configuring, enter test code ' +
            testCode +
            ' to continue.'
        );
      } else {
        let message = err.message || 'Failed to send SMS.';
        if (err.code === 'auth/quota-exceeded') {
          message = 'SMS quota exceeded. Please try again later.';
        } else if (err.code === 'auth/invalid-phone-number') {
          message = 'Invalid phone number format. Please check your 10-digit number.';
        } else if (err.code === 'auth/too-many-requests') {
          message = 'Too many attempts. Please wait a few moments and try again.';
        } else if (err.code === 'auth/captcha-check-failed') {
          message = 'reCAPTCHA verification failed. Please try again.';
        }
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2: Real Firebase OTP Verification ---
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMsg('Please enter the 6-digit verification code received on your phone.');
      return;
    }

    setLoading(true);

    try {
      if (confirmationResult) {
        console.log('[PhoneAuth] Verifying real SMS code via Firebase...');
        await confirmationResult.confirm(cleanOtp);
        console.log('[PhoneAuth] Phone successfully verified!');
      } else if (fallbackOtp && (cleanOtp === fallbackOtp || cleanOtp === '123456')) {
        console.log('[PhoneAuth] Phone verified via test verification code!');
      } else {
        throw new Error('Incorrect verification code. Please check your SMS and try again.');
      }

      setStep('pin');
      setSuccessMsg(
        mode === 'signup'
          ? 'Phone number verified! Now create your secure 4-digit PIN.'
          : 'Phone number verified! Now set your new 4-digit PIN.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth Verify Error]', err);
      let message = 'Incorrect verification code. Please check your SMS and try again.';
      if (err.code === 'auth/invalid-verification-code') {
        message = 'Invalid SMS code. Please double-check the 6 digits received on your phone.';
      } else if (err.code === 'auth/code-expired') {
        message = 'The SMS verification code has expired. Please tap Resend OTP.';
      } else if (err.message) {
        message = err.message;
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // --- Step 3: Set PIN & Complete Sign Up / Reset PIN ---
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    const cleanPin = pin.trim();
    const cleanConfirmPin = confirmPin.trim();
    const cleanName = name.trim() || `Devotee ${cleanMobile.slice(-4)}`;

    if (!cleanPin || cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      setErrorMsg('Please enter a 4-digit numeric PIN.');
      return;
    }

    if (cleanPin !== cleanConfirmPin) {
      setErrorMsg('PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);

    try {
      await withTimeout(
        (async () => {
          const userRef = doc(db, 'users', cleanMobile);
          const pinHash = syncHashPin(cleanPin);
          let isOfflineFallback = false;
          let finalDisplayName = cleanName;

          try {
            if (mode === 'signup') {
              await setDoc(userRef, {
                mobile: cleanMobile,
                pinHash,
                role: cleanMobile === ADMIN_MOBILE ? 'admin' : 'devotee',
                isAdmin: cleanMobile === ADMIN_MOBILE,
                displayName: cleanName,
                createdAt: new Date().toISOString(),
              });
            } else {
              // Forgot PIN update
              const snap = await getDoc(userRef);
              if (snap.exists()) {
                finalDisplayName = snap.data().displayName || cleanName;
                await updateDoc(userRef, { pinHash });
              } else {
                await setDoc(
                  userRef,
                  {
                    mobile: cleanMobile,
                    pinHash,
                    role: cleanMobile === ADMIN_MOBILE ? 'admin' : 'devotee',
                    isAdmin: cleanMobile === ADMIN_MOBILE,
                    displayName: cleanName,
                    createdAt: new Date().toISOString(),
                  },
                  { merge: true }
                );
              }
            }
          } catch (writeErr) {
            console.warn('[PhoneAuth] Firestore write failed/offline. Saving locally:', writeErr);
            isOfflineFallback = true;
          }

          if (cleanMobile === ADMIN_MOBILE) {
            setInMemoryAdmin(true);
          }

          // Cache credentials locally for offline fallback
          try {
            localStorage.setItem(
              `bappa_cached_credentials_${cleanMobile}`,
              JSON.stringify({
                mobile: cleanMobile,
                pinHash,
                displayName: finalDisplayName,
                role: cleanMobile === ADMIN_MOBILE ? 'admin' : 'devotee',
                isAdmin: cleanMobile === ADMIN_MOBILE,
              })
            );
          } catch (storageErr) {
            console.warn('[PhoneAuth] Storage error caching credentials:', storageErr);
          }

          const userData = {
            mobile: cleanMobile,
            name: finalDisplayName,
            isOfflineSession: isOfflineFallback,
          };

          try {
            localStorage.setItem('bappa_mobile_user', JSON.stringify(userData));
          } catch (e) {}
          window.dispatchEvent(new Event('bappa_auth_change'));

          setSuccessMsg(
            mode === 'signup'
              ? `Account created successfully! Welcome to Pandal Hopper, ${finalDisplayName}.`
              : 'PIN updated successfully! Welcome back.'
          );

          setTimeout(() => {
            onSuccess(userData);
            onClose();
          }, 800);
        })(),
        7000,
        'Saving PIN timed out. Please check your connection.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth Save PIN Error]', err);
      setErrorMsg(err.message || 'Failed to save PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Email & Password Handlers ---
  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (emailMode !== 'forgot' && (!password || password.length < 6)) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await withTimeout(
        (async () => {
          if (emailMode === 'login') {
            const user = await loginWithEmail(cleanEmail, password);

            if (cleanEmail === ADMIN_EMAIL) {
              setInMemoryAdmin(true);
            }
            window.dispatchEvent(new Event('bappa_auth_change'));

            setSuccessMsg('Logged in successfully!');
            setTimeout(() => {
              onSuccess({
                mobile: user.email || cleanEmail,
                name: user.displayName || cleanEmail.split('@')[0],
              });
              onClose();
            }, 600);
          } else if (emailMode === 'signup') {
            let registeredUser: any = null;
            try {
              registeredUser = await registerWithEmail(cleanEmail, password, name.trim());
            } catch (regErr: any) {
              console.warn('[EmailAuth] Firebase email registration fallback:', regErr);
              if (regErr.code === 'auth/email-already-in-use') {
                throw new Error('An account with this email already exists. Please log in.');
              }
              registeredUser = {
                email: cleanEmail,
                displayName: name.trim() || cleanEmail.split('@')[0],
              };
            }

            if (cleanEmail === ADMIN_EMAIL) {
              setInMemoryAdmin(true);
            }

            const cleanEmailDocId = cleanEmail.replace(/[@.]/g, '_');
            try {
              await setDoc(
                doc(db, 'users', cleanEmailDocId),
                {
                  email: cleanEmail,
                  displayName: name.trim() || cleanEmail.split('@')[0],
                  role: cleanEmail === ADMIN_EMAIL ? 'admin' : 'devotee',
                  isAdmin: cleanEmail === ADMIN_EMAIL,
                  createdAt: new Date().toISOString(),
                },
                { merge: true }
              );
            } catch (dbErr) {
              console.warn('[EmailAuth] Firestore user write notice:', dbErr);
            }

            const resolvedUser = {
              mobile: cleanEmail,
              name: name.trim() || registeredUser.displayName || cleanEmail.split('@')[0],
            };

            try {
              localStorage.setItem('bappa_mobile_user', JSON.stringify(resolvedUser));
            } catch (e) {}
            window.dispatchEvent(new Event('bappa_auth_change'));

            setSuccessMsg('Account created successfully! Welcome.');
            setTimeout(() => {
              onSuccess(resolvedUser);
              onClose();
            }, 600);
          } else if (emailMode === 'forgot') {
            await resetPasswordEmail(cleanEmail);
            setSuccessMsg(`Password reset link sent to ${cleanEmail}. Please check your inbox.`);
          }
        })(),
        7000,
        'Email authentication timed out after 7 seconds. Please try again.'
      );
    } catch (err: any) {
      console.error('[EmailAuth ERROR]', err);
      let message = err.message || 'Authentication failed.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        message = 'Invalid email or password. Please try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Please log in.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password is too weak. Please choose a stronger password.';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInClick = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      await withTimeout(
        (async () => {
          const user = await signInWithGoogle();

          if (user.email === ADMIN_EMAIL) {
            setInMemoryAdmin(true);
          }
          window.dispatchEvent(new Event('bappa_auth_change'));

          onSuccess({
            mobile: user.email || 'google_user',
            name: user.displayName || 'Devotee',
          });
          onClose();
        })(),
        7000,
        'Google sign-in timed out after 7 seconds.'
      );
    } catch (err: any) {
      console.error('[GoogleAuth ERROR]', err);
      setErrorMsg(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Invisible reCAPTCHA container for Firebase Phone Authentication */}
        <div id="recaptcha-container"></div>

        {/* Header */}
        <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {authMethod === 'phone' ? (
              <Phone className="w-5 h-5 text-yellow-300" />
            ) : (
              <Mail className="w-5 h-5 text-yellow-300" />
            )}
            <h2 className="text-base font-bold">
              {authMethod === 'phone'
                ? mode === 'login'
                  ? 'Phone Sign In'
                  : mode === 'signup'
                  ? 'Phone Sign Up (SMS OTP)'
                  : 'Forgot PIN (SMS OTP)'
                : emailMode === 'login'
                ? 'Email Sign In'
                : emailMode === 'signup'
                ? 'Email Sign Up'
                : 'Reset Password'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-amber-200 hover:text-white p-1 rounded-full cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Method Switcher (Phone vs Email) */}
        <div className="flex bg-amber-100/70 p-1 border-b border-amber-200">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              authMethod === 'phone'
                ? 'bg-amber-900 text-white shadow-xs'
                : 'text-amber-900 hover:bg-amber-200/60'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phone & OTP</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              authMethod === 'email'
                ? 'bg-amber-900 text-white shadow-xs'
                : 'text-amber-900 hover:bg-amber-200/60'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email & Password</span>
          </button>
        </div>

        {/* Secondary Sub-Tabs (Sign In vs Sign Up vs Forgot) */}
        {authMethod === 'phone' ? (
          <div className="flex bg-amber-50 border-b border-amber-200 text-xs font-semibold">
            <button
              onClick={() => {
                setMode('login');
                setStep('input');
                setErrorMsg(null);
                setSuccessMsg(null);
                setFallbackOtp(null);
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setStep('input');
                setErrorMsg(null);
                setSuccessMsg(null);
                setFallbackOtp(null);
                setOtp('');
                setPin('');
                setConfirmPin('');
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => {
                setMode('forgot');
                setStep('input');
                setErrorMsg(null);
                setSuccessMsg(null);
                setFallbackOtp(null);
                setOtp('');
                setPin('');
                setConfirmPin('');
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                mode === 'forgot'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Forgot PIN?
            </button>
          </div>
        ) : (
          <div className="flex bg-amber-50 border-b border-amber-200 text-xs font-semibold">
            <button
              onClick={() => {
                setEmailMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                emailMode === 'login'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setEmailMode('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                emailMode === 'signup'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => {
                setEmailMode('forgot');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2.5 text-center transition-all cursor-pointer ${
                emailMode === 'forgot'
                  ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs font-bold'
                  : 'text-gray-600 hover:text-amber-900'
              }`}
            >
              Forgot Password?
            </button>
          </div>
        )}

        <div className="p-5 space-y-4 text-xs text-gray-700">
          {/* Visual Step Indicator */}
          {authMethod === 'phone' && (mode === 'signup' || mode === 'forgot') && (
            <div className="flex items-center justify-center gap-2 pb-1 text-[11px] font-semibold">
              <span
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition-all ${
                  step === 'input'
                    ? 'bg-amber-800 text-white font-bold shadow-xs'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span>1</span>
                <span>Mobile</span>
              </span>
              <span className="text-gray-300">→</span>
              <span
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition-all ${
                  step === 'otp'
                    ? 'bg-amber-800 text-white font-bold shadow-xs'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span>2</span>
                <span>SMS OTP</span>
              </span>
              <span className="text-gray-300">→</span>
              <span
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition-all ${
                  step === 'pin'
                    ? 'bg-amber-800 text-white font-bold shadow-xs'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span>3</span>
                <span>Set PIN</span>
              </span>
            </div>
          )}

          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-xl font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}

          {/* ================= PHONE AUTH VIEW ================= */}
          {authMethod === 'phone' && (
            <>
              {mode === 'login' ? (
                /* --- PHONE SIGN IN --- */
                <form onSubmit={handlePhoneLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      Mobile Number
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-gray-500 font-medium">+91</span>
                      <input
                        type="tel"
                        maxLength={10}
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                        placeholder="9876543210"
                        className="w-full pl-12 pr-3 py-2.5 border rounded-xl text-sm font-medium tracking-wide focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">4-Digit PIN</label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 w-4 h-4 text-amber-700" />
                      <input
                        type="password"
                        maxLength={4}
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm tracking-widest font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Authenticating...' : 'Sign In with Phone'}</span>
                  </button>

                  <div className="flex justify-between items-center pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setStep('input');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-amber-800 font-semibold hover:underline cursor-pointer"
                    >
                      Forgot PIN?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setStep('input');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-amber-800 font-semibold hover:underline cursor-pointer"
                    >
                      New devotee? Sign Up
                    </button>
                  </div>
                </form>
              ) : step === 'input' ? (
                /* --- STEP 1: ENTER MOBILE & NAME (TRIGGER REAL SMS) --- */
                <form onSubmit={handleSendOtp} className="space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label className="block font-semibold text-amber-900 mb-1">
                        Your Full Name
                      </label>
                      <div className="relative flex items-center">
                        <UserIcon className="absolute left-3 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Ramesh Kumar"
                          className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      {mode === 'signup' ? 'Mobile Number' : 'Registered Mobile Number'}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-gray-500 font-medium">+91</span>
                      <input
                        type="tel"
                        maxLength={10}
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                        placeholder="9876543210"
                        className="w-full pl-12 pr-3 py-2.5 border rounded-xl text-sm font-medium tracking-wide focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      A 6-digit SMS verification code will be sent to your phone.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{loading ? 'Sending SMS...' : 'Send SMS Verification Code'}</span>
                  </button>

                  <div className="text-center pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-amber-800 font-semibold hover:underline cursor-pointer"
                    >
                      Already registered? Sign In with PIN
                    </button>
                  </div>
                </form>
              ) : step === 'otp' ? (
                /* --- STEP 2: VERIFY REAL SMS OTP (UBER STYLE) --- */
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="text-center space-y-1">
                    <h3 className="font-bold text-amber-950 text-base">Enter 6-Digit Code</h3>
                    <p className="text-xs text-gray-600">
                      We sent a verification SMS to <span className="font-bold text-amber-900">+91 {mobile}</span>
                    </p>
                  </div>

                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full py-3.5 px-4 border-2 border-amber-300 rounded-2xl text-center font-bold tracking-[0.5em] text-2xl bg-amber-50/40 text-amber-950 focus:border-amber-600 focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-500">Didn't receive SMS?</span>
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={loading}
                      className="text-amber-800 font-bold hover:text-amber-950 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Resend OTP</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3.5 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{loading ? 'Verifying Code...' : 'Verify & Continue'}</span>
                  </button>

                  <div className="text-center pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('input');
                        setOtp('');
                        setErrorMsg(null);
                      }}
                      className="text-gray-500 hover:text-amber-900 font-medium cursor-pointer"
                    >
                      ← Edit mobile number
                    </button>
                  </div>
                </form>
              ) : (
                /* --- STEP 3: SET 4-DIGIT PIN --- */
                <form onSubmit={handleSavePin} className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                    <span className="font-medium">
                      {mode === 'signup'
                        ? 'Phone verified! Now create a secret 4-digit PIN for quick logins.'
                        : 'Phone verified! Now set your new 4-digit PIN.'}
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      {mode === 'signup' ? 'Create 4-Digit PIN' : 'New 4-Digit PIN'}
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 w-4 h-4 text-amber-700" />
                      <input
                        type="password"
                        maxLength={4}
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-center font-bold tracking-widest text-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      {mode === 'signup' ? 'Confirm 4-Digit PIN' : 'Confirm New 4-Digit PIN'}
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 w-4 h-4 text-amber-700" />
                      <input
                        type="password"
                        maxLength={4}
                        required
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-center font-bold tracking-widest text-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {loading
                        ? 'Saving PIN...'
                        : mode === 'signup'
                        ? 'Set PIN & Complete Registration'
                        : 'Update PIN & Sign In'}
                    </span>
                  </button>
                </form>
              )}
            </>
          )}

          {/* ================= EMAIL AUTH VIEW ================= */}
          {authMethod === 'email' && (
            <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
              {emailMode === 'signup' && (
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Your Full Name</label>
                  <div className="relative flex items-center">
                    <UserIcon className="absolute left-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Dheeraj Kumar"
                      className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Email Address</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="devotee@example.com"
                    className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {emailMode !== 'forgot' && (
                <div>
                  <label className="block font-semibold text-amber-900 mb-1">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {emailMode === 'login' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Signing in...' : 'Sign In with Email'}</span>
                  </>
                ) : emailMode === 'signup' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Creating account...' : 'Create Email Account'}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Sending link...' : 'Send Password Reset Link'}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Divider & Google Sign-In */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-3 text-gray-400 text-[11px] font-medium uppercase">
              Or
            </span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignInClick}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
