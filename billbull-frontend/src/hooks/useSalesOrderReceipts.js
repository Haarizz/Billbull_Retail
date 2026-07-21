import { useCallback, useEffect, useRef, useState } from 'react';
import { getSalesOrderReceiptVouchers } from '../api/salesorderApi';

// Fetches the advance receipt vouchers tied to a sales order and maps them into
// the same row shape PaymentHistorySection consumes (shared with the Sales
// Invoice preview), so the SO Transaction Preview's "Advance Payments" tab and
// the invoice payment history render identically.
export async function fetchSalesOrderReceipts(order) {
    if (!order?.id) return [];
    const vouchers = await getSalesOrderReceiptVouchers(order.id).catch(() => []);

    return (vouchers || [])
        .map((rv) => ({
            key: `rv-${rv.id}`,
            dbId: rv.id,
            source: 'RECEIPT_VOUCHER',
            sourceLabel: 'Advance Receipt',
            receiptNumber: rv.voucherId || `RV-${rv.id}`,
            date: rv.date,
            customerName: rv.memberName || order.customerName,
            amount: Number(rv.amount || 0),
            mode: rv.paymentMode || 'Cash',
            reference: rv.reference || rv.chequeRef || '',
            bankName: rv.bankAccount || rv.depositAccount || rv.bankName || '',
            branchId: rv.branchId || order.branchId,
            status: rv.status || 'Completed',
            notes: rv.notes || '',
            purpose: rv.purpose,
            receivedBy: rv.createdBy || null,
            raw: rv,
        }))
        .sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
        });
}

// order: the fetched sales order object (or null while not yet loaded).
// Fires automatically whenever order.id changes; call refetch() to re-run.
export function useSalesOrderReceipts(order) {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);

    const load = useCallback(async () => {
        if (!order) {
            setReceipts([]);
            return;
        }
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchSalesOrderReceipts(order);
            if (requestIdRef.current === requestId) setReceipts(rows);
        } catch (err) {
            if (requestIdRef.current === requestId) setError(err);
        } finally {
            if (requestIdRef.current === requestId) setLoading(false);
        }
    }, [order]);

    useEffect(() => {
        load();
    }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return { receipts, loading, error, refetch: load };
}
