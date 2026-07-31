import React from 'react';
import { Store, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  onToggleDarkMode,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors pt-[env(safe-area-inset-top)]">
      <div className="w-full px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 select-none min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Store className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 min-w-0">
              <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight shrink-0">
                3Core
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] truncate">
                Multi-Branch P&L
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onToggleDarkMode}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors shrink-0"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>
      </div>
    </header>
  );
};

