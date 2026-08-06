package com.billbull.backend.sales.payment;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The canonical tender buckets every payment report rolls up to, and the one place that maps a
 * recorded {@link Payment#getPaymentMode() payment mode} onto them.
 *
 * <p>The mode on a Payment row is a per-tender label — "Cash", "Visa", "Bank Transfer" — written
 * when that single leg was collected. It is <em>not</em> the invoice's combined mode label, which
 * is a display string ("Cash + Visa") and can historically read "Mixed". Mapping the per-leg
 * label is therefore reporting normalisation, not business logic on a mode string: the amount is
 * already unambiguous, this only decides which column it lands in.
 *
 * <p>Every payment report — X report, Z report, sales dashboards, the POS tender reports —
 * bucket through here so the same sale cannot land in "Card" on one screen and "Other" on the
 * next. Order matters in {@link #of}: "credit card" must resolve to CARD, not CREDIT.
 */
public final class TenderBucket {

    public static final String CASH = "cash";
    public static final String CARD = "card";
    public static final String CREDIT = "credit";
    public static final String BANK_TRANSFER = "bankTransfer";
    public static final String WALLET = "wallet";
    public static final String VOUCHER = "voucher";
    public static final String CHEQUE = "cheque";
    public static final String LOYALTY = "loyalty";
    public static final String STORE_CREDIT = "storeCredit";
    public static final String OTHER = "other";

    private TenderBucket() {}

    /**
     * Maps a free-text payment mode (Cash / Visa / Card / Credit / Bank Transfer / …) onto a
     * canonical bucket key.
     */
    public static String of(String mode) {
        String m = mode == null ? "" : mode.toLowerCase();
        if (m.contains("card") || m.contains("visa") || m.contains("master")
                || m.contains("amex") || m.contains("mada")) return CARD;
        if (m.contains("cash")) return CASH;
        if (m.contains("credit")) return CREDIT;
        if (m.contains("bank") || m.contains("transfer") || m.contains("online")) return BANK_TRANSFER;
        if (m.contains("wallet") || m.contains("apple") || m.contains("google")) return WALLET;
        if (m.contains("voucher") || m.contains("gift")) return VOUCHER;
        if (m.contains("cheque") || m.contains("check")) return CHEQUE;
        if (m.contains("loyalty") || m.contains("points")) return LOYALTY;
        if (m.contains("store")) return STORE_CREDIT;
        return OTHER;
    }

    /** Human-facing name for a bucket key, for report rows, chart legends and column badges. */
    public static String displayName(String bucket) {
        if (bucket == null) return "Other";
        return switch (bucket) {
            case CASH -> "Cash";
            case CARD -> "Card";
            case CREDIT -> "Credit";
            case BANK_TRANSFER -> "Online";
            case WALLET -> "Wallet";
            case VOUCHER -> "Voucher";
            case CHEQUE -> "Cheque";
            case LOYALTY -> "Loyalty";
            case STORE_CREDIT -> "Store Credit";
            default -> "Other";
        };
    }

    /** Convenience: the display name a raw recorded mode rolls up to. */
    public static String displayNameOf(String mode) {
        return displayName(of(mode));
    }

    /**
     * Normalises a raw card mode label into a display card-network name ("VISA DEBIT" → "Visa").
     * Falls back to the trimmed raw label, or "Card" when blank, so an unrecognised network still
     * gets its own row rather than being merged into a generic bucket.
     */
    public static String cardNetwork(String rawMode) {
        String m = rawMode == null ? "" : rawMode.trim();
        String lower = m.toLowerCase();
        if (lower.contains("visa")) return "Visa";
        if (lower.contains("master")) return "Mastercard";
        if (lower.contains("amex")) return "Amex";
        if (lower.contains("mada")) return "Mada";
        if (m.isEmpty() || lower.equals("card")) return "Card";
        return m;
    }

    /**
     * The summary label for a set of tenders taken against one invoice, in the order they were
     * collected and de-duplicated by bucket: "Cash", "Cash + Card", "Cash + Card + Online".
     *
     * <p>This is what replaces reading the invoice's stored mode string. It can never produce
     * "Mixed", because it is built from the tenders themselves rather than from a label someone
     * chose at checkout time.
     *
     * @return null when there are no tenders, so the caller can fall back to the stored label
     */
    public static String summaryLabel(Collection<Payment> tenders) {
        if (tenders == null || tenders.isEmpty()) return null;
        LinkedHashMap<String, Boolean> seen = new LinkedHashMap<>();
        for (Payment p : tenders) {
            seen.putIfAbsent(displayNameOf(p.getPaymentMode()), Boolean.TRUE);
        }
        return seen.isEmpty() ? null : String.join(" + ", seen.keySet());
    }

    /** Sums tenders by bucket key, preserving collection order for stable report output. */
    public static Map<String, BigDecimal> sumByBucket(Collection<Payment> tenders) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        if (tenders == null) return totals;
        for (Payment p : tenders) {
            BigDecimal amount = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
            totals.merge(of(p.getPaymentMode()), amount, BigDecimal::add);
        }
        return totals;
    }

    /** Groups tender rows by the invoice they settled, dropping rows with no invoice link. */
    public static Map<String, List<Payment>> byInvoice(Collection<Payment> tenders) {
        Map<String, List<Payment>> byInvoice = new LinkedHashMap<>();
        if (tenders == null) return byInvoice;
        for (Payment p : tenders) {
            String invoice = p.getLinkedInvoice();
            if (invoice == null || invoice.isBlank()) continue;
            byInvoice.computeIfAbsent(invoice, k -> new java.util.ArrayList<>()).add(p);
        }
        return byInvoice;
    }
}
