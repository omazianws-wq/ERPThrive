import React, { useEffect } from 'react';
import { X, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { getAllModules, getFoundationStatusSummary } from '../../modules/navigation.ts';
import { IconHelper } from '../common/IconHelper.tsx';

interface RoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModule: (id: string) => void;
}

export const RoadmapModal: React.FC<RoadmapModalProps> = ({
  isOpen,
  onClose,
  onSelectModule
}) => {
  const allModules = getAllModules();
  const summary = getFoundationStatusSummary();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ERPThrive Module Delivery Roadmap"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden ring-1 ring-slate-900/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>ERPThrive Architecture</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-semibold">{summary.currentPhase}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Sequential Delivery Roadmap
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600"
            aria-label="Close roadmap dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Strict Development Rule Reminder */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-950 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-900">
                Single-Module Governance Protocol:
              </span>
              <p className="text-slate-700 leading-relaxed">
                Module 0 is implemented in full isolation. Future business modules (Modules 1 through 10)
                will be engineered sequentially only after implementation, functional verification, bug fixing,
                and explicit client approval of the previous module.
              </p>
            </div>
          </div>

          {/* Sequential Phases Timeline */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Module Progression Order (Phases 0 through 10)
            </h3>

            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {allModules.map((mod) => {
                const isCurrent = mod.status === 'active';

                return (
                  <div
                    key={mod.id}
                    className={`flex items-start justify-between p-4 transition-colors ${
                      isCurrent ? 'bg-sky-50/50' : 'bg-white hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                          isCurrent
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <IconHelper name={mod.iconName} className="h-4 w-4" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {mod.name}
                          </span>
                          <span className="text-xs text-slate-600 font-mono">
                            (Phase {mod.phaseNumber})
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                          {mod.description}
                        </p>

                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
                          <span>Prereq: {mod.prerequisites}</span>
                          <span aria-hidden="true">·</span>
                          <span>Category: {mod.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Active Shell</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Scheduled</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onSelectModule(mod.id);
                          onClose();
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600 rounded"
                        title={`View ${mod.name}`}
                        aria-label={`View ${mod.name}`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between text-xs text-slate-600">
          <span>Total Modules: 11 (1 Active Foundation, 10 Scheduled)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
