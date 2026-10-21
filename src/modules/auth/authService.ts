/**
 * Pure validation and formatting helpers for Module 2 Authentication.
 */

export function validateEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return 'Email address is required.';
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return 'Email address cannot be empty.';
  }
  // Standard RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Please enter a valid work email address.';
  }
  return null;
}

export function validateFullName(name: string): string | null {
  if (!name || typeof name !== 'string') {
    return 'Full name is required.';
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return 'Full name must be at least 2 characters.';
  }
  if (trimmed.length > 100) {
    return 'Full name cannot exceed 100 characters.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return 'Please confirm your password.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}

/**
 * Transforms Supabase Auth errors into user-friendly enterprise messages.
 */
export function formatAuthErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const errObj = error as { message?: string; code?: string; status?: number; error_description?: string };
  const rawMsg = errObj.message || errObj.error_description || String(error);

  if (rawMsg.includes('Invalid login credentials') || rawMsg.includes('invalid_credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (rawMsg.includes('Email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link.';
  }
  if (rawMsg.includes('User already registered') || rawMsg.includes('already registered')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (rawMsg.includes('Password should be at least')) {
    return 'Password must be at least 8 characters long.';
  }
  if (rawMsg.includes('rate limit') || rawMsg.includes('over_email_send_rate_limit')) {
    return 'Too many attempts. Please wait a few moments before trying again.';
  }
  if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) {
    return 'Unable to reach the authentication service. Check your internet connection.';
  }

  return rawMsg;
}

/**
 * Checks for recovery token or access token in the current URL hash.
 */
export function extractAuthTokensFromHash(): { type: string | null; accessToken: string | null } {
  if (typeof window === 'undefined') return { type: null, accessToken: null };
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const type = params.get('type');
  const accessToken = params.get('access_token');
  return { type, accessToken };
}

/**
 * Computes the runtime URL for Supabase Auth confirmation and password-recovery redirects.
 * Dynamically uses the current window origin + pathname so it works seamlessly in:
 * - Google AI Studio Preview (e.g. https://<applet>.scf.usercontent.goog/)
 * - Custom domain previews (e.g. https://*.googleusercontent.com/)
 * - Localhost during development (http://localhost:3000)
 *
 * CRITICAL: Supabase Redirect URLs MUST NOT contain a '#' fragment, because Supabase
 * appends auth tokens (#access_token=... or ?code=...) to this URL.
 */
export function getAuthRedirectUrl(targetOrigin?: string): string {
  if (typeof window === 'undefined') {
    if (!targetOrigin) return '';
    return targetOrigin.endsWith('/') ? targetOrigin : `${targetOrigin}/`;
  }

  const origin = targetOrigin || window.location.origin;
  let pathname = window.location.pathname || '/';

  // Strip trailing 'index.html' if any
  if (pathname.endsWith('index.html')) {
    pathname = pathname.slice(0, -'index.html'.length);
  }

  // Ensure trailing slash for root or directory path
  if (!pathname.endsWith('/')) {
    pathname += '/';
  }

  return `${origin}${pathname}`;
}

export type AuthNoticeType = 'success' | 'error' | 'info';

export interface AuthCallbackNotice {
  type: AuthNoticeType;
  title: string;
  message: string;
  sourceType: 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | null;
  errorCode?: string | null;
}

/**
 * Parses authentication callbacks, tokens, and errors from URL hash fragments
 * or query parameters when returning from Supabase email links.
 */
export function parseAuthCallbackFromUrl(
  customHash?: string,
  customSearch?: string
): AuthCallbackNotice | null {
  const hashStr = customHash !== undefined
    ? customHash.replace(/^#/, '')
    : (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '');

  const searchStr = customSearch !== undefined
    ? customSearch.replace(/^\?/, '')
    : (typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '');

  const hashParams = new URLSearchParams(hashStr);
  const searchParams = new URLSearchParams(searchStr);

  // 1. Check for errors in hash or search
  const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
  const errorName = hashParams.get('error') || searchParams.get('error');
  const errorDescription = hashParams.get('error_description') || searchParams.get('error_description');

  if (errorName || errorCode || errorDescription) {
    const rawError = errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : (errorName || 'Authentication verification failed');
    let friendlyMessage = rawError;

    if (rawError.includes('Email link is invalid or has expired') || errorCode === 'otp_expired' || errorCode === '401') {
      friendlyMessage = 'This email confirmation link is invalid or has expired. Please sign in or request a new verification email.';
    } else if (rawError.includes('access_denied')) {
      friendlyMessage = 'Access denied during authentication verification. Please check your credentials or request a new link.';
    }

    return {
      type: 'error',
      title: 'Verification Link Error',
      message: friendlyMessage,
      sourceType: null,
      errorCode: errorCode || errorName
    };
  }

  // 2. Check for token types
  const type = (hashParams.get('type') || searchParams.get('type')) as AuthCallbackNotice['sourceType'];
  const hasAccessToken = Boolean(hashParams.get('access_token') || searchParams.get('access_token'));
  const hasCode = Boolean(searchParams.get('code'));

  if (type === 'signup') {
    return {
      type: 'success',
      title: 'Email Confirmed Successfully',
      message: 'Your work email has been verified! Your ERPThrive account is now active and ready for use.',
      sourceType: 'signup'
    };
  }

  if (type === 'recovery') {
    return {
      type: 'info',
      title: 'Identity Confirmed for Password Reset',
      message: 'Your password reset token has been verified. Please enter your new password below.',
      sourceType: 'recovery'
    };
  }

  if (type === 'email_change') {
    return {
      type: 'success',
      title: 'Email Address Updated',
      message: 'Your email address update has been verified and applied to your account.',
      sourceType: 'email_change'
    };
  }

  if (type === 'invite') {
    return {
      type: 'info',
      title: 'Organization Invitation Verified',
      message: 'Your enterprise invitation has been confirmed. Please complete your profile.',
      sourceType: 'invite'
    };
  }

  // If there's an access token with no explicit type, check if it was implicit signup
  if (hasAccessToken || hasCode) {
    return {
      type: 'success',
      title: 'Authentication Verified',
      message: 'Your authentication credentials have been verified.',
      sourceType: null
    };
  }

  return null;
}

/**
 * Cleans auth tokens and parameters from the browser address bar while preserving the intended app route hash.
 */
export function cleanAuthUrlParams(targetRouteHash?: string): void {
  if (typeof window === 'undefined' || !window.history || !window.history.replaceState) {
    return;
  }

  const cleanPath = window.location.pathname || '/';
  const newHash = targetRouteHash ? (targetRouteHash.startsWith('#') ? targetRouteHash : `#${targetRouteHash}`) : '';
  const newUrl = `${cleanPath}${newHash}`;

  try {
    window.history.replaceState(null, '', newUrl);
  } catch (err) {
    console.warn('[ERPThrive Auth] Could not clean URL params:', err);
  }
}

