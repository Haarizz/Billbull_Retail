import { useCallback, useEffect, useRef, useState } from 'react';
import { getSalesPaymentsByInvoice } from '../api/salesPaymentApi';
import { receiptVoucherApi } from '../api/receiptVoucherApi';

// Fetches + merges every payment tied to a sales invoice (sales payments +
// standalone receipt vouchers, deduped against auto-created RVs), sorted
// newest-first. Extracted from SalesInvoice.jsx's handleViewReceipts so the
// Receipts modal and the Transaction Preview page's Payment History section
// share one implementation instead of two.
export async function fetchInvoicePaymentHistory(invoice) {
    if (!invoice) return [];

    const [salesPayments, allReceiptVouchers] = await Promise.all([
        getSalesPaymentsByInvoice(invoice.invoiceNumber).catch(() => []),
        receiptVoucherApi.getAll().catch(() => [])
    ]);

    const paymentRows = (salesPayments || []).map((p) => ({
        key: `sp-${p.id}`,
        dbId: p.id,
        source: 'SALES_PAYMENT',
        sourceLabel: 'Sales Payment',
        receiptNumber: p.paymentNumber || `RV-SP-${p.id}`,
        date: p.paymentDate,
        customerName: p.customerName || invoice.customerName,
        amount: Number(p.amount || 0),
        mode: p.paymentMode || 'Cash',
        reference: p.referenceNumber || '',
        bankName: p.bankName || '',
        status: p.status || 'Completed',
        notes: p.notes || '',
        receivedBy: p.receivedBy || p.createdBy || null,
        raw: p
    }));

    // Exclude receipt vouchers that were auto-created by a sales payment
    // (PaymentService.upsertReceiptVoucher stores the RV id in receiptVoucherRecordId)
    const autoCreatedRvIds = new Set(
        (salesPayments || []).map(p => p.receiptVoucherRecordId).filter(Boolean)
    );

    const rvRows = (allReceiptVouchers || [])
        .filter((rv) => Number(rv.salesInvoiceId) === Number(invoice.id) && !autoCreatedRvIds.has(rv.id))
        .map((rv) => ({
            key: `rv-${rv.id}`,
            dbId: rv.id,
            source: 'RECEIPT_VOUCHER',
            sourceLabel: 'Receipt Voucher',
            receiptNumber: rv.voucherId || `RV-${rv.id}`,
            date: rv.date,
            customerName: rv.memberName || invoice.customerName,
            amount: Number(rv.amount || 0),
            mode: rv.paymentMode || 'Cash',
            reference: rv.reference || rv.chequeRef || '',
            bankName: rv.depositAccount || rv.bankName || '',
            branchId: rv.branchId || invoice.branchId,
            status: rv.status || 'Completed',
            notes: rv.notes || '',
            purpose: rv.purpose,
            receivedBy: rv.createdBy || null,
            raw: rv
        }));

    return [...paymentRows, ...rvRows].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
    });
}

// invoice: the fetched invoice object (or null while not yet loaded).
// Fires automatically whenever invoice.id changes; call refetch() to re-run manually.
export function useInvoicePaymentHistory(invoice) {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);

    const load = useCallback(async () => {
        if (!invoice) {
            setPayments([]);
            return;
        }
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchInvoicePaymentHistory(invoice);
            if (requestIdRef.current === requestId) setPayments(rows);
        } catch (err) {
            if (requestIdRef.current === requestId) setError(err);
        } finally {
            if (requestIdRef.current === requestId) setLoading(false);
        }
    }, [invoice]);

    useEffect(() => {
        load();
    }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return { payments, loading, error, refetch: load };
}
