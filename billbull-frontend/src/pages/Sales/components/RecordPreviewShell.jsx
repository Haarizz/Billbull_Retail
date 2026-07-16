import React, { useEffect, useRef } from 'react';
import { ArrowLeft, RotateCcw, AlertTriangle, Lock, FileQuestion } from 'lucide-react';

// Generic, document-agnostic read-only "preview" layout shell, designed to
// render inside a fixed-width slide-over panel (not a full page): single
// stacked column — header, then summary card, then each main section in
// order — plus lazy-section skeleton/error scaffolding and the
// loading/not-found/forbidden/error states.
//
// Document-specific content (header, customer info, items table, status
// rules, etc.) is composed by the caller and passed in as props/children —
// this component has zero knowledge of "invoice"-shaped data, so a future
// Quotation/SalesOrder/PurchaseInvoice preview can reuse it directly.
export default function RecordPreviewShell({
    loadState = 'loading', // 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error'
    onBack,
    onRetry,
    headerContent,
    summaryContent,
    mainSections = [], // [{ key, content }]
    mobileActionBar, // node rendered in the fixed bottom bar on mobile
}) {
    const headingRef = useRef(null);

    useEffect(() => {
        if (loadState === 'ready' && headingRef.current) {
            headingRef.current.focus();
        }
    }, [loadState]);

    if (loadState === 'loading') {
        return (
            <div className="p-4 md:p-6 space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
                <div className="h-20 bg-slate-100 rounded-xl border border-slate-200" />
                <div className="h-32 bg-slate-100 rounded-xl border border-slate-200" />
                <div className="h-40 bg-slate-100 rounded-xl border border-slate-200" />
                <div className="h-64 bg-slate-100 rounded-xl border border-slate-200" />
            </div>
        );
    }

    if (loadState === 'not-found' || loadState === 'forbidden' || loadState === 'error') {
        const config = {
            'not-found': {
                icon: FileQuestion,
                title: 'Record not found',
                message: 'This record could not be found. It may have been deleted.',
                showRetry: false,
            },
            forbidden: {
                icon: Lock,
                title: 'Access denied',
                message: "You don't have permission to view this record.",
                showRetry: false,
            },
            error: {
                icon: AlertTriangle,
                title: 'Something went wrong',
                message: 'This record could not be loaded. Please try again.',
                showRetry: true,
            },
        }[loadState];
        const Icon = config.icon;
        return (
            <div className="p-4 md:p-6 flex flex-col items-center justify-center text-center py-20 px-4 bg-white border border-slate-200 rounded-xl m-4 md:m-6">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <Icon size={22} className="text-slate-400" />
                </div>
                <h2 className="text-base font-bold text-slate-800 mb-1">{config.title}</h2>
                <p className="text-sm text-slate-500 mb-5 max-w-sm">{config.message}</p>
                <div className="flex items-center gap-2">
                    {config.showRetry && onRetry && (
                        <button
                            onClick={onRetry}
                            className="h-9 px-4 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 text-sm font-medium"
                        >
                            <RotateCcw size={14} /> Retry
                        </button>
                    )}
                    <button
                        onClick={onBack}
                        className="h-9 px-4 rounded-md bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 flex items-center gap-1.5 text-sm font-bold"
                    >
                        <ArrowLeft size={14} /> Back to List
                    </button>
                </div>
            </div>
        );
    }

    // Single stacked column, sized for a slide-over panel: header, then the
    // summary card (net/paid/balance + quick actions), then each main
    // section in the order the caller supplied.
    return (
        <div className="p-4 md:p-6 space-y-4 pb-24 md:pb-6 animate-in fade-in duration-200">
            <h1 ref={headingRef} tabIndex={-1} className="sr-only">Transaction Preview</h1>
            {headerContent}
            {summaryContent}
            {mainSections.map((section) => (
                <div key={section.key}>{section.content}</div>
            ))}

            {mobileActionBar && (
                <div
                    className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-3 py-2"
                    style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
                >
                    {mobileActionBar}
                </div>
            )}
        </div>
    );
}
