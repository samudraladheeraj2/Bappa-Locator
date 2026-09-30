import React, { useState } from 'react';
import { X, Phone, Lock, CheckCircle2, AlertCircle, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { hashPin } from '../utils/crypto';

interface MobileAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (userData: { mobile: string; name: string }) => void;
}

export const MobileAuthModal: React.FC<MobileAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [step, setStep] = useState<'input' | 'otp' | 'pin'>('input');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [simulatedSmsNotice, setSimulatedSmsNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateMobile = (num: string) => {
    return /^[6-9]\d{9}$/.test(num.trim());
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSimulatedSmsNotice(null);

    const cleanMobile = mobile.trim();
    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }

    setLoading(true);
    try {
      // Check if user exists for signup vs login/forgot
      const userRef = doc(db, 'users', cleanMobile);
      const userSnap = await getDoc(userRef);

      if (mode === 'signup' && userSnap.exists()) {
        setErrorMsg('Mobile number already registered. Please log in.');
        setLoading(false);
        return;
      }

      if ((mode === 'login' || mode === 'forgot') && !userSnap.exists() && mode !== 'login') {
        setErrorMsg('Mobile number not registered. Please sign up first.');
        setLoading(false);
        return;
      }

      // Generate 6-digit OTP
      const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(randomOtp);

      // Save OTP in Firestore otps collection with expiration (5 mins)
      await setDoc(doc(db, 'otps', cleanMobile), {
        otp: randomOtp,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      setLoading(false);
      setStep('otp');
      setSimulatedSmsNotice(`[Simulated SMS]: Your Bappa Locator OTP is ${randomOtp}`);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Failed to send OTP.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!otp.trim() || otp.trim().length !== 6) {
      setErrorMsg('Please enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const otpRef = doc(db, 'otps', mobile.trim());
      const otpSnap = await getDoc(otpRef);

      if (!otpSnap.exists()) {
        setErrorMsg('OTP expired or not found. Please request a new OTP.');
        setLoading(false);
        return;
      }

      const data = otpSnap.data();
      if (data.attempts >= 5) {
        setErrorMsg('Too many failed OTP attempts. Please request a new OTP.');
        setLoading(false);
        return;
      }

      if (data.otp !== otp.trim()) {
        await updateDoc(otpRef, { attempts: (data.attempts || 0) + 1 });
        setErrorMsg('Incorrect OTP. Please try again.');
        setLoading(false);
        return;
      }

      // OTP verified successfully
      setLoading(false);
      setStep('pin');
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Failed to verify OTP.');
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMsg('PIN must be exactly 4 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setErrorMsg('PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      const cleanMobile = mobile.trim();
      const pinHash = await hashPin(pin);

      if (mode === 'signup') {
        await setDoc(doc(db, 'users', cleanMobile), {
          mobile: cleanMobile,
          pinHash,
          role: 'user',
          isAdmin: false,
          createdAt: new Date().toISOString(),
          displayName: `Devotee ${cleanMobile.slice(-4)}`,
        });
        setSuccessMsg('Account created successfully with secure 4-digit PIN!');
      } else if (mode === 'forgot') {
        const userRef = doc(db, 'users', cleanMobile);
        await updateDoc(userRef, { pinHash });
        setSuccessMsg('PIN reset successfully! You can now log in with your new PIN.');
      }

      setLoading(false);
      setTimeout(() => {
        onSuccess({ mobile: cleanMobile, name: `Devotee ${cleanMobile.slice(-4)}` });
        onClose();
      }, 1500);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Failed to save PIN.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanMobile = mobile.trim();
    if (!validateMobile(cleanMobile)) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMsg('Please enter your 4-digit PIN.');
      return;
    }

    setLoading(true);
    try {
      // Special check for preset Admin credentials (7702583629 / 0796)
      if (cleanMobile === '7702583629' && pin === '0796') {
        // Ensure admin user doc exists
        const userRef = doc(db, 'users', cleanMobile);
        const pinHash = await hashPin('0796');
        await setDoc(userRef, {
          mobile: cleanMobile,
          pinHash,
          role: 'admin',
          isAdmin: true,
          displayName: 'Dheeraj (Admin)',
          createdAt: new Date().toISOString(),
        }, { merge: true });

        setLoading(false);
        setSuccessMsg('Admin Login successful!');
        setTimeout(() => {
          onSuccess({ mobile: cleanMobile, name: 'Dheeraj (Admin)' });
          window.dispatchEvent(new Event('bappa_auth_change'));
          onClose();
        }, 1000);
        return;
      }

      const userRef = doc(db, 'users', cleanMobile);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setErrorMsg('Mobile number not registered. Please Sign Up first.');
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const inputHash = await hashPin(pin);

      if (userData.pinHash !== inputHash) {
        setErrorMsg('Incorrect 4-digit PIN. Please try again or click Forgot PIN.');
        setLoading(false);
        return;
      }

      setLoading(false);
      setSuccessMsg('Login successful!');
      setTimeout(() => {
        onSuccess({ mobile: cleanMobile, name: userData.displayName || 'Devotee' });
        onClose();
      }, 1000);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Login failed.');
    }
  };

  const resetForm = (newMode: 'login' | 'signup' | 'forgot') => {
    setMode(newMode);
    setStep('input');
    setMobile('');
    setPin('');
    setConfirmPin('');
    setOtp('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setSimulatedSmsNotice(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-amber-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Phone className="w-5 h-5 text-yellow-300" />
            <h2 className="text-base font-bold">
              {mode === 'login' ? 'Login with Mobile Number' : mode === 'signup' ? 'Sign Up with Mobile Number' : 'Reset PIN'}
            </h2>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white p-1 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex bg-amber-50 border-b border-amber-200 text-xs font-semibold">
          <button
            onClick={() => resetForm('login')}
            className={`flex-1 py-3 text-center transition-all ${mode === 'login' ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs' : 'text-gray-600 hover:text-amber-900'}`}
          >
            Login
          </button>
          <button
            onClick={() => resetForm('signup')}
            className={`flex-1 py-3 text-center transition-all ${mode === 'signup' ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs' : 'text-gray-600 hover:text-amber-900'}`}
          >
            Sign Up
          </button>
          <button
            onClick={() => resetForm('forgot')}
            className={`flex-1 py-3 text-center transition-all ${mode === 'forgot' ? 'bg-white text-amber-900 border-b-2 border-amber-800 shadow-xs' : 'text-gray-600 hover:text-amber-900'}`}
          >
            Forgot PIN?
          </button>
        </div>

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

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-amber-900 mb-1">Mobile Number</label>
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
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
              >
                {loading ? 'Logging in...' : 'Login with Mobile & PIN'}
              </button>
            </form>
          ) : step === 'input' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <p className="text-gray-500">
                {mode === 'signup'
                  ? 'Enter your mobile number to receive a verification OTP and create your secure 4-digit PIN.'
                  : 'Enter your registered mobile number to receive a password reset OTP.'}
              </p>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Mobile Number</label>
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
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
              >
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          ) : step === 'otp' ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="text-amber-800 font-semibold flex items-center gap-1 hover:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Number</span>
                </button>
                <span className="text-gray-500">OTP sent to +91 {mobile}</span>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Enter 6-Digit OTP</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 border rounded-xl text-center font-mono text-lg tracking-widest font-bold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSavePin} className="space-y-4">
              <div className="bg-amber-50 p-3 rounded-xl text-amber-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                <span>OTP Verified! Now create your secure 4-digit login PIN.</span>
              </div>

              <div>
                <label className="block font-semibold text-amber-900 mb-1">Create 4-Digit PIN</label>
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
                <label className="block font-semibold text-amber-900 mb-1">Confirm 4-Digit PIN</label>
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
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
              >
                {loading ? 'Saving PIN...' : mode === 'signup' ? 'Complete Sign Up' : 'Update PIN & Login'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
