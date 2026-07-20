import React from 'react';
import InvoiceCardList from './InvoiceCardList';
import TransactionPreview from './TransactionPreview';

// Transaction Preview page: persistent two-column split — invoice switcher on the
// left, read-only preview on the right. The left list is fed by the parent's
// already-filtered `invoices` (no refetch); selecting a card just swaps the id the
// preview fetches, so switching invoices never leaves this view.
//
// Below `lg` the columns stack (list first, preview under it) rather than trying to
// squeeze two columns onto a tablet/phone.
export default function InvoicePreviewSplitView({
    invoices,
    previewInvoiceId,
    onSelectInvoice,
    listLoading,
    searchTerm,
    onSearchChange,
    ...previewProps
}) {
    return (
        <div className="grid lg:grid-cols-[minmax(300px,360px)_1fr] gap-4 items-start animate-in fade-in duration-200">
            <div className="lg:sticky lg:top-24">
                <InvoiceCardList
                    invoices={invoices}
                    selectedId={previewInvoiceId}
                    onSelect={onSelectInvoice}
                    currency={previewProps.invoiceCurrency}
                    searchTerm={searchTerm}
                    onSearchChange={onSearchChange}
                    loading={listLoading}
                />
            </div>

            <div className="min-w-0">
                <TransactionPreview invoiceId={previewInvoiceId} {...previewProps} />
            </div>
        </div>
    );
}
