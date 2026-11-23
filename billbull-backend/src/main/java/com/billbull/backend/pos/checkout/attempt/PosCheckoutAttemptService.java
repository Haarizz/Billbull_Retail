package com.billbull.backend.pos.checkout.attempt;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;

/**
 * The checkout attempt journal (Phase 0 / M2): session claim, fenced write steps, evidence-based
 * recovery and administrative release.
 *
 * <h3>Protocol</h3>
 * <ol>
 *   <li><b>Claim</b> — one short transaction: {@code SET LOCAL lock_timeout}, lock the session row
 *       ({@code SELECT ... FOR UPDATE}), re-check its branch, closure workflow and OPEN status under
 *       that lock, then create the attempt (or reclaim a dead one) for the checkout key, with a new
 *       owner token, a fence number and a lease. It commits before any invoice work starts.</li>
 *   <li><b>Fenced steps</b> — each write step (invoice save, posting, each payment leg, the session
 *       totals) runs in its own transaction whose first statement is
 *       {@link PosCheckoutAttemptRepository#fence}. That update matches only the current owner token
 *       and fence, renews the lease, and holds the attempt row lock until the step commits. The
 *       existing service call joins that transaction, and the step's evidence column is written in
 *       it, so a step's business rows and its evidence commit together or not at all.</li>
 *   <li><b>Transitions</b> — close, begin-closure and suspend lock the same session row and then
 *       refuse while an ACTIVE or STALLED attempt exists ({@link PosCheckoutAttemptBarrier}).</li>
 * </ol>
 *
 * <h3>Lock order</h3>
 * A transaction that holds a session row lock only ever touches an attempt row with
 * {@code FOR UPDATE NOWAIT}, in a separate transaction ({@link #recoverIfExpired}). The fenced
 * session step is the one path that goes attempt → session; because the other direction never
 * waits, no wait cycle can form. The session row lock is held for the claim only, never through
 * invoice, inventory or GL posting.
 *
 * <h3>Recovery</h3>
 * A lease expiring changes nothing by itself. Recovery runs only on an ACTIVE attempt whose lease
 * has expired, and only after winning its row lock with NOWAIT, which is impossible while one of
 * its steps is in flight. It then classifies on durable evidence: all steps recorded → COMPLETED;
 * no invoice survives under the attempt → FAILED (reclaimable); otherwise → STALLED, which keeps
 * blocking the session until the owner re-adopts it or an administrator releases it.
 *
 * <h3>Abandonment (M2.2.3)</h3>
 * ABANDONED is only ever the result of an explicit {@link #abandon} and is terminal: it reserves the
 * key, so a late request under it is refused at the claim, before any business write. A key the
 * server never saw gets a tombstone row that competes with the claim on the key's unique index, so
 * whichever commits first wins and the other sees it. An attempt that exists can be abandoned only
 * from FAILED or RELEASED, under its row lock, after checking that no invoice survives under it.
 */
@Service
public class PosCheckoutAttemptService {

    private static final Logger log = LoggerFactory.getLogger(PosCheckoutAttemptService.class);

    /** PostgreSQL {@code lock_not_available}: a NOWAIT lock, or a wait that hit {@code lock_timeout}. */
    static final String SQLSTATE_LOCK_NOT_AVAILABLE = "55P03";
    /** PostgreSQL {@code query_canceled}: {@code statement_timeout}. */
    static final String SQLSTATE_QUERY_CANCELED = "57014";

    /** The only key source a new journal row is written with (see {@link ClaimRequest}). */
    static final String KEY_SOURCE_CLIENT = "CLIENT";

    private final PosCheckoutAttemptRepository repo;
    private final PosSessionRepository sessionRepository;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate txRequired;
    private final TransactionTemplate txRequiresNew;
    private final String instanceId;
    private final long leaseSeconds;
    private final long claimLockTimeoutMs;

    public PosCheckoutAttemptService(PosCheckoutAttemptRepository repo,
                                     PosSessionRepository sessionRepository,
                                     JdbcTemplate jdbc,
                                     PlatformTransactionManager transactionManager,
                                     @Value("${pos.checkout.attempt.lease-seconds:120}") long leaseSeconds,
                                     @Value("${pos.checkout.attempt.claim-lock-timeout-ms:5000}") long claimLockTimeoutMs) {
        this(repo, sessionRepository, jdbc, transactionManager, leaseSeconds, claimLockTimeoutMs, "");
    }

    /**
     * @param instanceIdPrefix {@code pos.checkout.attempt.instance-id}: an operator-chosen name for
     *        this backend process (e.g. the node name), recorded as the attempt owner. Empty means
     *        host name only. The pid and a per-boot random suffix are always appended, so two
     *        processes never share an owner identity even when configured with the same name.
     */
    @org.springframework.beans.factory.annotation.Autowired
    public PosCheckoutAttemptService(PosCheckoutAttemptRepository repo,
                                     PosSessionRepository sessionRepository,
                                     JdbcTemplate jdbc,
                                     PlatformTransactionManager transactionManager,
                                     @Value("${pos.checkout.attempt.lease-seconds:120}") long leaseSeconds,
                                     @Value("${pos.checkout.attempt.claim-lock-timeout-ms:5000}") long claimLockTimeoutMs,
                                     @Value("${pos.checkout.attempt.instance-id:}") String instanceIdPrefix) {
        this.repo = repo;
        this.sessionRepository = sessionRepository;
        this.jdbc = jdbc;
        this.txRequired = new TransactionTemplate(transactionManager);
        this.txRequired.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        this.txRequiresNew = new TransactionTemplate(transactionManager);
        this.txRequiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        if (leaseSeconds < 10) throw new IllegalArgumentException("pos.checkout.attempt.lease-seconds must be >= 10");
        if (claimLockTimeoutMs < 1) throw new IllegalArgumentException("pos.checkout.attempt.claim-lock-timeout-ms must be >= 1");
        this.leaseSeconds = leaseSeconds;
        this.claimLockTimeoutMs = claimLockTimeoutMs;
        this.instanceId = resolveInstanceId(instanceIdPrefix);
    }

    /** Optional observers of every fenced step (chaos testing only; none are registered by default). */
    private List<PosCheckoutStepHook> stepHooks = List.of();

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setStepHooks(List<PosCheckoutStepHook> stepHooks) {
        this.stepHooks = stepHooks != null ? List.copyOf(stepHooks) : List.of();
    }

    public long leaseSeconds() { return leaseSeconds; }
    public String instanceId() { return instanceId; }

    // ------------------------------------------------------------------ claim

    /**
     * What the caller wants to claim. The key is always the client's own: since M2.2.1 the server never
     * mints one, and every new journal row is written with key_source CLIENT (SERVER survives only on
     * rows journaled before then, which is why the column and its check constraint stay).
     */
    public record ClaimRequest(String checkoutKey, String requestHash, Long branchId,
                               Long sessionId, String terminalId, String initiatedBy, Long initiatedByUserId) {}

    /** Proof of ownership handed to every fenced step. */
    public record PosCheckoutClaim(UUID attemptId, String checkoutKey, UUID ownerToken, long fence, Long sessionId) {}

    public enum ConflictKind {
        /** Same key, different canonical request. */
        KEY_REUSED,
        /** Another worker owns the attempt and its lease is live (or a step is in flight). */
        IN_PROGRESS,
        /** Partly recorded; needs the owner to finish or an administrator to release. */
        STALLED,
        /** Already completed under this key with this hash: replay the invoice. */
        COMPLETED,
        /** Reclaimable, but an invoice still exists under the key: answer from that invoice. */
        INVOICE_EXISTS,
        /** The key was explicitly abandoned (M2.2.3). Terminal: nothing may be recorded under it. */
        ABANDONED
    }

    public sealed interface ClaimResult permits Claimed, Conflict, SessionRefused, Busy {}
    public record Claimed(PosCheckoutClaim claim) implements ClaimResult {}
    public record Conflict(ConflictKind kind, PosCheckoutAttempt attempt) implements ClaimResult {}
    /** The locked session failed the caller's check; {@code refusal} is what the check returned. */
    public record SessionRefused(Object refusal) implements ClaimResult {}
    /** The session row lock could not be had within the claim's lock timeout. Nothing was written. */
    public record Busy(String detail) implements ClaimResult {}

    /**
     * Claims the checkout key against the locked session.
     *
     * @param lockedSessionCheck run while the session row is locked, on the row as it is now
     *        ({@code null} when it does not exist). A non-empty result refuses the claim. It may also
     *        throw (for instance the close-workflow gate's 409), which rolls the claim back.
     */
    public ClaimResult claim(ClaimRequest request, Function<PosSession, Optional<?>> lockedSessionCheck) {
        try {
            return txRequired.execute(status -> {
                jdbc.execute("SET LOCAL lock_timeout = '" + claimLockTimeoutMs + "ms'");
                if (request.sessionId() != null) {
                    PosSession locked = sessionRepository.findByIdForUpdate(request.sessionId()).orElse(null);
                    Optional<?> refusal = lockedSessionCheck.apply(locked);
                    if (refusal.isPresent()) return new SessionRefused(refusal.get());
                }
                return claimKey(request);
            });
        } catch (RuntimeException ex) {
            if (isLockUnavailable(ex)) {
                log.warn("POS checkout claim busy: session={} key={} ({}ms lock timeout)",
                        request.sessionId(), request.checkoutKey(), claimLockTimeoutMs);
                return new Busy("session " + request.sessionId() + " is locked by another operation");
            }
            throw ex;
        }
    }

    private ClaimResult claimKey(ClaimRequest r) {
        for (int pass = 0; pass < 3; pass++) {
            Optional<PosCheckoutAttempt> existing = repo.findByKey(r.checkoutKey());
            if (existing.isEmpty()) {
                UUID id = UUID.randomUUID();
                UUID token = UUID.randomUUID();
                int inserted = repo.insertIfAbsent(id, r.checkoutKey(), KEY_SOURCE_CLIENT,
                        r.requestHash(), com.billbull.backend.pos.checkout.PosCheckoutRequestHasher.VERSION,
                        r.branchId(), r.sessionId(), r.terminalId(), r.initiatedBy(), r.initiatedByUserId(),
                        token, instanceId, leaseSeconds);
                if (inserted == 1) {
                    return new Claimed(new PosCheckoutClaim(id, r.checkoutKey(), token, 1L, r.sessionId()));
                }
                continue; // another transaction committed the key between our read and insert
            }
            PosCheckoutAttempt a = existing.get();
            // Terminal and key-wide: an abandoned key refuses every request, whatever its hash.
            if (a.state() == PosCheckoutAttemptState.ABANDONED) return new Conflict(ConflictKind.ABANDONED, a);
            if (!a.requestHash().equals(r.requestHash())) return new Conflict(ConflictKind.KEY_REUSED, a);
            switch (a.state()) {
                case COMPLETED: return new Conflict(ConflictKind.COMPLETED, a);
                case STALLED:   return new Conflict(ConflictKind.STALLED, a);
                case ACTIVE:
                    if (!a.leaseExpired()) return new Conflict(ConflictKind.IN_PROGRESS, a);
                    Optional<PosCheckoutAttempt> after = recoverIfExpired(a.id());
                    if (after.isEmpty() || after.get().state() == PosCheckoutAttemptState.ACTIVE) {
                        return new Conflict(ConflictKind.IN_PROGRESS, after.orElse(a));
                    }
                    continue; // re-read and decide on the recovered state
                case ABANDONED: return new Conflict(ConflictKind.ABANDONED, a); // refused above already
                default: // FAILED, RELEASED
                    if (invoiceSurvives(a)) return new Conflict(ConflictKind.INVOICE_EXISTS, a);
                    UUID token = UUID.randomUUID();
                    int taken = repo.reclaim(a.id(), a.state(), a.fence(), token, instanceId, leaseSeconds,
                            r.initiatedBy(), r.initiatedByUserId(),
                            "reclaimed from " + a.state() + " (attempt " + a.attemptCount() + ", fence " + a.fence()
                                    + ", owner " + a.ownerInstance() + ")"
                                    + (a.outcomeDetail() != null ? "; previous: " + a.outcomeDetail() : ""));
                    if (taken == 1) {
                        return new Claimed(new PosCheckoutClaim(a.id(), a.checkoutKey(), token, a.fence() + 1, r.sessionId()));
                    }
                    // somebody else changed it under us; read again
            }
        }
        return repo.findByKey(r.checkoutKey())
                .<ClaimResult>map(a -> new Conflict(ConflictKind.IN_PROGRESS, a))
                .orElse(new Busy("checkout key " + r.checkoutKey() + " could not be claimed"));
    }

    public Optional<PosCheckoutAttempt> find(String checkoutKey) {
        return repo.findByKey(checkoutKey);
    }

    public Optional<PosCheckoutAttempt> findById(UUID id) {
        return repo.findById(id);
    }

    // ------------------------------------------------------------------ till status lookup (M2.2.2)

    /** What the server holds under a checkout key, as far as the till needs to know. */
    public enum Recorded {
        /** A sale stands under this key. */
        YES,
        /** Nothing stands under this key right now. Definitive only once the till's request has ended. */
        NO,
        /** Some writes were committed, the sale is not finished (STALLED). Needs a supervisor. */
        PARTIAL,
        /** A worker owns the attempt (ACTIVE); the outcome is not decided yet. */
        UNKNOWN
    }

    /**
     * The read-only answer to "what happened to this key?" ({@code POST /api/pos/checkout/attempts/lookup}).
     * {@code sameRequest} is null when there is nothing to compare the request with.
     */
    public record KeyStatus(String checkoutKey, boolean found, PosCheckoutAttemptState state, Boolean sameRequest,
                            Recorded recorded, Long invoiceId, String invoiceNumber, Long branchId,
                            Long sessionId, String terminalId, boolean leaseExpired) {}

    /**
     * Classifies a key without changing anything: no claim, no recovery of an expired lease, no post
     * task. The till uses it to reconcile a checkout it persisted locally (after a reload or an
     * unexplained refusal) without replaying the sale. A replay is still the way to finish one.
     *
     * @param requestHash the canonical hash of the request the till holds for this key
     */
    public KeyStatus lookup(String checkoutKey, String requestHash) {
        Optional<PosCheckoutAttempt> found = repo.findByKey(checkoutKey);
        if (found.isEmpty()) {
            // No journal row: never claimed (not yet arrived, refused before the claim, or lost on the
            // way), or a sale recorded before M2 under this key.
            Optional<Long> invoiceId = repo.invoiceIdForKey(checkoutKey);
            return new KeyStatus(checkoutKey, false, null, null,
                    invoiceId.isPresent() ? Recorded.YES : Recorded.NO,
                    invoiceId.orElse(null), null, null, null, null, false);
        }
        PosCheckoutAttempt a = found.get();
        Recorded recorded = switch (a.state()) {
            case COMPLETED -> Recorded.YES;
            case STALLED -> Recorded.PARTIAL;
            case ACTIVE -> Recorded.UNKNOWN;
            case ABANDONED -> Recorded.NO; // terminal: nothing is, or ever will be, recorded under the key
            default -> invoiceSurvives(a) ? Recorded.YES : Recorded.NO; // FAILED, RELEASED
        };
        Long invoiceId = a.invoiceId() != null ? a.invoiceId() : repo.invoiceIdForKey(checkoutKey).orElse(null);
        return new KeyStatus(checkoutKey, true, a.state(), requestHash != null ? a.requestHash().equals(requestHash) : null,
                recorded, invoiceId, a.invoiceNumber(), a.branchId(), a.sessionId(), a.terminalId(), a.leaseExpired());
    }

    // ------------------------------------------------------------------ fenced steps

    /** The claim no longer owns its attempt: a newer owner or an administrator took it over. */
    public static class SupersededException extends RuntimeException {
        private final transient PosCheckoutClaim claim;
        private final String step;

        public SupersededException(PosCheckoutClaim claim, String step) {
            super("Checkout attempt " + claim.attemptId() + " (key " + claim.checkoutKey() + ", fence " + claim.fence()
                    + ") is no longer owned by this worker; step " + step + " was not run.");
            this.claim = claim;
            this.step = step;
        }

        public PosCheckoutClaim getClaim() { return claim; }
        public String getStep() { return step; }
    }

    /**
     * Runs one write step under the fence. {@code work} and {@code evidence} run in the same
     * transaction, after the fence update has locked the attempt row.
     *
     * @throws SupersededException when the claim no longer owns the attempt; nothing was written
     */
    public <T> T step(PosCheckoutClaim claim, String stepName, Supplier<T> work, Consumer<T> evidence) {
        for (PosCheckoutStepHook h : stepHooks) h.beforeStep(claim, stepName);
        return txRequired.execute(status -> {
            if (repo.fence(claim.attemptId(), claim.ownerToken(), claim.fence(), stepName, leaseSeconds) != 1) {
                throw new SupersededException(claim, stepName);
            }
            T result = work.get();
            if (evidence != null) evidence.accept(result);
            for (PosCheckoutStepHook h : stepHooks) h.insideStep(claim, stepName);
            return result;
        });
    }

    public void evidenceInvoiceSaved(PosCheckoutClaim c, Long invoiceId, String invoiceNumber) {
        repo.recordInvoiceSaved(c.attemptId(), c.ownerToken(), invoiceId, invoiceNumber);
    }

    public void evidencePosted(PosCheckoutClaim c, int paymentLegsExpected, boolean sessionStepRequired,
                               boolean serialsStepRequired, boolean salesOrderStepRequired) {
        repo.recordPosted(c.attemptId(), c.ownerToken(), paymentLegsExpected, sessionStepRequired,
                serialsStepRequired, salesOrderStepRequired);
    }

    public void evidenceSerialsMarked(PosCheckoutClaim c) {
        repo.recordSerialsMarked(c.attemptId(), c.ownerToken());
    }

    public void evidenceSalesOrderCompleted(PosCheckoutClaim c) {
        repo.recordSalesOrderCompleted(c.attemptId(), c.ownerToken());
    }

    /** Records, under the fence, that the Sales Order step ran and failed (the sale still stands). */
    public void recordSalesOrderFailure(PosCheckoutClaim c, String outcome) {
        step(c, "SALES_ORDER_OUTCOME", () -> null,
                ignored -> repo.recordSalesOrderOutcome(c.attemptId(), c.ownerToken(), outcome));
    }

    // ------------------------------------------------------------------ post-completion tasks

    /**
     * Runs a derived, retryable task (receipt QR, sale statistics) at most once per COMPLETED
     * attempt: the once-marker and the task's writes share one transaction. Returns false when the
     * task had already run (or the attempt is not COMPLETED). Never throws: a failure is logged and
     * the marker stays unset, so a later replay of the same key runs it again. Nothing here can undo
     * or misreport the settled sale.
     */
    public boolean runPostTask(UUID attemptId, String markerColumn, Runnable task) {
        try {
            Boolean ran = txRequired.execute(status -> {
                if (repo.claimPostTask(attemptId, markerColumn) != 1) return false;
                task.run();
                return true;
            });
            return Boolean.TRUE.equals(ran);
        } catch (RuntimeException ex) {
            log.warn("POS checkout post task {} for attempt {} failed and will be retried on replay: {}",
                    markerColumn, attemptId, ex.getMessage());
            return false;
        }
    }

    public void evidencePaymentLeg(PosCheckoutClaim c) {
        repo.recordPaymentLeg(c.attemptId(), c.ownerToken());
    }

    public void evidenceSessionRecorded(PosCheckoutClaim c) {
        repo.recordSessionRecorded(c.attemptId(), c.ownerToken());
    }

    /** Marks the attempt COMPLETED, under the fence. */
    public void complete(PosCheckoutClaim claim) {
        step(claim, "COMPLETE", () -> null, ignored -> repo.markCompleted(claim.attemptId(), claim.ownerToken()));
    }

    /**
     * Owner-side outcome after the checkout threw. Classified on evidence, exactly like recovery:
     * every step recorded → COMPLETED (the failure was in a best-effort post step); no invoice left
     * → FAILED; otherwise STALLED. Never throws: the caller is about to rethrow the real cause. When
     * the claim has already been superseded the new owner's record is left alone.
     */
    public void fail(PosCheckoutClaim claim, Throwable cause) {
        String why = cause.getClass().getSimpleName() + ": " + cause.getMessage();
        try {
            txRequired.executeWithoutResult(status -> {
                if (repo.fence(claim.attemptId(), claim.ownerToken(), claim.fence(), "FAILED", leaseSeconds) != 1) {
                    log.warn("POS checkout attempt {} failed after it was superseded; leaving it alone: {}",
                            claim.attemptId(), why);
                    return;
                }
                PosCheckoutAttempt a = repo.findById(claim.attemptId()).orElseThrow();
                if (a.allStepsRecorded()) {
                    repo.markCompleted(a.id(), claim.ownerToken());
                    repo.markOutcome(a.id(), claim.ownerToken(), PosCheckoutAttemptState.COMPLETED,
                            "completed; a post-settlement step failed: " + why);
                } else if (invoiceSurvives(a)) {
                    repo.markOutcome(a.id(), claim.ownerToken(), PosCheckoutAttemptState.STALLED,
                            "partly recorded (" + evidenceSummary(a) + "); failed: " + why);
                } else {
                    repo.markOutcome(a.id(), claim.ownerToken(), PosCheckoutAttemptState.FAILED, "failed: " + why);
                }
            });
        } catch (RuntimeException ex) {
            log.error("Could not record the outcome of POS checkout attempt {} (cause: {}): {}",
                    claim.attemptId(), why, ex.getMessage(), ex);
        }
    }

    // ------------------------------------------------------------------ recovery

    /**
     * Classifies an ACTIVE attempt whose lease has expired, in a transaction of its own. Returns the
     * row as it is afterwards, or empty when the row is locked right now (a step is in flight), in
     * which case it must be treated as in progress.
     *
     * <p>Safe to call while holding a session row lock: it never waits for the attempt row.
     */
    public Optional<PosCheckoutAttempt> recoverIfExpired(UUID attemptId) {
        try {
            return txRequiresNew.execute(status -> {
                Optional<PosCheckoutAttempt> locked;
                try {
                    locked = repo.lockByIdNowait(attemptId);
                } catch (RuntimeException ex) {
                    if (!isLockUnavailable(ex)) throw ex;
                    status.setRollbackOnly();
                    return Optional.<PosCheckoutAttempt>empty();
                }
                if (locked.isEmpty()) return locked;
                PosCheckoutAttempt a = locked.get();
                if (a.state() != PosCheckoutAttemptState.ACTIVE || !a.leaseExpired()) return locked;
                PosCheckoutAttemptState next;
                String detail;
                if (a.allStepsRecorded()) {
                    next = PosCheckoutAttemptState.COMPLETED;
                    detail = "recovered after lease expiry: every step's evidence was committed (" + evidenceSummary(a) + ")";
                } else if (!invoiceSurvives(a)) {
                    // FAILED, not ABANDONED (M2.2.3): retryable under the same key and hash. ABANDONED
                    // is reserved for an explicit, confirmed abandonment.
                    next = PosCheckoutAttemptState.FAILED;
                    detail = a.hasWriteEvidence()
                            ? "recovered after lease expiry: invoice " + a.invoiceNumber() + " was removed by compensation; nothing remains"
                            : "recovered after lease expiry: no write evidence";
                } else {
                    next = PosCheckoutAttemptState.STALLED;
                    detail = "lease expired with partial evidence (" + evidenceSummary(a) + "); owner " + a.ownerInstance();
                }
                repo.markRecovered(a.id(), a.fence(), next, detail);
                log.warn("POS checkout attempt {} (key {}) recovered as {}: {}", a.id(), a.checkoutKey(), next, detail);
                return repo.findById(a.id());
            });
        } catch (RuntimeException ex) {
            if (isLockUnavailable(ex)) return Optional.empty();
            throw ex;
        }
    }

    /** Attempts currently holding the session open, after recovering any whose lease expired.
     *  The caller holds the session row lock. */
    public List<PosCheckoutAttempt> blockingAttemptsAfterRecovery(Long sessionId) {
        List<PosCheckoutAttempt> blocking = repo.findBlockingForSession(sessionId);
        boolean recovered = false;
        for (PosCheckoutAttempt a : blocking) {
            if (a.state() == PosCheckoutAttemptState.ACTIVE && a.leaseExpired()) {
                recoverIfExpired(a.id());
                recovered = true;
            }
        }
        return recovered ? repo.findBlockingForSession(sessionId) : blocking;
    }

    public List<PosCheckoutAttempt> attemptsForSession(Long sessionId) {
        return repo.findForSession(sessionId);
    }

    public List<PosCheckoutAttempt> blockingAttempts(int limit) {
        return repo.findAllBlocking(Math.max(1, Math.min(limit, 500)));
    }

    // ------------------------------------------------------------------ explicit abandonment (M2.2.3)

    public enum AbandonOutcome {
        /** This call made the key ABANDONED (a tombstone, or FAILED/RELEASED → ABANDONED). */
        ABANDONED,
        /** The key was already ABANDONED. Same effect: nothing can ever be recorded under it. */
        ALREADY_ABANDONED,
        /** Not abandoned; {@code refusalCode} says why, and {@code status} is what the key holds now. */
        REFUSED
    }

    /**
     * @param refusalCode for REFUSED: CHECKOUT_RECORDED (a sale stands under the key), CHECKOUT_IN_PROGRESS
     *        (a worker owns it or a step is running), CHECKOUT_STALLED (needs the supervisor release first)
     *        or CHECKOUT_KEY_REUSED (the key's row belongs to a different request)
     */
    public record AbandonResult(AbandonOutcome outcome, String refusalCode, KeyStatus status) {
        public boolean terminal() { return outcome != AbandonOutcome.REFUSED; }
    }

    /** Where a tombstone is filed when the key was never claimed. Already authorized by the caller. */
    public record AbandonTarget(Long branchId, Long sessionId, String terminalId) {}

    private record AbandonPass(AbandonOutcome outcome, String refusalCode, UUID recover) {
        static AbandonPass done(AbandonOutcome o) { return new AbandonPass(o, null, null); }
        static AbandonPass refused(String code) { return new AbandonPass(AbandonOutcome.REFUSED, code, null); }
        static AbandonPass recover(UUID id) { return new AbandonPass(null, null, id); }
        static AbandonPass retry() { return new AbandonPass(null, null, null); }
    }

    /**
     * Abandons a checkout key for good, or reports why it cannot. Atomic against a racing claim:
     *
     * <ul>
     *   <li>No row: a sale recorded before the journal (by key) refuses; otherwise a tombstone is
     *       inserted with {@code ON CONFLICT DO NOTHING} on the key's unique index. If a claim got
     *       there first, the insert waits for it, does nothing, and the row it left is decided below.</li>
     *   <li>A row: locked with NOWAIT (a running step means "in progress"). ACTIVE with a live lease,
     *       COMPLETED and STALLED are never abandoned; an expired ACTIVE one is recovered first and
     *       decided on what recovery made of it. FAILED or RELEASED becomes ABANDONED only when no
     *       invoice survives under the attempt or its key, with the fence bumped.</li>
     * </ul>
     * Changes no invoice, payment, stock or session row in any case.
     *
     * @param requestHash  canonical hash of the request the till holds for the key; a row of another
     *                     request is refused (CHECKOUT_KEY_REUSED) unless it is already ABANDONED
     * @param authorizeRow run on the existing (locked) row before it is changed; throws to refuse
     */
    public AbandonResult abandon(String checkoutKey, String requestHash, AbandonTarget target, String actor,
                                 String reason, Consumer<PosCheckoutAttempt> authorizeRow) {
        String why = reason == null || reason.isBlank() ? "abandoned from the till" : reason.trim();
        for (int pass = 0; pass < 4; pass++) {
            AbandonPass p;
            try {
                p = txRequiresNew.execute(status -> abandonPass(checkoutKey, requestHash, target, actor, why, authorizeRow));
            } catch (RuntimeException ex) {
                if (!isLockUnavailable(ex)) throw ex;
                p = AbandonPass.refused("CHECKOUT_IN_PROGRESS"); // a step holds the row right now
            }
            if (p.outcome() != null) {
                if (p.outcome() == AbandonOutcome.ABANDONED) {
                    log.warn("POS checkout key {} ABANDONED by {}: {}", checkoutKey, actor, why);
                }
                return new AbandonResult(p.outcome(), p.refusalCode(), lookup(checkoutKey, requestHash));
            }
            if (p.recover() != null) recoverIfExpired(p.recover());
        }
        return new AbandonResult(AbandonOutcome.REFUSED, "CHECKOUT_IN_PROGRESS", lookup(checkoutKey, requestHash));
    }

    private AbandonPass abandonPass(String key, String requestHash, AbandonTarget target, String actor, String why,
                                    Consumer<PosCheckoutAttempt> authorizeRow) {
        Optional<PosCheckoutAttempt> found = repo.findByKey(key);
        if (found.isEmpty()) {
            // Legacy (pre-journal) sale under the key: it stands, so the key cannot be abandoned.
            if (repo.invoiceIdForKey(key).isPresent()) return AbandonPass.refused("CHECKOUT_RECORDED");
            int inserted = repo.insertAbandonedIfAbsent(UUID.randomUUID(), key, requestHash,
                    com.billbull.backend.pos.checkout.PosCheckoutRequestHasher.VERSION,
                    target != null ? target.branchId() : null, target != null ? target.sessionId() : null,
                    target != null ? target.terminalId() : null, actor, instanceId, why);
            return inserted == 1 ? AbandonPass.done(AbandonOutcome.ABANDONED) : AbandonPass.retry();
        }
        PosCheckoutAttempt seen = found.get();
        if (seen.state() == PosCheckoutAttemptState.ABANDONED) return AbandonPass.done(AbandonOutcome.ALREADY_ABANDONED);
        if (!seen.requestHash().equals(requestHash)) return AbandonPass.refused("CHECKOUT_KEY_REUSED");
        if (seen.state() == PosCheckoutAttemptState.ACTIVE && seen.leaseExpired()) return AbandonPass.recover(seen.id());
        // Throws 55P03 when a step (or a claim's reclaim) holds the row: the whole pass rolls back.
        PosCheckoutAttempt a = repo.lockByIdNowait(seen.id()).orElse(null);
        if (a == null) return AbandonPass.retry();
        if (authorizeRow != null) authorizeRow.accept(a);
        switch (a.state()) {
            case ABANDONED: return AbandonPass.done(AbandonOutcome.ALREADY_ABANDONED);
            case COMPLETED: return AbandonPass.refused("CHECKOUT_RECORDED");
            case STALLED:   return AbandonPass.refused("CHECKOUT_STALLED");
            case ACTIVE:    return a.leaseExpired() ? AbandonPass.recover(a.id()) : AbandonPass.refused("CHECKOUT_IN_PROGRESS");
            default: // FAILED, RELEASED
                if (!a.state().abandonable()) return AbandonPass.refused("CHECKOUT_IN_PROGRESS");
                if (invoiceSurvives(a)) return AbandonPass.refused("CHECKOUT_RECORDED");
                int n = repo.markAbandoned(a.id(), a.state(), a.fence(), actor,
                        why + " (was " + a.state() + ", attempt " + a.attemptCount() + ", fence " + a.fence() + ")");
                return n == 1 ? AbandonPass.done(AbandonOutcome.ABANDONED) : AbandonPass.retry();
        }
    }

    // ------------------------------------------------------------------ recovery listing (M2.2.3)

    /** One attempt as the till may see it after losing its local records. No secrets, no payload. */
    public record RecoverableAttempt(String checkoutKey, PosCheckoutAttemptState state, Recorded recorded,
                                     Long invoiceId, String invoiceNumber, Long branchId, Long sessionId,
                                     String terminalId, String initiatedBy, String lastStep,
                                     java.time.OffsetDateTime createdAt, java.time.OffsetDateTime updatedAt,
                                     java.time.OffsetDateTime completedAt, boolean leaseExpired, String nextAction) {}

    /**
     * Recoverable attempts of one branch (see {@link PosCheckoutAttemptRepository#findRecoverable}).
     * {@code nextAction} tells the till what can be done: NONE (recorded, or abandoned), WAIT (in
     * progress), SUPERVISOR_RELEASE (stalled), RETRY_OR_ABANDON (failed/released with nothing recorded;
     * a retry needs the original payload, which the server never stores).
     */
    public List<RecoverableAttempt> recoverable(Long branchId, String actor, Long actorUserId, Long sessionId,
                                                String terminalId, int sinceHours, int limit) {
        int hours = Math.max(1, Math.min(sinceHours, 24 * 30));
        int max = Math.max(1, Math.min(limit, 500));
        return repo.findRecoverable(branchId, actor, actorUserId, sessionId, terminalId, hours, max).stream()
                .map(r -> {
                    boolean survives = r.survivingInvoiceId() != null;
                    Recorded recorded = switch (r.state()) {
                        case COMPLETED -> Recorded.YES;
                        case STALLED -> Recorded.PARTIAL;
                        case ACTIVE -> Recorded.UNKNOWN;
                        case ABANDONED -> Recorded.NO;
                        default -> survives ? Recorded.YES : Recorded.NO;
                    };
                    String next = switch (r.state()) {
                        case COMPLETED, ABANDONED -> "NONE";
                        case ACTIVE -> "WAIT";
                        case STALLED -> "SUPERVISOR_RELEASE";
                        default -> survives ? "NONE" : "RETRY_OR_ABANDON";
                    };
                    Long invoiceId = r.invoiceId() != null && survives ? r.invoiceId() : r.survivingInvoiceId();
                    String invoiceNumber = survives ? r.survivingInvoiceNumber() : r.invoiceNumber();
                    return new RecoverableAttempt(r.checkoutKey(), r.state(), recorded, invoiceId, invoiceNumber,
                            r.branchId(), r.sessionId(), r.terminalId(), r.initiatedBy(), r.lastStep(), r.createdAt(),
                            r.updatedAt(), r.completedAt(), r.leaseExpired(), next);
                })
                .toList();
    }

    // ------------------------------------------------------------------ release

    /**
     * Administrative release of a STALLED attempt, or of an ACTIVE one whose lease has expired. The
     * fence is bumped, so the previous owner's next step is refused. Refused while a step is in
     * flight. Does not touch any invoice, payment or session row: the partial sale stays exactly as
     * recorded and must be reconciled by the person releasing it.
     */
    public PosCheckoutAttempt release(UUID attemptId, String reason, String releasedBy) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason is required to release a checkout attempt.");
        }
        try {
            return txRequired.execute(status -> {
                PosCheckoutAttempt a = repo.lockByIdNowait(attemptId).orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout attempt not found: " + attemptId));
                boolean releasable = a.state() == PosCheckoutAttemptState.STALLED
                        || (a.state() == PosCheckoutAttemptState.ACTIVE && a.leaseExpired());
                if (!releasable) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "CHECKOUT_ATTEMPT_NOT_RELEASABLE: attempt "
                            + attemptId + " is " + a.state() + (a.state() == PosCheckoutAttemptState.ACTIVE
                                    ? " with a live lease until " + a.leaseExpiresAt() : "") + ".");
                }
                repo.markReleased(a.id(), a.fence(), releasedBy, reason.trim());
                log.warn("POS checkout attempt {} (key {}, session {}) RELEASED by {} from {}: {} [evidence: {}]",
                        a.id(), a.checkoutKey(), a.sessionId(), releasedBy, a.state(), reason, evidenceSummary(a));
                return repo.findById(a.id()).orElseThrow();
            });
        } catch (RuntimeException ex) {
            if (isLockUnavailable(ex)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CHECKOUT_ATTEMPT_BUSY: attempt " + attemptId
                        + " is executing a step right now and cannot be released.");
            }
            throw ex;
        }
    }

    // ------------------------------------------------------------------ helpers

    /** Durable evidence that a sale under this attempt still exists. */
    private boolean invoiceSurvives(PosCheckoutAttempt a) {
        if (a.invoiceId() != null
                && !jdbc.queryForList("SELECT 1 FROM sales_invoices WHERE id = ?", Integer.class, a.invoiceId()).isEmpty()) {
            return true;
        }
        return repo.invoiceIdForKey(a.checkoutKey()).isPresent();
    }

    static String evidenceSummary(PosCheckoutAttempt a) {
        List<String> parts = new ArrayList<>();
        parts.add("invoice=" + (a.invoiceNumber() != null ? a.invoiceNumber() : a.invoiceId()));
        parts.add("posted=" + (a.invoicePostedAt() != null));
        parts.add("legs=" + a.paymentLegsRecorded() + "/" + (a.paymentLegsExpected() != null ? a.paymentLegsExpected() : "?"));
        parts.add("session=" + (a.sessionRecordedAt() != null ? "recorded"
                : Boolean.TRUE.equals(a.sessionStepRequired()) ? "pending" : "n/a"));
        parts.add("lastStep=" + a.lastStep());
        return String.join(", ", parts);
    }

    /** True when {@code ex} is PostgreSQL refusing or timing out a lock wait (55P03 / 57014). */
    public static boolean isLockUnavailable(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql) {
                String state = sql.getSQLState();
                if (SQLSTATE_LOCK_NOT_AVAILABLE.equals(state) || SQLSTATE_QUERY_CANCELED.equals(state)) return true;
            }
            if (t.getCause() == t) break;
        }
        return false;
    }

    private static String resolveInstanceId(String prefix) {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "unknown-host";
        }
        String jvm = ManagementFactory.getRuntimeMXBean().getName(); // pid@host
        String pid = jvm.contains("@") ? jvm.substring(0, jvm.indexOf('@')) : jvm;
        String name = prefix != null && !prefix.isBlank() ? prefix.trim() + "@" + host : host;
        return name + ":" + pid + ":" + UUID.randomUUID().toString().substring(0, 8);
    }
}
