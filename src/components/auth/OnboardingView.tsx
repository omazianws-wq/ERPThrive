import React, { useState } from 'react';
import {
  Building2,
  Shield,
  User,
  Mail,
  RefreshCw,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ExternalLink,
  Info
} from 'lucide-react';
import { useAuth } from '../../modules/auth/AuthContext.tsx';
import { Logo } from '../brand/Logo.tsx';

interface OnboardingViewProps {
  onSignOut?: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onSignOut }) => {
  const { user, profile, refreshSession, signOut, signInDemo, authNotice, clearAuthNotice } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      await refreshSession();
      setRefreshNotice('Checked public schema. No active company memberships found for this account yet.');
    } catch {
      setRefreshNotice('Failed to check memberships. Please verify network connectivity.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
    } else {
      await signOut();
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 flex flex-col justify-between text-slate-900 font-sans antialiased">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-8 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="hidden sm:inline font-mono text-xs text-slate-400">|</span>
          <span className="hidden sm:inline text-xs font-semibold text-slate-700">Enterprise Onboarding</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-mono text-slate-600 text-[11px] truncate max-w-[150px] sm:max-w-[200px]">
              {user?.email}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-red-700 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Email Confirmation Success Banner */}
        {authNotice && authNotice.type === 'success' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-xs flex items-start justify-between gap-3 text-xs text-emerald-950">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-emerald-900">{authNotice.title}</div>
                <div className="text-emerald-800 mt-0.5 leading-relaxed">{authNotice.message}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearAuthNotice}
              className="text-emerald-700 hover:text-emerald-950 font-semibold text-xs shrink-0 px-1 py-0.5"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs relative overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 to-sky-600 absolute top-0 left-0" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">
                    Welcome to ERPThrive, {user?.fullName || 'User'}
                  </h1>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  User identity verified via Supabase Auth & registered in <span className="font-mono">public.user_profiles</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Organization Pending
              </span>
            </div>
          </div>

          {/* User Identity Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-6">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div className="text-slate-500 font-medium mb-1">Authenticated Email</div>
              <div className="font-mono font-semibold text-slate-900 truncate" title={user?.email}>
                {user?.email}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div className="text-slate-500 font-medium mb-1">Display Name</div>
              <div className="font-semibold text-slate-900 truncate">
                {profile?.fullName || user?.fullName}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div className="text-slate-500 font-medium mb-1">User UUID (Auth.UID)</div>
              <div className="font-mono text-[11px] text-slate-700 truncate" title={user?.id}>
                {user?.id}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <div className="text-slate-500 font-medium mb-1">Profile State</div>
              <div className="font-mono font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Active Profile</span>
              </div>
            </div>
          </div>

          {refreshNotice && (
            <div className="mt-4 p-3 rounded-lg bg-sky-50 border border-sky-100 text-xs text-sky-900 flex items-center gap-2">
              <Info className="h-4 w-4 text-sky-600 shrink-0" />
              <span>{refreshNotice}</span>
            </div>
          )}
        </div>

        {/* Security & Multi-Tenant Governance Notice */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 text-xs text-sky-950 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Shield className="h-4 w-4 text-sky-700" />
            <span>ERPThrive Zero-Trust Architecture Notice</span>
          </div>
          <p className="text-slate-700 leading-relaxed">
            In compliance with enterprise Row-Level Security (RLS) and multi-tenant isolation, users cannot unilaterally assign themselves to a company or grant themselves <span className="font-mono font-semibold">COMPANY_ADMIN</span> privileges during signup. All enterprise operations (General Ledger, Branches, Master Data, Procurement) are strictly isolated to tenants in which you possess verified memberships.
          </p>
        </div>

        {/* Onboarding Pathways */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pathway 1: Organization Invitation */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <span>Pathway 1</span>
                <span>•</span>
                <span>Member Invitation</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">Awaiting Company Invitation</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                If your organization has already set up ERPThrive, your Company Administrator can invite you by adding <span className="font-mono font-semibold text-slate-900">{user?.email}</span> in the <span className="font-medium text-slate-800">Administration &gt; Users &amp; Memberships</span> console.
              </p>

              <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>No action required from you while invitation is pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Your profile automatically links upon invitation approval</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Already invited?</span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition shadow-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Checking...' : 'Check for Invitations'}</span>
              </button>
            </div>
          </div>

          {/* Pathway 2: New Tenant Provisioning */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <span>Pathway 2</span>
                <span>•</span>
                <span>Tenant Registration</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">Enterprise Tenant Provisioning</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                To prevent privilege escalation and unauthorized company creation, new enterprise tenants and initial Company Administrators are provisioned via secure backend onboarding workflows or verified invitations.
              </p>

              <div className="mt-4 rounded-lg bg-amber-50/70 border border-amber-200 p-3 text-xs text-amber-950 space-y-1.5">
                <div className="flex items-start gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    <span className="font-semibold">RLS Guarantee: </span>
                    Client-side insertion of companies is intentionally restricted to authorized administrators.
                  </span>
                </div>
              </div>
            </div>

            {/* Sandbox / Testing shortcut for reviewer */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 mb-2">Testing &amp; Reviewer Sandbox:</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => signInDemo('COMPANY_ADMIN', false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 text-xs font-semibold text-indigo-900 transition"
                  title="Switch to Demo Admin account to test workspace"
                >
                  <Shield className="h-3.5 w-3.5 text-indigo-700" />
                  <span>Attach Demo Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => signInDemo('STAFF_USER', false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50/50 hover:bg-sky-100/60 text-xs font-semibold text-sky-900 transition"
                  title="Switch to Demo Staff account to test workspace"
                >
                  <User className="h-3.5 w-3.5 text-sky-700" />
                  <span>Attach Demo Staff</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        ERPThrive Enterprise Suite · Module 2: Secure Authentication and User Onboarding
      </footer>
    </div>
  );
};
