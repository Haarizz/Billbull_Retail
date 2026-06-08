import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * KpiCards — renders a row of metric cards above a list table.
 *
 * Props:
 *   cards: Array<{
 *     label: string,
 *     value: string | number,   // already-formatted display value
 *     sub?: string,             // small secondary line below value
 *     icon: ReactNode,
 *     iconBg: string,           // tailwind bg class e.g. "bg-yellow-100"
 *     iconColor: string,        // tailwind text class e.g. "text-yellow-600"
 *     accent?: string,          // optional left-border color class e.g. "border-yellow-400"
 *   }>
 *   loading?: boolean
 */
const KpiCards = ({ cards = [], loading = false }) => {
  if (!cards.length) return null;

  return (
    <div className={`grid gap-3 mb-4`} style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
      {cards.map((card, i) => (
        <div
          key={i}
          className={`bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex items-center gap-3 border-l-4 ${card.accent || 'border-l-slate-200'}`}
        >
          <div className={`p-2.5 rounded-lg ${card.iconBg} flex-shrink-0`}>
            <span className={card.iconColor}>{card.icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">{card.label}</p>
            {loading ? (
              <div className="h-5 w-20 bg-slate-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-base font-bold text-slate-800 truncate leading-tight">{card.value}</p>
            )}
            {card.sub && !loading && (
              <p className="text-[10px] text-slate-400 truncate mt-0.5">{card.sub}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default KpiCards;
