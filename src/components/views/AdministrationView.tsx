import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  GitBranch,
  Users,
  Shield,
  FileText,
  Database,
  Plus,
  CheckCircle2,
  AlertTriangle,
  X,
  AlertCircle,
  ExternalLink,
  Lock,
  Eye,
  RefreshCw,
  Copy
} from 'lucide-react';
import { adminService, AdminServiceError, TenantIsolationError, UnauthorizedError } from '../../modules/admin/service.ts';
import {
  Company,
  Branch,
  CompanyMembership,
  AuditLogEntry,
  AuthContext,
  SystemRoleId,
  CreateBranchInput,
  CreateMembershipInput,
  UpdateCompanyInput,
  DatabaseIntegrationStatus,
  TableVerificationDetail
} from '../../modules/admin/types.ts';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS, LEAST_PRIVILEGE_DEFAULT_ROLE, hasPermission } from '../../modules/admin/permissions.ts';
import {
  getDatabaseIntegrationStatus,
  checkLiveDatabaseSchema,
  performLiveSupabaseProbe,
  subscribeDatabaseStatus,
  LiveProbeResult,
  resolvedSupabaseUrl
} from '../../lib/supabase.ts';

interface AdministrationViewProps {
  onReturnToDashboard: () => void;
}

type AdminTab = 'company' | 'branches' | 'users' | 'roles' | 'audit' | 'integration';

export const AdministrationView: React.FC<AdministrationViewProps> = ({ onReturnToDashboard }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('company');

  // Authenticated Context State (Allows testing role-based restrictions)
  const [currentRoleId, setCurrentRoleId] = useState<SystemRoleId>('COMPANY_ADMIN');
  const authContext: AuthContext = useMemo(
    () => ({
      userId: currentRoleId === 'COMPANY_ADMIN' ? 'usr-admin-01' : 'usr-staff-01',
      email: currentRoleId === 'COMPANY_ADMIN' ? 'admin@erpthrive.internal' : 'clerk@erpthrive.internal',
      activeCompanyId: 'cmp-001-global',
      roleId: currentRoleId
    }),
    [currentRoleId]
  );

  // Data States
  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit Company State
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState<UpdateCompanyInput>({});

  // Branch Modal State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchForm, setBranchForm] = useState<Partial<CreateBranchInput>>({
    name: '',
    code: '',
    isHeadquarters: false,
    address: ''
  });

  // User Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<Partial<CreateMembershipInput>>({
    email: '',
    fullName: '',
    roleId: LEAST_PRIVILEGE_DEFAULT_ROLE
  });

  // Cross-tenant simulated test modal
  const [crossTenantTargetId, setCrossTenantTargetId] = useState('');
  const [crossTenantResult, setCrossTenantResult] = useState<string | null>(null);

  // Live Supabase real probe state
  const [liveProbe, setLiveProbe] = useState<LiveProbeResult | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<DatabaseIntegrationStatus>(getDatabaseIntegrationStatus());
  const [copiedRedirectUrl, setCopiedRedirectUrl] = useState(false);

  const handleRunLiveProbe = async () => {
    setIsProbing(true);
    try {
      const [probeResult, newStatus] = await Promise.all([
        performLiveSupabaseProbe(),
        checkLiveDatabaseSchema()
      ]);
      setLiveProbe(probeResult);
      setIntegrationStatus(newStatus);
    } finally {
      setIsProbing(false);
    }
  };

  useEffect(() => {
    // Subscribe to live status updates
    const unsubscribe = subscribeDatabaseStatus((st) => {
      setIntegrationStatus(st);
    });

    // Run live schema check on mount to update integration status
    checkLiveDatabaseSchema().then((st) => {
      setIntegrationStatus(st);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (activeTab === 'integration' && !liveProbe && !isProbing) {
      handleRunLiveProbe();
    }
  }, [activeTab]);

  // Load Company and related records
  const loadData = () => {
    try {
      setFeedbackMessage(null);
      const cmp = adminService.getCompany(authContext, authContext.activeCompanyId);
      setCompany(cmp);
      setCompanyForm({
        legalName: cmp.legalName,
        displayName: cmp.displayName,
        country: cmp.country,
        baseCurrency: cmp.baseCurrency,
        timezone: cmp.timezone,
        fiscalYearStart: cmp.fiscalYearStart
      });

      const bList = adminService.getBranchesForCompany(authContext, authContext.activeCompanyId);
      setBranches(bList);

      if (hasPermission(authContext.roleId, 'admin:user:read')) {
        const mList = adminService.getCompanyMemberships(authContext, authContext.activeCompanyId);
        setMemberships(mList);
      } else {
        setMemberships([]);
      }

      if (hasPermission(authContext.roleId, 'admin:audit:read')) {
        const aList = adminService.getAuditLogs(authContext, authContext.activeCompanyId);
        setAuditLogs(aList);
      } else {
        setAuditLogs([]);
      }
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      } else {
        setFeedbackMessage({ type: 'error', text: 'Failed to load administration state.' });
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [authContext]);

  // Handle Company Save
  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!company) return;
      const updated = adminService.updateCompany(authContext, company.id, companyForm);
      setCompany(updated);
      setIsEditingCompany(false);
      setFeedbackMessage({ type: 'success', text: 'Company profile successfully updated and audit logged.' });
      loadData();
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      }
    }
  };

  // Handle Company Deactivate
  const handleToggleCompanyStatus = () => {
    try {
      if (!company) return;
      if (company.status === 'active') {
        const updated = adminService.deactivateCompany(authContext, company.id);
        setCompany(updated);
        setFeedbackMessage({ type: 'success', text: 'Company deactivated and marked inactive.' });
      } else {
        const updated = adminService.updateCompany(authContext, company.id, { status: 'active' });
        setCompany(updated);
        setFeedbackMessage({ type: 'success', text: 'Company reactivated to active status.' });
      }
      loadData();
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      }
    }
  };

  // Handle Create Branch
  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!branchForm.name || !branchForm.code) {
        setFeedbackMessage({ type: 'error', text: 'Branch name and branch code are required.' });
        return;
      }
      adminService.createBranch(authContext, {
        companyId: authContext.activeCompanyId,
        name: branchForm.name,
        code: branchForm.code,
        isHeadquarters: Boolean(branchForm.isHeadquarters),
        address: branchForm.address
      });
      setIsBranchModalOpen(false);
      setBranchForm({ name: '', code: '', isHeadquarters: false, address: '' });
      setFeedbackMessage({ type: 'success', text: 'Branch registered successfully and audit logged.' });
      loadData();
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      }
    }
  };

  // Handle Deactivate Branch
  const handleDeactivateBranch = (branchId: string) => {
    try {
      adminService.deactivateBranch(authContext, branchId);
      setFeedbackMessage({ type: 'success', text: 'Branch successfully deactivated.' });
      loadData();
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      }
    }
  };

  // Handle Invite Member
  const handleInviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!inviteForm.email || !inviteForm.fullName || !inviteForm.roleId) {
        setFeedbackMessage({ type: 'error', text: 'All member invitation fields are required.' });
        return;
      }
      adminService.inviteMember(authContext, {
        companyId: authContext.activeCompanyId,
        email: inviteForm.email,
        fullName: inviteForm.fullName,
        roleId: inviteForm.roleId
      });
      setIsInviteModalOpen(false);
      setInviteForm({ email: '', fullName: '', roleId: LEAST_PRIVILEGE_DEFAULT_ROLE });
      setFeedbackMessage({ type: 'success', text: 'Team member invited and membership registered.' });
      loadData();
    } catch (err: unknown) {
      if (err instanceof AdminServiceError) {
        setFeedbackMessage({ type: 'error', text: err.message });
      }
    }
  };

  // Cross-tenant verification tool
  const handleTestCrossTenant = () => {
    try {
      const target = crossTenantTargetId.trim() || 'cmp-999-foreign-tenant';
      adminService.getCompany(authContext, target);
      setCrossTenantResult('UNEXPECTED: Cross-tenant access succeeded (this should not happen).');
    } catch (err: unknown) {
      if (err instanceof TenantIsolationError) {
        setCrossTenantResult(`ACCESS DENIED (Expected): ${err.message}`);
      } else if (err instanceof AdminServiceError) {
        setCrossTenantResult(`BLOCKED: ${err.message}`);
      }
    } finally {
      loadData();
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* =========================================================================
          MODULE HEADER & CONTEXT BAR
         ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sky-400">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-medium">
              <span>ERPThrive Enterprise Suite</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="text-emerald-700 font-semibold">Module 1 Operational</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span>Multi-Tenant Architecture</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Administration & Identity Foundation
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Multi-tenant company parameters, branch facility boundaries, least-privilege RBAC, and immutable audit logs.
            </p>
          </div>
        </div>

        {/* Role Simulator and Return actions */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Role testing selector */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-xs">
            <span className="text-slate-500 font-medium pl-1">Role:</span>
            <select
              value={currentRoleId}
              onChange={(e) => setCurrentRoleId(e.target.value as SystemRoleId)}
              className="rounded bg-white border border-slate-300 px-2 py-1 font-mono text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-600"
              aria-label="Switch active test role"
            >
              <option value="COMPANY_ADMIN">COMPANY_ADMIN (Privileged)</option>
              <option value="STAFF_USER">STAFF_USER (Least-Privilege)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onReturnToDashboard}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
          role="alert"
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Integration Diagnostic Banner */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${
          integrationStatus.status === 'connected'
            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
            : 'border-sky-200 bg-sky-50/60 text-sky-950'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          {integrationStatus.status === 'connected' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <Database className="h-4 w-4 text-sky-700 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div>
            <span className="font-semibold">Persistence & Security Status: </span>
            <span className={integrationStatus.status === 'connected' ? 'text-emerald-900 font-medium' : 'text-slate-700'}>
              {integrationStatus.message}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('integration')}
          className={`self-start sm:self-auto font-mono text-[11px] font-semibold underline underline-offset-2 whitespace-nowrap ${
            integrationStatus.status === 'connected'
              ? 'text-emerald-800 hover:text-emerald-950'
              : 'text-sky-800 hover:text-sky-950'
          }`}
        >
          View Database & RLS Panel
        </button>
      </div>

      {/* =========================================================================
          TABBED SUB-NAVIGATION (Zero-pill segmented buttons)
         ========================================================================= */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'company'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Company Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branches')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'branches'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>Branches ({branches.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Users & Memberships ({memberships.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'roles'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Role & Permission Matrix</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'audit'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('integration')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'integration'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span>Database & RLS</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: COMPANY PROFILE & SETTINGS
         ========================================================================= */}
      {activeTab === 'company' && company && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Organization Legal Entity & Base Settings
                </h2>
                <p className="text-xs text-slate-500">
                  Defines multi-tenant tenant boundary, operational currency, and accounting timezone.
                </p>
              </div>

              {hasPermission(authContext.roleId, 'admin:company:update') && !isEditingCompany && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingCompany(true)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Edit Company Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleCompanyStatus}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      company.status === 'active'
                        ? 'border-amber-300 text-amber-800 hover:bg-amber-50'
                        : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    {company.status === 'active' ? 'Deactivate Company' : 'Reactivate Company'}
                  </button>
                </div>
              )}
            </div>

            {/* Read-only or Edit View */}
            {isEditingCompany ? (
              <form onSubmit={handleSaveCompany} className="mt-6 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Legal Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.legalName || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })}
                      className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Display / Trade Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.displayName || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, displayName: e.target.value })}
                      className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Country (ISO 3166-1 alpha-2) *
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      required
                      value={companyForm.country || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value.toUpperCase() })}
                      className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Base Operating Currency (ISO 4217) *
                    </label>
                    <input
                      type="text"
                      maxLength={3}
                      required
                      value={companyForm.baseCurrency || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, baseCurrency: e.target.value.toUpperCase() })}
                      className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      System Timezone *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.timezone || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, timezone: e.target.value })}
                      className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Fiscal Year Start (MM-DD) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="01-01"
                      value={companyForm.fiscalYearStart || ''}
                      onChange={(e) => setCompanyForm({ ...companyForm, fiscalYearStart: e.target.value })}
                      className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditingCompany(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Legal Entity</span>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{company.legalName}</p>
                  <span className="text-xs text-slate-500">Display: {company.displayName}</span>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tenant Identifier</span>
                  <p className="text-xs font-mono text-slate-800 font-semibold mt-1">{company.id}</p>
                  <span className="text-xs text-slate-500">Jurisdiction: {company.country}</span>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center font-mono text-xs px-2 py-0.5 rounded border ${
                        company.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {company.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Base Currency</span>
                  <p className="text-sm font-mono font-bold text-slate-900 mt-1">{company.baseCurrency}</p>
                  <span className="text-[11px] text-slate-500">Configurable ERP baseline</span>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">System Timezone</span>
                  <p className="text-sm font-mono text-slate-900 mt-1">{company.timezone}</p>
                  <span className="text-[11px] text-slate-500">Timestamp normalization</span>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Fiscal Year Cycle</span>
                  <p className="text-sm font-mono text-slate-900 mt-1">Starting {company.fiscalYearStart}</p>
                  <span className="text-[11px] text-slate-500">Accounting ledger cycle</span>
                </div>
              </div>
            )}
          </div>

          {/* Scope separation notice */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Scope Isolation Note: </span>
            <span>
              Base currency and timezone are organization settings. In accordance with strict module governance,
              country-specific tax calculation rules, charts of accounts, and financial journal closing belong to
              Module 2 (Master Data) and Module 3 (Finance & Accounting) and are not claimed as active here.
            </span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: BRANCH MANAGEMENT (Multi-Tenant Enforced)
         ========================================================================= */}
      {activeTab === 'branches' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Operating Facilities & Branch Network
              </h2>
              <p className="text-xs text-slate-500">
                All branches are strictly scoped to company <span className="font-mono text-slate-700">{authContext.activeCompanyId}</span>.
              </p>
            </div>

            {hasPermission(authContext.roleId, 'admin:branch:create') && (
              <button
                type="button"
                onClick={() => setIsBranchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Register New Branch</span>
              </button>
            )}
          </div>

          {/* Branch Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Branch Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No branch facilities registered for this company.
                      </td>
                    </tr>
                  ) : (
                    branches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {b.name}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700">
                          {b.code}
                        </td>
                        <td className="px-4 py-3">
                          {b.isHeadquarters ? (
                            <span className="font-mono text-[10px] font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                              Headquarters
                            </span>
                          ) : (
                            <span className="text-slate-500">Facility</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-xs">
                          {b.address || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                              b.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {b.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasPermission(authContext.roleId, 'admin:branch:deactivate') && !b.isHeadquarters && (
                            <button
                              type="button"
                              onClick={() => handleDeactivateBranch(b.id)}
                              className="text-red-700 hover:text-red-900 text-xs font-medium"
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: USERS & MEMBERSHIPS (Least-Privilege Default)
         ========================================================================= */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Company Users & Role Assignments
              </h2>
              <p className="text-xs text-slate-500">
                Authorized accounts associated with this tenant. Default assignment is least-privilege (Staff User).
              </p>
            </div>

            {hasPermission(authContext.roleId, 'admin:user:create') && (
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Invite Team Member</span>
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Member Name</th>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Assigned Role</th>
                    <th className="px-4 py-3">Membership Status</th>
                    <th className="px-4 py-3">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {memberships.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {hasPermission(authContext.roleId, 'admin:user:read')
                          ? 'No members registered.'
                          : 'Access Restricted: Caller lacks admin:user:read permission.'}
                      </td>
                    </tr>
                  ) : (
                    memberships.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {m.user?.fullName || 'User'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {m.user?.email || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {m.roleId}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                              m.status === 'active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {m.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: ROLE & PERMISSION MATRIX
         ========================================================================= */}
      {activeTab === 'roles' && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Enterprise Role & Permission Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Clear distinction between read, create, update, deactivate, and administrative privileges.
            </p>
          </div>

          {/* System Roles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.values(SYSTEM_ROLES).map((role) => (
              <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">{role.id}</span>
                    <span className="font-mono text-[10px] text-slate-500">Tier {role.hierarchyLevel}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 mt-1">{role.name}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-snug">{role.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Permissions:</span>
                  <span className="font-mono font-semibold text-slate-800">{role.permissions.length} actions</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Permission Matrix Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-800">
              Granular Permission Capabilities Matrix
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Resource & Capability</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3 text-center">Super Admin</th>
                    <th className="px-4 py-3 text-center">Company Admin</th>
                    <th className="px-4 py-3 text-center">Operations Mgr</th>
                    <th className="px-4 py-3 text-center">Staff User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SYSTEM_PERMISSIONS.map((perm) => (
                    <tr key={perm.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-900 block">{perm.description}</span>
                        <span className="font-mono text-[10px] text-slate-400">{perm.id}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] uppercase font-semibold text-slate-600">
                        {perm.action}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-emerald-600 font-bold">✓</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {hasPermission('COMPANY_ADMIN', perm.id) ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {hasPermission('OPERATIONS_MANAGER', perm.id) ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {hasPermission('STAFF_USER', perm.id) ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: IMMUTABLE AUDIT LOG
         ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Governance & Administrative Audit Log
              </h2>
              <p className="text-xs text-slate-500">
                Immutable, append-only security trail recording mutations, tenant boundaries, and access attempts.
              </p>
            </div>

            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors self-start sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Log</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Change Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {hasPermission(authContext.roleId, 'admin:audit:read')
                          ? 'No audit records logged yet.'
                          : 'Access Restricted: Caller lacks admin:audit:read permission.'}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleTimeString()} · {new Date(log.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900 block">{log.actorEmail}</span>
                          <span className="font-mono text-[10px] text-slate-400">{log.actorId}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${
                              log.action.includes('denied')
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {log.targetType}:{log.targetId.slice(0, 12)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-600 max-w-sm truncate">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: DATABASE & ROW LEVEL SECURITY SPEC
         ========================================================================= */}
      {activeTab === 'integration' && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Database & Row Level Security (RLS) Architecture
            </h2>
            <p className="text-xs text-slate-500">
              PostgreSQL schema migration and Row Level Security policies generated for Module 1.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-sky-700 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Database Integration Status</h3>
                  <p className="text-xs text-slate-500">Live configuration state returned by <span className="font-mono">getDatabaseIntegrationStatus()</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">State:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                    integrationStatus.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      integrationStatus.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {integrationStatus.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {/* 1. URL & Key Configuration */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 font-medium mb-1">1. URL & Key Config</div>
                  <div className="font-mono font-semibold flex items-center gap-1.5">
                    {integrationStatus.urlConfigured && integrationStatus.anonKeyConfigured ? (
                      <span className="text-emerald-700">Configured</span>
                    ) : (
                      <span className="text-amber-700">Incomplete</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2">
                  ANON: {integrationStatus.anonKeyConfigured ? 'Safe Public' : 'Missing'} · Srv: {integrationStatus.serviceRoleConfigured ? 'Present (Server)' : 'Omitted (Safe)'}
                </div>
              </div>

              {/* 2. Client Connectivity */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 font-medium mb-1">2. Client Connectivity</div>
                  <div className="font-mono font-semibold flex items-center gap-1.5">
                    {integrationStatus.clientConnected ? (
                      <span className="text-emerald-700">Connected (HTTP 200)</span>
                    ) : (
                      <span className="text-amber-700">Disconnected</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2">
                  Auth / REST Endpoint Ping
                </div>
              </div>

              {/* 3. Required Tables Present */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 font-medium mb-1">3. Required Tables</div>
                  <div className="font-mono font-semibold flex items-center gap-1.5">
                    {integrationStatus.allTablesPresent ? (
                      <span className="text-emerald-700">{integrationStatus.tablesCount} / {integrationStatus.expectedTablesCount} Present</span>
                    ) : (
                      <span className="text-amber-700">
                        {integrationStatus.tablesCount} / {integrationStatus.expectedTablesCount} Present
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2">Public Schema Cache</div>
              </div>

              {/* 4. Row-Level Security Enabled */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 font-medium mb-1">4. Row-Level Security</div>
                  <div className="font-mono font-semibold flex items-center gap-1.5">
                    {integrationStatus.rlsPoliciesEnforced ? (
                      <span className="text-emerald-700">Enforced on Tables</span>
                    ) : (
                      <span className="text-amber-700">Inactive / Partial</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2">Evaluated on queries</div>
              </div>

              {/* 5. Migration Status */}
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="text-slate-500 font-medium mb-1">5. Migration Status</div>
                  <div className="font-mono font-semibold flex items-center gap-1.5">
                    {integrationStatus.migrationStatus === 'applied' ? (
                      <span className="text-emerald-700">Applied (8/8 Tables)</span>
                    ) : integrationStatus.migrationStatus === 'partially_applied' ? (
                      <span className="text-amber-700">Partially Applied</span>
                    ) : integrationStatus.migrationStatus === 'unverified' ? (
                      <span className="text-slate-500">Unverified</span>
                    ) : (
                      <span className="text-amber-700">Pending Application</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2">Verified via schema cache</div>
              </div>
            </div>

            {/* Table Verification Manifest */}
            {integrationStatus.tablesChecked.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs">
                <div className="font-semibold text-slate-800 mb-2 flex items-center justify-between">
                  <span>Module 1 PostgreSQL Table Manifest ({integrationStatus.tablesCount}/{integrationStatus.expectedTablesCount} Detected)</span>
                  <span className="font-mono text-[11px] text-slate-500">Public Schema</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {integrationStatus.tablesChecked.map((table: TableVerificationDetail) => (
                    <div
                      key={table.name}
                      className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        {table.present ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className={table.present ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                          {table.name}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          table.present
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 font-medium'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {table.present ? (table.statusCode === 200 ? '200 OK' : 'RLS Active') : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostic Message */}
            <div className="rounded-lg bg-sky-50/50 p-3 border border-sky-100 text-xs text-sky-950">
              <span className="font-semibold">Diagnostic Notice: </span>
              <span className="text-slate-700">{integrationStatus.message}</span>
            </div>

            {/* Security Advisory (Strict rule: RLS enabled != 100% secure) */}
            <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-3 text-xs text-amber-950 flex items-start gap-2.5">
              <Shield className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Security Governance Advisory: </span>
                <span className="text-slate-800">{integrationStatus.securityNote}</span>
              </div>
            </div>

            {/* Supabase Auth Redirect Configuration for AI Studio Preview */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                  <span>Module 2 Auth Preview Redirect URL:</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const urlToCopy = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(urlToCopy);
                      setCopiedRedirectUrl(true);
                      setTimeout(() => setCopiedRedirectUrl(false), 2500);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition"
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
                {typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/'}
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                For signup confirmation emails and password resets to return to this preview, add this URL or wildcard <span className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">https://*.scf.usercontent.goog/**</span> in your Supabase Dashboard under <span className="font-semibold text-slate-700">Authentication → URL Configuration → Redirect URLs</span>.
              </p>
            </div>
          </div>

          {/* Live Real Query Probe Verification Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <RefreshCw className={`h-5 w-5 text-indigo-700 shrink-0 ${isProbing ? 'animate-spin' : ''}`} />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Live Read-Only Database Probe</h3>
                  <p className="text-xs text-slate-500">Real-time network validation against configured Supabase project</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunLiveProbe}
                disabled={isProbing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                <span>{isProbing ? 'Querying...' : 'Run Live Probe'}</span>
              </button>
            </div>

            {liveProbe ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500 font-medium mb-1">Target Endpoint</div>
                    <div className="font-mono font-semibold text-slate-900 truncate">
                      {liveProbe.endpointUrl}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500 font-medium mb-1">Auth Service Ping</div>
                    <div className="font-mono font-semibold">
                      {liveProbe.authSuccess ? (
                        <span className="text-emerald-700">HTTP {liveProbe.authEndpointStatus} OK (Active)</span>
                      ) : (
                        <span className="text-red-700">HTTP {liveProbe.authEndpointStatus || 'Failed'}</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500 font-medium mb-1">PostgreSQL Table Check</div>
                    <div className="font-mono font-semibold">
                      {liveProbe.tableQueryResult === 'success' ? (
                        <span className="text-emerald-700">Verified & Queryable</span>
                      ) : liveProbe.tableQueryResult === 'table_not_found' ? (
                        <span className="text-amber-700">PGRST205 (Table Not Found)</span>
                      ) : (
                        <span className="text-red-700">{liveProbe.tableQueryResult}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 text-slate-100 p-3.5 font-mono text-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                    <span>Safe Read-Only Query Executed:</span>
                    <span>{liveProbe.testedAt}</span>
                  </div>
                  <div className="text-sky-300 font-semibold">{liveProbe.tableQueryAttempted}</div>
                  <div className="text-slate-300 text-[11px]">
                    Result: {liveProbe.summaryMessage}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-500 italic">Probe initializing...</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="font-mono text-xs font-semibold text-sky-800 uppercase">Artifact</span>
                <h3 className="text-sm font-semibold text-slate-900 mt-1">Versioned Migration</h3>
                <p className="text-xs font-mono text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-200">
                  /supabase/migrations/20261020000001_module1_admin_and_identity.sql
                </p>
                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>8 normalized PostgreSQL tables with foreign key constraints.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Row Level Security (RLS) enabled on all 8 tables.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Append-only database trigger on audit_logs.</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span>Migration Status</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    integrationStatus.migrationStatus === 'applied'
                      ? 'text-emerald-700'
                      : integrationStatus.migrationStatus === 'partially_applied'
                      ? 'text-amber-700'
                      : 'text-slate-600'
                  }`}
                >
                  {integrationStatus.migrationStatus === 'applied'
                    ? 'Applied in Supabase (8/8 Verified)'
                    : integrationStatus.migrationStatus === 'partially_applied'
                    ? 'Partially Applied'
                    : 'Pending Application'}
                </span>
              </div>
            </div>

            {/* Cross-Tenant Live Denial Test */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="font-mono text-xs font-semibold text-amber-800 uppercase">Live Verification</span>
                <h3 className="text-sm font-semibold text-slate-900 mt-1">Cross-Tenant Isolation Tester</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Simulate an attempt by active session <span className="font-mono font-semibold">{authContext.activeCompanyId}</span> to query a foreign tenant ID.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={crossTenantTargetId}
                    onChange={(e) => setCrossTenantTargetId(e.target.value)}
                    placeholder="cmp-999-foreign-tenant"
                    className="flex-1 text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                  />
                  <button
                    type="button"
                    onClick={handleTestCrossTenant}
                    className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                  >
                    Simulate Access
                  </button>
                </div>

                {crossTenantResult && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-800 border border-slate-200">
                    {crossTenantResult}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span>Security Enforcement</span>
                <span className="font-mono text-emerald-700 font-semibold">Strict Server Boundary</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS
         ========================================================================= */}
      {/* 1. Register Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsBranchModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Register Operating Branch</h3>
              <button
                type="button"
                onClick={() => setIsBranchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. North America Distribution Center"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Branch Code (Unique) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DC-NA-01"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Facility Address</label>
                <input
                  type="text"
                  placeholder="e.g. 100 Logistics Blvd, Suite 400"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isHq"
                  checked={branchForm.isHeadquarters}
                  onChange={(e) => setBranchForm({ ...branchForm, isHeadquarters: e.target.checked })}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="isHq" className="text-xs text-slate-700 font-medium">
                  Mark as Primary Headquarters Facility
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Invite User Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsInviteModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Invite Team Member</h3>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInviteMember} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Lee"
                  value={inviteForm.fullName}
                  onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. jordan@erpthrive.internal"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Role (Defaults to Least-Privilege) *
                </label>
                <select
                  value={inviteForm.roleId}
                  onChange={(e) => setInviteForm({ ...inviteForm, roleId: e.target.value as SystemRoleId })}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-600 font-mono"
                >
                  <option value="STAFF_USER">STAFF_USER (Least-Privilege Default)</option>
                  <option value="OPERATIONS_MANAGER">OPERATIONS_MANAGER</option>
                  <option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Higher tier roles require higher authorization hierarchy.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Confirm Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
