import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, GitBranch, Wallet } from 'lucide-react';
import { useUser } from '../../context/UserContext';

const LOGO_SRC = '/company_logo_nobg.png';

const ANALYTICS_DETAILS = [
  {
    label: 'Sales',
    hint: 'Live P&L',
    icon: BarChart3,
    iconClass: 'text-amber-400',
    cardClass: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    label: 'Expenses',
    hint: 'Cost control',
    icon: Wallet,
    iconClass: 'text-sky-400',
    cardClass: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    label: 'Branches',
    hint: 'One system',
    icon: GitBranch,
    iconClass: 'text-emerald-400',
    cardClass: 'bg-emerald-500/10 border-emerald-500/20',
  },
] as const;

export const LoginView: React.FC = () => {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const trimmedUser = username.trim();
    if (trimmedUser.toLowerCase() !== 'admin') {
      setError('Only the admin account can access Resto Analytics.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUser, password }),
      });
      const result = await response.json();

      if (result.success) {
        login(result.data, result.tokens.accessToken);
      } else {
        setError(result.error || 'Invalid username or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection failed. Please check if the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen bg-slate-950 text-slate-100">
      <div
        className="hidden lg:block lg:w-2/3 h-full bg-cover bg-center relative"
        style={{ backgroundImage: `url('/login-bg.png')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-indigo-950/40 to-slate-950/80" />
        <div className="absolute bottom-10 left-10 right-10 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <img
              src={LOGO_SRC}
              alt="3Core"
              className="w-11 h-11 object-contain drop-shadow-md"
            />
            <div>
              <p className="text-indigo-300 text-xs font-bold uppercase tracking-[0.2em]">3Core Analytics</p>
              <p className="text-slate-400 text-xs mt-0.5">Multi-branch restaurant intelligence</p>
            </div>
          </div>
          <h1 className="text-3xl xl:text-4xl font-bold text-white tracking-tight leading-tight">
            Multi-Branch P&amp;L at a glance
          </h1>
          <p className="mt-3 text-slate-300 text-sm xl:text-base leading-relaxed">
            Sign in to review sales, expenses, and branch performance across your restaurants — all in one system.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
            {ANALYTICS_DETAILS.map(({ label, hint, icon: Icon, iconClass, cardClass }) => (
              <div
                key={label}
                className={`rounded-xl border px-3 py-2.5 backdrop-blur-sm bg-slate-950/40 ${cardClass}`}
              >
                <Icon className={`w-4 h-4 mb-1.5 ${iconClass}`} />
                <p className="text-white text-xs font-bold">{label}</p>
                <p className="text-slate-400 text-[10px] mt-0.5">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/3 h-full bg-white dark:bg-slate-900 flex flex-col justify-center px-8 sm:px-12 py-10 border-l border-slate-200 dark:border-slate-800 shadow-[-10px_0_40px_rgba(0,0,0,0.25)] z-10 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-sm mx-auto"
        >
          <div className="flex flex-col items-start mb-8">
            <div className="flex items-center gap-3 mb-6">
              <img
                src={LOGO_SRC}
                alt="3Core logo"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-md"
              />
              <div className="min-w-0">
                <p className="text-slate-900 dark:text-white font-bold text-lg tracking-tight leading-tight">
                  3Core Analytics
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Unified multi-branch P&amp;L
                </p>
              </div>
            </div>

            <div className="w-full grid grid-cols-3 gap-2 mb-7">
              {ANALYTICS_DETAILS.map(({ label, hint, icon: Icon, iconClass, cardClass }) => (
                <div
                  key={label}
                  className={`rounded-xl border px-2 py-2.5 text-center ${cardClass}`}
                >
                  <Icon className={`w-3.5 h-3.5 mx-auto mb-1 opacity-90 ${iconClass}`} />
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{label}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{hint}</p>
                </div>
              ))}
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              Welcome Back
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">
              Please enter your details to sign in
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 text-red-600 dark:text-red-300 p-3.5 rounded-xl text-sm font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={isLoading}
                autoComplete="username"
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500/25"
                />
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
                  Remember me
                </span>
              </label>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">Forgot password?</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white text-base font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] mt-2 disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Don&apos;t have an account?{' '}
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">Contact Support</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
