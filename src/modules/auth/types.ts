import { SystemRoleId } from '../admin/types.ts';

export type AuthViewMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

export interface AuthUserProfile {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'suspended' | 'pending';
  createdAt?: string;
  updatedAt?: string;
}

export interface UserCompanyMembership {
  id: string;
  companyId: string;
  companyName: string;
  roleId: SystemRoleId;
  status: 'active' | 'invited' | 'deactivated';
  isDefault?: boolean;
}

export interface AuthState {
  user: {
    id: string;
    email: string;
    fullName: string;
    userMetadata?: Record<string, unknown>;
  } | null;
  profile: AuthUserProfile | null;
  memberships: UserCompanyMembership[];
  activeMembership: UserCompanyMembership | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnboarding: boolean;
  isDemoSession: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpCredentials {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ForgotPasswordCredentials {
  email: string;
}

export interface ResetPasswordCredentials {
  password: string;
  confirmPassword: string;
}
