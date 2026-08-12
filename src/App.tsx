import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { SalesAnalytics } from './components/analytics/SalesAnalytics';
import { LoginView } from './components/auth/LoginView';
import { useUser } from './context/UserContext';

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
  const { isLoggedIn, syncSessionUser, clearSession } = useUser();
  const [darkMode, setDarkMode] = useState<boolean>(readStoredDark);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [darkMode]);

  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setCheckingSession(false);
        return;
      }
      try {
        const response = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          syncSessionUser(result.data);
        } else {
          clearSession();
        }
      } catch (err) {
        console.error('Session check failed:', err);
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, [clearSession, syncSessionUser]);

  if (checkingSession) {
    return (
      <div className="min-h-dvh h-dvh bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Checking session…
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginView />;
  }

  return (
    <div className="min-h-dvh h-dvh md:h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-200 overflow-hidden">
      <Navbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
      />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <SalesAnalytics />
      </main>
    </div>
  );
}
