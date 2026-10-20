import React, { useState, useEffect, useRef } from 'react';
import { Search, X, CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { ModuleDefinition } from '../../modules/types.ts';
import { getAllModules } from '../../modules/navigation.ts';
import { IconHelper } from '../common/IconHelper.tsx';

interface ModuleSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModule: (id: string) => void;
  currentModuleId: string;
}

export const ModuleSearchModal: React.FC<ModuleSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectModule,
  currentModuleId
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const allModules = getAllModules();

  const filtered = allModules.filter((m) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelectModule(filtered[selectedIndex].id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onSelectModule, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Module Quick Switcher"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden ring-1 ring-slate-900/10">
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-slate-200 px-4">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search enterprise modules (e.g. Procurement, Inventory, Finance)..."
            className="h-12 w-full bg-transparent px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 p-1"
              aria-label="Clear search input"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ml-2">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No matching module found for &quot;{query}&quot;.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((mod: ModuleDefinition, idx: number) => {
                const isSelected = idx === selectedIndex;
                const isCurrent = mod.id === currentModuleId;
                const isImplemented = mod.status === 'active';

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      onSelectModule(mod.id);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-sky-50 text-sky-950'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          isSelected
                            ? 'bg-sky-200/60 text-sky-900'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <IconHelper name={mod.iconName} className="h-3.5 w-3.5" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">
                            {mod.name}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            · {mod.category}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-600 truncate max-w-sm">
                          {mod.description}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isImplemented ? (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-800">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-600">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Phase {mod.phaseNumber}</span>
                        </span>
                      )}

                      {isCurrent && (
                        <span className="font-mono text-[10px] text-sky-800 font-medium">
                          Current
                        </span>
                      )}

                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>ESC to close</span>
          </div>
          <span className="font-mono">{filtered.length} of {allModules.length} modules</span>
        </div>
      </div>
    </div>
  );
};
