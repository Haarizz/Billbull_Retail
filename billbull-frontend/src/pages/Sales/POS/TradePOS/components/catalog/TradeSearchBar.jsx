import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { TradeInput } from '../ui/TradeInput';

export const TradeSearchBar = React.memo(({
  searchQuery,
  setSearchQuery,
  handleUnifiedEntry,
  barcodeInputRef,
  placeholder = "Search products or scan barcode..."
}) => {
  // Local state for immediate typing feedback
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const typingTimeoutRef = useRef(null);

  // Sync incoming props (if cleared from outside)
  useEffect(() => {
    if (searchQuery !== localQuery) {
      setLocalQuery(searchQuery || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setLocalQuery(value);

    // Debounce the actual global state update by 150ms to prevent heavy re-renders
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
      // Cancel debounce since we are submitting now
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
    <div className="relative w-full">
      <TradeInput
        ref={barcodeInputRef}
        type="text"
        placeholder={placeholder}
        value={localQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        icon={<Search className="w-5 h-5" />}
        iconPosition="left"
        className="w-full pr-10" // Make room for clear button
      />
      
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          title="Clear search"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
});

TradeSearchBar.displayName = 'TradeSearchBar';
