import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  db,
  signInWithGoogle,
  loginWithEmail,
  registerWithEmail,
  resetPasswordEmail,
} from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { hashPin, syncHashPin } from '../utils/crypto';
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
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [step, setStep] = useState<'input' | 'otp' | 'pin'>('input');
  const [simulatedSmsNotice, setSimulatedSmsNotice] = useState<string | null>(null);

  // Email states
  const [emailMode, setEmailMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // General states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateMobile = (num: string) => {
    const clean = num.replace(/\D/g, '').slice(-10);
    return /^[6-9]\d{9}$/.test(clean);
  };

  // --- Phone OTP & PIN Handlers ---

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSimulatedSmsNotice(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setLoading(true);
    console.log(`[PhoneAuth] Sending OTP verification request for ${cleanMobile}...`);

    try {
      await withTimeout(
        (async () => {
          const userRef = doc(db, 'users', cleanMobile);
          const userSnap = await getDoc(userRef);

          if (mode === 'signup' && userSnap.exists()) {
            throw new Error('Mobile number is already registered. Please switch to Login.');
          }

          if (mode === 'forgot' && !userSnap.exists()) {
            throw new Error('Mobile number not found. Please Sign Up first.');
          }

          // Generate 6-digit OTP
          const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
          setGeneratedOtp(randomOtp);

          // Save OTP in Firestore otps collection
          await setDoc(doc(db, 'otps', cleanMobile), {
            otp: randomOtp,
            createdAt: new Date().toISOString(),
            attempts: 0,
          });

          setStep('otp');
          setSimulatedSmsNotice(`[SMS Simulation]: Your Bappa Locator verification OTP is: ${randomOtp}`);
          console.log(`[PhoneAuth] OTP generated successfully: ${randomOtp}`);
        })(),
        7000,
        'Request timed out after 7 seconds. Please verify your connection.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth Error]', err);
      setErrorMsg(err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!otp.trim() || otp.trim().length !== 6) {
      setErrorMsg('Please enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    console.log(`[PhoneAuth] Verifying OTP for ${cleanMobile}...`);

    try {
      await withTimeout(
        (async () => {
          const otpRef = doc(db, 'otps', cleanMobile);
          const otpSnap = await getDoc(otpRef);

          if (!otpSnap.exists() && otp.trim() !== generatedOtp) {
            throw new Error('OTP expired or not found. Please request a new OTP.');
          }

          const storedOtp = otpSnap.exists() ? otpSnap.data().otp : generatedOtp;
          if (storedOtp !== otp.trim() && otp.trim() !== generatedOtp) {
            throw new Error('Incorrect OTP entered. Please try again.');
          }

          setStep('pin');
          setSuccessMsg('OTP verified successfully! Please set your 4-digit PIN.');
          console.log(`[PhoneAuth SUCCESS] OTP verified for ${cleanMobile}`);
        })(),
        7000,
        'Verification timed out after 7 seconds. Please try again.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth Error]', err);
      setErrorMsg(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMsg('Please enter a 4-digit numeric PIN.');
      return;
    }

    if (pin !== confirmPin) {
      setErrorMsg('PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);
    console.log(`[PhoneAuth] Saving PIN for ${cleanMobile}...`);

    try {
      await withTimeout(
        (async () => {
          const pinHash = syncHashPin(pin);
          const userRef = doc(db, 'users', cleanMobile);

          if (mode === 'signup') {
            await setDoc(userRef, {
              mobile: cleanMobile,
              pinHash,
              role: cleanMobile === ADMIN_MOBILE ? 'admin' : 'devotee',
              isAdmin: cleanMobile === ADMIN_MOBILE,
              createdAt: new Date().toISOString(),
              displayName: name.trim() || `Devotee ${cleanMobile.slice(-4)}`,
            });
            setSuccessMsg('Account created successfully with secure PIN!');
          } else {
            await updateDoc(userRef, { pinHash });
            setSuccessMsg('PIN updated successfully!');
          }

          if (cleanMobile === ADMIN_MOBILE) {
            setInMemoryAdmin(true);
          }

          const userData = {
            mobile: cleanMobile,
            name: name.trim() || `Devotee ${cleanMobile.slice(-4)}`,
          };
          localStorage.setItem('bappa_mobile_user', JSON.stringify(userData));
          window.dispatchEvent(new Event('bappa_auth_change'));

          setTimeout(() => {
            onSuccess(userData);
            onClose();
          }, 800);
        })(),
        7000,
        'Saving PIN timed out after 7 seconds. Please check your connection.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth Error]', err);
      setErrorMsg(err.message || 'Failed to save PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    const cleanPin = pin.trim();

    console.log(`[PhoneAuth Stage 1/4] Validating mobile (${cleanMobile}) and PIN...`);

    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
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
          // Special instant check for Admin credentials
          if (cleanMobile === ADMIN_MOBILE && cleanPin === ADMIN_PIN) {
            console.log(`[PhoneAuth Stage 2/4] Admin credentials verified (${ADMIN_MOBILE}). Activating Admin session...`);
            setInMemoryAdmin(true);

            const adminData = { mobile: ADMIN_MOBILE, name: 'Dheeraj (Admin)' };
            try {
              localStorage.setItem('bappa_mobile_user', JSON.stringify(adminData));
            } catch (e) {
              console.warn('Iframe localStorage notice:', e);
            }
            window.dispatchEvent(new Event('bappa_auth_change'));

            // Sync doc in background
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
            console.log('[PhoneAuth SUCCESS] Admin logged in.');
            setTimeout(() => {
              onSuccess(adminData);
              onClose();
            }, 600);
            return;
          }

          // Regular User Login
          console.log(`[PhoneAuth Stage 2/4] Fetching user profile for ${cleanMobile}...`);
          const userRef = doc(db, 'users', cleanMobile);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            throw new Error('Mobile number not registered. Please switch to Sign Up.');
          }

          console.log(`[PhoneAuth Stage 3/4] Matching SHA-256 PIN hash...`);
          const userData = userSnap.data();
          const inputHash = syncHashPin(cleanPin);

          if (userData.pinHash !== inputHash) {
            throw new Error('Incorrect 4-digit PIN. Please try again or click Forgot PIN.');
          }

          console.log(`[PhoneAuth Stage 4/4] Establishing session...`);
          if (userData.isAdmin || cleanMobile === ADMIN_MOBILE) {
            setInMemoryAdmin(true);
          }

          const resolvedUser = {
            mobile: cleanMobile,
            name: userData.displayName || `Devotee ${cleanMobile.slice(-4)}`,
          };

          try {
            localStorage.setItem('bappa_mobile_user', JSON.stringify(resolvedUser));
          } catch (e) {}
          window.dispatchEvent(new Event('bappa_auth_change'));

          setSuccessMsg('Login successful! Welcome back.');
          console.log('[PhoneAuth SUCCESS] User logged in:', resolvedUser.name);
          setTimeout(() => {
            onSuccess(resolvedUser);
            onClose();
          }, 600);
        })(),
        7000,
        'Login request timed out after 7 seconds. Please verify your connection.'
      );
    } catch (err: any) {
      console.error('[PhoneAuth ERROR]', err);
      setErrorMsg(err.message || 'Login failed.');
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
    console.log(`[EmailAuth] Processing ${emailMode} for ${cleanEmail}...`);

    try {
      await withTimeout(
        (async () => {
          if (emailMode === 'login') {
            const user = await loginWithEmail(cleanEmail, password);
            console.log('[EmailAuth SUCCESS] Logged in with email:', user.email);

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
            const user = await registerWithEmail(cleanEmail, password, name.trim());
            console.log('[EmailAuth SUCCESS] Registered new account:', user.email);

            if (cleanEmail === ADMIN_EMAIL) {
              setInMemoryAdmin(true);
            }
            window.dispatchEvent(new Event('bappa_auth_change'));

            setSuccessMsg('Account created successfully! Welcome.');
            setTimeout(() => {
              onSuccess({
                mobile: user.email || cleanEmail,
                name: name.trim() || user.displayName || cleanEmail.split('@')[0],
              });
              onClose();
            }, 600);
          } else if (emailMode === 'forgot') {
            await resetPasswordEmail(cleanEmail);
            console.log('[EmailAuth SUCCESS] Password reset email sent.');
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
    console.log('[GoogleAuth] Initiating Google Sign-In...');

    try {
      await withTimeout(
        (async () => {
          const user = await signInWithGoogle();
          console.log('[GoogleAuth SUCCESS] User signed in:', user.email);

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
                  ? 'Phone Sign Up'
                  : 'Reset PIN'
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
            <span>Phone & PIN</span>
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

          {simulatedSmsNotice && (
            <div className="bg-amber-100 border border-amber-300 text-amber-900 p-3 rounded-xl font-mono text-[11px] shadow-xs">
              {simulatedSmsNotice}
            </div>
          )}

          {/* ================= PHONE AUTH VIEW ================= */}
          {authMethod === 'phone' && (
            <>
              {mode === 'login' ? (
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
                </form>
              ) : step === 'input' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label className="block font-semibold text-amber-900 mb-1">Your Name</label>
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Sending OTP...' : 'Send Verification OTP'}
                  </button>
                </form>
              ) : step === 'otp' ? (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      Enter 6-Digit OTP
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full px-3 py-2.5 border rounded-xl text-center font-bold tracking-widest text-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSavePin} className="space-y-4">
                  <div className="bg-amber-50 p-3 rounded-xl text-amber-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>OTP Verified! Set your secure 4-digit PIN.</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      Create 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full px-3 py-2.5 border rounded-xl text-center font-bold tracking-widest text-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-amber-900 mb-1">
                      Confirm 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full px-3 py-2.5 border rounded-xl text-center font-bold tracking-widest text-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Set PIN & Complete Sign Up'}
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
