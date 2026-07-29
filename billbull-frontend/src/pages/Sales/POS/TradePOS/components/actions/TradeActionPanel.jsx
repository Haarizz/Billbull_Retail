import React from 'react';
import { 
  Calculator, Tag, Percent, PauseCircle, StopCircle, 
  Truck, ArrowDownCircle, ArrowUpCircle, Delete
} from 'lucide-react';
import { TradeCard } from '../ui';

export const TradeActionPanel = React.memo(() => {
  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Action Grid (Disabled Placeholders for Phase 4) */}
      <TradeCard padding="p-2" className="shrink-0 bg-white shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Qty', icon: <Calculator className="w-4 h-4" /> },
            { label: 'Discount', icon: <Percent className="w-4 h-4" /> },
            { label: 'Price', icon: <Tag className="w-4 h-4" /> },
            { label: 'Hold', icon: <PauseCircle className="w-4 h-4" /> },
            { label: 'Suspend', icon: <StopCircle className="w-4 h-4" /> },
            { label: 'Delivery', icon: <Truck className="w-4 h-4" /> },
            { label: 'Cash In', icon: <ArrowDownCircle className="w-4 h-4" /> },
            { label: 'Cash Out', icon: <ArrowUpCircle className="w-4 h-4" /> },
          ].map((action, i) => (
            <button
              key={i}
              disabled
              className="flex items-center gap-2 p-2 rounded bg-gray-50 border border-gray-100 text-slate-400 opacity-60 cursor-not-allowed hover:bg-gray-100 transition-colors"
            >
              {action.icon}
              <span className="text-xs font-semibold">{action.label}</span>
            </button>
          ))}
        </div>
      </TradeCard>

      {/* Numpad Placeholder (Phase 4) */}
      <TradeCard padding="p-3" className="flex-1 min-h-0 bg-slate-100 shadow-inner border border-slate-200/60 flex flex-col">
        <div className="bg-white rounded border border-slate-200 h-12 mb-3 flex items-center justify-end px-3 shadow-sm">
          <span className="text-xl font-mono font-bold text-slate-300">0.00</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 flex-1">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', 'DEL'].map((key) => (
            <button
              key={key}
              disabled
              className={`flex items-center justify-center rounded shadow-sm text-lg font-black transition-colors opacity-50 cursor-not-allowed
                ${key === 'DEL' ? 'bg-red-50 text-red-400 border border-red-100' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
            >
              {key === 'DEL' ? <Delete className="w-5 h-5" /> : key}
            </button>
          ))}
        </div>
      </TradeCard>
    </div>
  );
});

TradeActionPanel.displayName = 'TradeActionPanel';
