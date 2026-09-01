package com.billbull.backend.sales.advance;

import com.billbull.backend.config.PosDrawerCashCategorySeeder;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.session.PosDrawerSessionValidator;
import com.billbull.backend.pos.session.PosSessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Books the drawer cash-out for a customer advance refunded in cash.
 *
 * <p>Before this existed, {@code AdvanceApplicationService#refund} posted a GL journal and
 * wrote an {@link AdvanceApplication} row, and nothing else. The notes left the till but
 * Expected Cash did not move, so the cashier was short at close with nothing to explain it —
 * the identical defect {@code SalesReturnCashRefundService} was written to fix for returns,
 * left unfixed on this path because the method never even took a session.
 *
 * <h3>Why it delegates rather than writing the row itself</h3>
 * Creation goes through {@link PosSessionService#addCashMovement}, the same method the POS
 * "Cash Drawer" quick action, the back-office Cash Drop/Outs screen and the Sales Return refund
 * all use. That method already owns session-OPEN validation, the business-day continuation
 * gate, the closure-workflow gate, category compatibility, the drawer-sufficiency check, audit
 * and terminal activity. Reimplementing any of it here would create the second cash ledger this
 * must not become.
 *
 * <h3>Accounting is deliberately left alone</h3>
 * The movement is created with {@code postGlJournal = false}. Unlike a Sales Return — whose own
 * journal has no cash leg, so the movement's posting completes it —
 * {@code createJournalFromAdvanceRefund} already posts the whole entry:
 * {@code Dr Customer Advance / Cr Cash} (for a cash mode, via
 * {@code resolveIncomingPaymentAccount}). Posting again from the movement would double it.
 * This flow therefore changes the drawer ledger and nothing about the general ledger.
 */
@Service
public class AdvanceCashRefundService {

    private static final Logger log = LoggerFactory.getLogger(AdvanceCashRefundService.class);

    /** Reference prefix, and the key the duplicate check reads. */
    static final String REFERENCE_PREFIX = "ADV-REFUND-";

    private final PosSessionService posSessionService;
    private final PosDrawerSessionValidator drawerSessionValidator;
    private final PosCashMovementCategoryRepository categoryRepository;
    private final PosCashMovementRepository cashMovementRepository;

    public AdvanceCashRefundService(PosSessionService posSessionService,
                                    PosDrawerSessionValidator drawerSessionValidator,
                                    PosCashMovementCategoryRepository categoryRepository,
                                    PosCashMovementRepository cashMovementRepository) {
        this.posSessionService = posSessionService;
        this.drawerSessionValidator = drawerSessionValidator;
        this.categoryRepository = categoryRepository;
        this.cashMovementRepository = cashMovementRepository;
    }

    /**
     * True when settling an advance refund by this mode moves physical cash in the drawer.
     * Same "contains cash" convention the rest of the cash reconciliation uses for the
     * free-text payment modes these vouchers carry.
     */
    public static boolean isCashDrawerAffecting(String paymentMode) {
        return paymentMode != null && paymentMode.toLowerCase(java.util.Locale.ROOT).contains("cash");
    }

    /**
     * Creates the drawer cash-out for a cash advance refund paid from a till, or returns the
     * existing movement if one was already booked for this refund.
     *
     * <p>Runs inside the caller's transaction ({@code REQUIRED} propagation), so the cash
     * movement, the {@link AdvanceApplication} row and the GL journal commit together or not at
     * all. A till refund is never recorded without its matching drawer movement.
     *
     * <h3>Back-office refunds are a different thing, not a missing session</h3>
     * A refund paid from the office safe is a legitimate operation that moves no POS drawer
     * cash. It books no movement and takes no part in POS reconciliation — but it has to say so
     * ({@link AdvanceRefundCashSource#BACK_OFFICE}). Treating a missing session as "must be
     * back-office" would let a POS client that forgot to send its session pay cash out of a till
     * invisibly, which is the defect this class was written to remove.
     *
     * @param refundApplicationId the {@code AdvanceApplication} row for this refund — the
     *      identity of this one refund event, which is what makes the reference unique when an
     *      advance is refunded in more than one instalment
     * @param posSessionId the drawer session that physically paid the cash out. Required for
     *      {@code POS_DRAWER}; must be absent for {@code BACK_OFFICE}
     * @param cashSource where the notes came from; required for a cash refund
     * @return the movement, or {@code null} when the refund moves no POS drawer cash (non-cash
     *      mode, non-positive amount, or a back-office cash source)
     */
    @Transactional
    public PosCashMovement recordCashRefund(Long refundApplicationId, BigDecimal amount,
                                            String paymentMode, Long posSessionId,
                                            AdvanceRefundCashSource cashSource,
                                            String advanceVoucherId) {
        if (!isCashDrawerAffecting(paymentMode)) {
            return null;
        }

        AdvanceRefundCashSource source = resolveDeclaredSource(cashSource, posSessionId);
        if (source == AdvanceRefundCashSource.BACK_OFFICE) {
            // Office safe / petty cash: outside POS drawer reconciliation by declaration.
            // The advance-refund journal still posts exactly as it always has, so the
            // accounting behaviour of this path is unchanged.
            log.info("[AdvanceRefund] Application {} refunded {} in cash from BACK_OFFICE; "
                            + "no POS drawer movement booked.", refundApplicationId, amount);
            return null;
        }
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("[AdvanceRefund] Cash refund for application {} has a non-positive amount ({}); "
                    + "no cash movement posted.", refundApplicationId, amount);
            return null;
        }

        String reference = REFERENCE_PREFIX + refundApplicationId;

        // Idempotency, first line of defence — a retry arriving after the first transaction
        // committed must not pay the customer twice.
        Optional<PosCashMovement> existing = findExistingRefundMovement(reference);
        if (existing.isPresent()) {
            log.info("[AdvanceRefund] Application {} already has cash movement id={}; skipping duplicate creation.",
                    refundApplicationId, existing.get().getId());
            return existing.get();
        }

        // POS_DRAWER branch. The drawer is stated by the caller and validated here; it is never
        // resolved from a terminal, a branch, or whatever session happens to be open. Cash
        // cannot leave a till that no session is accountable for.
        drawerSessionValidator.requireOpenDrawerSession(
                posSessionId, "Refunding a customer advance in cash from a POS drawer");

        PosCashMovementCategory category = findRefundCategory();

        StringBuilder description = new StringBuilder("Customer advance refund");
        if (advanceVoucherId != null && !advanceVoucherId.isBlank()) {
            description.append(" (advance ").append(advanceVoucherId).append(')');
        }

        PosCashMovement movement = posSessionService.addCashMovement(
                posSessionId,
                PosCashMovementType.DROP_OUT.name(),
                amount,
                description.length() > 500 ? description.substring(0, 500) : description.toString(),
                reference,
                category.getId(),
                // The advance-refund journal already includes the Cash leg — see the class note.
                false);

        log.info("[AdvanceRefund] Advance refund of {} booked as DROP_OUT movement id={} on session {} "
                        + "(business date {}).",
                amount, movement.getId(), posSessionId, movement.getBusinessDate());

        return movement;
    }

    /**
     * Validates the caller's declaration and returns the source to act on.
     *
     * <p>Deliberately has no default. The two error cases are the whole point:
     * <ul>
     *   <li>nothing declared at all — could be a till refund whose client forgot the session,
     *       or a back-office one; guessing either way risks silently unreconciled till cash</li>
     *   <li>BACK_OFFICE together with a session — contradictory, and accepting it would book
     *       office-safe cash against a drawer</li>
     * </ul>
     */
    private AdvanceRefundCashSource resolveDeclaredSource(AdvanceRefundCashSource cashSource,
                                                          Long posSessionId) {
        if (cashSource == null) {
            if (posSessionId != null) return AdvanceRefundCashSource.POS_DRAWER;
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A cash advance refund must say where the cash comes from. Send "
                            + "cashSource=POS_DRAWER with the collecting posSessionId for a refund paid "
                            + "from a till, or cashSource=BACK_OFFICE for one paid from the office safe.");
        }
        if (cashSource == AdvanceRefundCashSource.BACK_OFFICE && posSessionId != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A BACK_OFFICE cash refund cannot carry a POS session — office cash does not "
                            + "come out of a till drawer. Use cashSource=POS_DRAWER to refund from a till.");
        }
        return cashSource;
    }

    /**
     * An existing ACTIVE cash movement already booked for this refund.
     *
     * <p>Voided movements are ignored on purpose: if a refund movement was voided the money
     * went back into the drawer, and a re-issued refund is a legitimate new payout.
     */
    private Optional<PosCashMovement> findExistingRefundMovement(String reference) {
        return cashMovementRepository
                .findByReferenceAndMovementTypeAndStatus(
                        reference, PosCashMovementType.DROP_OUT, PosCashMovementStatus.ACTIVE)
                .stream()
                .findFirst();
    }

    /**
     * The seeded refund category. Absent only when the chart of accounts was never seeded, in
     * which case refusing is correct — the alternative books a customer liability to General
     * Expense.
     */
    private PosCashMovementCategory findRefundCategory() {
        return categoryRepository.findAll().stream()
                .filter(c -> PosDrawerCashCategorySeeder.ADVANCE_REFUND_CODE.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "The '" + PosDrawerCashCategorySeeder.ADVANCE_REFUND_CODE + "' cash movement category "
                                + "is missing, so a cash advance refund cannot be posted to the correct "
                                + "account. Restart the application to seed it, or contact your administrator."));
    }
}
