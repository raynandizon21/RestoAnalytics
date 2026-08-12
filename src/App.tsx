import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { SalesAnalytics } from './components/analytics/SalesAnalytics';
import { LoginView } from './components/auth/LoginView';
import { useUser } from './context/UserContext';
import { getTelegramInitData, isTelegramWebApp } from './utils/telegramWebApp';

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

function readTelegramBypassParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tg_t = String(params.get('tg_t') || '').trim();
    const tg_sig = String(params.get('tg_sig') || '').trim();
    const view = String(params.get('view') || '').trim().toLowerCase();
    return {
      tg_t,
      tg_sig,
      hasBypass: Boolean(tg_t && tg_sig),
      wantsCompare: view === 'branch-comparison' || view === 'compare',
    };
  } catch {
    return { tg_t: '', tg_sig: '', hasBypass: false, wantsCompare: false };
  }
}

function ensureComparisonDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const view = String(params.get('view') || '').trim().toLowerCase();
    if (view === 'branch-comparison' || view === 'compare') return;
    params.set('view', 'branch-comparison');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}?${qs}${window.location.hash || ''}`);
  } catch {
    /* ignore */
  }
}

function stripTelegramBypassParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    for (const key of ['tg_t', 'tg_sig']) {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const { isLoggedIn, login, syncSessionUser, clearSession } = useUser();
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
      const bypass = readTelegramBypassParams();
      const fromTelegram = isTelegramWebApp() || bypass.hasBypass || bypass.wantsCompare;

      if (fromTelegram || bypass.wantsCompare) {
        ensureComparisonDeepLink();
      }

      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const result = await response.json();
          if (result.success && result.data) {
            syncSessionUser(result.data);
            if (bypass.hasBypass) stripTelegramBypassParams();
            setCheckingSession(false);
            return;
          }
          clearSession();
        } catch (err) {
          console.error('Session check failed:', err);
        }
      }

      // Telegram Mini App → SSO (signed URL and/or initData)
      if (fromTelegram || bypass.hasBypass) {
        try {
          let initData = getTelegramInitData();
          if (!initData && !bypass.hasBypass) {
            for (let i = 0; i < 8 && !initData; i += 1) {
              await new Promise((r) => setTimeout(r, 150));
              initData = getTelegramInitData();
            }
          }

          const body: Record<string, string> = {};
          if (bypass.hasBypass) {
            body.tg_t = bypass.tg_t;
            body.tg_sig = bypass.tg_sig;
          }
          if (initData) body.initData = initData;

          if (body.tg_sig || body.initData) {
            const response = await fetch('/api/telegram-auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const result = await response.json();
            if (result?.success && result?.data && result?.tokens?.accessToken) {
              login(result.data, result.tokens.accessToken);
              ensureComparisonDeepLink();
              stripTelegramBypassParams();
              setCheckingSession(false);
              return;
            }
            console.error('Telegram auth failed:', result?.error || response.status);
          } else {
            console.error('Telegram auth skipped: no initData / bypass params');
          }
        } catch (err) {
          console.error('Telegram auth error:', err);
        }
      }

      setCheckingSession(false);
    };
    void checkSession();
  }, [clearSession, login, syncSessionUser]);

  if (checkingSession) {
    return (
      <div className="min-h-dvh h-dvh bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        {isTelegramWebApp() || readTelegramBypassParams().hasBypass
          ? 'Opening comparison…'
          : 'Checking session…'}
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
