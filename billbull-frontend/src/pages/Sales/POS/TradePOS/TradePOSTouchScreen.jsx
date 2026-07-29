import React, { useState } from 'react';
import { TradeHeader } from './components/layout/TradeHeader';
import { TradeMainCanvas } from './components/layout/TradeMainCanvas';
import { TradeCartPanel } from './components/cart/TradeCartPanel';
import { TradeActionPanel } from './components/actions/TradeActionPanel';

/**
 * TradePOSTouchScreen
 * 
 * The main presentation shell for the Trade POS.
 * Replaces the legacy Compact POS template.
 * Routes props to child components without executing business logic.
 */
export const TradePOSTouchScreen = React.memo((props) => {
  // Presentation state for mobile/tablet responsive behavior
  const [mobileActiveTab, setMobileActiveTab] = useState('catalog'); // 'catalog' | 'cart'
  
  return (
    <div className="flex flex-col h-screen w-full bg-[#F7F7FA] overflow-hidden">
      {/* Global Header */}
      <div className="shrink-0">
        <TradeHeader {...props} />
      </div>

      {/* Main Content Area - Responsive Flex Grid */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3 pt-0">
        
        {/* LEFT PANEL: 42% (Customer, Search, Quick Picks) */}
        <div className={`h-full flex flex-col min-w-0 ${mobileActiveTab === 'catalog' ? 'flex flex-1' : 'hidden'} lg:flex lg:w-[42%]`}>
          <TradeMainCanvas {...props} />
        </div>

        {/* CENTER PANEL: 36% (Invoice Header, Items, Totals, Checkout) */}
        <div className={`h-full flex flex-col min-w-0 ${mobileActiveTab === 'cart' ? 'flex flex-1' : 'hidden'} lg:flex lg:w-[36%]`}>
          <TradeCartPanel {...props} />
        </div>

        {/* RIGHT PANEL: 22% (Actions & Numpad Placeholders) */}
        {/* On mobile, this will eventually become a slide-up drawer or floating actions */}
        <div className="h-full flex flex-col min-w-0 hidden lg:flex lg:w-[22%]">
          <TradeActionPanel {...props} />
        </div>

      </div>

      {/* Mobile Bottom Navigation (Placeholder for Phase 1/4) */}
      <div className="lg:hidden shrink-0 bg-white border-t border-gray-200 p-2 flex justify-around shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10 gap-2">
        <button 
          onClick={() => setMobileActiveTab('catalog')}
          className={`flex-1 py-3 text-center rounded-lg font-bold text-sm transition-colors ${mobileActiveTab === 'catalog' ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          Quick Picks
        </button>
        <button 
          onClick={() => setMobileActiveTab('cart')}
          className={`flex-1 py-3 text-center rounded-lg font-bold text-sm transition-colors ${mobileActiveTab === 'cart' ? 'bg-[#F5C742] text-[#1E293B]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          Invoice ({props.currentInvoice?.items?.filter(i => !i.isVoided)?.length || 0})
        </button>
      </div>
      
    </div>
  );
});

TradePOSTouchScreen.displayName = 'TradePOSTouchScreen';
