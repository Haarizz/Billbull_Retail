import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Package } from 'lucide-react';

const SearchableDropdown = ({
    options = [],
    value,
    onChange,
    placeholder = "Select...",
    className = "",
    disabled = false,
    label, // Optional label to display inside the selected state if needed
    menuPlacement = "bottom",
    menuZIndexClass = "z-50"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [openUpward, setOpenUpward] = useState(false);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

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

        return () => {
            window.removeEventListener('resize', updateDirection);
        };
    }, [isOpen, menuPlacement]);

    // Filter options based on search term
    const filteredOptions = options.filter(option => {
        const term = searchTerm.toLowerCase();
        return (
            (option.label && option.label.toLowerCase().includes(term)) ||
            (option.subtitle && option.subtitle.toLowerCase().includes(term)) ||
            (option.barcode && option.barcode.toLowerCase().includes(term)) ||
            (option.sku && option.sku.toLowerCase().includes(term)) ||
            (option.code && option.code.toLowerCase().includes(term))
        );
    });

    const selectedOption = options.find(option => option.value === value);
    const hasValue = value !== undefined && value !== null && `${value}`.trim() !== '';
    const selectedLabel = selectedOption
        ? (selectedOption.displayLabel || selectedOption.label)
        : (hasValue ? `${value}` : placeholder);

    const handleSelect = (option) => {
        onChange(option.value);
        setIsOpen(false);
        setSearchTerm('');
    };

    const clearSelection = (e) => {
        e.stopPropagation();
        onChange('');
        setIsOpen(false);
    };

    return (
        <div className={`relative overflow-visible ${className}`} ref={dropdownRef}>
            <div
                className={`w-full border rounded-md py-2 px-3 bg-white flex items-center justify-between cursor-pointer ${disabled ? 'bg-slate-50 cursor-not-allowed text-slate-500' : 'hover:border-slate-300'
                    } ${isOpen ? 'ring-1 ring-[#F5C742] border-[#F5C742]' : 'border-slate-200'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={`text-sm truncate ${hasValue ? 'text-slate-900' : 'text-slate-400'}`}>
                    {selectedLabel}
                </span>
                <div className="flex items-center gap-1">
                    {hasValue && !disabled && (
                        <div
                            onClick={clearSelection}
                            className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={14} />
                        </div>
                    )}
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {isOpen && !disabled && (
                <div className={`absolute left-0 ${menuZIndexClass} w-full min-w-[280px] bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#F5C742]"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.value}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${option.value === value ? 'bg-yellow-50 text-slate-900 font-medium' : 'text-slate-700'
                                        } ${option.image !== undefined ? 'border-b border-slate-50 last:border-0' : ''}`}
                                    onClick={() => handleSelect(option)}
                                >
                                    {option.image !== undefined ? (
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 shrink-0 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center overflow-hidden">
                                                {option.image ? (
                                                    <img
                                                        src={option.image.startsWith('data:') || option.image.startsWith('http') ? option.image : `data:image/jpeg;base64,${option.image}`}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.parentNode.classList.add('bg-slate-50');
                                                            // Show package icon sibling if possible, or just hide image
                                                            e.target.parentNode.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-300"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22v-10"></path></svg>';
                                                        }}
                                                    />
                                                ) : (
                                                    <Package size={20} className="text-slate-300" />
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-bold text-sm text-slate-900 leading-tight">{option.label}</span>
                                                <span className="text-xs text-slate-500 leading-tight block">{option.subtitle}</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {option.sku && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                            SKU: {option.sku}
                                                        </span>
                                                    )}
                                                    {option.barcode && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                            Bar: {option.barcode}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        option.label
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-4 text-center text-xs text-slate-500">
                                No results found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
