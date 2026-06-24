import React from 'react';

// Fast typeahead for large customer lists — never renders all items at once
const CustomerPicker = React.memo(({ customers, value, onChange, placeholder = 'Type name, code or phone…' }) => {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  const selected = React.useMemo(() => customers.find(c => c.id === value) || null, [customers, value]);

  const results = React.useMemo(() => {
    const lq = q.trim().toLowerCase();
    if (!lq) return customers.slice(0, 10);
    return customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(lq)) ||
      (c.code && c.code.toLowerCase().includes(lq)) ||
      (c.phone && String(c.phone).includes(lq))
    ).slice(0, 12);
  }, [customers, q]);

  React.useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div
        className="w-full h-10 px-3 flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#327F74]/30 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected && !open ? (
          <>
            <span className="flex-1 text-sm font-medium text-[#1E293B] truncate">{selected.name}</span>
            <button
              className="ml-2 text-gray-400 hover:text-gray-600 text-xs"
              onClick={e => { e.stopPropagation(); onChange(null); setQ(''); }}
            >
              ✕
            </button>
          </>
        ) : (
          <input
            type="text"
            autoFocus={open}
            className="flex-1 text-sm outline-none bg-transparent"
            placeholder={placeholder}
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
          />
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {results.length === 0
              ? <div className="px-3 py-4 text-sm text-gray-400 text-center">No customers found</div>
              : results.map(c => (
                <button
                  key={c.id}
                  className="w-full px-3 py-2.5 text-left hover:bg-[#F7F7FA] flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onChange(c.id); setQ(''); setOpen(false); }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#1E293B] truncate">{c.name}</div>
                    {c.code && <div className="text-xs text-gray-400 font-mono">{c.code}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                    {(c.balance || 0) > 0 && (
                      <div className="text-xs font-semibold text-orange-500">
                        Bal: {(c.balance || 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                </button>
              ))
            }
          </div>
          {!q.trim() && customers.length > 10 && (
            <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
              Showing 10 of {customers.length} — type to search
            </div>
          )}
        </div>
      )}
    </div>
  );
});

CustomerPicker.displayName = 'CustomerPicker';

export default CustomerPicker;
