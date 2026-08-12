import React from 'react';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useUser } from '../../context/UserContext';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  onToggleDarkMode,
}) => {
  const { user, logout } = useUser();
  const displayName = [user?.firstname, user?.lastname].filter(Boolean).join(' ') || user?.username || '';

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors pt-[env(safe-area-inset-top)]">
      <div className="w-full px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 select-none min-w-0">
          <img
            src="/company_logo_nobg.png"
            alt="3Core"
            className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0"
          />
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

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {displayName && (
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 max-w-[140px] truncate">
              {displayName}
            </span>
          )}
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition-colors text-xs font-semibold"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

