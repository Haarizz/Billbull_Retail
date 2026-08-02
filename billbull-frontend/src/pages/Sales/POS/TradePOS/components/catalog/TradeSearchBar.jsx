import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';

export const TradeSearchBar = React.memo(({
  searchQuery,
  setSearchQuery,
  handleUnifiedEntry,
  barcodeInputRef,
  placeholder = "Scan barcode or type item code / name..."
}) => {
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (searchQuery !== localQuery) {
      setLocalQuery(searchQuery || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setLocalQuery(value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 150);
  }, [setSearchQuery]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setSearchQuery(localQuery);
      handleUnifiedEntry(localQuery, { fromGrid: true });
    }
  }, [localQuery, setSearchQuery, handleUnifiedEntry]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    setSearchQuery('');
    if (barcodeInputRef?.current) {
      barcodeInputRef.current.focus();
    }
  }, [setSearchQuery, barcodeInputRef]);

  return (
    <div className="relative w-full shadow-sm rounded-xl bg-white border border-amber-400 overflow-hidden focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400 transition-all">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-amber-500" />
      </div>
      <input
        ref={barcodeInputRef}
        type="text"
        placeholder={placeholder}
        value={localQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full h-12 pl-12 pr-12 text-sm font-semibold text-slate-800 placeholder:text-slate-400 bg-transparent border-none focus:outline-none focus:ring-0"
      />
      
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
          title="Clear search"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
});

TradeSearchBar.displayName = 'TradeSearchBar';

