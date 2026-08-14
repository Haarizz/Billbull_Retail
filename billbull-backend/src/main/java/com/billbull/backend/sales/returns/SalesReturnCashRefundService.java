package com.billbull.backend.sales.returns;

import com.billbull.backend.config.SalesReturnCashCategorySeeder;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.session.PosSessionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Books the drawer cash-out for a Sales Return settled by {@link SalesReturnRefundMethod#CASH_REFUND}.
 *
 * <p>Before this existed a cash refund completed without any {@link PosCashMovement}: the money
 * physically left the till, but expected-cash, the X-Report, the Z-Report and day-close
 * reconciliation all behaved as though it had not. The cashier was then short at close with
 * nothing to explain it.
 *
 * <h3>Why it delegates rather than writing the row itself</h3>
 * Creation goes through {@link PosSessionService#addCashMovement}, the same method the POS
 * "Cash Drawer" quick action and the back-office Cash Drop/Outs screen use. That method already
 * owns session-OPEN validation, the business-day continuation gate, the closure-workflow gate,
 * category compatibility, GL posting, terminal activity, and POS audit. Reimplementing any of
 * that here would create the second cash ledger this must not become.
 *
 * <h3>Accounting</h3>
 * The movement is booked under the seeded {@code SALES_RETURN_REFUND} category, whose GL
 * override points at Accounts Receivable. See {@link SalesReturnCashCategorySeeder} for why a
 * plain DROP_OUT (which posts to General Expense) would be wrong.
 *
 * <h3>Reporting</h3>
 * Nothing downstream needed changing. Expected cash is
 * {@code opening + tender + dropIn − dropOut} in a single shared helper used by both
 * {@code closeSession()} and {@code getXReport()}, so a DROP_OUT reduces expected drawer cash in
 * the X-Report, the Z-Report and day-close automatically.
 */
@Service
@Slf4j
public class SalesReturnCashRefundService {

    @Autowired
    private PosSessionService posSessionService;

    @Autowired
    private PosCashMovementCategoryRepository categoryRepository;

    @Autowired
    private PosCashMovementRepository cashMovementRepository;

    /**
     * Creates the drawer cash-out for an approved cash-refund return, or returns the existing
     * movement if one was already booked for this return.
     *
     * <p>Runs inside the caller's transaction ({@code REQUIRED} propagation), so the cash
     * movement, the stock movements, the GL journals and the return's own APPROVED status all
     * commit together or not at all. A failure here rolls the whole approval back rather than
     * leaving a return marked refunded with no corresponding cash movement.
     *
     * @return the movement, or {@code null} when the return is not a cash refund
     */
    @Transactional
    public PosCashMovement recordCashRefund(SalesReturn salesReturn) {
        if (salesReturn.getRefundMethod() == null || !salesReturn.getRefundMethod().isCashDrawerAffecting()) {
            return null;
        }

        BigDecimal amount = resolveRefundAmount(salesReturn);
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("[SalesReturn] {} is a cash refund with a non-positive amount ({}); no cash movement posted.",
                    salesReturn.getReturnNumber(), amount);
            return null;
        }

        // Idempotency, first line of defence. The approval path also locks the return row, so
        // two concurrent confirmations cannot both reach this point — but a retry that arrives
        // after the first transaction committed would, and must not pay the customer twice.
        Optional<PosCashMovement> existing = findExistingRefundMovement(salesReturn.getReturnNumber());
        if (existing.isPresent()) {
            log.info("[SalesReturn] {} already has cash movement id={}; skipping duplicate creation.",
                    salesReturn.getReturnNumber(), existing.get().getId());
            return existing.get();
        }

        Long sessionId = salesReturn.getPosSessionId();
        if (sessionId == null) {
            // The UI blocks this, but the API must not depend on that. Cash cannot leave a
            // drawer that no session is accountable for.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cash Refund requires an open POS session. " + salesReturn.getReturnNumber()
                            + " has no POS session attached — choose another refund method, or process "
                            + "the return from a POS terminal with an open session.");
        }

        PosCashMovementCategory category = findRefundCategory();

        String description = buildDescription(salesReturn);

        // reference = return number: the traceable link back to the return, and the key the
        // duplicate check above reads.
        PosCashMovement movement = posSessionService.addCashMovement(
                sessionId,
                PosCashMovementType.DROP_OUT.name(),
                amount,
                description,
                salesReturn.getReturnNumber(),
                category.getId());

        log.info("[SalesReturn] {} — cash refund of {} booked as DROP_OUT movement id={} on session {} "
                        + "(terminal {}, business date {}).",
                salesReturn.getReturnNumber(), amount, movement.getId(), sessionId,
                salesReturn.getPosTerminalId(), movement.getBusinessDate());

        return movement;
    }

    /**
     * The amount actually paid out. Prefers the explicit refund amount and falls back to the
     * return total, which are equal unless a partial settlement was recorded.
     */
    private BigDecimal resolveRefundAmount(SalesReturn salesReturn) {
        BigDecimal amount = salesReturn.getRefundAmount() != null
                ? salesReturn.getRefundAmount()
                : salesReturn.getTotalAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    /**
     * An existing ACTIVE cash movement already booked against this return number.
     *
     * <p>Voided movements are ignored on purpose: if a refund movement was voided, the money
     * was returned to the drawer and a re-issued refund is a legitimate new payout.
     */
    private Optional<PosCashMovement> findExistingRefundMovement(String returnNumber) {
        if (returnNumber == null || returnNumber.isBlank()) return Optional.empty();
        return cashMovementRepository
                .findByReferenceAndMovementTypeAndStatus(
                        returnNumber, PosCashMovementType.DROP_OUT, PosCashMovementStatus.ACTIVE)
                .stream()
                .findFirst();
    }

    /**
     * The seeded refund category. Absent only when the chart of accounts was never seeded, in
     * which case refusing is the correct outcome — the alternative is booking the payout to
     * General Expense and silently overstating both AR and expenses.
     */
    private PosCashMovementCategory findRefundCategory() {
        return categoryRepository.findAll().stream()
                .filter(c -> SalesReturnCashCategorySeeder.CATEGORY_CODE.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "The '" + SalesReturnCashCategorySeeder.CATEGORY_CODE + "' cash movement category is "
                                + "missing, so a cash refund cannot be posted to the correct account. "
                                + "Restart the application to seed it, or contact your administrator."));
    }

    /** Human-readable drawer narration; the structured linkage lives in {@code reference}. */
    private String buildDescription(SalesReturn salesReturn) {
        StringBuilder sb = new StringBuilder("Sales Return refund ").append(salesReturn.getReturnNumber());
        if (salesReturn.getLinkedInvoice() != null && !salesReturn.getLinkedInvoice().isBlank()) {
            sb.append(" (invoice ").append(salesReturn.getLinkedInvoice()).append(')');
        }
        if (salesReturn.getCustomerName() != null && !salesReturn.getCustomerName().isBlank()) {
            sb.append(" — ").append(salesReturn.getCustomerName());
        }
        return sb.length() > 500 ? sb.substring(0, 500) : sb.toString();
    }
}
