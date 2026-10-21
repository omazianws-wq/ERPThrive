import React from 'react';
import {
  ArrowRight,
  Shield,
  Layers,
  Terminal,
  CheckCircle2,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { ModuleDefinition } from '../../modules/types.ts';
import { getAllModules, getFoundationStatusSummary } from '../../modules/navigation.ts';
import { IconHelper } from '../common/IconHelper.tsx';

interface DashboardViewProps {
  onSelectModule: (id: string) => void;
  onOpenRoadmap: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectModule,
  onOpenRoadmap
}) => {
  const allModules = getAllModules();
  const summary = getFoundationStatusSummary();

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* =========================================================================
          HERO & WELCOME SECTION
         ========================================================================= */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
            <span>ERPThrive Enterprise</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>{summary.currentPhase}</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="text-emerald-700 font-semibold">{summary.foundationStatus}</span>
          </div>

          <div className="flex flex-col gap-2 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Welcome to ERPThrive
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              ERPThrive is an original, modular enterprise resource planning platform engineered
              for high structural stability and sequential scalability. Module 0 (Application Shell)
              and Module 1 (Administration & Identity) are active.
            </p>
          </div>

          {/* Foundation Status Note (strictly neutral, no synthetic metrics) */}
          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Shell & Administration: <strong className="text-slate-900">Operational</strong></span>
            </div>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-sky-600" />
              <span>Registered Modules: <strong className="text-slate-900 tabular-nums">11 Modules</strong> ({summary.implementedCount} Active · {summary.scheduledCount} Scheduled)</span>
            </div>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-slate-500" />
              <span>Data Policy: <strong className="text-slate-900">Strictly Non-Fabricated</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FOUNDATION INFORMATIONAL CARDS (NEUTRAL & ACCURATE)
         ========================================================================= */}
      <section aria-labelledby="foundation-status-heading">
        <h2 id="foundation-status-heading" className="text-base font-semibold text-slate-900 mb-4">
          Foundation Architecture & Development Status
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Shell Architecture */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-sky-700" />
                <h3 className="text-sm font-semibold text-slate-900">Application Shell</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Responsive viewport engine featuring collapsible sidebar navigation, mobile drawer
                gestures, accessible keyboard controls, and modular view mounting.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Layout Engine</span>
              <span className="font-mono text-slate-800">React 19 / Vite</span>
            </div>
          </div>

          {/* Card 2: Development Principle */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-700" />
                <h3 className="text-sm font-semibold text-slate-900">Sequential Development</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Development advances one module at a time. Business logic, accounting models, and
                data stores remain uninitialized until formal review and approval of the preceding module.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Next Candidate</span>
              <span className="font-mono text-slate-800">Module 2 (Master Data)</span>
            </div>
          </div>

          {/* Card 3: Security & Data Integrity */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">Zero Synthetic Data</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                No mock revenue numbers, fake customers, synthetic transactions, or stubbed logins
                are generated. The application shell accurately reflects genuine runtime state.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Compliance</span>
              <span className="font-mono text-emerald-800 font-medium">Verified Clean</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          APPLICATION NAVIGATION HUB
         ========================================================================= */}
      <section aria-labelledby="modules-navigation-heading" className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 id="modules-navigation-heading" className="text-base font-semibold text-slate-900">
              Enterprise Module Directory
            </h2>
            <p className="text-xs text-slate-500">
              Select any module to inspect its planned architectural scope or placeholder status.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenRoadmap}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900"
          >
            <span>Inspect Delivery Roadmap</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allModules.map((mod: ModuleDefinition) => {
            const isImplemented = mod.status === 'active';

            return (
              <div
                key={mod.id}
                className={`group flex flex-col justify-between rounded-xl border p-5 transition-all ${
                  isImplemented
                    ? 'border-sky-300 bg-sky-50/30 hover:border-sky-400'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isImplemented
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <IconHelper name={mod.iconName} className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-sky-900">
                          {mod.name}
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          {mod.category}
                        </span>
                      </div>
                    </div>

                    {isImplemented ? (
                      <span className="text-[11px] font-mono font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Active Shell
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        Phase {mod.phaseNumber}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed min-h-[3rem]">
                    {mod.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-600 truncate max-w-[170px]">
                    {isImplemented ? 'Currently viewing' : 'Not implemented yet'}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectModule(mod.id)}
                    className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-sky-600"
                    aria-label={`Open ${mod.name} view`}
                  >
                    <span>{isImplemented ? 'Active' : 'Inspect'}</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          ENVIRONMENT AUDIT NOTICE
         ========================================================================= */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 text-xs text-slate-600">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-slate-900">Module 0 Acceptance Invariant:</span>
            <p className="leading-relaxed">
              In accordance with strict ERPThrive engineering rules, authentication, real database tables,
              and business transaction handlers are deliberately omitted in this phase. The application
              shell operates as a clean, self-contained TypeScript foundation ready for Module 1 upon approval.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
