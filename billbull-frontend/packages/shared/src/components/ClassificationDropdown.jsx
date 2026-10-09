import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check, Plus, Loader2 } from 'lucide-react';

/**
 * ClassificationDropdown
 *
 * Searchable dropdown with an inline "➕ Create New" option.
 *
 * Props:
 *   options       – [{ value, label }]
 *   value         – currently selected value
 *   onChange(v)   – called when an existing item is picked
 *   onCreateNew(name) – called when user clicks the inline create row;
 *                       parent is responsible for the API call and updating options.
 *   placeholder   – trigger placeholder text
 *   disabled      – bool
 *   creating      – bool  show spinner while parent is saving the new item
 *   noCreateMsg   – custom string shown instead of "No results" when onCreateNew absent
 */
const ClassificationDropdown = ({
  options = [],
  value,
  onChange,
  onCreateNew,
  placeholder = 'Select...',
  disabled = false,
  creating = false,
  noCreateMsg = 'No results found',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-focus search when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  const trimmed = searchTerm.trim();

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(trimmed.toLowerCase())
  );

  const selectedOption = options.find((o) => String(o.value) === String(value));

  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase()
  );
  const showCreateRow = !!onCreateNew && !!trimmed && !hasExactMatch;

  const handleOpen = () => {
    if (!disabled) setIsOpen((v) => !v);
  };

  const handleSelect = (opt) => {
    onChange(opt.value);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const handleCreate = () => {
    if (creating || !trimmed) return;
    onCreateNew(trimmed);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* ── Trigger ── */}
      <div
        onClick={handleOpen}
        className={[
          'w-full border rounded-md py-2 px-3 bg-white flex items-center justify-between transition-colors',
          disabled
            ? 'bg-slate-50 cursor-not-allowed text-slate-400'
            : 'cursor-pointer hover:border-slate-300',
          isOpen
            ? 'border-[#F5C742] ring-1 ring-[#F5C742]'
            : 'border-slate-200',
        ].join(' ')}
      >
        <span
          className={`text-sm truncate ${
            selectedOption ? 'text-slate-900' : 'text-slate-400'
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {/* ── Dropdown panel ── */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 flex flex-col animate-in fade-in zoom-in-95 duration-100">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreateRow) handleCreate();
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchTerm('');
                  }
                }}
                placeholder={
                  onCreateNew ? 'Search or type to create…' : 'Search…'
                }
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt)}
                  className={[
                    'px-3 py-2 text-sm cursor-pointer flex items-center gap-2 hover:bg-slate-50',
                    isSelected
                      ? 'bg-yellow-50 text-slate-900 font-medium'
                      : 'text-slate-700',
                  ].join(' ')}
                >
                  {isSelected ? (
                    <Check size={13} className="text-[#F5C742] shrink-0" />
                  ) : (
                    <span className="w-[13px] shrink-0" />
                  )}
                  {opt.label}
                </div>
              );
            })}

            {filtered.length === 0 && !showCreateRow && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                {noCreateMsg}
              </div>
            )}

            {/* ── Inline Create Row ── */}
            {showCreateRow && (
              <div
                onClick={handleCreate}
                className={[
                  'px-3 py-2.5 text-sm flex items-center gap-2 border-t border-dashed border-slate-200',
                  creating
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-[#F5C742] hover:bg-yellow-50 cursor-pointer font-medium',
                ].join(' ')}
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Plus size={14} className="shrink-0" />
                )}
                <span>
                  {creating ? 'Creating…' : `Create "${trimmed}"`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassificationDropdown;
