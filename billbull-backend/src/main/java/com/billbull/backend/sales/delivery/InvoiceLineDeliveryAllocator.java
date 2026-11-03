package com.billbull.backend.sales.delivery;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;

/**
 * Which invoice line each delivered unit belongs to, in base (stock) units.
 *
 * <p>Revenue, line COGS and the line's cost-at-sale all follow from this one allocation, so they
 * can no longer land on different lines. It is pure: quantities come in through {@link BaseQty}
 * (the same packing conversion stock deduction uses), and nothing is read or written here.
 *
 * <h3>Quantities</h3>
 * <ul>
 *   <li>An invoice line orders {@code quantity} in its {@code unit} (paid) and {@code foc} in its
 *       {@code focUnit}, defaulting to {@code unit} — the same effective FOC unit a delivery note
 *       line uses. Both are converted to base units.</li>
 *   <li>A delivery note line delivers {@code currentQty} in its {@code unit} (paid) and {@code foc}
 *       in its {@code focUnit}, defaulting to {@code unit}, converted the same way. That base
 *       quantity is exactly what stock deduction posts.</li>
 *   <li>Paid and free units are allocated separately: revenue follows paid units only, cost follows
 *       both.</li>
 * </ul>
 *
 * <h3>Matching</h3>
 * <ol>
 *   <li>A delivery note generated from this very invoice names each line in {@code sourceLineId};
 *       the whole delivered quantity goes to that line.</li>
 *   <li>Otherwise the candidates are the invoice's live (not voided) lines with the same item
 *       code — one linked to the same Sales Order line first, then invoice order. Each takes what
 *       it still has outstanding; anything delivered beyond every candidate's order stays on the
 *       last line that received units (its revenue is capped at its own net there).</li>
 *   <li>No candidate at all: the units are unallocated. Their cost still reaches the COGS journal
 *       (the stock did leave) but no invoice line.</li>
 * </ol>
 * Earlier deliveries are replayed first, so a second delivery fills what the first left open.
 */
final class InvoiceLineDeliveryAllocator {

    /** Base-unit conversion: the quantity of {@code unit} in base units, for the given product. */
    @FunctionalInterface
    interface BaseQty {
        int of(Long productId, String unit, int qty);
    }

    /** One delivery note line's share of one invoice line (or of none), in base units. */
    record Share(DeliveryNoteItem dnItem, SalesInvoiceItem line, int paidBase, int focBase) {
        int totalBase() { return paidBase + focBase; }
    }

    /** What an invoice line ordered and what has been delivered against it, in base units. */
    static final class LineState {
        final SalesInvoiceItem line;
        private int orderedPaid = -1;
        private int orderedFoc = -1;
        int deliveredPaid;
        int deliveredFoc;

        LineState(SalesInvoiceItem line) { this.line = line; }

        void resolveOrdered(Long productId, BaseQty base) {
            if (orderedPaid >= 0) return;
            orderedPaid = Math.max(0, base.of(productId, line.getUnit(), nz(line.getQuantity())));
            orderedFoc = Math.max(0, base.of(productId, focUnit(line.getFocUnit(), line.getUnit()), nz(line.getFoc())));
        }

        boolean touched() { return orderedPaid >= 0; }
        int orderedPaid() { return Math.max(0, orderedPaid); }
        int orderedFoc() { return Math.max(0, orderedFoc); }
        boolean fullyDelivered() {
            return touched() && deliveredPaid >= orderedPaid() && deliveredFoc >= orderedFoc();
        }

        /** The share of this line's net recognised once {@code paid} base units have been delivered. */
        BigDecimal revenueTarget(int paid) {
            BigDecimal net = nzMoney(line.getNetAmount()).max(BigDecimal.ZERO);
            int ordered = orderedPaid();
            if (ordered <= 0) {
                return (paid > 0 || deliveredFoc > 0) ? net : BigDecimal.ZERO;
            }
            if (paid >= ordered) return net;
            return net.multiply(BigDecimal.valueOf(paid))
                    .divide(BigDecimal.valueOf(ordered), 2, RoundingMode.HALF_UP);
        }
    }

    /** The allocation of one delivery note, given the deliveries that preceded it. */
    static final class Result {
        final Map<SalesInvoiceItem, LineState> states;
        final List<Share> shares;
        /** Paid base units already delivered per line before this delivery. */
        final Map<SalesInvoiceItem, Integer> paidBefore;

        Result(Map<SalesInvoiceItem, LineState> states, List<Share> shares, Map<SalesInvoiceItem, Integer> paidBefore) {
            this.states = states;
            this.shares = shares;
            this.paidBefore = paidBefore;
        }

        /** This delivery's own revenue for a line: target after it, minus target before it. */
        BigDecimal revenueDelta(SalesInvoiceItem line) {
            LineState s = states.get(line);
            if (s == null || !s.touched()) return BigDecimal.ZERO;
            int before = paidBefore.getOrDefault(line, 0);
            BigDecimal delta = s.revenueTarget(s.deliveredPaid).subtract(s.revenueTarget(before));
            return delta.max(BigDecimal.ZERO);
        }

        /** Lines this delivery reached, in invoice order. */
        List<SalesInvoiceItem> linesReached() {
            List<SalesInvoiceItem> out = new ArrayList<>();
            for (Share sh : shares) {
                if (sh.line() != null && !out.contains(sh.line())) out.add(sh.line());
            }
            return out;
        }
    }

    private InvoiceLineDeliveryAllocator() {}

    /**
     * Allocates {@code current} against {@code invoice}, after replaying {@code prior} deliveries
     * (oldest first) to establish what each line has already received.
     */
    static Result allocate(SalesInvoice invoice, List<DeliveryNote> prior, DeliveryNote current, BaseQty base) {
        Map<SalesInvoiceItem, LineState> states = new IdentityHashMap<>();
        List<SalesInvoiceItem> live = liveLines(invoice);
        for (SalesInvoiceItem l : live) states.put(l, new LineState(l));

        if (prior != null) {
            for (DeliveryNote dn : prior) {
                allocateOne(invoice, live, states, dn, base, null);
            }
        }
        Map<SalesInvoiceItem, Integer> paidBefore = new IdentityHashMap<>();
        for (LineState s : states.values()) paidBefore.put(s.line, s.deliveredPaid);

        List<Share> shares = new ArrayList<>();
        allocateOne(invoice, live, states, current, base, shares);
        return new Result(states, shares, paidBefore);
    }

    /** Base units this delivery note line issued from stock: paid + free, as stock deduction posts them. */
    static int[] deliveredBase(DeliveryNoteItem item, BaseQty base) {
        Long productId = item.getProduct() != null ? item.getProduct().getId() : null;
        int paid = base.of(productId, item.getUnit(), nz(item.getCurrentQty()));
        int foc = base.of(productId, focUnit(item.getFocUnit(), item.getUnit()), nz(item.getFoc()));
        return new int[] { Math.max(0, paid), Math.max(0, foc) };
    }

    private static void allocateOne(SalesInvoice invoice, List<SalesInvoiceItem> live,
            Map<SalesInvoiceItem, LineState> states, DeliveryNote dn, BaseQty base, List<Share> out) {
        if (dn == null || dn.getItems() == null) return;
        for (DeliveryNoteItem item : dn.getItems()) {
            int[] delivered = deliveredBase(item, base);
            int paidLeft = delivered[0];
            int focLeft = delivered[1];
            if (paidLeft + focLeft <= 0) continue;
            Long productId = item.getProduct() != null ? item.getProduct().getId() : null;

            List<LineState> candidates = candidates(invoice, live, states, dn, item);
            if (candidates.isEmpty()) {
                if (out != null) out.add(new Share(item, null, paidLeft, focLeft));
                continue;
            }
            for (LineState c : candidates) c.resolveOrdered(productId, base);

            Map<LineState, int[]> taken = new LinkedHashMap<>();
            LineState lastPaid = null;
            for (LineState c : candidates) {
                if (paidLeft <= 0) break;
                int room = c.orderedPaid() - c.deliveredPaid;
                if (room <= 0) continue;
                int take = Math.min(room, paidLeft);
                taken.computeIfAbsent(c, k -> new int[2])[0] += take;
                paidLeft -= take;
                lastPaid = c;
            }
            for (LineState c : candidates) {
                if (focLeft <= 0) break;
                int room = c.orderedFoc() - c.deliveredFoc;
                if (room <= 0) continue;
                int take = Math.min(room, focLeft);
                taken.computeIfAbsent(c, k -> new int[2])[1] += take;
                focLeft -= take;
            }
            // Over-delivery beyond every candidate's order: kept on one line, never dropped, so the
            // line's COGS still adds up to what left the warehouse.
            LineState overflow = lastPaid != null ? lastPaid
                    : (!taken.isEmpty() ? taken.keySet().iterator().next() : candidates.get(candidates.size() - 1));
            if (paidLeft > 0) taken.computeIfAbsent(overflow, k -> new int[2])[0] += paidLeft;
            if (focLeft > 0) taken.computeIfAbsent(overflow, k -> new int[2])[1] += focLeft;

            for (Map.Entry<LineState, int[]> e : taken.entrySet()) {
                LineState s = e.getKey();
                s.deliveredPaid += e.getValue()[0];
                s.deliveredFoc += e.getValue()[1];
                if (out != null) out.add(new Share(item, s.line, e.getValue()[0], e.getValue()[1]));
            }
        }
    }

    private static List<LineState> candidates(SalesInvoice invoice, List<SalesInvoiceItem> live,
            Map<SalesInvoiceItem, LineState> states, DeliveryNote dn, DeliveryNoteItem item) {
        List<LineState> out = new ArrayList<>();
        SalesInvoiceItem exact = DeliveryNoteService.invoiceLineForCost(dn, item, invoice, null);
        if (exact != null && states.containsKey(exact)) {
            out.add(states.get(exact));
            return out;
        }
        String code = normalize(item.getItemCode());
        if (code == null) return out;
        Long soLine = item.getSalesOrderItemId();
        for (SalesInvoiceItem l : live) {
            if (soLine != null && soLine.equals(l.getSalesOrderItemId()) && code.equals(normalize(l.getItemCode()))) {
                out.add(states.get(l));
            }
        }
        for (SalesInvoiceItem l : live) {
            if (code.equals(normalize(l.getItemCode())) && !out.contains(states.get(l))) {
                out.add(states.get(l));
            }
        }
        return out;
    }

    private static List<SalesInvoiceItem> liveLines(SalesInvoice invoice) {
        List<SalesInvoiceItem> out = new ArrayList<>();
        if (invoice == null || invoice.getItems() == null) return out;
        for (SalesInvoiceItem l : invoice.getItems()) {
            if (l != null && !l.isVoided()) out.add(l);
        }
        return out;
    }

    static String focUnit(String focUnit, String unit) {
        return focUnit != null && !focUnit.isBlank() ? focUnit : unit;
    }

    private static String normalize(String code) {
        return code == null || code.isBlank() ? null : code.trim().toUpperCase();
    }

    private static int nz(Integer v) { return v != null ? v : 0; }

    private static BigDecimal nzMoney(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
