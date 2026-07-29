import React from 'react';
import { TradeCard, TradeEmptyState } from '../ui';

export const TradeMainCanvas = React.memo(() => {
  return (
    <div className="flex-1 min-w-0 h-full flex flex-col">
      <TradeCard className="flex-1 flex items-center justify-center">
        <TradeEmptyState 
          title="Product Catalog" 
          description="(Phase 2)" 
        />
      </TradeCard>
    </div>
  );
});

TradeMainCanvas.displayName = 'TradeMainCanvas';
