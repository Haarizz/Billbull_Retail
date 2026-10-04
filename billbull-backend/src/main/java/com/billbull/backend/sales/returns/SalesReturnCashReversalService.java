package com.billbull.backend.sales.returns;

import com.billbull.backend.config.SalesReturnCashCategorySeeder;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
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
 * Puts drawer cash back when a cash-refunded Sales Return is reversed.
 *
 * <p><b>A compensating movement, not a void.</b> The original {@code DROP_OUT} is left exactly as
 * it is and a {@code DROP_IN} is posted against it. Voiding would be the wrong instrument twice
 * over: the payout genuinely happened and the audit trail should keep saying so, and the session
 * it belongs to is usually closed and already counted, so rewriting it would silently restate a
 * Z-report that has been signed off. Cash coming back is a new event on the day it comes back.
 *
 * <p>The {@code SALES_RETURN_REFUND_REVERSAL} category carries a GL override to Accounts
 * Receivable, so the drop-in posts {@code Dr Cash / Cr Accounts Receivable} — the exact contra of
 * the payout's {@code Dr Accounts Receivable / Cr Cash}. Without that override a default drop-in
 * would post to Petty Cash and leave AR overstated, which is the same class of mis-posting
 * {@link SalesReturnCashCategorySeeder} exists to prevent on the way out.
 */
@Service
public class SalesReturnCashReversalService {

    private static final Logger log = LoggerFactory.getLogger(SalesReturnCashReversalService.class);

    private final PosSessionService posSessionService;
    private final PosCashMovementRepository cashMovementRepository;
    private final PosCashMovementCategoryRepository categoryRepository;

    public SalesReturnCashReversalService(PosSessionService posSessionService,
                                          PosCashMovementRepository cashMovementRepository,
                                          PosCashMovementCategoryRepository categoryRepository) {
        this.posSessionService = posSessionService;
        this.cashMovementRepository = cashMovementRepository;
        this.categoryRepository = categoryRepository;
    }

    /**
     * Posts the compensating drop-in for a reversed cash refund.
     *
     * <p>Runs inside the reversal's transaction, so the cash movement and the contra journals
     * commit together — a return is never reported as reversed while the drawer still shows the
     * money gone.
     *
     * @return the drop-in, or {@code null} when the return is not a cash refund or never had a
     *         live payout to compensate
     */
    @Transactional
    public PosCashMovement recordCashRefundReversal(SalesReturn salesReturn) {
        if (salesReturn.getRefundMethod() == null
                || !salesReturn.getRefundMethod().isCashDrawerAffecting()) {
            return null;
        }

        Optional<PosCashMovement> payout = findActivePayout(salesReturn.getReturnNumber());
        if (payout.isEmpty()) {
            // Nothing left the drawer for this return — a pre-Phase-2 row, or a payout already
            // voided by hand. Posting a drop-in anyway would put in cash that never went out.
            log.warn("[SalesReturn] {} is a cash refund with no ACTIVE drawer payout — no"
                            + " compensating drop-in posted.", salesReturn.getReturnNumber());
            return null;
        }

        String reference = salesReturn.getReturnNumber() + "-REV";
        if (findExistingReversal(reference).isPresent()) {
            log.info("[SalesReturn] {} already has a compensating drop-in; not posted again.",
                    salesReturn.getReturnNumber());
            return findExistingReversal(reference).get();
        }

        BigDecimal amount = payout.get().getAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("[SalesReturn] {} — drawer payout {} has a non-positive amount; nothing to"
                    + " compensate.", salesReturn.getReturnNumber(), payout.get().getId());
            return null;
        }

        // Cash can only go back into a drawer a session is accountable for, and that session has
        // to be open now — not the one the payout came from, which is usually long closed.
        Long sessionId = salesReturn.getPosSessionId();
        if (sessionId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Reversing the cash refund on " + salesReturn.getReturnNumber()
                            + " needs an open POS session to put the cash back into. Reverse it from"
                            + " a POS terminal with an open session.");
        }

        PosCashMovementCategory category = findReversalCategory();

        PosCashMovement movement = posSessionService.addCashMovement(
                sessionId,
                PosCashMovementType.DROP_IN.name(),
                amount,
                "Cash returned on reversal of Sales Return " + salesReturn.getReturnNumber(),
                reference,
                category.getId());

        log.info("[SalesReturn] {} — cash refund of {} returned to drawer as DROP_IN movement id={}"
                        + " on session {} (compensating payout id={}).",
                salesReturn.getReturnNumber(), amount, movement.getId(), sessionId, payout.get().getId());

        return movement;
    }

    private Optional<PosCashMovement> findActivePayout(String returnNumber) {
        return cashMovementRepository.findAll().stream()
                .filter(m -> returnNumber.equals(m.getReference()))
                .filter(m -> m.getMovementType() == PosCashMovementType.DROP_OUT)
                .filter(m -> m.getStatus() == PosCashMovementStatus.ACTIVE)
                .findFirst();
    }

    private Optional<PosCashMovement> findExistingReversal(String reference) {
        return cashMovementRepository.findAll().stream()
                .filter(m -> reference.equals(m.getReference()))
                .filter(m -> m.getMovementType() == PosCashMovementType.DROP_IN)
                .filter(m -> m.getStatus() == PosCashMovementStatus.ACTIVE)
                .findFirst();
    }

    private PosCashMovementCategory findReversalCategory() {
        return categoryRepository.findAll().stream()
                .filter(c -> SalesReturnCashCategorySeeder.REVERSAL_CATEGORY_CODE.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Cash-movement category '" + SalesReturnCashCategorySeeder.REVERSAL_CATEGORY_CODE
                                + "' is missing. It is seeded at startup from the chart of accounts;"
                                + " without it the drop-in would post to the wrong GL account."));
    }
}
