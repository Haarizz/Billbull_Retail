package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.settings.PosDeliveryReturnChargePolicy;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnCondition;
import com.billbull.backend.sales.returns.SalesReturnEntryPoint;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnReasonCode;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnService;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Returning a retail delivery order from the POS Delivery Settlement screen.
 *
 * <p><b>Why this exists at all.</b> A retail delivery is not a completed transaction when the
 * invoice is raised. The goods leave with a driver against a CONFIRMED, unpaid invoice, and the
 * sale only closes when the cashier settles it here. Until that moment the customer can simply
 * refuse the delivery at the door. Sending the cashier to the back-office Sales Return module
 * for that is the wrong surface twice over: it is a till action on an order that never
 * completed, and a plain sales return leaves the order sitting in the "out for delivery" list
 * afterwards, because a return does not — and must not — change the linked invoice status.
 *
 * <p><b>What this class is not.</b> It is not a second returns engine. Every rule that matters —
 * returnable quantities under a row lock, the restock decision, the GL journal, the receivable
 * allocation, the authorization threshold — belongs to {@link SalesReturnService} and is reached
 * by building an ordinary {@link SalesReturn} and approving it. This class contributes exactly
 * three things that engine has no opinion about:
 *
 * <ol>
 *   <li>the <b>guard</b> that this invoice really is an unpaid order out for delivery;</li>
 *   <li>the <b>delivery charge</b>, which is not a return line and so needs a policy;</li>
 *   <li>the <b>close-out</b> that takes a settled-up order off the delivery list.</li>
 * </ol>
 *
 * <p><b>Why unpaid only.</b> On an unpaid invoice the whole return value is the split unpaid
 * portion, so it cancels a receivable and no money moves — the refund method is not a choice, it
 * is necessarily Customer Credit, and
 * {@code SalesReturnService.assertSettlementMethodMatchesSplit} enforces exactly that. The
 * cashier is therefore asked for a reason and nothing else. The moment a customer has paid
 * something there is a paid portion owed back, which means a refund method, possibly a drawer
 * payout, and a supervisor conversation — a different workflow, and it stays in the full Sales
 * Return screen rather than being half-rebuilt behind a one-click button on a settlement row.
 */
@Service
@Slf4j
public class PosDeliveryReturnService {

    @Autowired
    private SalesInvoiceRepository invoiceRepository;

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private InvoiceBalanceService invoiceBalanceService;

    @Autowired
    private PosSettingsService posSettingsService;

    /**
     * Returns an unpaid delivery order goods and closes the order out when nothing is left to
     * collect.
     *
     * <p>Not {@code @Transactional} itself, deliberately. The money-moving work happens inside
     * {@link SalesReturnService} own transaction, exactly as it does for every other return;
     * wrapping it in a wider one here would change the locking behaviour of a path that is
     * already correct. The close-out that follows is a two-column update on the invoice, applied
     * once the return has committed — see {@link #closeOutOrder}.
     *
     * @return what happened, for the till to show and print
     */
    public PosDeliveryReturnResponse returnDelivery(Long invoiceId, PosDeliveryReturnRequest req) {
        // Fetch-joined, not findById: this method is deliberately non-transactional (see above)
        // and spring.jpa.open-in-view is off, so the returned entity is detached the moment the
        // repository call ends. buildReturnLines/isFullReturn both walk invoice.getItems(), which
        // would otherwise throw LazyInitializationException.
        SalesInvoice invoice = invoiceRepository.findByIdWithItems(invoiceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Delivery order not found."));

        assertReturnableDeliveryOrder(invoice);

        List<SalesReturnItem> lines = buildReturnLines(invoice, req);
        if (lines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select at least one item to return.");
        }

        PosDeliveryReturnChargePolicy policy = resolveChargePolicy(invoice, req);
        boolean fullReturn = isFullReturn(invoice, lines);

        SalesReturn draft = buildReturn(invoice, req, lines);
        SalesReturn saved = salesReturnService.saveReturn(draft);
        SalesReturn approved = salesReturnService.updateStatus(saved.getId(), SalesReturnStatus.APPROVED,
                req.getSupervisorUsername(), req.getSupervisorPassword());

        // Only now, with the credit note posted, is it safe to touch the charge and the delivery
        // lifecycle: if the approval had failed, nothing below this line runs and the order is
        // untouched — still out for delivery, still owing its full amount.
        boolean chargeWaived = applyChargePolicy(invoice, policy, fullReturn);
        BigDecimal outstanding = invoiceBalanceService.recomputeInvoiceBalanceByNumber(invoice.getInvoiceNumber());
        boolean closed = closeOutOrder(invoice.getId(), outstanding, approved.getReturnNumber());

        log.info("POS delivery return {} against invoice {}: full={} chargeWaived={} outstanding={} closed={}",
                approved.getReturnNumber(), invoice.getInvoiceNumber(), fullReturn, chargeWaived,
                outstanding, closed);

        return new PosDeliveryReturnResponse(approved.getReturnNumber(), approved.getTotalAmount(),
                fullReturn, chargeWaived, outstanding, closed);
    }

    // ---------------------------------------------------------------
    // Guard
    // ---------------------------------------------------------------

    /**
     * Refuses anything that is not an unpaid order currently out for delivery.
     *
     * <p>Each rejection names what is wrong and where to go instead, because every one of these
     * is reachable by a cashier doing something reasonable — working from a stale list, or trying
     * to return an order a colleague already settled at the other till.
     */
    private void assertReturnableDeliveryOrder(SalesInvoice invoice) {
        if (invoice.getPosDriverName() == null || invoice.getPosDriverName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Invoice " + invoice.getInvoiceNumber() + " is not a delivery order."
                            + " Return it from Customer and Sales to Sales Return.");
        }
        if (invoice.getPosDeliveryReturnedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Delivery order " + invoice.getInvoiceNumber() + " was already returned on "
                            + invoice.getPosDeliveryReturnedAt().toLocalDate()
                            + " (return " + invoice.getPosDeliveryReturnNumber() + ").");
        }
        BigDecimal paid = money(invoice.getAmountPaid());
        if (paid.signum() > 0) {
            // Not a technical limitation — see the class javadoc. The paid portion is real money
            // owed back and needs the full return screen refund-method and authorization path.
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Delivery order " + invoice.getInvoiceNumber() + " has already been paid "
                            + paid + ". A part-paid order has money to refund, so it must be"
                            + " returned from Customer and Sales to Sales Return, where a refund"
                            + " method can be chosen.");
        }
    }

    // ---------------------------------------------------------------
    // Return construction
    // ---------------------------------------------------------------

    /**
     * Turns the requested quantities into return lines against the invoice own items.
     *
     * <p>An empty {@code lines} request means the whole order, which is the common case: the
     * customer refused the delivery outright. A populated one is a partial refusal — the customer
     * kept some of what arrived — and only the item codes named are returned, capped at what the
     * invoice actually sold so a mistyped quantity cannot credit more than was ever bought. The
     * engine re-checks this under a row lock at approval; the cap here is to fail early with a
     * clear message, not to be the control.
     */
    private List<SalesReturnItem> buildReturnLines(SalesInvoice invoice, PosDeliveryReturnRequest req) {
        Map<String, Integer> requested = new LinkedHashMap<>();
        boolean wholeOrder = req.getLines() == null || req.getLines().isEmpty();
        if (!wholeOrder) {
            for (PosDeliveryReturnRequest.Line l : req.getLines()) {
                if (l.getItemCode() == null || l.getItemCode().isBlank()) continue;
                int qty = l.getReturnQty() != null ? l.getReturnQty() : 0;
                if (qty > 0) requested.merge(l.getItemCode().trim(), qty, Integer::sum);
            }
        }

        SalesReturnCondition condition = resolveCondition(req);
        String reason = resolveReason(req);

        List<SalesReturnItem> lines = new ArrayList<>();
        for (SalesInvoiceItem item : invoice.getItems()) {
            // A voided line was struck off the sale before it was ever delivered; there is
            // nothing of it in the driver hands to bring back.
            if (Boolean.TRUE.equals(item.getVoided())) continue;

            int sold = item.getQuantity() != null ? item.getQuantity() : 0;
            if (sold <= 0) continue;

            int qty = wholeOrder ? sold : requested.getOrDefault(item.getItemCode(), 0);
            if (qty <= 0) continue;
            if (qty > sold) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Cannot return " + qty + " of " + item.getItemName() + ": only "
                                + sold + " were sold on " + invoice.getInvoiceNumber() + ".");
            }
            lines.add(buildLine(item, qty, sold, condition, reason, req.getRemarks()));
        }

        if (!wholeOrder) {
            // Every requested code must have matched something, or the cashier believes they are
            // returning an item that this order never carried.
            for (String code : requested.keySet()) {
                boolean matched = lines.stream().anyMatch(l -> code.equals(l.getItemCode()));
                if (!matched) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "Item " + code + " is not on delivery order "
                                    + invoice.getInvoiceNumber() + ".");
                }
            }
        }
        return lines;
    }

    /**
     * One return line, with its money pro-rated from the invoice line by returned/sold ratio.
     *
     * <p>Pro-rating rather than recomputing from price keeps line discounts and tax exactly as
     * the customer was billed them: a half-returned line credits half of what that line actually
     * charged, including its share of any discount, which is the only figure that reconciles
     * against the original invoice.
     */
    private SalesReturnItem buildLine(SalesInvoiceItem item, int qty, int sold,
                                      SalesReturnCondition condition, String reason, String remarks) {
        BigDecimal ratio = BigDecimal.valueOf(qty)
                .divide(BigDecimal.valueOf(sold), 6, RoundingMode.HALF_UP);

        SalesReturnItem line = new SalesReturnItem();
        line.setInvoiceItemId(item.getId());
        line.setItemCode(item.getItemCode());
        line.setItemName(item.getItemName());
        line.setUnit(item.getUnit());
        line.setSoldQty(sold);
        line.setReturnQty(qty);
        line.setPrice(item.getPrice());
        line.setDiscountPercent(item.getDiscount());
        line.setTaxRate(item.getTaxRate());
        line.setDiscountAmount(money(proRate(item.getFooterDiscount(), ratio)));
        line.setTaxAmount(money(proRate(item.getTaxAmount(), ratio)));
        line.setTotal(money(proRate(item.getNetAmount(), ratio)));
        line.setCondition(condition);
        line.setReturnReason(reason);
        line.setReturnReasonNotes(remarks);
        // The legacy free-text status the inventory/COGS path still branches on. Kept in step
        // with the structured condition rather than passed independently.
        line.setItemStatus(condition != null && condition.isRestockable() ? "Good" : "Damaged");
        return line;
    }

    /** The return header. Refund method is fixed, not chosen — see the class javadoc. */
    private SalesReturn buildReturn(SalesInvoice invoice, PosDeliveryReturnRequest req,
                                    List<SalesReturnItem> lines) {
        SalesReturn r = new SalesReturn();
        r.setLinkedInvoice(invoice.getInvoiceNumber());
        r.setCustomerCode(invoice.getCustomerCode());
        r.setCustomerName(invoice.getCustomerName());
        // Branch is deliberately not set here. SalesReturnService stamps it from the
        // authenticated user branch on save, and then checks it against the linked invoice —
        // setting it from the invoice would hand that guard its own answer and defeat it.

        BigDecimal tax = lines.stream().map(SalesReturnItem::getTaxAmount)
                .reduce(BigDecimal.ZERO, (a, b) -> a.add(money(b)));
        BigDecimal total = lines.stream().map(SalesReturnItem::getTotal)
                .reduce(BigDecimal.ZERO, (a, b) -> a.add(money(b)));
        r.setTaxInclusive(invoice.getTaxInclusive());
        r.setTaxAmount(money(tax));
        r.setTotalAmount(money(total));
        r.setSubTotal(money(Boolean.TRUE.equals(invoice.getTaxInclusive())
                ? total.subtract(tax) : total));

        // The only settlement an unpaid return can legally have: the customer has handed over
        // nothing, so there is nothing to hand back and the whole value cancels the receivable.
        r.setRefundMethod(SalesReturnRefundMethod.CUSTOMER_CREDIT);
        r.setReturnAction("Credit Note");
        r.setReason(resolveReason(req));
        r.setInternalNotes(req.getRemarks());

        r.setEntryPoint(SalesReturnEntryPoint.POS);
        r.setPosSessionId(req.getSessionId());
        r.setPosTerminalId(req.getTerminalId());
        r.setPosCounterName(req.getCounterName());

        lines.forEach(l -> l.setSalesReturn(r));
        r.setItems(lines);
        return r;
    }

    // ---------------------------------------------------------------
    // Delivery charge and close-out
    // ---------------------------------------------------------------

    /**
     * The branch policy, with the cashier answer honoured only where the branch allows it.
     *
     * <p>A branch set to WAIVE or RETAIN has made the decision centrally and the till cannot
     * overrule it — that is the point of configuring it. Only ASK defers to the request, and even
     * then it defaults to waiving when the till sends nothing.
     */
    private PosDeliveryReturnChargePolicy resolveChargePolicy(SalesInvoice invoice,
                                                              PosDeliveryReturnRequest req) {
        PosSettings settings = posSettingsService.getForBranch(invoice.getBranchId());
        PosDeliveryReturnChargePolicy configured = settings != null
                ? settings.resolvedDeliveryReturnChargePolicy()
                : PosDeliveryReturnChargePolicy.WAIVE;

        if (configured != PosDeliveryReturnChargePolicy.ASK) return configured;
        return Boolean.FALSE.equals(req.getWaiveDeliveryCharge())
                ? PosDeliveryReturnChargePolicy.RETAIN
                : PosDeliveryReturnChargePolicy.WAIVE;
    }

    /**
     * Cancels the delivery charge when the policy waives it and the whole order came back.
     *
     * <p>A partial return never waives: the customer kept something, so the trip was made for
     * goods they still have and the charge stands whatever the policy says.
     *
     * @return true when the charge was actually cancelled
     */
    private boolean applyChargePolicy(SalesInvoice invoice, PosDeliveryReturnChargePolicy policy,
                                      boolean fullReturn) {
        if (policy != PosDeliveryReturnChargePolicy.WAIVE || !fullReturn) return false;
        BigDecimal charge = money(invoice.getDeliveryCharge());
        if (charge.signum() <= 0) return false;

        // Re-read rather than reusing the instance loaded before the return posted: the approval
        // transaction recomputed this invoice balance and payment columns, and saving the stale
        // copy would merge those back to their pre-return values.
        SalesInvoice fresh = invoiceRepository.findById(invoice.getId()).orElse(null);
        if (fresh == null) return false;
        fresh.setDeliveryCharge(BigDecimal.ZERO);
        fresh.setInvoiceTotal(money(fresh.getInvoiceTotal()).subtract(charge).max(BigDecimal.ZERO));
        invoiceRepository.save(fresh);
        return true;
    }

    /**
     * Takes a settled-up order off the pending-delivery list.
     *
     * <p>Only when nothing is outstanding. An order that still owes its retained delivery charge,
     * or the balance of items the customer kept, stays listed on purpose — that balance is money
     * the cashier has to collect, and the delivery list is where they collect it.
     *
     * <p>The invoice status is deliberately untouched. The sale happened and its journals stand;
     * what ended is the delivery. Writing the lifecycle fact into its own column keeps the status
     * meaning what it has always meant everywhere else that reads it.
     */
    private boolean closeOutOrder(Long invoiceId, BigDecimal outstanding, String returnNumber) {
        if (outstanding != null && outstanding.signum() > 0) return false;
        SalesInvoice invoice = invoiceRepository.findById(invoiceId).orElse(null);
        if (invoice == null || invoice.getPosDeliveryReturnedAt() != null) return false;
        invoice.setPosDeliveryReturnedAt(LocalDateTime.now());
        invoice.setPosDeliveryReturnNumber(returnNumber);
        invoiceRepository.save(invoice);
        return true;
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /** True when every unvoided line on the order is coming back in full. */
    private boolean isFullReturn(SalesInvoice invoice, List<SalesReturnItem> lines) {
        Map<String, Integer> returning = new LinkedHashMap<>();
        lines.forEach(l -> returning.merge(l.getItemCode(), l.getReturnQty(), Integer::sum));
        for (SalesInvoiceItem item : invoice.getItems()) {
            if (Boolean.TRUE.equals(item.getVoided())) continue;
            int sold = item.getQuantity() != null ? item.getQuantity() : 0;
            if (sold <= 0) continue;
            if (returning.getOrDefault(item.getItemCode(), 0) < sold) return false;
        }
        return true;
    }

    /**
     * Goods refused at the door and carried straight back are saleable unless the cashier says
     * otherwise — which is what makes "reason only" a complete answer for the common case.
     * An unrecognised value falls back to GOOD rather than being rejected: the condition decides
     * whether stock comes back, and a typo must not quietly scrap a van-load of saleable goods.
     */
    private SalesReturnCondition resolveCondition(PosDeliveryReturnRequest req) {
        String raw = req.getCondition();
        if (raw == null || raw.isBlank()) return SalesReturnCondition.GOOD;
        for (SalesReturnCondition c : SalesReturnCondition.values()) {
            if (c.name().equalsIgnoreCase(raw.trim())) return c;
        }
        return SalesReturnCondition.GOOD;
    }

    private String resolveReason(PosDeliveryReturnRequest req) {
        SalesReturnReasonCode code = SalesReturnReasonCode.fromCode(req.getReason());
        return code != null ? code.name() : SalesReturnReasonCode.CUSTOMER_RETURN.name();
    }

    private static BigDecimal proRate(BigDecimal amount, BigDecimal ratio) {
        return money(amount).multiply(ratio);
    }

    private static BigDecimal money(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }
}
