package com.billbull.backend.pos.checkout;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;

/**
 * Decides whether a repeated {@code checkoutKey} carries the same sale as the invoice already
 * recorded under it (Phase 0 / M1).
 *
 * <p>Until M1 a repeated key was answered with the stored invoice whatever the request said.
 * The till only reuses a key for an identical retry (its fingerprint, {@code useCheckout.js}
 * {@code checkoutKeyFor}, mints a new key when the sale changes), so a different sale under a
 * stored key is a misuse. It is now answered with 409 {@code CHECKOUT_KEY_REUSED} instead of
 * another sale's invoice.
 *
 * <h3>What is compared</h3>
 * There is no stored request hash yet (that is M2's attempt journal), so the comparison uses
 * only what the invoice keeps exactly as sent:
 * <ul>
 *   <li>session id, terminal id, and customer code (null means {@code WALK-IN}, as
 *       {@code buildInvoice} stores it);</li>
 *   <li>the lines as a multiset of item code, quantity, voided flag, serial and pinned batch,
 *       plus unit price wherever the request sent one. {@code save()} keeps client-sent prices
 *       and fills only missing ones, so a line sent without a price matches any stored price.</li>
 * </ul>
 * Tender split, bill discount and supervisor credentials are not compared. Credentials are not
 * part of the sale; the other two are recomputed or re-stamped server-side, so comparing them
 * would refuse genuine retries.
 *
 * <h3>Since M2</h3>
 * A key with an attempt-journal row is answered from that row's canonical request hash
 * ({@link PosCheckoutRequestHasher}), which does include the tender plan, so a tender-only change is
 * refused. This matcher now answers only keys with no journal row (sales recorded before M2) and a
 * RELEASED attempt whose invoice still stands. For those a tender-only difference is still not seen.
 */
final class PosCheckoutReplayMatcher {

    private PosCheckoutReplayMatcher() {}

    /** The first field that differs, or empty when the request matches the stored sale. */
    static Optional<String> firstMismatch(PosCheckoutRequest request, SalesInvoice stored) {
        if (!Objects.equals(request.getSessionId(), stored.getPosSessionId())) return Optional.of("sessionId");
        if (!Objects.equals(blankToNull(request.getTerminalId()), blankToNull(stored.getPosTerminalId()))) {
            return Optional.of("terminalId");
        }
        if (!customer(request.getCustomerCode()).equalsIgnoreCase(customer(stored.getCustomerCode()))) {
            return Optional.of("customerCode");
        }
        List<PosCheckoutRequest.PosCheckoutItem> requested =
                request.getItems() != null ? request.getItems() : List.of();
        List<SalesInvoiceItem> remaining =
                new ArrayList<>(stored.getItems() != null ? stored.getItems() : List.of());
        if (requested.size() != remaining.size()) return Optional.of("items");
        for (PosCheckoutRequest.PosCheckoutItem line : requested) {
            SalesInvoiceItem match = null;
            for (SalesInvoiceItem candidate : remaining) {
                if (sameLine(line, candidate)) { match = candidate; break; }
            }
            if (match == null) return Optional.of("items");
            remaining.remove(match);
        }
        return Optional.empty();
    }

    private static boolean sameLine(PosCheckoutRequest.PosCheckoutItem line, SalesInvoiceItem stored) {
        boolean voided = Boolean.TRUE.equals(line.getVoided());
        if (voided != stored.isVoided()) return false;
        if (!Objects.equals(blankToNull(line.getItemCode()), blankToNull(stored.getItemCode()))) return false;
        if (!Objects.equals(line.getQuantity(), stored.getQuantity())) return false;
        // buildInvoice stores serial and pinned batch only on live lines.
        if (!voided) {
            if (!Objects.equals(blankToNull(line.getSerialNumber()), blankToNull(stored.getSerialNumber()))) return false;
            if (!Objects.equals(blankToNull(line.getBatchNumber()), blankToNull(stored.getPinnedBatchNumber()))) return false;
        }
        if (line.getPrice() == null) return true;
        if (stored.getPrice() == null) return false;
        return money(BigDecimal.valueOf(line.getPrice())).compareTo(money(stored.getPrice())) == 0;
    }

    private static BigDecimal money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private static String customer(String code) {
        String c = blankToNull(code);
        return c == null ? "WALK-IN" : c;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
