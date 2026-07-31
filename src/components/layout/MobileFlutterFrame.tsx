import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, Smartphone, ChevronLeft } from 'lucide-react';

interface MobileFlutterFrameProps {
  children: React.ReactNode;
  isSimulatorActive: boolean;
  onCloseSimulator: () => void;
  osType?: 'ios' | 'android';
}

export const MobileFlutterFrame: React.FC<MobileFlutterFrameProps> = ({
  children,
  isSimulatorActive,
  onCloseSimulator,
}) => {
  const [timeStr, setTimeStr] = useState('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setTimeStr(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!isSimulatorActive) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-6 py-8">
      {/* Top Banner Control */}
      <div className="w-full max-w-sm mb-4 flex items-center justify-between text-white text-xs px-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-bold tracking-wide text-slate-300">
            Flutter 3.22 Android / iOS Renderer
          </span>
        </div>
        <button
          onClick={onCloseSimulator}
          className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-colors"
        >
          Exit Simulator View
        </button>
      </div>

      {/* Phone Hardware Mockup Frame */}
      <div className="w-full max-w-[390px] h-[820px] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-[6px] border-slate-700 relative flex flex-col overflow-hidden ring-1 ring-white/10">
        {/* Dynamic Island / Camera Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 flex items-center justify-end px-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
        </div>

        {/* Mobile Status Bar */}
        <div className="h-10 w-full bg-slate-900 text-white px-7 flex items-end justify-between text-[11px] font-bold z-40 select-none pb-1">
          <span>{timeStr}</span>
          <div className="flex items-center space-x-1.5 opacity-90">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <Battery className="w-4 h-4 fill-white" />
          </div>
        </div>

        {/* Inner Phone Screen Content */}
        <div className="flex-1 bg-white dark:bg-slate-950 rounded-[40px] overflow-y-auto relative scrollbar-none">
          {children}
        </div>

        {/* iOS Home Indicator Bar */}
        <div className="h-5 w-full bg-slate-900 flex items-center justify-center pt-1">
          <div className="w-32 h-1 bg-white/40 rounded-full" />
        </div>
      </div>
    </div>
  );
};
