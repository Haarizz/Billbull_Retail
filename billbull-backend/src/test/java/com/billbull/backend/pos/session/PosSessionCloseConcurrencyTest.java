package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

/**
 * Concurrency around session close.
 *
 * <p>GL idempotency on {@code SCL-{id}} already prevents a duplicate journal, but it cannot
 * prevent a duplicate <em>finalization</em>: two simultaneous closes could both pass the status
 * check under read-committed and interleave through grant consumption, the snapshot freeze and
 * the audit completion. The session row is now read under a pessimistic lock so the whole close
 * serialises.
 *
 * <p>The lock itself is a database behaviour and is asserted structurally here (the repository
 * declares it, the service uses it). What <em>is</em> exercised directly is the piece that has to
 * be correct even under a lock: the single-use approval grant, which two racing threads must not
 * both be able to spend.
 */
class PosSessionCloseConcurrencyTest {

    // ── The lock is declared and used ────────────────────────────────────────────────────

    @Test
    void theRepositoryDeclaresAPessimisticWriteLockForClose() throws Exception {
        Method m = PosSessionRepository.class.getMethod("findByIdForUpdate", Long.class);

        var lock = m.getAnnotation(org.springframework.data.jpa.repository.Lock.class);
        assertNotNull(lock, "findByIdForUpdate must carry a lock annotation");
        assertEquals(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE, lock.value(),
                "an optimistic lock would let both closes read, and only fail one on write — after "
                        + "both had already consumed a grant and posted audit");
    }

    @Test
    void closeSessionTakesTheLockRatherThanAPlainRead() throws Exception {
        // The whole close must happen under the lock: status check, grant consumption, freeze,
        // journal, audit. Reading the session unlocked and locking later would leave the status
        // check racing.
        String source = java.nio.file.Files.readString(java.nio.file.Path.of(
                "src/main/java/com/billbull/backend/pos/session/PosSessionService.java"));
        int lockAt = source.indexOf("repo.findByIdForUpdate(sessionId)");
        int statusCheckAt = source.indexOf("Session is already closed.");

        assertTrue(lockAt > 0, "closeSession must read the session through findByIdForUpdate");
        assertTrue(lockAt < statusCheckAt,
                "the lock must be taken before the already-closed check, or two closes can both "
                        + "pass it");
    }

    @Test
    void theCloseTransactionIsAtomic() throws Exception {
        boolean transactional = java.util.Arrays.stream(PosSessionService.class.getMethods())
                .filter(m -> m.getName().equals("closeSession"))
                .anyMatch(m -> m.isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));
        assertTrue(transactional,
                "the lock is only held for the life of a transaction, so close must be one");
    }

    // ── The grant cannot be double-spent ─────────────────────────────────────────────────

    @Test
    void twoThreadsRacingForTheSameGrantYieldExactlyOneApproval() throws Exception {
        PosVarianceApprovalRegistry registry = new PosVarianceApprovalRegistry();
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");

        AtomicInteger approved = new AtomicInteger();
        runConcurrently(8, () -> {
            if (registry.consume(1L, bd("5000"), bd("4800"), token).isPresent()) {
                approved.incrementAndGet();
            }
            return null;
        });

        assertEquals(1, approved.get(),
                "a single-use grant must be redeemable exactly once, however many threads race");
    }

    @Test
    void racingApprovalsForDifferentCountsCannotBothSucceed() throws Exception {
        // One thread closes the drawer as counted; another has recounted it. Only the grant that
        // matches the figures being closed may win, and only once.
        PosVarianceApprovalRegistry registry = new PosVarianceApprovalRegistry();
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "r");

        AtomicInteger matched = new AtomicInteger();
        AtomicInteger mismatched = new AtomicInteger();
        runConcurrently(2, List.of(
                () -> { if (registry.consume(1L, bd("5000"), bd("4800"), token).isPresent()) matched.incrementAndGet(); return null; },
                () -> { if (registry.consume(1L, bd("5000"), bd("4500"), token).isPresent()) mismatched.incrementAndGet(); return null; }));

        assertEquals(0, mismatched.get(), "a changed count must never be authorized by this grant");
        assertTrue(matched.get() <= 1, "the grant must be spendable at most once");
    }

    @Test
    void concurrentIssuesProduceDistinctSingleUseTokens() throws Exception {
        PosVarianceApprovalRegistry registry = new PosVarianceApprovalRegistry();
        java.util.Set<String> tokens = java.util.concurrent.ConcurrentHashMap.newKeySet();

        runConcurrently(16, () -> {
            tokens.add(registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "r"));
            return null;
        });

        assertEquals(16, tokens.size(), "every issued grant must be distinct");
        AtomicInteger redeemed = new AtomicInteger();
        for (String t : tokens) {
            if (registry.consume(1L, bd("5000"), bd("4800"), t).isPresent()) redeemed.incrementAndGet();
        }
        assertEquals(16, redeemed.get(), "each distinct grant is independently valid once");
    }

    // ── Retry semantics ──────────────────────────────────────────────────────────────────

    @Test
    void aRetriedCloseAfterATimeoutCannotSpendTheGrantTwice() throws Exception {
        // The client timed out and retried, but the first request had already succeeded. The
        // grant is gone, so the retry cannot re-approve; the session's own already-closed guard
        // is what makes the retry deterministic.
        PosVarianceApprovalRegistry registry = new PosVarianceApprovalRegistry();
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "r");

        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isPresent());
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isEmpty(),
                "a retry must not resurrect a spent authorization");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private static BigDecimal bd(String v) { return new BigDecimal(v); }

    private static void runConcurrently(int threads, Callable<Void> task) throws Exception {
        runConcurrently(threads, java.util.Collections.nCopies(threads, task));
    }

    /** Releases every task at once so they genuinely contend rather than running in sequence. */
    private static void runConcurrently(int threads, List<Callable<Void>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(Math.max(2, threads));
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        try {
            List<Future<Void>> futures = new java.util.ArrayList<>();
            for (Callable<Void> task : tasks) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return task.call();
                }));
            }
            start.countDown();
            for (Future<Void> f : futures) f.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }
}
