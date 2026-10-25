import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { SystemRoleId } from '../admin/types.ts';
import {
  AuthState,
  AuthUserProfile,
  UserCompanyMembership,
  LoginCredentials,
  SignUpCredentials,
  InvitationCheckResult
} from './types.ts';
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirmation,
  formatAuthErrorMessage,
  getAuthRedirectUrl,
  parseAuthCallbackFromUrl,
  cleanAuthUrlParams,
  AuthCallbackNotice
} from './authService.ts';

interface AuthContextValue extends AuthState {
  signIn: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  signUp: (credentials: SignUpCredentials) => Promise<{ success: boolean; error?: string; confirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  refreshSession: () => Promise<InvitationCheckResult>;
  signInDemo: (role: SystemRoleId, simulateUnassigned?: boolean) => void;
  switchCompany: (companyId: string) => void;
  clearError: () => void;
  authNotice: AuthCallbackNotice | null;
  clearAuthNotice: () => void;
  previewOriginUrl: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_SESSION_KEY = 'erpthrive_demo_session';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthState['user']>(null);
  const [profile, setProfile] = useState<AuthUserProfile | null>(null);
  const [memberships, setMemberships] = useState<UserCompanyMembership[]>([]);
  const [activeMembership, setActiveMembership] = useState<UserCompanyMembership | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoSession, setIsDemoSession] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<AuthCallbackNotice | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);
  const previewOriginUrl = typeof window !== 'undefined' ? getAuthRedirectUrl() : '';

  /**
   * Loads user profile and company memberships from PostgreSQL schema.
   */
  const loadUserData = useCallback(async (userId: string, userEmail: string, userMetaName?: string) => {
    let userProfile: AuthUserProfile = {
      id: userId,
      email: userEmail,
      fullName: userMetaName || userEmail.split('@')[0] || 'User',
      status: 'active'
    };

    let userMemberships: UserCompanyMembership[] = [];
    let queryError: { message: string; code?: string; details?: string; hint?: string } | undefined;

    if (supabase) {
      try {
        // 1. Fetch user profile from public.user_profiles
        const { data: prof, error: profErr } = await supabase
          .from('user_profiles')
          .select('id, email, full_name, status, created_at, updated_at')
          .eq('id', userId)
          .maybeSingle();

        if (profErr) {
          console.warn('[ERPThrive Auth] user_profiles query warning:', profErr);
          queryError = {
            message: profErr.message,
            code: profErr.code,
            details: profErr.details,
            hint: profErr.hint
          };
        } else if (prof) {
          userProfile = {
            id: prof.id,
            email: prof.email || userEmail,
            fullName: prof.full_name || userProfile.fullName,
            status: (prof.status as AuthUserProfile['status']) || 'active',
            createdAt: prof.created_at,
            updatedAt: prof.updated_at
          };
        }

        // 2. Fetch company memberships from public.company_memberships
        // Query memberships for the authenticated user to detect both active and pending invitations
        const { data: mems, error: memsErr } = await supabase
          .from('company_memberships')
          .select('id, company_id, role_id, status, created_at, companies(id, legal_name, display_name)')
          .eq('user_id', userId);

        if (memsErr) {
          console.warn('[ERPThrive Auth] company_memberships query warning:', memsErr);
          queryError = {
            message: memsErr.message,
            code: memsErr.code,
            details: memsErr.details,
            hint: memsErr.hint
          };
        } else if (mems && Array.isArray(mems)) {
          userMemberships = mems.map((m: any) => ({
            id: m.id,
            companyId: m.company_id,
            companyName: m.companies?.display_name || m.companies?.legal_name || 'Enterprise Tenant',
            roleId: m.role_id as SystemRoleId,
            status: m.status as UserCompanyMembership['status']
          }));
        }
      } catch (err: any) {
        console.warn('[ERPThrive Auth] Error retrieving user profile/membership:', err);
        queryError = {
          message: err?.message || 'Unexpected network or database exception during membership lookup.'
        };
      }
    }

    setProfile(userProfile);

    // Active memberships grant access to operational modules
    const activeMemberships = userMemberships.filter((m) => m.status === 'active');
    setMemberships(activeMemberships);
    setActiveMembership(activeMemberships.length > 0 ? activeMemberships[0] : null);

    return {
      userProfile,
      allMemberships: userMemberships,
      activeMemberships,
      queryError
    };
  }, []);

  /**
   * Initializes session on load and subscribes to Supabase onAuthStateChange.
   */
  useEffect(() => {
    let mounted = true;

    // Check for existing demo session in sessionStorage
    const checkDemoSession = () => {
      try {
        const stored = window.sessionStorage.getItem(DEMO_SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.user) {
            setUser(parsed.user);
            setProfile(parsed.profile);
            setMemberships(parsed.memberships || []);
            setActiveMembership(parsed.activeMembership || null);
            setIsDemoSession(true);
            setIsLoading(false);
            return true;
          }
        }
      } catch {
        // Ignore JSON error
      }
      return false;
    };

    if (checkDemoSession()) {
      return;
    }

    if (!supabase || !isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    // 0. Parse potential redirect callbacks, errors, or tokens from URL
    const callbackNotice = parseAuthCallbackFromUrl();
    if (callbackNotice) {
      setAuthNotice(callbackNotice);

      if (callbackNotice.type === 'error') {
        setError(callbackNotice.message);
        cleanAuthUrlParams('login');
      } else if (callbackNotice.sourceType === 'recovery') {
        window.location.hash = '#reset-password';
        cleanAuthUrlParams('reset-password');
      } else if (callbackNotice.sourceType === 'signup') {
        cleanAuthUrlParams(window.location.hash.includes('signup') ? 'login' : undefined);
      }
    }

    // 1. Initial Session Check
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionErr }) => {
      if (!mounted) return;
      if (sessionErr) {
        console.warn('[ERPThrive Auth] getSession error:', sessionErr);
      }
      if (session?.user) {
        const userObj = {
          id: session.user.id,
          email: session.user.email || '',
          fullName: (session.user.user_metadata?.full_name as string) || (session.user.user_metadata?.name as string) || '',
          userMetadata: session.user.user_metadata
        };
        setUser(userObj);
        await loadUserData(userObj.id, userObj.email, userObj.fullName);
      } else {
        setUser(null);
        setProfile(null);
        setMemberships([]);
        setActiveMembership(null);
      }
      setIsLoading(false);
    });

    // 2. Real-time auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        window.location.hash = '#reset-password';
        setAuthNotice({
          type: 'info',
          title: 'Identity Confirmed for Password Reset',
          message: 'Your password reset token has been verified. Please set your new password below.',
          sourceType: 'recovery'
        });
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setProfile(null);
        setMemberships([]);
        setActiveMembership(null);
        setIsDemoSession(false);
        setIsLoading(false);
        return;
      }

      const userObj = {
        id: session.user.id,
        email: session.user.email || '',
        fullName: (session.user.user_metadata?.full_name as string) || (session.user.user_metadata?.name as string) || '',
        userMetadata: session.user.user_metadata
      };

      setUser(userObj);
      await loadUserData(userObj.id, userObj.email, userObj.fullName);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadUserData]);

  /**
   * Signs in with email and password via Supabase Auth.
   */
  const signIn = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    clearError();
    setIsLoading(true);

    const emailErr = validateEmail(credentials.email);
    if (emailErr) {
      setIsLoading(false);
      setError(emailErr);
      return { success: false, error: emailErr };
    }

    if (!credentials.password) {
      const passErr = 'Password is required.';
      setIsLoading(false);
      setError(passErr);
      return { success: false, error: passErr };
    }

    if (!supabase) {
      const msg = 'Supabase client is not configured.';
      setIsLoading(false);
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password
      });

      if (authErr) {
        const friendlyMsg = formatAuthErrorMessage(authErr);
        setError(friendlyMsg);
        setIsLoading(false);
        return { success: false, error: friendlyMsg };
      }

      if (data?.user) {
        setIsDemoSession(false);
        window.sessionStorage.removeItem(DEMO_SESSION_KEY);
        const userObj = {
          id: data.user.id,
          email: data.user.email || credentials.email,
          fullName: (data.user.user_metadata?.full_name as string) || '',
          userMetadata: data.user.user_metadata
        };
        setUser(userObj);
        await loadUserData(userObj.id, userObj.email, userObj.fullName);
      }

      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const formatted = formatAuthErrorMessage(err);
      setError(formatted);
      setIsLoading(false);
      return { success: false, error: formatted };
    }
  };

  /**
   * Signs up a new user with full_name metadata (compatible with handle_new_auth_user trigger).
   * Does NOT allow users to select or assign roles or company memberships.
   */
  const signUp = async (credentials: SignUpCredentials): Promise<{ success: boolean; error?: string; confirmationRequired?: boolean }> => {
    clearError();
    setIsLoading(true);

    const nameErr = validateFullName(credentials.fullName);
    if (nameErr) {
      setIsLoading(false);
      setError(nameErr);
      return { success: false, error: nameErr };
    }

    const emailErr = validateEmail(credentials.email);
    if (emailErr) {
      setIsLoading(false);
      setError(emailErr);
      return { success: false, error: emailErr };
    }

    const passErr = validatePassword(credentials.password);
    if (passErr) {
      setIsLoading(false);
      setError(passErr);
      return { success: false, error: passErr };
    }

    const matchErr = validatePasswordConfirmation(credentials.password, credentials.confirmPassword);
    if (matchErr) {
      setIsLoading(false);
      setError(matchErr);
      return { success: false, error: matchErr };
    }

    if (!supabase) {
      const msg = 'Supabase client is not configured.';
      setIsLoading(false);
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      const trimmedName = credentials.fullName.trim();
      const trimmedEmail = credentials.email.trim().toLowerCase();
      const redirectUrl = getAuthRedirectUrl();

      // Pass full_name in raw_user_meta_data for the database trigger
      // Pass emailRedirectTo so confirmation email opens the current app preview origin instead of localhost
      const { data, error: authErr } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: credentials.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: trimmedName,
            name: trimmedName
          }
        }
      });

      if (authErr) {
        const friendlyMsg = formatAuthErrorMessage(authErr);
        setError(friendlyMsg);
        setIsLoading(false);
        return { success: false, error: friendlyMsg };
      }

      // If email confirmation is required, session will be null
      const confirmationRequired = !data.session;

      if (data.user && data.session) {
        setIsDemoSession(false);
        window.sessionStorage.removeItem(DEMO_SESSION_KEY);
        const userObj = {
          id: data.user.id,
          email: data.user.email || trimmedEmail,
          fullName: trimmedName,
          userMetadata: data.user.user_metadata
        };
        setUser(userObj);
        await loadUserData(userObj.id, userObj.email, userObj.fullName);
      }

      setIsLoading(false);
      return { success: true, confirmationRequired };
    } catch (err) {
      const formatted = formatAuthErrorMessage(err);
      setError(formatted);
      setIsLoading(false);
      return { success: false, error: formatted };
    }
  };

  /**
   * Signs out the current user.
   */
  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    setIsDemoSession(false);

    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[ERPThrive Auth] signOut error:', err);
      }
    }

    setUser(null);
    setProfile(null);
    setMemberships([]);
    setActiveMembership(null);
    setIsLoading(false);
    window.location.hash = '#login';
  };

  /**
   * Initiates password recovery email with clean redirect URL matching Supabase Allowed URLs.
   */
  const resetPasswordForEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    clearError();
    setIsLoading(true);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setIsLoading(false);
      setError(emailErr);
      return { success: false, error: emailErr };
    }

    if (!supabase) {
      const msg = 'Supabase client is not configured.';
      setIsLoading(false);
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { error: authErr } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl
      });

      if (authErr) {
        const friendlyMsg = formatAuthErrorMessage(authErr);
        setError(friendlyMsg);
        setIsLoading(false);
        return { success: false, error: friendlyMsg };
      }

      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const formatted = formatAuthErrorMessage(err);
      setError(formatted);
      setIsLoading(false);
      return { success: false, error: formatted };
    }
  };

  /**
   * Updates user password once authenticated or during password recovery.
   */
  const updatePassword = async (password: string): Promise<{ success: boolean; error?: string }> => {
    clearError();
    setIsLoading(true);

    const passErr = validatePassword(password);
    if (passErr) {
      setIsLoading(false);
      setError(passErr);
      return { success: false, error: passErr };
    }

    if (!supabase) {
      const msg = 'Supabase client is not configured.';
      setIsLoading(false);
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      const { error: authErr } = await supabase.auth.updateUser({ password });

      if (authErr) {
        const friendlyMsg = formatAuthErrorMessage(authErr);
        setError(friendlyMsg);
        setIsLoading(false);
        return { success: false, error: friendlyMsg };
      }

      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const formatted = formatAuthErrorMessage(err);
      setError(formatted);
      setIsLoading(false);
      return { success: false, error: formatted };
    }
  };

  /**
   * Refreshes the session and re-checks profile/membership in PostgreSQL schema.
   * Returns a structured InvitationCheckResult without toggling global isLoading (which would unmount active views).
   */
  const refreshSession = async (): Promise<InvitationCheckResult> => {
    if (isDemoSession) {
      return {
        success: true,
        activeCount: memberships.length,
        invitedCount: 0,
        allMemberships: memberships
      };
    }

    if (!supabase || !user) {
      return {
        success: false,
        activeCount: 0,
        invitedCount: 0,
        allMemberships: [],
        error: { message: 'No active session or Supabase client available.' }
      };
    }

    // Do NOT set global isLoading=true here.
    // Setting global isLoading replaces AppContent with the splash screen, unmounting OnboardingView and destroying local state.
    const result = await loadUserData(user.id, user.email, user.fullName);
    const activeCount = result.activeMemberships.length;
    const invitedCount = result.allMemberships.filter((m) => m.status === 'invited').length;

    return {
      success: !result.queryError,
      activeCount,
      invitedCount,
      allMemberships: result.allMemberships,
      error: result.queryError
    };
  };

  /**
   * Demo session helper for previewing and testing all roles and onboarding flows.
   */
  const signInDemo = (roleId: SystemRoleId, simulateUnassigned = false) => {
    setIsLoading(true);
    clearError();

    const isCompanyAdmin = roleId === 'COMPANY_ADMIN';
    const demoUser = {
      id: simulateUnassigned ? 'usr-unassigned-01' : isCompanyAdmin ? 'usr-admin-01' : 'usr-staff-01',
      email: simulateUnassigned
        ? 'newuser@enterprise.sample'
        : isCompanyAdmin
        ? 'admin@erpthrive.internal'
        : 'clerk@erpthrive.internal',
      fullName: simulateUnassigned
        ? 'Jordan Vance (Unassigned User)'
        : isCompanyAdmin
        ? 'Devon Miller (Company Administrator)'
        : 'Taylor Brooks (Staff Operations)',
      userMetadata: { role: roleId }
    };

    const demoProfile: AuthUserProfile = {
      id: demoUser.id,
      email: demoUser.email,
      fullName: demoUser.fullName,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const demoMemberships: UserCompanyMembership[] = simulateUnassigned
      ? []
      : [
          {
            id: isCompanyAdmin ? 'mem-001-admin' : 'mem-002-staff',
            companyId: 'cmp-001-global',
            companyName: 'ERPThrive Global Corp',
            roleId,
            status: 'active',
            isDefault: true
          }
        ];

    const demoState = {
      user: demoUser,
      profile: demoProfile,
      memberships: demoMemberships,
      activeMembership: demoMemberships.length > 0 ? demoMemberships[0] : null
    };

    window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoState));
    setUser(demoUser);
    setProfile(demoProfile);
    setMemberships(demoMemberships);
    setActiveMembership(demoState.activeMembership);
    setIsDemoSession(true);
    setIsLoading(false);
    window.location.hash = simulateUnassigned ? '#onboarding' : '#dashboard';
  };

  /**
   * Switches the active organization when the user belongs to multiple companies.
   */
  const switchCompany = (companyId: string) => {
    const found = memberships.find((m) => m.companyId === companyId);
    if (found) {
      setActiveMembership(found);
    }
  };

  const isAuthenticated = Boolean(user);
  // An authenticated user is in Onboarding if they do not yet belong to any company
  const isOnboarding = Boolean(isAuthenticated && memberships.length === 0);

  const value: AuthContextValue = {
    user,
    profile,
    memberships,
    activeMembership,
    isLoading,
    isAuthenticated,
    isOnboarding,
    isDemoSession,
    error,
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    refreshSession,
    signInDemo,
    switchCompany,
    clearError,
    authNotice,
    clearAuthNotice,
    previewOriginUrl
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
