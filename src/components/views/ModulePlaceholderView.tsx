import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Map,
  ShieldAlert
} from 'lucide-react';
import { ModuleDefinition } from '../../modules/types.ts';
import { IconHelper } from '../common/IconHelper.tsx';

interface ModulePlaceholderViewProps {
  module: ModuleDefinition;
  onReturnToDashboard: () => void;
  onOpenRoadmap: () => void;
}

export const ModulePlaceholderView: React.FC<ModulePlaceholderViewProps> = ({
  module,
  onReturnToDashboard,
  onOpenRoadmap
}) => {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Back button & Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onReturnToDashboard}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 rounded-md py-1 px-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Dashboard</span>
        </button>

        <span className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded">
          Phase {module.phaseNumber} · Scheduled
        </span>
      </div>

      {/* Main Module Identification Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
              <IconHelper name={module.iconName} className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-medium">
                <span>ERPThrive Enterprise Suite</span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>Category: {module.category}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {module.name}
              </h1>
              <p className="text-sm text-slate-600 max-w-2xl mt-1">
                {module.description}
              </p>
            </div>
          </div>
        </div>

        {/* Clear "Not implemented yet" status card */}
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-xs text-amber-900">
              <span className="font-semibold text-sm text-amber-950">
                Not Implemented Yet
              </span>
              <p className="leading-relaxed">
                The <strong>{module.name}</strong> module is currently an architectural placeholder.
                ERPThrive adheres strictly to single-module sequential engineering. This module will
                only be initialized once all prior roadmap phases have been implemented, tested, and explicitly approved.
              </p>
              <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 font-mono text-[11px] text-amber-800">
                <span>Sequential Order: Phase {module.phaseNumber}</span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>Prerequisite: {module.prerequisites}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Planned Capabilities & Architecture Scope */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Planned Capabilities */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Planned Functional Scope
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              When {module.name} development commences, the following core capabilities will be engineered:
            </p>
            <ul className="flex flex-col gap-2.5 mt-2">
              {module.plannedCapabilities.map((capability, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 mt-0.5">
                    <span className="font-mono text-[10px]">{idx + 1}</span>
                  </div>
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Status</span>
            <span className="font-mono text-slate-700">Scheduled for Phase {module.phaseNumber}</span>
          </div>
        </div>

        {/* Development Safety & Data Isolation */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Data & Integrity Guarantee
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              In accordance with Module 0 development invariants:
            </p>
            <div className="flex flex-col gap-2 mt-1 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Zero fabricated ledger accounts, journal entries, or synthetic balances.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Zero fake vendor, customer, employee, or stock records.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Zero mock authentication stubs or placeholder database migrations.</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenRoadmap}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              <Map className="h-3.5 w-3.5" />
              <span>Inspect Full Roadmap</span>
            </button>

            <button
              type="button"
              onClick={onReturnToDashboard}
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
