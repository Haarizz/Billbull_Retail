import { useCallback, useEffect, useRef, useState } from 'react';
import { getLpoPaymentVouchers } from '../api/lpoApi';

// Fetches the advance payment vouchers tied to an LPO (by its numeric dbId) and
// maps them into the row shape PaymentHistorySection consumes — shared with the
// sales previews, so the LPO "Advance Payments" tab renders identically.
export async function fetchLpoAdvances(lpo) {
    const dbId = lpo?.dbId ?? lpo?.id;
    if (!dbId) return [];
    const vouchers = await getLpoPaymentVouchers(dbId).catch(() => []);

    return (vouchers || [])
        .map((v) => ({
            key: `pv-${v.id}`,
            dbId: v.id,
            source: 'PAYMENT_VOUCHER',
            sourceLabel: 'Payment Voucher',
            receiptNumber: v.voucherId || v.voucherNumber || `PV-${v.id}`,
            date: v.date || v.paymentDate,
            customerName: v.vendorName || lpo.vendorName,
            amount: Number(v.amount || 0),
            mode: v.paymentMode || 'Bank Transfer',
            reference: v.reference || v.chequeRef || '',
            bankName: v.bankAccount || v.depositAccount || v.bankName || '',
            status: v.status || 'Completed',
            notes: v.notes || '',
            receivedBy: v.createdBy || v.paidBy || null,
            paidBy: v.createdBy || v.paidBy || null,
            raw: v,
        }))
        .sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
        });
}

export function useLpoAdvances(lpo) {
    const [advances, setAdvances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);

    const load = useCallback(async () => {
        if (!lpo) { setAdvances([]); return; }
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchLpoAdvances(lpo);
            if (requestIdRef.current === requestId) setAdvances(rows);
        } catch (err) {
            if (requestIdRef.current === requestId) setError(err);
        } finally {
            if (requestIdRef.current === requestId) setLoading(false);
        }
    }, [lpo]);

    useEffect(() => { load(); }, [lpo?.dbId, lpo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return { advances, loading, error, refetch: load };
}
