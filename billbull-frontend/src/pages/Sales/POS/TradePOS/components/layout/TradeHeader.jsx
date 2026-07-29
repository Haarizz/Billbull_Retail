import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Settings, Store, Monitor } from 'lucide-react';
import { TradeButton } from '../ui';

export const TradeHeader = React.memo(({
  setCurrentView,
  currentSession,
  posSettings
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-slate-900 text-white h-14 flex items-center px-4 justify-between shrink-0 shadow-md relative z-20">
      {/* Left Area: Navigation & Title */}
      <div className="flex items-center gap-4 h-full">
        <button 
          onClick={() => setCurrentView && setCurrentView('dashboard')}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors py-2 px-1 text-sm font-semibold group"
          title="Return to Dashboard"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Dashboard
        </button>
        
        <div className="h-6 w-px bg-slate-700 mx-2"></div>
        
        <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
          Trade POS
          <span className="bg-[#F5C742] text-slate-900 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm tracking-wider">PRO</span>
        </h1>
      </div>

      {/* Center Area: Session & Branch Info */}
      <div className="hidden lg:flex items-center gap-6">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Store className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{posSettings?.branchName || 'Main Branch'}</span>
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Location</span>
        </div>
        
        <div className="h-8 w-px bg-slate-800"></div>
        
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Monitor className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{currentSession?.terminal || 'Terminal 1'}</span>
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Register</span>
        </div>

        <div className="h-8 w-px bg-slate-800"></div>
        
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-emerald-400">{currentSession?.id || 'NO SESSION'}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Session ID</span>
        </div>
      </div>

      {/* Right Area: Time & Settings */}
      <div className="flex items-center gap-4 h-full">
        <div className="hidden md:flex flex-col items-end text-right">
          <span className="text-sm font-bold text-white flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="h-6 w-px bg-slate-700 hidden md:block mx-2"></div>

        <TradeButton 
          variant="secondary"
          className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white !p-2"
          onClick={() => {}}
          title="Configure Trade POS"
        >
          <Settings className="w-4 h-4" />
        </TradeButton>
      </div>
    </header>
  );
});

TradeHeader.displayName = 'TradeHeader';
