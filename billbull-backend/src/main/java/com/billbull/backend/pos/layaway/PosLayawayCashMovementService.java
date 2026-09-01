package com.billbull.backend.pos.layaway;

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
 * Books the drawer movements for layaway cash: deposits and instalments in, cancellation
 * refunds out.
 *
 * <p>Layaway cash previously reached {@code pos_layaway_payments} and the general ledger and
 * stopped there. Physically the notes were in the till, so every cash deposit left the drawer
 * long at close and every cash cancellation refund left it short — with nothing on any report
 * to explain either.
 *
 * <h3>Why a drawer movement and not a Payment row</h3>
 * A layaway is not an invoice. Recording it as tender would create a {@code Payment} with no
 * {@code linkedInvoice}, which {@code PaymentService#upsertReceiptVoucher} classifies as a
 * general receipt and sweeps against the customer's <em>outstanding invoices</em> — settling
 * unrelated debt with layaway money. It would also pull layaway into cash sales, sales revenue
 * and every tender report, none of which it belongs in: the money is a customer liability
 * ({@code Customer Advances 2060}) until the layaway converts.
 *
 * <p>Booking it as a categorised {@code DROP_IN}/{@code DROP_OUT} keeps it out of all of that
 * while still putting it in Expected Cash exactly once — which is the whole requirement.
 *
 * <h3>Accounting is deliberately left alone</h3>
 * Movements are created with {@code postGlJournal = false}. {@code
 * createJournalFromLayawayDeposit} and {@code reverseLayawayDepositJournal} already post the
 * complete entries including their Cash legs, so a second journal from the movement would
 * double them. This service changes the drawer ledger and nothing about the general ledger.
 *
 * <h3>Session attribution</h3>
 * Every method takes the drawer session as a parameter. It is never read from
 * {@code PosLayaway#getPosSessionId()} — that is the session the layaway was <em>created</em>
 * in, and an instalment or a cancellation refund weeks later is collected or paid at whichever
 * till is open then. Using the originating session would attribute today's cash to a drawer
 * that was counted and closed long ago.
 */
@Service
public class PosLayawayCashMovementService {

    private static final Logger log = LoggerFactory.getLogger(PosLayawayCashMovementService.class);

    static final String DEPOSIT_REFERENCE_PREFIX = "LAY-DEP-";
    static final String INSTALMENT_REFERENCE_PREFIX = "LAY-PAY-";
    static final String REFUND_REFERENCE_PREFIX = "LAY-REF-";

    private final PosSessionService posSessionService;
    private final PosDrawerSessionValidator drawerSessionValidator;
    private final PosCashMovementCategoryRepository categoryRepository;
    private final PosCashMovementRepository cashMovementRepository;

    public PosLayawayCashMovementService(PosSessionService posSessionService,
                                         PosDrawerSessionValidator drawerSessionValidator,
                                         PosCashMovementCategoryRepository categoryRepository,
                                         PosCashMovementRepository cashMovementRepository) {
        this.posSessionService = posSessionService;
        this.drawerSessionValidator = drawerSessionValidator;
        this.categoryRepository = categoryRepository;
        this.cashMovementRepository = cashMovementRepository;
    }

    /**
     * True when settling by this mode moves physical cash in the drawer. Layaway payment modes
     * are free text, so this uses the same "contains cash" convention as the rest of the cash
     * reconciliation — and deliberately mirrors what the GL side does, which treats anything
     * non-card as cash. (That GL default is itself wrong for bank transfers and is tracked
     * separately; this method must not inherit the bug, so it tests for cash positively.)
     */
    public static boolean isCashDrawerAffecting(String paymentMode) {
        return paymentMode != null && paymentMode.toLowerCase(java.util.Locale.ROOT).contains("cash");
    }

    /** Cash into the drawer for the deposit taken when the layaway was created. */
    @Transactional
    public PosCashMovement recordDeposit(Long layawayId, String layawayNumber, BigDecimal amount,
                                         String paymentMode, Long posSessionId) {
        return recordIn(DEPOSIT_REFERENCE_PREFIX + layawayId, layawayId, layawayNumber, amount,
                paymentMode, posSessionId, "Layaway deposit");
    }

    /** Cash into the drawer for a later instalment against an open layaway. */
    @Transactional
    public PosCashMovement recordInstalment(Long layawayPaymentId, Long layawayId, String layawayNumber,
                                            BigDecimal amount, String paymentMode, Long posSessionId) {
        return recordIn(INSTALMENT_REFERENCE_PREFIX + layawayPaymentId, layawayId, layawayNumber, amount,
                paymentMode, posSessionId, "Layaway instalment");
    }

    /** Cash out of the drawer when a layaway is cancelled and its cash deposit returned. */
    @Transactional
    public PosCashMovement recordCancellationRefund(Long layawayId, String layawayNumber, BigDecimal amount,
                                                    String paymentMode, Long posSessionId) {
        if (!isCashDrawerAffecting(paymentMode)) return null;
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return null;

        String reference = REFUND_REFERENCE_PREFIX + layawayId;
        Optional<PosCashMovement> existing = findExisting(reference, PosCashMovementType.DROP_OUT);
        if (existing.isPresent()) {
            log.info("[Layaway] {} already has cancellation refund movement id={}; skipping duplicate creation.",
                    layawayNumber, existing.get().getId());
            return existing.get();
        }

        drawerSessionValidator.requireOpenDrawerSession(posSessionId, "Refunding a layaway deposit in cash");

        PosCashMovement movement = posSessionService.addCashMovement(
                posSessionId,
                PosCashMovementType.DROP_OUT.name(),
                amount,
                describe("Layaway cancellation refund", layawayNumber),
                reference,
                categoryId(PosDrawerCashCategorySeeder.LAYAWAY_REFUND_CODE),
                false);

        log.info("[Layaway] {} — cash refund of {} booked as DROP_OUT movement id={} on session {}.",
                layawayNumber, amount, movement.getId(), posSessionId);
        return movement;
    }

    private PosCashMovement recordIn(String reference, Long layawayId, String layawayNumber,
                                     BigDecimal amount, String paymentMode, Long posSessionId,
                                     String label) {
        if (!isCashDrawerAffecting(paymentMode)) return null;
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return null;

        Optional<PosCashMovement> existing = findExisting(reference, PosCashMovementType.DROP_IN);
        if (existing.isPresent()) {
            log.info("[Layaway] {} already has movement id={} for {}; skipping duplicate creation.",
                    layawayNumber, existing.get().getId(), reference);
            return existing.get();
        }

        drawerSessionValidator.requireOpenDrawerSession(posSessionId, "Taking a layaway payment in cash");

        PosCashMovement movement = posSessionService.addCashMovement(
                posSessionId,
                PosCashMovementType.DROP_IN.name(),
                amount,
                describe(label, layawayNumber),
                reference,
                categoryId(PosDrawerCashCategorySeeder.LAYAWAY_DEPOSIT_CODE),
                false);

        log.info("[Layaway] {} — cash of {} booked as DROP_IN movement id={} on session {}.",
                layawayNumber, amount, movement.getId(), posSessionId);
        return movement;
    }

    private static String describe(String label, String layawayNumber) {
        String text = layawayNumber != null && !layawayNumber.isBlank()
                ? label + " " + layawayNumber : label;
        return text.length() > 500 ? text.substring(0, 500) : text;
    }

    /**
     * Voided movements are ignored on purpose: a voided deposit movement means the cash went
     * back out of the drawer, so a re-taken deposit is a legitimate new movement.
     */
    private Optional<PosCashMovement> findExisting(String reference, PosCashMovementType type) {
        return cashMovementRepository
                .findByReferenceAndMovementTypeAndStatus(reference, type, PosCashMovementStatus.ACTIVE)
                .stream()
                .findFirst();
    }

    /**
     * The seeded category. Absent only when the chart of accounts was never seeded, in which
     * case refusing is correct — the alternative books a customer liability to Petty Cash or
     * General Expense.
     */
    private Long categoryId(String code) {
        PosCashMovementCategory category = categoryRepository.findAll().stream()
                .filter(c -> code.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "The '" + code + "' cash movement category is missing, so layaway cash cannot be "
                                + "posted to the correct account. Restart the application to seed it, or "
                                + "contact your administrator."));
        return category.getId();
    }
}
