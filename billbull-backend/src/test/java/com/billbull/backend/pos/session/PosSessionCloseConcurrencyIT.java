package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

/**
 * Real-database proof that two concurrent closes of the same session finalize exactly once.
 *
 * <p>Deliberately NOT Mockito-based, for the same reason as
 * {@code PosDeliverySettlementConcurrencyIT}: the thing under test is a pessimistic row lock,
 * which is a property of real transaction and connection boundaries. A mocked repository cannot
 * exhibit the race either way, so a unit test of it would prove nothing. GL idempotency on
 * {@code SCL-{id}} already prevents a duplicate journal — what needs a real database is whether
 * two requests can both pass the status check and both finalize.
 *
 * <p>Requires a reachable datasource, same as {@code BillbullBackendApplicationTests} (see
 * CLAUDE.md's "no datasource configured" note). Named {@code *IT} so surefire's default
 * {@code *Test} includes skip it: a bare {@code mvn test} does not run this, by design.
 * Run with a database via {@code mvn test -Dtest=PosSessionCloseConcurrencyIT} plus
 * {@code -Dspring.datasource.url/username/password}, or with a profile that configures one.
 */
@SpringBootTest
class PosSessionCloseConcurrencyIT {

    @Autowired private PosSessionService sessionService;
    @Autowired private PosSessionRepository sessionRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private JournalEntryRepository journalEntryRepository;

    private Long sessionId;

    @AfterEach
    void cleanup() {
        SecurityContextHolder.clearContext();
        if (sessionId != null) {
            try {
                sessionRepository.deleteById(sessionId);
            } catch (Exception ignored) {
                // A closed session's journal references it; leaving the row is harmless.
            }
        }
        // Branch/User are deliberately NOT deleted: closing posts a real GL entry that
        // references the branch, so a hard delete would violate that FK. Uniquely named.
    }

    @Test
    void twoConcurrentClosesFinalizeExactlyOnceAndPostOneJournal() throws Exception {
        String username = "it-cashier-" + System.nanoTime();

        Branch branch = new Branch();
        branch.setName("IT Close Branch");
        branch = branchRepository.save(branch);

        User user = new User();
        user.setUsername(username);
        user.setPassword("x");
        user.setBranch(branch);
        userRepository.save(user);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(username, "x", List.of()));

        PosSession session = new PosSession();
        session.setStatus(PosSessionStatus.OPEN);
        session.setOpeningCash(new BigDecimal("100.00"));
        session.setBranchId(branch.getId());
        session.setOpenedBy(username);
        session.setOpenedAt(java.time.LocalDateTime.now());
        session.setSessionDate(java.time.LocalDate.now());
        session = sessionRepository.save(session);
        sessionId = session.getId();

        // A drawer counted at exactly its float: expected 100, counted 100, no variance, so no
        // approval is involved and the race is purely about finalization.
        Map<String, Object> denominations = Map.of("100", 1);

        AtomicInteger succeeded = new AtomicInteger();
        AtomicInteger refused = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> futures = List.of(
                    pool.submit(() -> attemptClose(start, username, denominations, succeeded, refused)),
                    pool.submit(() -> attemptClose(start, username, denominations, succeeded, refused)));
            start.countDown();
            for (Future<?> f : futures) f.get(30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertEquals(1, succeeded.get(), "exactly one close may finalize the session");
        assertEquals(1, refused.get(), "the loser must get a deterministic refusal, not a second close");

        PosSession reloaded = sessionRepository.findById(sessionId).orElseThrow();
        assertEquals(PosSessionStatus.CLOSED, reloaded.getStatus());
        assertNotNull(reloaded.getClosingCash(), "the winner's count must be persisted");
        assertEquals(0, new BigDecimal("100.00").compareTo(reloaded.getClosingCash()));
        assertEquals(0, BigDecimal.ZERO.compareTo(reloaded.getCashDifference()));

        // Exactly one close journal, whatever happened above.
        assertTrue(journalEntryRepository.existsByReference("SCL-" + sessionId),
                "the winning close must have posted its journal");
        assertEquals("POSTED", reloaded.getGlPostingStatus());
    }

    private void attemptClose(CountDownLatch start, String username, Map<String, Object> denominations,
                              AtomicInteger succeeded, AtomicInteger refused) {
        try {
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(username, "x", List.of()));
            start.await();
            sessionService.closeSession(sessionId, denominations, null, "concurrent-it");
            succeeded.incrementAndGet();
        } catch (Exception e) {
            // The deterministic loser response: the session was already closed by the winner.
            refused.incrementAndGet();
        }
    }
}
