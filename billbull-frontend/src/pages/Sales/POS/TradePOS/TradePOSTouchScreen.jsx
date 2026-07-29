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
        <TradeHeader />
      </div>

      {/* Main Content Area - Responsive Grid */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 pt-0">
        
        {/* Main Canvas (Catalog) */}
        {/* On mobile, only visible if active tab is catalog */}
        <div className={`flex-1 min-w-0 h-full ${mobileActiveTab === 'catalog' ? 'flex' : 'hidden'} lg:flex`}>
          <TradeMainCanvas {...props} />
        </div>

        {/* Cart Panel */}
        {/* On mobile, only visible if active tab is cart */}
        <div className={`h-full shrink-0 ${mobileActiveTab === 'cart' ? 'flex' : 'hidden'} lg:flex`}>
          <TradeCartPanel {...props} />
        </div>

        {/* Action Panel (Numpad, Quick Actions, Checkout) */}
        {/* On mobile, this will eventually become a slide-up drawer or floating actions, for now it stacks or hides */}
        <div className="h-full shrink-0 hidden lg:flex">
          <TradeActionPanel {...props} />
        </div>

      </div>

      {/* Mobile Bottom Navigation (Placeholder for Phase 1) */}
      <div className="lg:hidden shrink-0 bg-white border-t border-gray-200 p-2 flex justify-around shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
        <button 
          onClick={() => setMobileActiveTab('catalog')}
          className={`flex-1 py-3 text-center rounded-lg font-bold ${mobileActiveTab === 'catalog' ? 'bg-[#F5C742] text-[#1E293B]' : 'text-gray-500'}`}
        >
          Catalog
        </button>
        <button 
          onClick={() => setMobileActiveTab('cart')}
          className={`flex-1 py-3 text-center rounded-lg font-bold ${mobileActiveTab === 'cart' ? 'bg-[#F5C742] text-[#1E293B]' : 'text-gray-500'}`}
        >
          Cart
        </button>
        {/* Mobile Action Drawer Trigger Placeholder */}
        <button className="flex-1 py-3 text-center rounded-lg font-bold text-gray-500">
          Actions
        </button>
      </div>
      
    </div>
  );
});

TradePOSTouchScreen.displayName = 'TradePOSTouchScreen';
