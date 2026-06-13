import React, { useState, useRef, useEffect } from 'react';
import {
    Download,
    FileText,
    FileSpreadsheet,
    Printer,
    ChevronDown,
    FileDown,
} from 'lucide-react';

/**
 * A branded export dropdown for report pages.
 *
 * Props:
 *   onExportPdf    () => void   — export to PDF
 *   onExportExcel  () => void   — export to Excel (.xlsx)
 *   onPrint        () => void   — open print dialog
 *   onDownload     () => void   — download as CSV (optional)
 *   disabled       boolean      — disable the button
 *   className      string       — extra classes for the trigger button
 */
const ExportDropdown = ({
    onExportPdf,
    onExportExcel,
    onPrint,
    onDownload,
    disabled = false,
    className = '',
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, []);

    const close = (fn) => () => {
        setOpen(false);
        fn?.();
    };

    return (
        <div ref={ref} className="relative inline-block">
            {/* Trigger button */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen((v) => !v)}
                className={[
                    'inline-flex items-center gap-1.5 px-3 py-1.5',
                    'text-[11px] font-medium text-slate-600',
                    'bg-white border border-slate-200 rounded-md shadow-sm',
                    'hover:bg-[#FFF8E7] hover:border-[#FDE6A9] hover:text-slate-800',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors duration-150',
                    className,
                ].join(' ')}
            >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                Export
                <ChevronDown
                    className={`h-3 w-3 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className="absolute right-0 bottom-full mb-1.5 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-200 overflow-hidden">
                    {/* PDF */}
                    <MenuItem
                        icon={<FileText className="h-3.5 w-3.5 text-red-500" />}
                        label="PDF (.pdf)"
                        onClick={close(onExportPdf)}
                    />

                    {/* Excel */}
                    <MenuItem
                        icon={<FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
                        label="Excel (.xlsx)"
                        onClick={close(onExportExcel)}
                    />

                    {/* Print */}
                    <MenuItem
                        icon={<Printer className="h-3.5 w-3.5 text-blue-500" />}
                        label="Print"
                        onClick={close(onPrint)}
                    />

                    {/* Download (CSV) — shown only when handler provided */}
                    {onDownload && (
                        <>
                            <div className="my-0.5 mx-2 border-t border-slate-100" />
                            <MenuItem
                                icon={<FileDown className="h-3.5 w-3.5 text-slate-500" />}
                                label="Download (.csv)"
                                onClick={close(onDownload)}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

function MenuItem({ icon, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-[#FFF8E7] transition-colors duration-100 text-left"
        >
            {icon}
            {label}
        </button>
    );
}

export default ExportDropdown;
