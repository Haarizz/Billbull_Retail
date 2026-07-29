import React from 'react';
import { TradeCard, TradeEmptyState } from '../ui';

export const TradeCartPanel = React.memo(() => {
  return (
    <div className="w-full lg:w-[380px] xl:w-[420px] h-full flex flex-col shrink-0">
      <TradeCard className="flex-1 flex items-center justify-center">
        <TradeEmptyState 
          title="Cart Panel" 
          description="(Phase 3)" 
        />
      </TradeCard>
    </div>
  );
});

TradeCartPanel.displayName = 'TradeCartPanel';
