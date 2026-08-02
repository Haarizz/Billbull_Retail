import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings, ShoppingCart } from 'lucide-react';

export const TradeHeader = React.memo(({
  setCurrentView,
  setShowPOSConfig,
  currentSession,
  posSettings
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Top Tier (White) */}
      <div className="bg-white flex flex-col gap-1.5 px-3 sm:px-4 py-2.5 border-b border-gray-200 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => setCurrentView && setCurrentView('dashboard')}
            className="flex items-center gap-2 text-amber-500 hover:text-amber-600 transition-colors py-1.5 px-3 border border-amber-200 hover:bg-amber-50 rounded-lg text-xs sm:text-sm font-bold shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          {/* Settings / Configure */}
          <button
            onClick={() => setShowPOSConfig && setShowPOSConfig(true)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors py-1.5 px-3 border border-gray-200 hover:bg-gray-50 rounded-full text-xs sm:text-sm font-semibold shadow-sm shrink-0"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configure</span>
          </button>
        </div>

        <div className="text-slate-500 font-medium text-xs sm:text-sm leading-snug">
          <span>Session: <span className="font-semibold text-slate-600">{currentSession?.id || 'NO SESSION'}</span></span>
          <span className="hidden sm:inline">
            {' '}&bull;{' '}
            {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Second Tier (Brand Amber) */}
      <div className="bg-primary text-white min-h-12 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="bg-white p-1.5 rounded-full text-primary shrink-0">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-sm sm:text-base font-black tracking-wide leading-tight truncate">
              Compact — Trade POS
            </h1>
            <span className="text-white/80 text-[11px] font-medium leading-tight truncate">
              {posSettings?.branchName || 'Main Branch'} &bull; {currentSession?.terminal || 'Terminal 01'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end text-right justify-center shrink-0">
          <span className="text-xs sm:text-sm font-bold tracking-wider leading-none">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="hidden sm:block text-[10px] text-white/80 font-medium uppercase tracking-widest mt-0.5 leading-none">
            {time.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
});

TradeHeader.displayName = 'TradeHeader';

