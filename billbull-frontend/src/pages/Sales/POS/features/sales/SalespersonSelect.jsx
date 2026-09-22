import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

/**
 * POS salesperson picker — a sale-level attribute, deliberately NOT an action-grid button.
 *
 * Keys on the employee id (the salesperson is resolved server-side by id, with employee code as a
 * fallback), unlike DeliveryPersonSelect which keys on employeeCode. Modelled on that component's
 * interaction behaviour — searchable combobox, keyboard nav, click-away, clear — but kept as a
 * separate file so the delivery flow is untouched.
 */
function SalespersonSelect({
  options = [],
  value,
  onChange,
  loading = false,
  error = '',
  placeholder = 'Unassigned',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef(null);

  const selected = useMemo(
    () => options.find(person => String(person.id) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    // Name and employee code only — the salesperson feed deliberately carries no personal data.
    return options.filter(person => [
      person.name,
      person.employeeCode,
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

  // Clamped during render rather than reset from an effect: the index only ever needs to be
  // valid for the CURRENT filtered list, and doing it here avoids a cascading setState-in-effect.
  const activeIndex = Math.min(highlighted, Math.max(filtered.length - 1, 0));

  const commitSelection = (person) => {
    if (!person) return;
    onChange(person.id);
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
      setHighlighted(Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commitSelection(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center border rounded-lg bg-white overflow-hidden focus-within:border-[#327F74] ${error ? 'border-red-300' : 'border-gray-200'}`}>
        <Search className={`text-gray-400 ml-2 shrink-0 ${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
        <input
          type="text"
          value={open ? search : (selected ? selected.name : '')}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setSearch(event.target.value); setHighlighted(0); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading salespersons...' : placeholder}
          aria-label="Salesperson"
          className={`flex-1 min-w-0 px-2 focus:outline-none ${compact ? 'py-1 text-[11px]' : 'py-2 text-sm'}`}
          role="combobox"
          aria-expanded={open}
        />
        {selected && (
          <button
            type="button"
            onClick={() => { onChange(null); setSearch(''); setOpen(false); }}
            className="p-1.5 text-gray-400 hover:text-gray-700"
            aria-label="Clear salesperson"
          >
            <X className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="p-1.5 text-gray-400 hover:text-gray-700"
          aria-label="Open salesperson list"
        >
          <ChevronDown className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-3 text-xs text-gray-500">Loading salespersons...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500">No active employees found</div>
          ) : filtered.map((person, index) => (
            <button
              type="button"
              key={person.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitSelection(person)}
              className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-emerald-50 ${index === activeIndex ? 'bg-emerald-50' : 'bg-white'}`}
            >
              <div className="text-sm font-semibold text-gray-900 truncate">{person.name || 'Unnamed employee'}</div>
              <div className="text-xs text-gray-500">{person.employeeCode || '-'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SalespersonSelect;
