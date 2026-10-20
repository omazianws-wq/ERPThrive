import React from 'react';
import { Menu, Search, Map, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ModuleDefinition } from '../../modules/types.ts';
import { Logo } from '../brand/Logo.tsx';

interface HeaderProps {
  currentModule: ModuleDefinition;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
  onOpenRoadmap: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModule,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileMenu,
  onOpenSearch,
  onOpenRoadmap
}) => {
  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6">
      {/* Zone 1: Mobile toggle & Breadcrumb Trail */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile brand display */}
        <div className="flex items-center md:hidden">
          <Logo size="sm" />
        </div>

        {/* Desktop Sidebar Collapse Toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 md:inline-flex"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* Contextual Breadcrumb (Strict single-line text with typographic separators) */}
        <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm md:flex">
          <span className="font-semibold text-slate-900">ERPThrive</span>
          <span className="text-slate-400" aria-hidden="true">/</span>
          <span className="text-slate-700 font-medium">{currentModule.name}</span>
          {currentModule.status === 'scheduled' && (
            <>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-xs text-amber-700 font-mono">
                Phase {currentModule.phaseNumber} Scheduled
              </span>
            </>
          )}
          {currentModule.status === 'active' && (
            <>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-xs text-emerald-700 font-medium">
                Module 0 Foundation
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Zone 2 & 3: Actions & Quick Search */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Module Finder / Command Palette trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600"
          aria-label="Search and jump to module"
        >
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <span className="hidden sm:inline">Jump to module...</span>
          <kbd className="hidden rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 sm:inline-block">
            ⌘K
          </kbd>
        </button>

        {/* Development Roadmap trigger */}
        <button
          type="button"
          onClick={onOpenRoadmap}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 whitespace-nowrap"
          aria-label="View module delivery roadmap"
        >
          <Map className="h-3.5 w-3.5 text-sky-700" />
          <span className="hidden md:inline">Roadmap</span>
        </button>

        {/* Foundation Phase Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 border-l border-slate-200 pl-3 text-xs text-slate-500">
          <span>Engine:</span>
          <span className="font-mono text-slate-800 font-semibold">v0.1.0-M0</span>
        </div>
      </div>
    </header>
  );
};
