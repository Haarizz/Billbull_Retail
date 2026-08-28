package com.billbull.backend.pos.checkout;

import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.businessdate.BusinessDayContinuationGate;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionClosureWorkflowGate;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.settings.PosSettingsService;
import com.billbull.backend.pos.terminal.PosTerminalActivityService;
import com.billbull.backend.sales.invoice.InvoiceCustomerContactService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Owns the complete delivery-settlement critical section as ONE atomic unit of work.
 *
 * <p>Extracted out of {@link PosCheckoutController} specifically so the pessimistic
 * row lock acquired here ({@code findByIdForUpdate}) stays held for the entire
 * lock-validate-write sequence. Previously the lock was acquired directly in the
 * (non-transactional) controller: as a plain Spring Data JPA repository call with no
 * enclosing transaction, {@code findByIdForUpdate} opened and committed its own
 * transaction before returning to the caller — releasing the lock immediately, before
 * the balance check or the payment write ever ran. Two concurrent settlement requests
 * could therefore both observe the same pre-payment balance and both create a Payment.
 *
 * <p>This mirrors the one other correct pessimistic-lock usage already in this
 * codebase: {@code SalesReturnService#applyBatchReturns} acquires its lock from
 * <em>inside</em> an already-{@code @Transactional} method ({@code updateStatus}), so
 * the lock and the write share one transaction. This class does the same for delivery
 * settlement instead of locking in the controller and writing in a separately
 * transactional service call.
 */
@Service
public class PosDeliverySettlementService {

    private final SalesInvoiceRepository invoiceRepository;
    private final SalesInvoiceService invoiceService;
    private final OwnershipAccessService ownershipAccessService;
    private final PosSettingsService posSettingsService;
    private final PosAuditService auditService;
    private final PosSessionService sessionService;
    private final BusinessDayContinuationGate businessDayContinuationGate;
    private final PosSessionClosureWorkflowGate closureWorkflowGate;
    private final PosPaymentAllocationResolver allocationResolver;
    private final PosTerminalActivityService terminalActivityService;
    private final InvoiceCustomerContactService invoiceCustomerContactService;

    public PosDeliverySettlementService(SalesInvoiceRepository invoiceRepository,
            SalesInvoiceService invoiceService,
            OwnershipAccessService ownershipAccessService,
            PosSettingsService posSettingsService,
            PosAuditService auditService,
            PosSessionService sessionService,
            BusinessDayContinuationGate businessDayContinuationGate,
            PosSessionClosureWorkflowGate closureWorkflowGate,
            PosPaymentAllocationResolver allocationResolver,
            PosTerminalActivityService terminalActivityService,
            InvoiceCustomerContactService invoiceCustomerContactService) {
        this.invoiceRepository = invoiceRepository;
        this.invoiceService = invoiceService;
        this.ownershipAccessService = ownershipAccessService;
        this.posSettingsService = posSettingsService;
        this.auditService = auditService;
        this.sessionService = sessionService;
        this.businessDayContinuationGate = businessDayContinuationGate;
        this.closureWorkflowGate = closureWorkflowGate;
        this.allocationResolver = allocationResolver;
        this.terminalActivityService = terminalActivityService;
        this.invoiceCustomerContactService = invoiceCustomerContactService;
    }

    /**
     * Settles (collects payment for) a pending delivery order. Lock acquisition,
     * authorization, session/branch validation, balance recomputation and the payment
     * write all happen inside this one transaction — nothing here trusts a value
     * computed before the lock was acquired.
     *
     * @param fallbackBusinessDate the business date to stamp on the payment when the
     *      invoice itself has none. Resolved by the caller from the session alone (no
     *      invoice dependency), so it can safely be computed before the lock is taken.
     */
    @Transactional
    public SalesInvoice settle(Long id, PosCheckoutController.DeliverySettleRequest req, LocalDate fallbackBusinessDate) {
        // Pessimistic-write lock on the invoice row, held for the remainder of THIS
        // transaction — released only at commit/rollback — so two concurrent settlement
        // requests against the same delivery cannot both read the same balance-due and
        // both record a payment for it.
        SalesInvoice invoice = invoiceRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));

        boolean isOwner = ownershipAccessService.canAccessRecord(invoice.getCreatedByUserId(), List.of());
        boolean isAuthorized = isOwner;
        if (!isOwner) {
            if (verifySupervisorCredentials(req.getSupervisorOverrideEmail(), req.getSupervisorOverridePassword(),
                    req.getSupervisorOverridePin(), req.getTerminalId())) {
                isAuthorized = true;
                auditService.logDeliverySettlementAuthorized(req.getSessionId(), req.getTerminalId(),
                        req.getBranchId() != null ? req.getBranchId() : invoice.getBranchId(),
                        invoice.getId(), invoice.getInvoiceNumber());
            } else {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "SUPERVISOR_AUTHORIZATION_REQUIRED");
            }
        }

        // Collection-session validation. A delivery settlement legitimately carries no
        // session at all (back-office settlement — see PosCheckoutController#posBusinessDate's
        // doc comment), but when one IS supplied it must be a session that's actually
        // usable right now, exactly like checkout() already requires. Without this, a
        // stale/closed sessionId from a cashier's out-of-date browser tab would get
        // stamped onto the Payment as its COLLECTION session and then never surface in
        // any session's cash reconciliation — the same class of "lost cash" bug this
        // whole fix closes, via a different trigger.
        if (req.getSessionId() != null) {
            PosSession settlingSession = sessionService.getById(req.getSessionId());
            businessDayContinuationGate.assertMayContinue(settlingSession);
            closureWorkflowGate.assertMayOperate(settlingSession);
            if (settlingSession.getStatus() != PosSessionStatus.OPEN) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot settle a delivery against a session that is not open.");
            }
            // Branch isolation: the settling session must belong to the same branch as
            // the delivery being settled, or that branch's cash reconciliation would
            // silently absorb another branch's collection. Both-null (legacy/unscoped
            // data) is allowed through unchanged; only an explicit mismatch is rejected.
            if (invoice.getBranchId() != null && settlingSession.getBranchId() != null
                    && !invoice.getBranchId().equals(settlingSession.getBranchId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot settle a delivery against a session belonging to a different branch.");
            }
        }

        // Balance is re-derived from the row this transaction now holds locked — never
        // trust a balance computed before the lock was acquired.
        double invoiceTotal = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal().doubleValue() : 0.0;
        double alreadyPaid = invoice.getAmountPaid() != null ? invoice.getAmountPaid().doubleValue() : 0.0;
        double balanceDue = Math.max(0, invoiceTotal - alreadyPaid);
        if (balanceDue <= 0.001) {
            // Already fully settled — by this same request racing itself (retry after
            // the first attempt committed) or otherwise. No-op, matching prior behavior.
            return loadResponseInvoice(id, isAuthorized, isOwner);
        }

        // Delivery settlement runs through the same allocation engine as checkout: same
        // over-allocation guard, same cash capping, same summary label. There is one
        // settlement architecture, not one per screen.
        PosPaymentPlan plan = resolveDeliverySettlementPlan(req, balanceDue);
        double paymentAmount = plan.getSettledAmount();
        if (paymentAmount <= 0.001) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be greater than zero");
        }

        // Every leg carries the same combined label, or the last recordPayment call
        // would overwrite the invoice's displayed mode with just its own leg.
        String combinedMode = plan.getCombinedPaymentMode();
        String splitGroupId = plan.getLegCount() > 1 ? UUID.randomUUID().toString() : null;
        LocalDate paymentDate = invoice.getInvoiceDate() != null ? invoice.getInvoiceDate() : fallbackBusinessDate;
        for (ResolvedPaymentAllocation allocation : plan.getAllocations()) {
            if (allocation.getAmount() <= 0.001) continue;
            if (!allocation.isReceipt()) continue; // credit stays on the customer's ledger

            // The COLLECTION session is whatever session is actually open right now
            // (req.getSessionId()) — deliberately NOT invoice.getPosSessionId(). That
            // field stays the immutable SALE session (set once at delivery-order
            // creation); the cash being collected here may belong to a different, later
            // session, or to no session at all for a back-office settlement.
            if (isAuthorized && !isOwner) {
                invoiceService.recordPaymentForAuthorizedDeliverySettlement(id, allocation.getAmount(),
                        allocation.getModeLabel(), allocation.getReference(), paymentDate,
                        allocation.getBankAccountName(), null, splitGroupId, combinedMode, req.getSessionId());
            } else {
                invoiceService.recordPayment(id, allocation.getAmount(), allocation.getModeLabel(),
                        allocation.getReference(), paymentDate, allocation.getBankAccountName(),
                        null, splitGroupId, combinedMode, req.getSessionId());
            }
        }

        auditService.logCheckoutCompleted(req.getSessionId(), req.getTerminalId(),
                req.getBranchId() != null ? req.getBranchId() : invoice.getBranchId(),
                id, invoice.getInvoiceNumber());
        terminalActivityService.recordActivity(req.getTerminalId(), "CHECKOUT");

        return loadResponseInvoice(id, isAuthorized, isOwner);
    }

    /** Reloads the settled invoice and attaches the customer contact details for the receipt. */
    private SalesInvoice loadResponseInvoice(Long id, boolean isAuthorized, boolean isOwner) {
        SalesInvoice invoice = isAuthorized && !isOwner
                ? invoiceService.getByIdBypassingOwnership(id)
                : invoiceService.getById(id);
        invoiceCustomerContactService.attach(invoice);
        return invoice;
    }

    /**
     * Resolves a delivery settlement into the same {@link PosPaymentPlan} a checkout produces.
     * Prefers the progressive {@code paymentAllocations} list; falls back to the legacy
     * cash/card scalars for a terminal whose browser tab has not been reloaded since deploy
     * (dropping that path would make those tills settle a delivery with no payment recorded).
     */
    private PosPaymentPlan resolveDeliverySettlementPlan(PosCheckoutController.DeliverySettleRequest req, double balanceDue) {
        if (req.getPaymentAllocations() != null && !req.getPaymentAllocations().isEmpty()) {
            return allocationResolver.resolveAllocations(
                    req.getPaymentAllocations(), balanceDue, req.getPaymentMode(), "Cash");
        }
        // Legacy scalars, expressed as allocations so the settlement loop stays single-path.
        List<PosPaymentAllocation> legacy = new ArrayList<>();
        double cashAmt = req.getCashAmount() != null ? req.getCashAmount() : 0.0;
        double cardAmt = req.getCardAmount() != null ? req.getCardAmount() : 0.0;
        if (cashAmt <= 0.001 && cardAmt <= 0.001) {
            double tendered = req.getAmountTendered() != null ? req.getAmountTendered() : balanceDue;
            legacy.add(legacyAllocation(
                    req.getPaymentMode() != null && !req.getPaymentMode().isBlank() ? req.getPaymentMode() : "Cash",
                    Math.min(tendered, balanceDue), req.getCardReference()));
        } else {
            if (cardAmt > 0.001) {
                legacy.add(legacyAllocation(
                        req.getCardType() != null && !req.getCardType().isBlank() ? req.getCardType() : "Card",
                        cardAmt, req.getCardReference()));
            }
            if (cashAmt > 0.001) legacy.add(legacyAllocation("Cash", cashAmt, null));
        }
        return allocationResolver.resolveAllocations(legacy, balanceDue, null, "Cash");
    }

    /** Builds one allocation from a legacy mode label, inferring its type from the label. */
    private PosPaymentAllocation legacyAllocation(String modeLabel, double amount, String reference) {
        PosPaymentAllocation a = new PosPaymentAllocation();
        PosPaymentAllocationType parsed = PosPaymentAllocationType.parse(modeLabel);
        // An unrecognised label is a card network name ("Visa", "Mastercard"), which is the
        // only mode the legacy delivery-settle UI could send besides Cash.
        a.setType((parsed != null ? parsed : PosPaymentAllocationType.CARD).name());
        a.setSubtype(parsed == null || parsed == PosPaymentAllocationType.CARD ? modeLabel : null);
        a.setAmount(amount);
        a.setReference(reference);
        return a;
    }

    private boolean verifySupervisorCredentials(String email, String password, String pin, String terminalId) {
        if (pin != null && !pin.isBlank()) {
            return posSettingsService.verifyPin(pin);
        }
        if (email != null && !email.isBlank() && password != null && !password.isBlank()) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String cashier = auth != null ? auth.getName() : null;
            return posSettingsService.verifySupervisorCredentials(email, password, terminalId, cashier).isValid();
        }
        return false;
    }
}
