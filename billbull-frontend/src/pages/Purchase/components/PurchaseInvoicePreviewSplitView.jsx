import React, { useEffect, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import PurchaseInvoiceCardList from './PurchaseInvoiceCardList';
import PurchaseInvoicePreview from './PurchaseInvoicePreview';

// Purchase Invoice Transaction Preview page: persistent invoice switcher +
// read-only preview. Invoices are keyed by their numeric backend id (dbId).
export default function PurchaseInvoicePreviewSplitView({
    invoices,
    previewInvoiceDbId,
    onSelectInvoice,
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

    const selectedInvoice = invoices?.find((i) => i.dbId === previewInvoiceDbId);

    const handleSelect = (inv) => {
        onSelectInvoice(inv);
        setDrawerOpen(false);
    };

    const listNode = (
        <PurchaseInvoiceCardList
            invoices={invoices}
            selectedDbId={previewInvoiceDbId}
            onSelect={handleSelect}
            currency={previewProps.invoiceCurrency}
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
                Browse invoices
                {selectedInvoice && <span className="text-slate-400 font-normal">· {selectedInvoice.id}</span>}
            </button>

            <div className="grid lg:grid-cols-[minmax(260px,300px)_1fr] xl:grid-cols-[minmax(300px,340px)_1fr] gap-4 items-start">
                <div className="hidden lg:block lg:sticky lg:top-24">
                    {listNode}
                </div>

                <div className="min-w-0">
                    <PurchaseInvoicePreview invoiceId={previewInvoiceDbId} {...previewProps} />
                </div>
            </div>

            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex">
                    <button
                        type="button"
                        aria-label="Close invoice list"
                        onClick={() => setDrawerOpen(false)}
                        className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-150"
                    />
                    <div
                        role="dialog"
                        aria-label="Purchase Invoices"
                        className="relative w-[85%] max-w-sm h-full bg-slate-50 shadow-xl flex flex-col animate-in slide-in-from-left duration-200"
                    >
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 bg-white shrink-0">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Purchase Invoices</span>
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
