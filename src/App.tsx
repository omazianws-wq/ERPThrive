/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ModuleId } from './modules/types.ts';
import { getModuleById, isValidModuleId, getAllModules } from './modules/navigation.ts';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { DashboardView } from './components/views/DashboardView.tsx';
import { AdministrationView } from './components/views/AdministrationView.tsx';
import { ModulePlaceholderView } from './components/views/ModulePlaceholderView.tsx';
import { ModuleSearchModal } from './components/dialogs/ModuleSearchModal.tsx';
import { RoadmapModal } from './components/dialogs/RoadmapModal.tsx';
import { AuthProvider, useAuth } from './modules/auth/AuthContext.tsx';
import { AuthScreen } from './components/auth/AuthScreen.tsx';
import { OnboardingView } from './components/auth/OnboardingView.tsx';
import { AuthViewMode } from './modules/auth/types.ts';
import { Logo } from './components/brand/Logo.tsx';
import { RefreshCw, Shield } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, isOnboarding, isLoading, signOut } = useAuth();

  // Extract initial module from location hash if valid, otherwise default to 'dashboard'
  const getInitialModule = (): ModuleId => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && isValidModuleId(hash)) {
        return hash;
      }
    }
    return 'dashboard';
  };

  const [currentModuleId, setCurrentModuleId] = useState<ModuleId>(getInitialModule);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [roadmapModalOpen, setRoadmapModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthViewMode>('login');

  // Sync state with browser location hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash === 'signup' || hash === 'login' || hash === 'forgot-password' || hash === 'reset-password') {
        setAuthMode(hash as AuthViewMode);
      } else if (hash && isValidModuleId(hash)) {
        setCurrentModuleId(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectModule = (id: string) => {
    if (isValidModuleId(id)) {
      setCurrentModuleId(id);
      window.location.hash = `#${id}`;
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
    }
  };

  // Global keyboard shortcut for ⌘K / Ctrl+K search palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // 1. Loading splash screen while session resolves
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white font-sans antialiased">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-3.5 rounded-2xl shadow-xl">
            <Logo size="lg" />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
            <span>Verifying enterprise session &amp; RLS boundaries...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Redirect all routes to Auth Screen
  if (!isAuthenticated) {
    return (
      <AuthScreen
        initialMode={authMode}
        onNavigateMode={(mode) => setAuthMode(mode)}
      />
    );
  }

  // 3. Authenticated but user does not belong to any company: Show Onboarding
  if (isOnboarding) {
    return <OnboardingView onSignOut={() => signOut()} />;
  }

  // 4. Authenticated with verified company membership: Render full ERP workspace
  const currentModule = getModuleById(currentModuleId) || getAllModules()[0];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased">
      {/* Desktop & Mobile Responsive Navigation */}
      <Sidebar
        currentModuleId={currentModuleId}
        onSelectModule={handleSelectModule}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenRoadmap={() => setRoadmapModalOpen(true)}
      />

      {/* Main Workspace Frame */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          currentModule={currentModule}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          onOpenRoadmap={() => setRoadmapModalOpen(true)}
        />

        {/* Scrollable Viewport Content Area */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
          role="main"
          id="main-content"
          tabIndex={-1}
        >
          {currentModule.id === 'dashboard' ? (
            <DashboardView
              onSelectModule={handleSelectModule}
              onOpenRoadmap={() => setRoadmapModalOpen(true)}
            />
          ) : currentModule.id === 'administration' ? (
            <AdministrationView
              onReturnToDashboard={() => handleSelectModule('dashboard')}
            />
          ) : (
            <ModulePlaceholderView
              module={currentModule}
              onReturnToDashboard={() => handleSelectModule('dashboard')}
              onOpenRoadmap={() => setRoadmapModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <ModuleSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectModule={handleSelectModule}
        currentModuleId={currentModuleId}
      />

      <RoadmapModal
        isOpen={roadmapModalOpen}
        onClose={() => setRoadmapModalOpen(false)}
        onSelectModule={handleSelectModule}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
