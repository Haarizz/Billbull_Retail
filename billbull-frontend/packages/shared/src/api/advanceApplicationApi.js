import api from './axiosConfig';

const BASE_PATH = '/api/sales/advance-applications';

export const getOpenAdvances = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/open-advances`);
    return res.data;
};

export const applyAdvance = async ({ advanceReceiptId, invoiceNumber, amount, appliedDate }) => {
    const res = await api.post(`${BASE_PATH}/apply`, {
        advanceReceiptId,
        invoiceNumber,
        amount,
        appliedDate,
    });
    return res.data;
};

export const hasAdvanceHistory = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/has-history`);
    return res.data?.hasHistory === true;
};

export const applyAdvanceAgainstOutstanding = async ({ customerCode, advanceReceiptId }) => {
    const res = await api.post(`${BASE_PATH}/apply-against-outstanding`, { customerCode, advanceReceiptId });
    return res.data;
};

export const getAdvanceSummary = async (customerCode) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/summary`);
    return res.data;
};

export const getAdvanceHistory = async (customerCode, filter) => {
    const res = await api.get(`${BASE_PATH}/customer/${encodeURIComponent(customerCode)}/history`, {
        params: filter && filter !== 'All' ? { filter } : {}
    });
    return res.data;
};

/**
 * @param {number|null} posSessionId  the POS drawer session that physically took the cash.
 *   Replaces the previous `terminalId`: the server no longer resolves the session from a
 *   terminal (that inferred the drawer, and silently produced an unattributed advance when no
 *   session was open) -- the caller now states it and the server validates it. Omit for a
 *   genuine back-office advance that never passes through a till.
 *
 *   A request still carrying the old `terminalId` field is rejected by the server with a
 *   reload prompt, never silently ignored.
 */
export const receiveAdvance = async ({ customerCode, amount, paymentMode, reference, posSessionId = null, memberName = null, notes = null }) => {
    const res = await api.post(`${BASE_PATH}/receive`, {
        customerCode,
        amount,
        paymentMode,
        reference,
        posSessionId,
        memberName,
        notes
    });
    return res.data;
};

/**
 * @param {string|null} cashSource  where the notes come from for a CASH refund:
 *   'POS_DRAWER' (paid from a till — must also send posSessionId; books a drawer cash-out) or
 *   'BACK_OFFICE' (paid from the office safe — books no drawer movement and takes no part in
 *   POS reconciliation). Required for cash; the server rejects a cash refund that declares
 *   neither, rather than guessing. Ignored for non-cash modes.
 * @param {number|null} posSessionId  the POS drawer session physically paying the cash out.
 *   Required for POS_DRAWER, and must be omitted for BACK_OFFICE. Never inferred server-side.
 */
export const refundAdvance = async ({ advanceReceiptId, amount, paymentMode, posSessionId = null, cashSource = null }) => {
    const res = await api.post(`${BASE_PATH}/refund`, {
        advanceReceiptId,
        amount,
        paymentMode,
        posSessionId,
        cashSource
    });
    return res.data;
};
