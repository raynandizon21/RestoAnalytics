import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { SalesAnalytics } from './components/analytics/SalesAnalytics';

const THEME_KEY = 'restoAnalytics.theme';

function readStoredDark(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(readStoredDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [darkMode]);

  return (
    <div className="min-h-dvh h-dvh md:h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200 overflow-hidden">
      <Navbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
      />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-hidden overscroll-y-contain">
        <SalesAnalytics />
      </main>
    </div>
  );
}
