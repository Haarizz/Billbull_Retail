package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.payment.Payment;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

/**
 * Real-database regression proof for the P1 fix: two genuinely concurrent delivery
 * settlement requests against the same invoice must produce exactly one {@link Payment}.
 *
 * <p>Deliberately NOT Mockito-based — the defect this pins (the pessimistic lock's
 * transaction ending before the payment write, letting two requests both observe the
 * same pre-payment balance) is a property of real transaction/connection boundaries
 * that a mocked repository cannot exhibit either way. This needs a real Postgres
 * connection pool and real row locking to mean anything.
 *
 * <p>Requires a reachable datasource, same as {@code BillbullBackendApplicationTests}
 * (see that class and CLAUDE.md's "no datasource configured" note) — pass
 * {@code -Dspring.datasource.url/username/password} or activate a profile with a real
 * database. Not expected to pass on a bare {@code mvn test} with no datasource.
 */
@SpringBootTest
class PosDeliverySettlementConcurrencyIT {

    @Autowired private PosDeliverySettlementService deliverySettlementService;
    @Autowired private SalesInvoiceRepository invoiceRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private PosSessionRepository sessionRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private UserRepository userRepository;

    private Long invoiceId;
    private Long sessionId;
    private String invoiceNumber;
    private Long branchId;

    @AfterEach
    void cleanup() {
        SecurityContextHolder.clearContext();
        if (invoiceNumber != null) {
            paymentRepository.findByLinkedInvoice(invoiceNumber).forEach(p -> paymentRepository.deleteById(p.getId()));
        }
        if (invoiceId != null) invoiceRepository.deleteById(invoiceId);
        if (sessionId != null) sessionRepository.deleteById(sessionId);
        // Branch/User are deliberately NOT deleted here: settling a payment posts a real GL
        // journal entry that references the branch (correct production behavior), so a
        // hard delete would violate that FK. They're harmless, uniquely-named leftovers.
    }

    @Test
    void twoConcurrentSettlementRequestsProduceExactlyOnePayment() throws Exception {
        invoiceNumber = "INV-IT-" + System.nanoTime();
        String username = "it-cashier-" + System.nanoTime();

        // PaymentService.savePayment resolves the branch from the currently authenticated
        // user (BranchAccessService.getRequiredCurrentUserBranch) — real production
        // behavior, not something this test can bypass with a mock.
        Branch branch = new Branch();
        branch.setName("IT Branch");
        branch = branchRepository.save(branch);
        branchId = branch.getId();

        User user = new User();
        user.setUsername(username);
        user.setPassword("x");
        user.setBranch(branch);
        user = userRepository.save(user);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(username, "x", java.util.List.of()));

        // Session 99 (the ORIGINAL sale session, already closed) created the delivery order.
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(invoiceNumber);
        invoice.setInvoiceTotal(new BigDecimal("195.00"));
        invoice.setAmountPaid(BigDecimal.ZERO);
        invoice.setStatus(SalesInvoiceStatus.CONFIRMED);
        invoice.setInvoiceDate(LocalDate.now());
        invoice.setPosSessionId(99L);
        invoice.setBranchId(branchId);
        invoice = invoiceRepository.save(invoice);
        invoiceId = invoice.getId();

        // Session 100 (the SETTLING session) is open right now, same branch as the invoice.
        PosSession session = new PosSession();
        session.setStatus(PosSessionStatus.OPEN);
        session.setOpeningCash(BigDecimal.ZERO);
        session.setBranchId(branchId);
        session = sessionRepository.save(session);
        sessionId = session.getId();

        PosCheckoutController.DeliverySettleRequest req = new PosCheckoutController.DeliverySettleRequest();
        req.setSessionId(sessionId);
        req.setTerminalId("IT-T1");
        req.setCashAmount(195.0);

        int threadCount = 2;
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        CountDownLatch ready = new CountDownLatch(threadCount);
        CountDownLatch go = new CountDownLatch(1);
        Long finalInvoiceId = invoiceId;
        // SecurityContextHolder is ThreadLocal by default — the authentication set on the
        // main test thread does NOT automatically reach these worker threads, so it's
        // captured here and re-applied inside each one.
        var authentication = SecurityContextHolder.getContext().getAuthentication();

        java.util.List<Throwable> failures = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        List<Future<?>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < threadCount; i++) {
            futures.add(pool.submit(() -> {
                SecurityContextHolder.getContext().setAuthentication(authentication);
                ready.countDown();
                try {
                    go.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                try {
                    deliverySettlementService.settle(finalInvoiceId, req, LocalDate.now());
                } catch (RuntimeException ex) {
                    failures.add(ex);
                } finally {
                    SecurityContextHolder.clearContext();
                }
            }));
        }

        ready.await(5, TimeUnit.SECONDS);
        go.countDown();
        for (Future<?> f : futures) {
            f.get(15, TimeUnit.SECONDS);
        }
        pool.shutdown();

        if (!failures.isEmpty()) {
            for (Throwable t : failures) {
                t.printStackTrace();
            }
        }

        List<Payment> payments = paymentRepository.findByLinkedInvoice(invoiceNumber);
        assertEquals(1, payments.size(),
                "exactly one Payment must exist after two concurrent settlement requests race the same invoice");
        assertTrue(new BigDecimal("195.00").compareTo(payments.get(0).getAmount()) == 0,
                "the single payment must be for the full 195.00, not double-counted or split incorrectly");
        assertEquals(sessionId, payments.get(0).getPosSessionId(),
                "the payment must carry the settling session (100), not the invoice's own session (99)");

        SalesInvoice reloaded = invoiceRepository.findById(finalInvoiceId).orElseThrow();
        assertTrue(new BigDecimal("195.00").compareTo(reloaded.getAmountPaid()) == 0,
                "invoice must be settled for exactly 195.00 total, not 390.00 from a duplicate payment");
        assertEquals(Long.valueOf(99L), reloaded.getPosSessionId(),
                "the sale's own creation session must never move, even after settlement");
    }
}
