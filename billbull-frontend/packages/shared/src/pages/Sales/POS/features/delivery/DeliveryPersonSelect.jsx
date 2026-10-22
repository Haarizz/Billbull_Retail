// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
// Behaviour is unchanged; only the location moved.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

function DeliveryPersonSelect({ options = [], value, onChange, loading = false, error = '' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef(null);

  const selected = useMemo(
    () => options.find(person => String(person.employeeCode) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(person => [
      person.name,
      person.employeeCode,
      person.phone,
    ].some(part => String(part || '').toLowerCase().includes(q)));
  }, [options, search]);

  useEffect(() => {
    const handleClickAway = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [search, options.length]);

  const commitSelection = (person) => {
    if (!person) return;
    onChange(person.employeeCode);
    setSearch('');
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commitSelection(filtered[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center border rounded-xl bg-white overflow-hidden focus-within:border-[#327F74] ${error ? 'border-red-300' : 'border-gray-200'}`}>
        <Search className="h-4 w-4 text-gray-400 ml-3 shrink-0" />
        <input
          type="text"
          value={open ? search : (selected ? `${selected.name} (${selected.employeeCode})` : '')}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading delivery persons...' : 'Search delivery person'}
          className="flex-1 min-w-0 px-2 py-2.5 text-sm focus:outline-none"
          role="combobox"
          aria-expanded={open}
        />
        {selected && (
          <button
            type="button"
            onClick={() => { onChange(''); setSearch(''); setOpen(false); }}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label="Clear delivery person"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="p-2 text-gray-400 hover:text-gray-700"
          aria-label="Open delivery person list"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-3 text-xs text-gray-500">Loading delivery persons...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500">No active delivery persons found</div>
          ) : filtered.map((person, index) => (
            <button
              type="button"
              key={person.employeeCode || person.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitSelection(person)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-emerald-50 ${index === highlighted ? 'bg-emerald-50' : 'bg-white'}`}
            >
              <div className="text-sm font-semibold text-gray-900 truncate">{person.name || 'Unnamed employee'}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>{person.employeeCode || '-'}</span>
                <span>{person.phone || '-'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeliveryPersonSelect;
