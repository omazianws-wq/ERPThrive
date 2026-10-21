import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  Shield,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Building2,
  KeyRound,
  ExternalLink,
  Copy,
  Info
} from 'lucide-react';
import { Logo } from '../brand/Logo.tsx';
import { useAuth } from '../../modules/auth/AuthContext.tsx';
import { AuthViewMode } from '../../modules/auth/types.ts';

interface AuthScreenProps {
  initialMode?: AuthViewMode;
  onNavigateMode?: (mode: AuthViewMode) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode = 'login',
  onNavigateMode
}) => {
  const {
    signIn,
    signUp,
    resetPasswordForEmail,
    updatePassword,
    signInDemo,
    error: authContextError,
    clearError,
    authNotice,
    clearAuthNotice,
    previewOriginUrl
  } = useAuth();

  const [mode, setMode] = useState<AuthViewMode>(initialMode);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [copiedRedirectUrl, setCopiedRedirectUrl] = useState(false);

  // Sync mode with URL hash if present
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash === 'signup' || hash === 'login' || hash === 'forgot-password' || hash === 'reset-password') {
        setMode(hash as AuthViewMode);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchMode = (newMode: AuthViewMode) => {
    clearError();
    setFormError(null);
    setSuccessNotice(null);
    setMode(newMode);
    window.location.hash = `#${newMode}`;
    if (onNavigateMode) {
      onNavigateMode(newMode);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessNotice(null);
    setIsSubmitting(true);

    const res = await signIn({ email, password, rememberMe });
    setIsSubmitting(false);

    if (res.success) {
      window.location.hash = '#dashboard';
    } else if (res.error) {
      setFormError(res.error);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessNotice(null);
    setIsSubmitting(true);

    const res = await signUp({
      fullName,
      email,
      password,
      confirmPassword
    });
    setIsSubmitting(false);

    if (res.success) {
      if (res.confirmationRequired) {
        setSuccessNotice(
          `Account registered successfully! A confirmation link has been sent to ${email}. Please verify your email to log in.`
        );
      } else {
        window.location.hash = '#dashboard';
      }
    } else if (res.error) {
      setFormError(res.error);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessNotice(null);
    setIsSubmitting(true);

    const res = await resetPasswordForEmail(email);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessNotice(
        `If an account exists for ${email}, a password reset link has been dispatched. Please check your inbox and spam folder.`
      );
    } else if (res.error) {
      setFormError(res.error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessNotice(null);

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const res = await updatePassword(password);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessNotice('Your password has been successfully updated. You may now sign in.');
      setTimeout(() => {
        switchMode('login');
      }, 2000);
    } else if (res.error) {
      setFormError(res.error);
    }
  };

  const activeError = formError || authContextError;

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-slate-900/95 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background architectural mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-700/50 mb-3">
            <Logo size="lg" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white text-center">
            ERPThrive Enterprise Core
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Module 2 · Identity & Authentication Foundation
          </p>
        </div>

        {/* Card Frame */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Top subtle phase bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700" />

          <div className="p-6 sm:p-8">
            {/* View Title & Subtitle */}
            <div className="mb-6">
              {mode === 'login' && (
                <>
                  <h2 className="text-lg font-bold text-slate-900">Sign in to your account</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your corporate credentials to access your ERP workspace.
                  </p>
                </>
              )}
              {mode === 'signup' && (
                <>
                  <h2 className="text-lg font-bold text-slate-900">Create Corporate Account</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Register your verified account. Organization access is granted post-signup.
                  </p>
                </>
              )}
              {mode === 'forgot-password' && (
                <>
                  <h2 className="text-lg font-bold text-slate-900">Reset Your Password</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your work email to receive a secure recovery link.
                  </p>
                </>
              )}
              {mode === 'reset-password' && (
                <>
                  <h2 className="text-lg font-bold text-slate-900">Set New Password</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Choose a strong password containing at least 8 characters with letters and numbers.
                  </p>
                </>
              )}
            </div>

            {/* Supabase URL Callback Notice (Email Confirmation, Password Recovery, or Link Error) */}
            {authNotice && (
              <div
                className={`mb-4 flex items-start justify-between gap-2.5 rounded-xl border p-3.5 text-xs shadow-2xs ${
                  authNotice.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-950'
                    : authNotice.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border-sky-200 bg-sky-50 text-sky-950'
                }`}
                role={authNotice.type === 'error' ? 'alert' : 'status'}
              >
                <div className="flex items-start gap-2.5">
                  {authNotice.type === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  {authNotice.type === 'success' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  {authNotice.type === 'info' && (
                    <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 leading-snug">
                    <div className="font-bold mb-0.5">{authNotice.title}</div>
                    <div className="text-[11px] leading-relaxed">{authNotice.message}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearAuthNotice}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1 rounded-md shrink-0"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Error Notification */}
            {activeError && (!authNotice || activeError !== authNotice.message) && (
              <div
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">{activeError}</div>
              </div>
            )}

            {/* Success Notification */}
            {successNotice && (
              <div
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
                role="status"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-snug">{successNotice}</div>
              </div>
            )}

            {/* ===================================================================
                VIEW 1: LOGIN FORM
               =================================================================== */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot-password')}
                      className="text-[11px] font-medium text-sky-700 hover:text-sky-900 focus:outline-none"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5"
                    />
                    <span>Remember my session</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2 text-xs text-slate-500">
                  Don't have an enterprise account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-semibold text-sky-700 hover:text-sky-900 focus:outline-none"
                  >
                    Create account
                  </button>
                </div>
              </form>
            )}

            {/* ===================================================================
                VIEW 2: SIGN UP FORM
               =================================================================== */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      id="signup-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="block w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="signup-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 chars (letters & numbers)"
                      className="block w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="block w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Least-Privilege Architectural Policy Note */}
                <div className="rounded-lg bg-sky-50/70 border border-sky-200/80 p-2.5 text-[11px] text-sky-950 flex items-start gap-2">
                  <Shield className="h-3.5 w-3.5 text-sky-700 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-semibold">Security Governance: </span>
                    <span>
                      Company access and roles are not self-assigned during public registration. Following sign-up, your organization administrator will assign your permissions.
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating account...</span>
                    </>
                  ) : (
                    <>
                      <span>Register Account</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2 text-xs text-slate-500">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-sky-700 hover:text-sky-900 focus:outline-none"
                  >
                    Sign in here
                  </button>
                </div>
              </form>
            )}

            {/* ===================================================================
                VIEW 3: FORGOT PASSWORD FORM
               =================================================================== */}
            {mode === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Work Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Sending link...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Recovery Link</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2 text-xs text-slate-500">
                  Remembered your password?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-sky-700 hover:text-sky-900 focus:outline-none"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            {/* ===================================================================
                VIEW 4: RESET PASSWORD FORM
               =================================================================== */}
            {mode === 'reset-password' && (
              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <div>
                  <label htmlFor="reset-new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 chars (letters & numbers)"
                      className="block w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reset-confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="block w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Updating password...</span>
                    </>
                  ) : (
                    <>
                      <span>Update Password</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-sky-700 hover:text-sky-900 focus:outline-none"
                  >
                    Return to sign in
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* AI Studio Preview Supabase Redirect Configuration Guide */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                <span>AI Studio Preview Redirect URL:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const urlToCopy = previewOriginUrl || (typeof window !== 'undefined' ? `${window.location.origin}/` : '');
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(urlToCopy);
                    setCopiedRedirectUrl(true);
                    setTimeout(() => setCopiedRedirectUrl(false), 2500);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition"
                title="Copy the exact runtime URL for Supabase Auth Redirect URLs"
              >
                {copiedRedirectUrl ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 text-slate-500" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
            <div className="font-mono text-[11px] bg-white border border-slate-200 rounded p-1.5 text-slate-800 break-all select-all font-medium">
              {previewOriginUrl || (typeof window !== 'undefined' ? `${window.location.origin}/` : '')}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
              In your Supabase Dashboard (<span className="font-semibold text-slate-700">Authentication → URL Configuration → Redirect URLs</span>), add this exact URL or the wildcard <span className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">https://*.scf.usercontent.goog/**</span> so confirmation emails redirect directly to your running preview.
            </p>
          </div>

          {/* Quick-Access Testing Sandbox / Reviewer Bar */}
          <div className="bg-slate-50/70 border-t border-slate-200 px-6 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                <KeyRound className="h-3.5 w-3.5 text-sky-700" />
                <span>Reviewer & Test Sandbox Quick-Access:</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Multi-Tenant Simulator</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => signInDemo('COMPANY_ADMIN', false)}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-[11px] font-medium text-slate-800 transition shadow-2xs"
                title="Sign in with Company Admin credentials"
              >
                <Shield className="h-3.5 w-3.5 text-indigo-700" />
                <span>Admin Demo</span>
              </button>
              <button
                type="button"
                onClick={() => signInDemo('STAFF_USER', false)}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-[11px] font-medium text-slate-800 transition shadow-2xs"
                title="Sign in with Staff least-privilege credentials"
              >
                <User className="h-3.5 w-3.5 text-sky-700" />
                <span>Staff Demo</span>
              </button>
              <button
                type="button"
                onClick={() => signInDemo('STAFF_USER', true)}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-[11px] font-medium text-slate-800 transition shadow-2xs"
                title="Simulate a new user with no company membership to test the Onboarding Screen"
              >
                <Building2 className="h-3.5 w-3.5 text-amber-600" />
                <span>Test Onboarding</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Security Badges */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span>Supabase Auth & RLS</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Lock className="h-3.5 w-3.5 text-sky-400" />
            <span>Encrypted Sessions</span>
          </div>
        </div>
      </div>
    </div>
  );
};
