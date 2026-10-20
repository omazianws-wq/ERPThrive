import React, { useEffect } from 'react';
import { X, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { ModuleDefinition, ModuleCategory } from '../../modules/types.ts';
import { getModulesByCategory } from '../../modules/navigation.ts';
import { Logo } from '../brand/Logo.tsx';
import { IconHelper } from '../common/IconHelper.tsx';

interface SidebarProps {
  currentModuleId: string;
  onSelectModule: (id: string) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenRoadmap: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModuleId,
  onSelectModule,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onOpenRoadmap
}) => {
  const groupedModules = getModulesByCategory();
  const categories: ModuleCategory[] = ['Core', 'Operations', 'Management', 'Configuration'];

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const renderNavList = (isMobile: boolean = false) => (
    <div className="flex flex-col gap-6 p-3">
      {categories.map((category) => {
        const modules = groupedModules[category];
        if (!modules || modules.length === 0) return null;

        return (
          <div key={category} className="flex flex-col gap-1">
            {(!collapsed || isMobile) && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {category}
              </div>
            )}

            <div className="flex flex-col gap-0.5">
              {modules.map((mod: ModuleDefinition) => {
                const isActive = currentModuleId === mod.id;
                const isImplemented = mod.status === 'active';

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      onSelectModule(mod.id);
                      if (isMobile) onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed && !isMobile ? `${mod.name} (${mod.status})` : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 ${
                      isActive
                        ? 'bg-sky-50 text-sky-950 font-semibold ring-1 ring-sky-200/70 shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    } ${collapsed && !isMobile ? 'justify-center px-2 py-2.5' : ''}`}
                  >
                    {/* Active vertical marker */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-sm bg-sky-600"
                        aria-hidden="true"
                      />
                    )}

                    <div
                      className={`flex shrink-0 items-center justify-center transition-colors ${
                        isActive
                          ? 'text-sky-700'
                          : 'text-slate-600 group-hover:text-slate-900'
                      }`}
                    >
                      <IconHelper name={mod.iconName} className="h-4 w-4" />
                    </div>

                    {(!collapsed || isMobile) && (
                      <div className="flex flex-1 items-center justify-between min-w-0">
                        <span className="truncate text-slate-800 group-hover:text-slate-950">
                          {mod.name}
                        </span>

                        {isImplemented ? (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-800 whitespace-nowrap pl-2">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>M0</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-slate-600 whitespace-nowrap pl-2">
                            <Clock className="h-3 w-3 text-slate-500" />
                            <span>P{mod.phaseNumber}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* =========================================================================
          DESKTOP SIDEBAR
         ========================================================================= */}
      <aside
        className={`hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-200 ease-in-out shrink-0 z-10 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
        aria-label="Desktop application navigation"
      >
        {/* Brand header */}
        <div
          className={`flex h-16 items-center border-b border-slate-200 px-4 ${
            collapsed ? 'justify-center px-2' : 'justify-between'
          }`}
        >
          <Logo collapsed={collapsed} />
        </div>

        {/* Scrollable Navigation Area */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="Main Navigation">
          {renderNavList(false)}
        </nav>

        {/* Sidebar Footer info */}
        <div className="border-t border-slate-200 p-3 bg-slate-50/50">
          {!collapsed ? (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Module 0 Foundation</span>
                <span className="font-mono text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Foundation shell verified. Modules 1–10 await sequential development.
              </p>
              <button
                type="button"
                onClick={onOpenRoadmap}
                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900"
              >
                <span>View roadmap spec</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onOpenRoadmap}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                title="View Development Roadmap"
                aria-label="View Development Roadmap"
              >
                <Clock className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* =========================================================================
          MOBILE NAVIGATION DRAWER
         ========================================================================= */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl ring-1 ring-slate-900/10">
            {/* Drawer top bar */}
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <Logo />
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 overflow-y-auto py-2" aria-label="Mobile Navigation List">
              {renderNavList(true)}
            </nav>

            {/* Mobile drawer footer */}
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="font-semibold text-slate-900">ERPThrive Suite</span>
                <span className="text-slate-500 text-[11px]">
                  Phase 0: Foundation Shell Active.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onCloseMobile();
                    onOpenRoadmap();
                  }}
                  className="mt-1 flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
                >
                  <span>Architecture & Roadmap</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
