import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { SalesAnalytics } from './components/analytics/SalesAnalytics';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="min-h-dvh h-dvh md:h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200 overflow-hidden">
      <Navbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-hidden overscroll-y-contain">
        <SalesAnalytics />
      </main>
    </div>
  );
}
