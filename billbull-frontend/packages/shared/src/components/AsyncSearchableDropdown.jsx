import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Loader2, AlertCircle } from 'lucide-react';

const AsyncSearchableDropdown = ({
    value,
    onChange,
    onSelect,
    inputValue,
    onInputChange,
    fetchOptions,
    renderOption,
    placeholder = "Search...",
    className = "",
    disabled = false,
    debounceMs = 300,
    menuPlacement = "bottom",
    menuZIndexClass = "z-[100]"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [internalSearchTerm, setInternalSearchTerm] = useState('');
    const searchTerm = inputValue !== undefined ? inputValue : internalSearchTerm;
    
    const handleSearchChange = (val) => {
        if (inputValue === undefined) setInternalSearchTerm(val);
        if (onInputChange) onInputChange(val);
    };

    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [openUpward, setOpenUpward] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const debounceTimerRef = useRef(null);
    const listRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Menu direction logic
    useEffect(() => {
        if (!isOpen) return;

        if (menuPlacement === "top") {
            setOpenUpward(true);
            return;
        }

        if (menuPlacement !== "auto" || !dropdownRef.current) {
            setOpenUpward(false);
            return;
        }

        const updateDirection = () => {
            const rect = dropdownRef.current.getBoundingClientRect();
            const estimatedMenuHeight = 280;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
        };

        updateDirection();
        window.addEventListener('resize', updateDirection);
        return () => window.removeEventListener('resize', updateDirection);
    }, [isOpen, menuPlacement]);

    // Async Fetching with Debounce
    useEffect(() => {
        if (!isOpen) return;

        const fetchResults = async () => {
            setLoading(true);
            setError(null);
            try {
                const results = await fetchOptions(searchTerm);
                setOptions(results || []);
            } catch (err) {
                setError('Failed to fetch results');
                setOptions([]);
            } finally {
                setLoading(false);
            }
        };

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        
        // Immediate fetch if empty or fast barcode scan
        debounceTimerRef.current = setTimeout(fetchResults, debounceMs);
        
        return () => clearTimeout(debounceTimerRef.current);
    }, [searchTerm, isOpen]);

    // Reset selected index when options change
    useEffect(() => {
        setSelectedIndex(-1);
    }, [options]);

    // Keyboard Navigation
    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
                scrollIntoView(selectedIndex + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
                scrollIntoView(selectedIndex - 1);
                break;
            case 'Enter':
                e.preventDefault();
                if (options.length === 1 && selectedIndex === -1) {
                    handleSelect(options[0]);
                } else if (selectedIndex >= 0 && selectedIndex < options.length) {
                    handleSelect(options[selectedIndex]);
                } else if (options.length > 0) {
                    handleSelect(options[0]); // fallback to first option for quick barcode scans
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                inputRef.current?.blur();
                break;
            default:
                break;
        }
    };

    const scrollIntoView = (index) => {
        if (!listRef.current || index < 0 || index >= options.length) return;
        const item = listRef.current.children[index];
        if (item) {
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleSelect = (option) => {
        if (onChange) onChange(option);
        if (onSelect) onSelect(option);
        setIsOpen(false);
        handleSearchChange(option ? (option.label || option.name || option.code || option.batchNumber || option.invoiceNumber || '') : '');
    };

    const clearSelection = (e) => {
        e.stopPropagation();
        if (onChange) onChange(null);
        if (onSelect) onSelect(null);
        setIsOpen(false);
        handleSearchChange('');
    };

    return (
        <div className={`relative overflow-visible ${className}`} ref={dropdownRef} data-bb-skip-aed-symbol="true">
            <div
                className={`w-full border rounded-md py-2 px-3 bg-white flex items-center justify-between cursor-text ${disabled ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'hover:border-[#327F74]/50'} ${isOpen ? 'ring-1 ring-[#327F74] border-[#327F74]' : 'border-slate-200'}`}
                onClick={() => {
                    if (!disabled) {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 10);
                    }
                }}
            >
                {!isOpen ? (
                    <span className={`text-sm truncate ${value ? 'text-slate-900 font-medium' : searchTerm ? 'text-slate-900' : 'text-slate-400'}`}>
                        {value ? (value.label || value.id || 'Selected') : searchTerm ? searchTerm : placeholder}
                    </span>
                ) : (
                    <input
                        ref={inputRef}
                        type="text"
                        className="w-full text-sm bg-transparent focus:outline-none"
                        placeholder={placeholder}
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                )}
                
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {loading && <Loader2 className="w-3.5 h-3.5 text-[#327F74] animate-spin" />}
                    {value && !disabled && !isOpen && (
                        <div
                            onClick={clearSelection}
                            className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        >
                            <X size={14} />
                        </div>
                    )}
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''} cursor-pointer`} onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} />
                </div>
            </div>

            {isOpen && !disabled && (
                <div className={`absolute left-0 ${menuZIndexClass} w-full min-w-[320px] bg-white border border-slate-200 rounded-lg shadow-xl max-h-[300px] flex flex-col animate-in fade-in zoom-in-95 duration-100 ${openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
                    
                    <div ref={listRef} className="overflow-y-auto flex-1 p-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                        {loading && options.length === 0 ? (
                            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                                <Loader2 className="w-5 h-5 animate-spin text-[#327F74]" />
                                <span className="text-xs font-medium">Searching...</span>
                            </div>
                        ) : error ? (
                            <div className="py-6 flex flex-col items-center justify-center text-red-400 gap-2">
                                <AlertCircle className="w-6 h-6" />
                                <span className="text-xs font-medium">{error}</span>
                            </div>
                        ) : options.length > 0 ? (
                            options.map((option, index) => (
                                <div
                                    key={option.id || index}
                                    className={`cursor-pointer rounded-md transition-colors ${
                                        index === selectedIndex ? 'bg-[#327F74]/10 ring-1 ring-[#327F74]/30' : 'hover:bg-slate-50'
                                    } ${value?.id === option.id ? 'bg-[#327F74]/5' : ''}`}
                                    onClick={() => handleSelect(option)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    {renderOption ? renderOption(option, index === selectedIndex) : (
                                        <div className="px-3 py-2 text-sm text-slate-700">
                                            {option.label || 'Option'}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="py-8 text-center text-xs font-medium text-slate-500 bg-slate-50/50 rounded-md">
                                {searchTerm ? 'No results found.' : 'Start typing to search...'}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AsyncSearchableDropdown;
