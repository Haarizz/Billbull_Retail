import React, { useEffect, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import ProformaCardList from './ProformaCardList';
import ProformaPreview from './ProformaPreview';

// Proforma Invoice Transaction Preview page: persistent proforma switcher +
// read-only preview. Mirrors SalesOrderPreviewSplitView.
export default function ProformaPreviewSplitView({
    proformas,
    previewProformaId,
    onSelectProforma,
    listLoading,
    searchTerm,
    onSearchChange,
    ...previewProps
}) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        if (!drawerOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [drawerOpen]);

    const selectedPi = proformas?.find((p) => p.id === previewProformaId);

    const handleSelect = (pi) => {
        onSelectProforma(pi);
        setDrawerOpen(false);
    };

    const listNode = (
        <ProformaCardList
            proformas={proformas}
            selectedId={previewProformaId}
            onSelect={handleSelect}
            currency={previewProps.proformaCurrency}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            loading={listLoading}
        />
    );

    return (
        <div className="animate-in fade-in duration-200">
            <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden mb-3 inline-flex items-center gap-2 h-9 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm"
            >
                <ListFilter size={14} className="text-[#D99A00]" />
                Browse proformas
                {selectedPi && <span className="text-slate-400 font-normal">· {selectedPi.piNumber}</span>}
            </button>

            <div className="grid lg:grid-cols-[minmax(260px,300px)_1fr] xl:grid-cols-[minmax(300px,340px)_1fr] gap-4 items-start">
                <div className="hidden lg:block lg:sticky lg:top-24">
                    {listNode}
                </div>

                <div className="min-w-0">
                    <ProformaPreview proformaId={previewProformaId} {...previewProps} />
                </div>
            </div>

            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex">
                    <button
                        type="button"
                        aria-label="Close proforma list"
                        onClick={() => setDrawerOpen(false)}
                        className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-150"
                    />
                    <div
                        role="dialog"
                        aria-label="Proformas"
                        className="relative w-[85%] max-w-sm h-full bg-slate-50 shadow-xl flex flex-col animate-in slide-in-from-left duration-200"
                    >
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 bg-white shrink-0">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Proformas</span>
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Close"
                                className="h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden p-2">
                            {listNode}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
