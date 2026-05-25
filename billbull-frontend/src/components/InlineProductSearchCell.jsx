import React, { useEffect, useRef } from 'react';
import { Zap, Menu } from 'lucide-react';

/**
 * QA-FAST-ENTRY: Inline product-search input rendered inside empty item
 * rows. Typing the first character lifts the typed text to the parent
 * page and opens the shared ProductSelector with that string pre-filled.
 *
 * Props:
 *   value         – controlled text (parent owns it)
 *   onChange(t)   – fired on every keystroke (parent stores pending search)
 *   onOpenSelector(t) – fired once the user has typed AT LEAST one non-space
 *                       char; parent flips ProductSelector open with this text
 *                       seeded as initialSearch.
 *   isReadOnly    – disables typing (e.g. when the doc is in view-only mode)
 *   inputRef      – forwarded ref so the parent can focus this input when a
 *                   freshly-added empty row mounts.
 */
const InlineProductSearchCell = React.memo(({
    value = '',
    onChange,
    onOpenSelector,
    isReadOnly = false,
    inputRef,
}) => {
    const localRef = useRef(null);
    const ref = inputRef || localRef;
    // One-shot guard so we open the selector ONCE per typed sequence, not on
    // every keystroke (the selector also has its own search input that the
    // user keeps typing into after the modal opens).
    const openedRef = useRef(false);

    useEffect(() => {
        // If the parent clears the field (e.g. row reset), allow re-trigger.
        if (!value) openedRef.current = false;
    }, [value]);

    const handleChange = (e) => {
        const next = e.target.value;
        onChange?.(next);
        if (isReadOnly) return;
        if (!openedRef.current && next.trim().length > 0) {
            openedRef.current = true;
            onOpenSelector?.(next);
        }
    };

    const handleKeyDown = (e) => {
        if (isReadOnly) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (value.trim().length > 0) {
                openedRef.current = true;
                onOpenSelector?.(value);
            } else {
                // Empty Enter still opens the selector for browsing.
                onOpenSelector?.('');
            }
        }
    };

    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex items-center gap-2 flex-1 min-w-0 border border-yellow-300/70 bg-yellow-50/30 rounded-lg px-3 py-2 focus-within:border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-100 transition-all">
                <Zap size={14} className="text-yellow-500 shrink-0" />
                <input
                    ref={ref}
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type to search items… (Opens product browser)"
                    readOnly={isReadOnly}
                    className="w-full bg-transparent text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none disabled:opacity-50"
                />
            </div>
            <button
                type="button"
                onClick={() => !isReadOnly && onOpenSelector?.(value || '')}
                disabled={isReadOnly}
                title="Browse products"
                className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-yellow-400 transition-all shrink-0"
            >
                <Menu size={12} />
            </button>
        </div>
    );
});

export default InlineProductSearchCell;
