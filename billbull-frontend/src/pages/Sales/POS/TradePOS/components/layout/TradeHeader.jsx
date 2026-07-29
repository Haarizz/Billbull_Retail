import React from 'react';
import { TradeCard } from '../ui';

export const TradeHeader = React.memo(() => {
  return (
    <header className="h-16 flex-shrink-0 w-full mb-4">
      <TradeCard className="h-full w-full flex items-center px-6">
        <h1 className="text-xl font-bold text-[#1E293B]">Trade POS</h1>
        <div className="ml-auto text-sm text-gray-500">
          Header (Phase 2)
        </div>
      </TradeCard>
    </header>
  );
});

TradeHeader.displayName = 'TradeHeader';
