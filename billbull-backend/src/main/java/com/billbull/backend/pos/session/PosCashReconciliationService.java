package com.billbull.backend.pos.session;

import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.admin.CorrectionTargetType;
import com.billbull.backend.pos.admin.EffectiveCorrectionViewService;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.payment.TenderBucket;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * The single authority for POS drawer reconciliation.
 *
 * <h3>The model</h3>
 * <pre>
 *   Expected Closing Cash = L1 Opening Float
 *                         + L2 Cash Tender Collected
 *                         + L3 Authorized Cash-In
 *                         − L3 Authorized Cash-Out
 * </pre>
 * Four terms, three ledgers, and no per-category members. Business purpose lives in
 * {@code PosCashMovementCategory}; direction lives in {@code PosCashMovementType}. Adding a new
 * kind of cash movement — a new payout reason, a new deposit type — must never add a term here.
 * That constraint is what keeps the formula from re-acquiring the double counts it used to have.
 *
 * <h3>Why this class exists</h3>
 * The algebra was already correct and already lived in one method
 * ({@code PosSessionService#computeExpectedCash}), which is why it is moved here verbatim rather
 * than rewritten. What was <em>not</em> single was everything around it: the X-Report resolved
 * correction overlays before computing, {@code closeSession} did not, and the frontend carried
 * eight further reconstructions of the same sum — two of which omitted cash movements entirely
 * and therefore hid every cash refund. The same session could report three different Expected
 * Cash figures depending on which screen asked.
 *
 * <p>So the value of this class is not the arithmetic. It is that there is now exactly one place
 * that decides which rows count, what a correction does to them, and what "not counted" means.
 *
 * <h3>Read-only by construction</h3>
 * {@code reconcile} performs no writes: no journal, no cash movement, no session mutation. It is
 * deterministic for a given database state and safe to call from a report path and a close path
 * alike. Freezing the result onto the session stays the caller's job, so the transaction
 * boundary of {@code closeSession} is unchanged by the extraction.
 */
@Service
public class PosCashReconciliationService {

    private final PaymentRepository paymentRepository;
    private final ReceiptVoucherRepository receiptVoucherRepository;
    private final EffectiveCorrectionViewService effectiveCorrectionViewService;
    private final EntityManager entityManager;

    public PosCashReconciliationService(PaymentRepository paymentRepository,
                                        ReceiptVoucherRepository receiptVoucherRepository,
                                        EffectiveCorrectionViewService effectiveCorrectionViewService,
                                        EntityManager entityManager) {
        this.paymentRepository = paymentRepository;
        this.receiptVoucherRepository = receiptVoucherRepository;
        this.effectiveCorrectionViewService = effectiveCorrectionViewService;
        this.entityManager = entityManager;
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    /**
     * Reconciles one drawer.
     *
     * @param session the session that owns the drawer. Passed as an entity rather than an id
     *      because both callers already hold one, and re-fetching would risk reconciling a
     *      different snapshot than the one being closed.
     */
    @Transactional(readOnly = true)
    public PosCashReconciliationResult reconcile(PosSession session) {
        Long sessionId = session.getId();

        BigDecimal openingFloat = nz(session.getOpeningCash());
        BigDecimal cashTender = cashTenderCollected(sessionId);

        List<PosCashMovement> movements = effectiveMovements(session);
        BigDecimal cashIn = sumMovements(movements, PosCashMovementType.DROP_IN);
        BigDecimal cashOut = sumMovements(movements, PosCashMovementType.DROP_OUT);

        // The formula, unchanged: moved from PosSessionService#computeExpectedCash, same
        // operands in the same order.
        BigDecimal expectedCash = openingFloat.add(cashTender).add(cashIn).subtract(cashOut);

        BigDecimal countedCash = effectiveCountedCash(session);
        LocalDateTime countedAt = countedCash == null ? null : effectiveCountedAt(session);

        return new PosCashReconciliationResult(
                sessionId, openingFloat, cashTender, cashIn, cashOut,
                expectedCash, countedCash, countedAt, statusOf(expectedCash, countedCash));
    }

    // ── Frozen snapshots: what a closed drawer was reconciled to ─────────────────────────

    /**
     * The reconciliation a closed session was frozen with, rather than a fresh one.
     *
     * <p>Reports of past days must show what the drawer was actually counted against, not what
     * the same query returns today. Recomputing would let a closed session's expected cash drift
     * as later data lands — a delivery settled afterwards, a movement voided — and quietly
     * restate a figure a cashier was already held accountable for.
     *
     * <p>The one thing that legitimately moves after a close is an <em>approved correction</em>,
     * which exists precisely to restate a count through an auditable workflow. So counted cash is
     * read through the same overlay resolution {@link #reconcile} uses, and expected cash is
     * taken from the frozen column. Both halves of the variance therefore describe the same
     * effective state, and there is still exactly one place that decides what a correction means.
     *
     * @param session a CLOSED session; an open one has nothing frozen and is reconciled live
     */
    @Transactional(readOnly = true)
    public PosCashReconciliationResult frozen(PosSession session) {
        if (session.getStatus() != PosSessionStatus.CLOSED) {
            return reconcile(session);
        }
        BigDecimal expectedCash = nz(session.getExpectedCash());
        BigDecimal countedCash = effectiveCountedCash(session);
        LocalDateTime countedAt = countedCash == null ? null : effectiveCountedAt(session);

        return new PosCashReconciliationResult(
                session.getId(), nz(session.getOpeningCash()), null, null, null,
                expectedCash, countedCash, countedAt, statusOf(expectedCash, countedCash));
    }

    /**
     * A day's reconciliation, aggregated from the frozen per-session snapshots.
     *
     * <p>Addition over already-authoritative values — deliberately not a day-level re-derivation
     * from the day's transactions, which would be a second cash model competing with the one the
     * sessions were closed against.
     */
    @Transactional(readOnly = true)
    public PosDayCashReconciliation summarizeDay(List<PosSession> sessions) {
        BigDecimal expectedAll = BigDecimal.ZERO;
        BigDecimal countedTotal = null;
        BigDecimal expectedOfCounted = BigDecimal.ZERO;
        int counted = 0;
        int uncounted = 0;
        int withVariance = 0;

        List<PosSession> all = sessions == null ? List.of() : sessions;
        for (PosSession session : all) {
            PosCashReconciliationResult r = frozen(session);
            expectedAll = expectedAll.add(nz(r.expectedCash()));
            if (r.countedCash() == null) {
                uncounted++;
                continue;
            }
            counted++;
            countedTotal = (countedTotal == null ? BigDecimal.ZERO : countedTotal).add(r.countedCash());
            expectedOfCounted = expectedOfCounted.add(nz(r.expectedCash()));
            if (r.variance() != null && r.variance().signum() != 0) withVariance++;
        }

        return new PosDayCashReconciliation(expectedAll, countedTotal, expectedOfCounted,
                all.size(), counted, uncounted, withVariance,
                dayStatus(all.size(), uncounted, countedTotal, expectedOfCounted));
    }

    /**
     * The day's status.
     *
     * <p>A day with any uncounted drawer is NOT_COUNTED, never BALANCED — one verified till does
     * not make the day verified, and labelling it balanced would hide the drawer nobody counted.
     */
    private static PosCashReconciliationStatus dayStatus(int sessionCount, int uncounted,
                                                         BigDecimal countedTotal,
                                                         BigDecimal expectedOfCounted) {
        if (sessionCount == 0 || uncounted > 0 || countedTotal == null) {
            return PosCashReconciliationStatus.NOT_COUNTED;
        }
        return statusOf(expectedOfCounted, countedTotal);
    }

    /**
     * L2 — cash settlement attributable to this collection session.
     *
     * <p>Two sources, one rule: the row must carry <em>this</em> session and bucket as cash.
     * There is no per-category term — a POS cash sale, a delivery settlement collected here, the
     * cash leg of a mixed tender, a credit receipt taken at the till and a customer advance are
     * all simply cash tender that names this drawer.
     *
     * <p>Keyed on {@code Payment.posSessionId}, the COLLECTION session — never
     * {@code SalesInvoice.posSessionId} (the SALE session), which for a delivery order settled
     * weeks later belongs to a different and probably already-counted drawer.
     */
    private BigDecimal cashTenderCollected(Long sessionId) {
        if (sessionId == null) return BigDecimal.ZERO;
        List<Long> ids = List.of(sessionId);

        BigDecimal total = BigDecimal.ZERO;
        for (Object[] row : paymentRepository.sumTenderByModeForSessions(ids)) {
            String rawMode = (String) row[0];
            if (!TenderBucket.CASH.equals(TenderBucket.of(rawMode))) continue;
            total = total.add(row[1] != null ? (BigDecimal) row[1] : BigDecimal.ZERO);
        }

        for (ReceiptVoucher rv : effectiveAdvances(sessionId)) {
            if (!ReceiptPurpose.ADVANCE_RECEIVED.equals(rv.getPurpose())) continue;
            if (!TenderBucket.CASH.equals(TenderBucket.of(rv.getPaymentMode()))) continue;
            total = total.add(nz(rv.getAmount()));
        }
        return total;
    }

    /**
     * Advances for this session with approved corrections applied.
     *
     * <p>Detached first so resolving an overlay cannot write a corrected value back through the
     * persistence context — the correction model is display-time, and this service must stay
     * read-only.
     */
    private List<ReceiptVoucher> effectiveAdvances(Long sessionId) {
        List<ReceiptVoucher> advances = receiptVoucherRepository.findByPosSessionId(sessionId);
        if (advances == null || advances.isEmpty()) return List.of();
        advances.forEach(entityManager::detach);
        return effectiveCorrectionViewService.resolveOverlays(
                CorrectionTargetType.RECEIPT_VOUCHER, advances, ReceiptVoucher::getId);
    }

    /**
     * Drawer movements for this session with approved corrections applied.
     *
     * <p>Resolved onto transient copies, never onto the session's own managed instances: overlay
     * resolution writes the corrected values into the object it is given, and this service is
     * called from write transactions (Cash Out, Close Session) where mutating — or detaching —
     * an element of {@code session.getCashMovements()} corrupts the cascade on the next flush.
     * See {@link PosCashMovement#detachedCopy()}.
     */
    private List<PosCashMovement> effectiveMovements(PosSession session) {
        List<PosCashMovement> movements = session.getCashMovements();
        if (movements == null || movements.isEmpty()) return List.of();
        List<PosCashMovement> copy = movements.stream().map(PosCashMovement::detachedCopy).toList();
        return effectiveCorrectionViewService.resolveOverlays(
                CorrectionTargetType.CASH_MOVEMENT, copy, PosCashMovement::getId);
    }

    /**
     * ACTIVE-only sum. A voided movement never contributes to Expected Cash: the money went
     * back where it came from, and its GL was reversed.
     */
    private static BigDecimal sumMovements(List<PosCashMovement> movements, PosCashMovementType type) {
        return movements.stream()
                .filter(m -> type.equals(m.getMovementType()))
                .filter(m -> m.getStatus() == null || m.getStatus() == PosCashMovementStatus.ACTIVE)
                .map(m -> nz(m.getAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * The physical count, or {@code null} when none was taken.
     *
     * <p>{@code closing_cash} is null until a session is closed, which is what makes "not
     * counted" distinguishable from "counted zero" without changing how counts are persisted.
     *
     * <p>An applied denomination correction restates the count, so it wins. Reading the raw
     * {@code closingCash} while the denominations displayed elsewhere were overlaid is what let
     * a corrected session report a count, a denomination breakdown and a variance that did not
     * agree with each other.
     */
    private BigDecimal effectiveCountedCash(PosSession session) {
        // "Counted" is established by the presence of a physical count, not by closingCash being
        // non-null and not by it being non-zero. A drawer counted and found empty has a real
        // count of 0.00; a drawer never counted has none, and must not be reported as short by
        // its whole expected balance.
        if (!hasCount(session)) return null;

        BigDecimal stored = session.getClosingCash();
        if (session.getId() == null || session.getStatus() != PosSessionStatus.CLOSED) {
            return stored;
        }
        Map<String, Object> effective = effectiveCorrectionViewService.getEffectiveView(
                CorrectionTargetType.POS_SESSION, session.getId());
        if (!Boolean.TRUE.equals(effective.get("corrected"))) return stored;

        Object correctedTotal = effective.get("effectiveTotal");
        if (correctedTotal instanceof BigDecimal bd) return bd;
        if (correctedTotal instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return stored;
    }

    /**
     * Whether a physical count exists for this drawer.
     *
     * <p>A denomination snapshot is the evidence of counting. {@code countedAt} is the explicit
     * marker going forward, but sessions closed before it existed carry only the snapshot, so a
     * snapshot with no timestamp still counts — otherwise every historical session would
     * regress to "not counted" the moment this shipped.
     */
    private static boolean hasCount(PosSession session) {
        if (session.getCountedAt() != null) return true;
        String snapshot = session.getClosingDenominationsJson();
        return snapshot != null && !snapshot.isBlank();
    }

    /** The count timestamp, falling back to close time for pre-existing sessions. */
    private static LocalDateTime effectiveCountedAt(PosSession session) {
        return session.getCountedAt() != null ? session.getCountedAt() : session.getClosedAt();
    }

    private static PosCashReconciliationStatus statusOf(BigDecimal expected, BigDecimal counted) {
        if (counted == null) return PosCashReconciliationStatus.NOT_COUNTED;
        int cmp = counted.compareTo(expected);
        if (cmp == 0) return PosCashReconciliationStatus.BALANCED;
        return cmp > 0 ? PosCashReconciliationStatus.OVER : PosCashReconciliationStatus.SHORT;
    }
}
