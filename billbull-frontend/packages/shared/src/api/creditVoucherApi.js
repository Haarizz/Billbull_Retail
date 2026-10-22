import api from "./axiosConfig";

const BASE_URL = "/api/sales/vouchers";

/**
 * Credit Voucher API — store credit issued by a Sales Return and redeemed at the till.
 *
 * A voucher is a payment instrument, not a coupon: it pays for a sale at full price by
 * drawing down a liability, rather than discounting it. Redemption deliberately has no
 * endpoint here — it happens inside POS checkout as a VOUCHER payment allocation, so a
 * voucher can never be spent without a sale to attach it to.
 */

/**
 * Resolves a scanned barcode, typed code, or voucher number to a voucher.
 *
 * Read-only — it reserves nothing and decrements nothing, so a cashier may check a balance
 * freely. The balance returned is advisory: checkout re-validates under a row lock, so a
 * voucher spent on another till between lookup and settle is still correctly refused.
 *
 * Returns `{ ok, voucher, error }` rather than throwing, because "no voucher for that code"
 * is a normal outcome of scanning, not an exceptional one.
 */
export const lookupCreditVoucher = async (code) => {
    try {
        const res = await api.get(`${BASE_URL}/lookup`, { params: { code } });
        return { ok: true, voucher: res.data, error: null };
    } catch (err) {
        const status = err?.response?.status;
        // The backend deliberately gives the same message for unknown and malformed codes so
        // the endpoint cannot be used to probe which codes exist.
        const message = err?.response?.data?.message
            || (status === 404 ? "No voucher found for that code." : "Could not look up that voucher.");
        return { ok: false, voucher: null, error: message };
    }
};

/** A voucher's full history — issue, every redemption, any adjustment or cancellation. */
export const getCreditVoucherHistory = async (voucherId) => {
    const res = await api.get(`${BASE_URL}/${voucherId}/history`);
    return res.data;
};

/** The voucher issued by a given Sales Return, for reprinting from the returns register. */
export const getCreditVoucherByReturn = async (returnNumber) => {
    const res = await api.get(`${BASE_URL}/by-return/${encodeURIComponent(returnNumber)}`);
    return res.data;
};

/** Withdraws a voucher and releases its unredeemed balance. Admin-only on the backend. */
export const cancelCreditVoucher = async (voucherId, reason) => {
    const res = await api.post(`${BASE_URL}/${voucherId}/cancel`, { reason });
    return res.data;
};
