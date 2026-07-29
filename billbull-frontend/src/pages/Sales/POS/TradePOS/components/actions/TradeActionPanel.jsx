import React from 'react';
import { TradeCard, TradeEmptyState } from '../ui';

export const TradeActionPanel = React.memo(() => {
  return (
    <div className="w-full lg:w-[320px] xl:w-[360px] h-full flex flex-col shrink-0">
      <TradeCard className="flex-1 flex items-center justify-center">
        <TradeEmptyState 
          title="Action Panel" 
          description="(Phase 4/6)" 
        />
      </TradeCard>
    </div>
  );
});

TradeActionPanel.displayName = 'TradeActionPanel';
