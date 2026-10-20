import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ collapsed = false, className = '', size = 'md' }) => {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 36 : 28;

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Original ERPThrive Crest: Interlocking geometric hexagon and chevron */}
      <div 
        className="relative flex items-center justify-center shrink-0 rounded-lg bg-slate-900 p-1.5 shadow-sm ring-1 ring-slate-800/10"
        style={{ width: iconSize + 10, height: iconSize + 10 }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Hexagonal structural boundary */}
          <path
            d="M16 3L27 9.5V22.5L16 29L5 22.5V9.5L16 3Z"
            stroke="#38BDF8"
            strokeWidth="1.75"
            strokeLinejoin="round"
            className="text-sky-400"
          />
          {/* Upward dynamic core indicating structural growth ('Thrive') */}
          <path
            d="M16 8L22 14.5L18.5 15.5L16 13L13.5 15.5L10 14.5L16 8Z"
            fill="#38BDF8"
          />
          <path
            d="M16 15L22 21.5L19 22.5L16 19.5L13 22.5L10 21.5L16 15Z"
            fill="#0284C7"
          />
          {/* Center stability focal point */}
          <circle cx="16" cy="16" r="1.5" fill="#FFFFFF" />
        </svg>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          <div className="flex items-center tracking-tight">
            <span className="font-bold text-slate-900 text-lg leading-tight">ERP</span>
            <span className="font-extrabold text-sky-700 text-lg leading-tight">Thrive</span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 leading-none mt-0.5">
            Enterprise Core
          </span>
        </div>
      )}
    </div>
  );
};
