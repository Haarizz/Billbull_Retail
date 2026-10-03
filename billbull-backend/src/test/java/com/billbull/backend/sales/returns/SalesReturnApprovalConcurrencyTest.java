package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Real-PostgreSQL proof that the approval path's {@code PESSIMISTIC_WRITE} lock-then-split
 * stops two concurrent Sales Returns from both consuming the same invoice outstanding.
 *
 * <h3>Why this cannot be a Mockito test</h3>
 * The thing under test is a database row lock. {@code SalesReturnService.updateStatus} takes
 * {@code SalesInvoiceRepository.findByInvoiceNumberForUpdate} (SELECT ... FOR UPDATE) and
 * computes the economic split from <em>that</em> locked instance, inside the same transaction.
 * A mocked repository returns whatever it is told to return, in either thread, at any time —
 * so it can exhibit neither the race nor its prevention. Only real transaction and connection
 * boundaries can. Equally, asserting call order or generated SQL would prove only that the
 * code calls the method, not that the database serialises on it.
 *
 * <h3>What makes the assertion a proof rather than a restatement</h3>
 * The invoice is set up with an effective outstanding of 4,000.00 and two returns worth
 * 3,000.00 and 2,000.00 are approved concurrently — 5,000.00 of return value against 4,000.00
 * of receivable. If the lock did not serialise the read-check-write, both threads would read
 * {@code effectiveOutstanding = 4000} and allocate their full value, producing 5,000.00 of
 * allocations against a 4,000.00 receivable. The allocation total is therefore the discriminator:
 *
 * <ul>
 *   <li>unlocked / broken: allocations sum to 5,000.00 (over-allocated by 1,000.00);</li>
 *   <li>locked / correct: allocations sum to exactly 4,000.00, whichever thread wins, because
 *       the loser re-reads the outstanding <em>after</em> the winner committed and its
 *       {@code min(returnValue, outstanding)} cap trims it to the 1,000.00 that is left.</li>
 * </ul>
 *
 * The test also records each thread's call window and asserts the two overlapped, so a run in
 * which the threads happened not to contend cannot pass as evidence (brief §12: the two
 * approvals must not be artificially serialised).
 *
 * <h3>Refund method</h3>
 * Both returns carry a {@code null} refund method, and that is forced by the scenario rather
 * than chosen for convenience. With an outstanding of 4,000.00 the winning return's paid
 * portion is zero, and {@code assertSettlementMethodMatchesSplit} correctly refuses every
 * value-moving method when there is no paid portion; the losing return's paid portion is
 * 1,000.00, which {@code CUSTOMER_CREDIT} correctly refuses pending the Decision 7 sign-off on
 * account 2062. A null method is therefore the only one legal under both thread orderings, and
 * it keeps the refund-method gate from deciding the outcome before the lock is exercised.
 * {@link #concurrentCustomerCreditReturnsRefuseTheSecondRatherThanOverAllocate()} covers the
 * gated case explicitly.
 *
 * <h3>Running it, and test-data isolation</h3>
 * Named {@code *Test}, not {@code *IT}: there is no failsafe plugin in this build, so an
 * {@code *IT} class is never executed by any phase (see CLAUDE.md). It therefore needs a
 * reachable datasource, exactly like the seven existing DB-backed {@code *Test} classes, and
 * fails context load on a bare {@code mvn test} with no datasource configured — which is not a
 * code regression.
 *
 * <pre>
 * -- A throwaway database carrying a real tenant's schema and seeded chart of accounts.
 * -- Flyway cannot build one from empty: V1 is a baseline and Hibernate owns the DDL, so an
 * -- empty database fails at V15. Clone an existing tenant instead.
 * psql -U postgres -c "CREATE DATABASE billbull_concurrency_test TEMPLATE &lt;a_tenant_db&gt;"
 *
 * mvn -o test -Dtest=SalesReturnApprovalConcurrencyTest \
 *     -Dspring.datasource.url=jdbc:postgresql://localhost:5432/billbull_concurrency_test \
 *     -Dspring.datasource.username=postgres -Dspring.datasource.password=***
 * </pre>
 *
 * Run it against a throwaway database, never a business tenant: an approval posts real GL
 * journals and writes real allocation rows, and those are committed by the service's own
 * transaction, so a test-method {@code @Transactional} rollback would not undo them.
 * {@link #cleanup()} deletes every row this test created, keyed on a per-run unique suffix, and
 * {@link #assertNoResidue} fails the test if anything survives — so a cleanup regression is
 * reported rather than silently leaving financial rows behind.
 */
@SpringBootTest
@DisplayName("Sales Return approval — real-database concurrency")
class SalesReturnApprovalConcurrencyTest {

    private static final BigDecimal INVOICE_TOTAL = new BigDecimal("10000.00");
    private static final BigDecimal RECEIPTS = new BigDecimal("6000.00");
    private static final BigDecimal EFFECTIVE_OUTSTANDING = new BigDecimal("4000.00");
    private static final BigDecimal RETURN_A = new BigDecimal("3000.00");
    private static final BigDecimal RETURN_B = new BigDecimal("2000.00");

    @Autowired private SalesReturnService salesReturnService;
    @Autowired private SalesReturnRepository salesReturnRepository;
    @Autowired private SalesInvoiceRepository salesInvoiceRepository;
    @Autowired private SalesReturnCreditApplicationRepository creditApplicationRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private JdbcTemplate jdbc;

    /** Unique per run, so cleanup can key on it and two runs can never collide. */
    private String runId;
    private String invoiceNumber;
    private String returnNumberA;
    private String returnNumberB;
    private Long branchId;
    private Long invoiceId;

    @AfterEach
    void cleanup() throws InterruptedException {
        if (runId == null) return;
        // Let any in-flight @Async audit write land before the DELETE below, so it cannot arrive
        // after cleanup and look like residue. One settle pass is enough: the approvals have
        // already returned, so at most one row per committed approval is outstanding.
        Thread.sleep(500);
        // Order matters: children before parents, journals before the documents they reference.
        for (String ref : List.of(returnNumberA, returnNumberB,
                returnNumberA + "-RFND", returnNumberB + "-RFND",
                "FS-" + invoiceNumber, invoiceNumber)) {
            if (ref == null) continue;
            // ledger_entries.journal_id is varchar while journal_entries.id is bigint, so the
            // join needs an explicit cast.
            jdbc.update("DELETE FROM ledger_entries WHERE journal_id IN "
                    + "(SELECT id::text FROM journal_entries WHERE reference = ?)", ref);
            jdbc.update("DELETE FROM journal_lines WHERE journal_entry_id IN "
                    + "(SELECT id FROM journal_entries WHERE reference = ?)", ref);
            jdbc.update("DELETE FROM journal_entries WHERE reference = ?", ref);
        }
        jdbc.update("DELETE FROM sales_return_credit_applications WHERE invoice_number = ?", invoiceNumber);
        jdbc.update("DELETE FROM sales_return_item_batches WHERE sales_return_item_id IN "
                + "(SELECT sri.id FROM sales_return_items sri JOIN sales_returns r "
                + "ON r.id = sri.sales_return_id WHERE r.linked_invoice = ?)", invoiceNumber);
        jdbc.update("DELETE FROM sales_return_items WHERE sales_return_id IN "
                + "(SELECT id FROM sales_returns WHERE linked_invoice = ?)", invoiceNumber);
        jdbc.update("DELETE FROM sales_returns WHERE linked_invoice = ?", invoiceNumber);
        jdbc.update("DELETE FROM stock_movements WHERE reference_no IN (?, ?)", returnNumberA, returnNumberB);
        if (invoiceId != null) {
            jdbc.update("DELETE FROM sales_receipt_vouchers WHERE sales_invoice_id = ?", invoiceId);
            jdbc.update("DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?", invoiceId);
        }
        jdbc.update("DELETE FROM sales_invoices WHERE invoice_number = ?", invoiceNumber);
        jdbc.update("DELETE FROM audit_logs WHERE entity_type = 'SALES_RETURN' AND entity_id IN (?, ?)",
                returnNumberA, returnNumberB);
        jdbc.update("DELETE FROM pos_audit_log WHERE description LIKE ? OR description LIKE ?",
                "%" + returnNumberA + "%", "%" + returnNumberB + "%");
        jdbc.update("DELETE FROM customers WHERE code = ?", customerCode());
        if (branchId != null) {
            // An outlet-backfill runner creates an outlets row for any branch it finds on a later
            // boot, which would then make the branch undeletable. Delete the dependant first so
            // cleanup stays correct even if this row outlives the run that created it.
            jdbc.update("DELETE FROM outlets WHERE branch_id = ?", branchId);
            jdbc.update("DELETE FROM branches WHERE id = ?", branchId);
        }
        assertNoResidue();
    }

    /**
     * Fails the test if any row this run created survived cleanup. §13 of the brief: a DB-backed
     * financial test must not leave transactions behind, and "it should have cleaned up" is not
     * evidence that it did.
     */
    private void assertNoResidue() {
        assertEquals(0, count("SELECT COUNT(*) FROM sales_invoices WHERE invoice_number = ?", invoiceNumber),
                "invoice row survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM sales_returns WHERE linked_invoice = ?", invoiceNumber),
                "sales return rows survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM sales_return_credit_applications WHERE invoice_number = ?",
                invoiceNumber), "credit allocation rows survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM journal_entries WHERE reference IN (?, ?)",
                returnNumberA, returnNumberB), "return journals survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM sales_receipt_vouchers WHERE sales_invoice_id = ?",
                invoiceId == null ? -1L : invoiceId), "receipt voucher survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM customers WHERE code = ?", customerCode()),
                "customer row survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'SALES_RETURN' "
                + "AND entity_id IN (?, ?)", returnNumberA, returnNumberB),
                "audit rows survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM branches WHERE id = ?",
                branchId == null ? -1L : branchId), "branch row survived cleanup");
        assertEquals(0, count("SELECT COUNT(*) FROM journal_lines jl JOIN journal_entries je "
                + "ON je.id = jl.journal_entry_id WHERE je.reference IN (?, ?)",
                returnNumberA, returnNumberB), "journal lines survived cleanup");
    }

    private String customerCode() { return "CONC-CUST-" + runId; }

    /**
     * Waits for the expected number of RETURN_APPROVED audit rows to appear, up to 10s.
     *
     * <p>{@code AuditLogService} writes on an {@code @Async} executor in its own transaction, so
     * the row lands some time after the approval returns. Both the assertion and the cleanup
     * need it to have landed: without this wait, {@link #cleanup()} could DELETE the audit rows
     * and have the async INSERT arrive afterwards, leaving residue that
     * {@link #assertNoResidue()} then reports. That is a race in the test, not in the code, and
     * it only shows up under full-suite load — so it is waited out here rather than tolerated.
     */
    private long awaitApprovalAuditRows(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        long rows = 0;
        while (System.currentTimeMillis() < deadline) {
            rows = count("SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'SALES_RETURN' "
                    + "AND http_method = 'RETURN_APPROVED' AND entity_id IN (?, ?)",
                    returnNumberA, returnNumberB);
            if (rows >= expected) break;
            Thread.sleep(200);
        }
        return rows;
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n != null ? n : 0L;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The main proof
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("two returns worth 5,000 against 4,000 outstanding allocate exactly 4,000, never 5,000")
    void concurrentReturnsCannotBothConsumeTheSameOutstanding() throws Exception {
        buildFixture(null);

        Outcome outcome = approveBothConcurrently();

        // Both approvals are legitimate with a null refund method, so both must commit.
        assertEquals(2, outcome.succeeded.get(),
                "both approvals are legal; a failure here means the lock produced a deadlock or a"
                        + " spurious refusal rather than serialising. Failures: " + outcome.failures);
        assertTrue(outcome.overlapped(),
                "the two approvals did not overlap in time, so this run proves nothing about"
                        + " contention — A [" + outcome.startA + "," + outcome.endA + "] B ["
                        + outcome.startB + "," + outcome.endB + "]");

        // ── The discriminator: total allocated against the invoice.
        BigDecimal allocatedA = nz(creditApplicationRepository.sumAppliedByReturnNumber(returnNumberA));
        BigDecimal allocatedB = nz(creditApplicationRepository.sumAppliedByReturnNumber(returnNumberB));
        BigDecimal allocatedTotal = allocatedA.add(allocatedB);

        assertEquals(0, EFFECTIVE_OUTSTANDING.compareTo(allocatedTotal),
                "sum of unpaid-portion allocations must equal the original effective outstanding"
                        + " exactly — got " + allocatedTotal + " (A=" + allocatedA + ", B=" + allocatedB
                        + "). A total of " + RETURN_A.add(RETURN_B) + " would mean both threads read the"
                        + " same outstanding and the lock did not serialise them.");

        // Whichever order the threads ran in, one took its full value and the other was trimmed
        // to the residue. Both orderings are correct; neither allows a double claim.
        boolean aWonRace = allocatedA.compareTo(RETURN_A) == 0;
        if (aWonRace) {
            assertEquals(0, RETURN_A.compareTo(allocatedA), "winner A allocates its full value");
            assertEquals(0, EFFECTIVE_OUTSTANDING.subtract(RETURN_A).compareTo(allocatedB),
                    "loser B is trimmed to the residue");
        } else {
            assertEquals(0, RETURN_B.compareTo(allocatedB), "winner B allocates its full value");
            assertEquals(0, EFFECTIVE_OUTSTANDING.subtract(RETURN_B).compareTo(allocatedA),
                    "loser A is trimmed to the residue");
        }

        // ── Server-authoritative refund amount: the paid portion is the residue of the split,
        // and the client-supplied figure (seeded as the full return value) must have been
        // overwritten. The loser's paid portion is what the over-allocation would have hidden.
        SalesReturn a = salesReturnRepository.findByReturnNumber(returnNumberA).orElseThrow();
        SalesReturn b = salesReturnRepository.findByReturnNumber(returnNumberB).orElseThrow();
        assertEquals(0, RETURN_A.subtract(allocatedA).compareTo(nz(a.getRefundAmount())),
                "A's refundAmount must be the server-derived paid portion");
        assertEquals(0, RETURN_B.subtract(allocatedB).compareTo(nz(b.getRefundAmount())),
                "B's refundAmount must be the server-derived paid portion");

        // ── Invoice end state.
        SalesInvoice reloaded = salesInvoiceRepository.findByInvoiceNumber(invoiceNumber).orElseThrow();
        assertTrue(nz(reloaded.getBalance()).signum() >= 0,
                "invoice balance must never go negative — was " + reloaded.getBalance());
        assertEquals(0, BigDecimal.ZERO.compareTo(nz(reloaded.getBalance())),
                "4,000 of outstanding fully allocated leaves a zero balance, not a negative one");
        assertEquals(0, INVOICE_TOTAL.compareTo(
                        nz(reloaded.getAmountPaid()).add(nz(reloaded.getReturnCredited()))),
                "paid + credited must reconcile to the invoice total exactly");

        // ── No duplicated side effect, per return.
        assertEquals(1, count("SELECT COUNT(*) FROM sales_return_credit_applications "
                + "WHERE return_number = ? AND status = 'APPLIED'", returnNumberA),
                "exactly one APPLIED allocation row for A");
        assertEquals(1, count("SELECT COUNT(*) FROM sales_return_credit_applications "
                + "WHERE return_number = ? AND status = 'APPLIED'", returnNumberB),
                "exactly one APPLIED allocation row for B");
        assertEquals(1, count("SELECT COUNT(*) FROM journal_entries WHERE reference = ?", returnNumberA),
                "exactly one return journal for A");
        assertEquals(1, count("SELECT COUNT(*) FROM journal_entries WHERE reference = ?", returnNumberB),
                "exactly one return journal for B");
        // Scrap returns (condition DAMAGED) restock nothing, so there must be no stock movement
        // at all — and certainly not a duplicated one.
        assertEquals(0, count("SELECT COUNT(*) FROM stock_movements WHERE reference_no IN (?, ?)",
                returnNumberA, returnNumberB), "a scrap return must post no stock movement");
        // Neither return is a cash refund, so no drawer movement may exist for either.
        assertEquals(0, count("SELECT COUNT(*) FROM pos_cash_movements WHERE reference IN (?, ?)",
                returnNumberA, returnNumberB), "no settlement/drawer movement for a null refund method");

        // ── GL: AR is credited the full return value and nothing debits it back (no settlement
        // leg for a null method), so the net credit to 1100 across both journals is 5,000 while
        // only 4,000 was allocated. That 1,000 gap is the loser's unsettled paid portion, which
        // is a property of approving a return with no refund method — not of the lock. Asserted
        // so the figure is recorded rather than assumed.
        BigDecimal arCredited = nz(jdbc.queryForObject(
                "SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) FROM journal_lines jl "
                        + "JOIN journal_entries je ON je.id = jl.journal_entry_id "
                        + "WHERE jl.account_code = '1100' AND je.reference IN (?, ?)",
                BigDecimal.class, returnNumberA, returnNumberB));
        assertEquals(0, RETURN_A.add(RETURN_B).compareTo(arCredited),
                "both return journals credit AR for their full value, by design");

        assertApprovalAudited(2);
    }

    /**
     * The RETURN_APPROVED domain audit row must exist for both approvals.
     *
     * <p>Not incidental coverage: this is the assertion that caught
     * {@code AuditLogWriter.saveDomainEvent} mirroring the full detail string into
     * {@code denial_reason}, a varchar(255) column. The Phase 2 approval detail runs to ~354
     * characters for ordinary customer and branch names, so the INSERT failed — and because the
     * writer is {@code @Async} the failure was swallowed and every approved return silently lost
     * its audit row while the approval itself succeeded.
     *
     * <p>Written asynchronously, so it is polled rather than read once.
     */
    private void assertApprovalAudited(int expectedRows) throws InterruptedException {
        long rows = awaitApprovalAuditRows(expectedRows);
        assertEquals(expectedRows, rows,
                "each committed approval must leave exactly one RETURN_APPROVED audit row");
        // And the full, untruncated detail must survive in details (TEXT), not just the mirror.
        Integer longest = jdbc.queryForObject(
                "SELECT MAX(LENGTH(details)) FROM audit_logs WHERE entity_type = 'SALES_RETURN' "
                        + "AND http_method = 'RETURN_APPROVED' AND entity_id IN (?, ?)",
                Integer.class, returnNumberA, returnNumberB);
        assertTrue(longest != null && longest > 255,
                "the audit detail is longer than the varchar(255) mirror — that is the point of"
                        + " the regression, so details must keep the whole string; got " + longest);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The gated case: CUSTOMER_CREDIT under contention
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CUSTOMER_CREDIT: the loser is refused outright rather than over-allocating")
    void concurrentCustomerCreditReturnsRefuseTheSecondRatherThanOverAllocate() throws Exception {
        buildFixture(SalesReturnRefundMethod.CUSTOMER_CREDIT);

        Outcome outcome = approveBothConcurrently();

        // The winner's paid portion is zero, so CUSTOMER_CREDIT is legal for it. The loser's is
        // 1,000, which the Decision 7 gate refuses because account 2062 does not exist — so
        // exactly one approval commits and the other rolls back whole.
        assertEquals(1, outcome.succeeded.get(),
                "exactly one approval may commit. Failures: " + outcome.failures);
        assertEquals(1, outcome.refused.get(), "the loser must be refused, not silently trimmed");
        // The Decision 7 gate names the missing liability account in prose rather than by code,
        // so match the phrase assertSettlementMethodMatchesSplit actually emits.
        assertTrue(outcome.failures.stream().anyMatch(m -> m != null
                        && m.contains("Customer Credit Notes Unapplied")),
                "the refusal must be the Decision 7 held-credit gate, not an unrelated error: "
                        + outcome.failures);

        BigDecimal allocatedTotal = nz(creditApplicationRepository.sumAppliedByReturnNumber(returnNumberA))
                .add(nz(creditApplicationRepository.sumAppliedByReturnNumber(returnNumberB)));
        assertTrue(allocatedTotal.compareTo(EFFECTIVE_OUTSTANDING) <= 0,
                "allocations may never exceed the original outstanding — got " + allocatedTotal);

        SalesInvoice reloaded = salesInvoiceRepository.findByInvoiceNumber(invoiceNumber).orElseThrow();
        assertTrue(nz(reloaded.getBalance()).signum() >= 0,
                "invoice balance must never go negative — was " + reloaded.getBalance());
        assertEquals(0, INVOICE_TOTAL.subtract(RECEIPTS).subtract(allocatedTotal)
                        .compareTo(nz(reloaded.getBalance())),
                "balance must be total - receipts - allocations exactly");

        // The refused approval must have left nothing at all behind.
        long approved = count("SELECT COUNT(*) FROM sales_returns WHERE linked_invoice = ? AND status = 'APPROVED'",
                invoiceNumber);
        assertEquals(1, approved, "only the winning return may be APPROVED");
        assertEquals(1, count("SELECT COUNT(*) FROM sales_return_credit_applications "
                + "WHERE invoice_number = ? AND status = 'APPLIED'", invoiceNumber),
                "exactly one allocation row for the whole invoice");
        assertEquals(1, count("SELECT COUNT(*) FROM journal_entries WHERE reference IN (?, ?)",
                returnNumberA, returnNumberB),
                "the refused return must have posted no journal");

        // Only the winner is audited as approved: the refused one rolled back before auditApproval.
        assertApprovalAudited(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fixture + driver
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * An invoice of 10,000.00 with 6,000.00 of completed receipts — an effective outstanding of
     * 4,000.00 — and two DRAFT returns of 3,000.00 and 2,000.00 against it.
     *
     * <p>Both returns are {@code DAMAGED} (scrap), so nothing restocks: no stock movement, no
     * unit-cost resolution, no product master needed. That keeps the fixture to the economics,
     * which is what the lock protects.
     *
     * <p>Quantities are deliberately NOT the constraint: 10 units were sold and the two returns
     * ask for 3 and 2, so both pass the returnable-quantity guard under either ordering and the
     * only thing they contend over is the outstanding balance.
     */
    private void buildFixture(SalesReturnRefundMethod method) {
        runId = Long.toString(System.nanoTime());
        invoiceNumber = "CONC-INV-" + runId;
        returnNumberA = "CONC-SR-A-" + runId;
        returnNumberB = "CONC-SR-B-" + runId;
        String itemCode = "CONC-ITEM-" + runId;
        String customerCode = "CONC-CUST-" + runId;

        Branch branch = new Branch();
        branch.setName("Concurrency Test Branch " + runId);
        branch = branchRepository.save(branch);
        branchId = branch.getId();

        // CUSTOMER_CREDIT is legitimately refused for a walk-in, and
        // SalesReturnCustomerAccountResolver.isWalkIn treats "no customers row" as a walk-in. A
        // registered customer is therefore part of the fixture, not a convenience: without it the
        // gated test would be measuring the walk-in guard instead of the Decision 7 gate.
        jdbc.update("INSERT INTO customers (code, name, status) VALUES (?, ?, 'Active')",
                customerCode, "Concurrency Test Customer");

        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(invoiceNumber);
        invoice.setCustomerCode(customerCode);
        invoice.setCustomerName("Concurrency Test Customer");
        invoice.setInvoiceDate(LocalDate.now());
        invoice.setStatus(SalesInvoiceStatus.PARTIALLY_PAID);
        invoice.setDeliveryStatus(DeliveryStatus.DELIVERED);
        invoice.setSalesType(SalesType.STANDARD_FLOW);
        invoice.setSubTotal(INVOICE_TOTAL);
        invoice.setTaxTotal(BigDecimal.ZERO);
        invoice.setInvoiceTotal(INVOICE_TOTAL);
        invoice.setAmountPaid(RECEIPTS);
        invoice.setBalance(EFFECTIVE_OUTSTANDING);

        SalesInvoiceItem line = new SalesInvoiceItem();
        line.setItemCode(itemCode);
        line.setItemName("Concurrency Test Item");
        line.setQuantity(10);
        line.setPrice(new BigDecimal("1000.00"));
        line.setCost(new BigDecimal("600.00"));
        line.setTaxRate(0d);
        line.setTaxAmount(BigDecimal.ZERO);
        line.setGrossAmount(INVOICE_TOTAL);
        line.setNetAmount(INVOICE_TOTAL);
        line.setSalesInvoice(invoice);
        invoice.setItems(new ArrayList<>(List.of(line)));

        invoice = salesInvoiceRepository.save(invoice);
        invoiceId = invoice.getId();

        // SalesInvoice exposes branchEntity read-only, so the fixture stamps the branch directly.
        // It matters: it is what keeps the cross-branch guard (assertReturnBranchMatchesInvoice)
        // in play rather than short-circuiting on a branchless invoice.
        jdbc.update("UPDATE sales_invoices SET branch_id = ? WHERE id = ?", branchId, invoiceId);

        // The 6,000.00 of settlement, as the one thing effectiveOutstanding reads: a completed
        // receipt voucher linked by salesInvoiceId. Inserted directly so the fixture does not
        // depend on the receipt-creation path, which would itself recompute the balance.
        jdbc.update("INSERT INTO sales_receipt_vouchers "
                + "(voucher_id, amount, status, sales_invoice_id, customer_code, date, payment_mode, is_active) "
                + "VALUES (?, ?, 'Completed', ?, ?, ?, 'Cash', true)",
                "CONC-RV-" + runId, RECEIPTS, invoiceId, customerCode, LocalDate.now());

        createDraftReturn(returnNumberA, RETURN_A, 3, itemCode, customerCode, branch, method);
        createDraftReturn(returnNumberB, RETURN_B, 2, itemCode, customerCode, branch, method);
    }

    private void createDraftReturn(String returnNumber, BigDecimal amount, int qty, String itemCode,
                                   String customerCode, Branch branch, SalesReturnRefundMethod method) {
        SalesReturn r = new SalesReturn();
        r.setReturnNumber(returnNumber);
        r.setReturnDate(LocalDate.now());
        r.setCustomerCode(customerCode);
        r.setCustomerName("Concurrency Test Customer");
        r.setLinkedInvoice(invoiceNumber);
        r.setSubTotal(amount);
        r.setTaxAmount(BigDecimal.ZERO);
        r.setTotalAmount(amount);
        r.setStatus(SalesReturnStatus.DRAFT);
        r.setBranch(branch);
        r.setRefundMethod(method);
        // Seeded as the FULL return value, i.e. what a client would send. The server must
        // overwrite it with the paid portion; the assertions check that it did.
        r.setRefundAmount(amount);

        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode(itemCode);
        item.setItemName("Concurrency Test Item");
        item.setSoldQty(10);
        item.setReturnQty(qty);
        item.setPrice(new BigDecimal("1000.00"));
        item.setTaxRate(0d);
        item.setTaxAmount(BigDecimal.ZERO);
        item.setTotal(amount);
        // Scrap: no restock, so no unit cost to resolve and no stock movement to post.
        item.setCondition(SalesReturnCondition.DAMAGED);
        item.setSalesReturn(r);
        r.setItems(new ArrayList<>(List.of(item)));

        salesReturnRepository.save(r);
    }

    /**
     * Drives both approvals through {@code SalesReturnService.updateStatus} from two threads
     * that rendezvous on a {@link CyclicBarrier} immediately before the call, so neither can
     * finish before the other starts trying. Each thread's start and end instants are recorded
     * so the caller can assert the two windows actually overlapped.
     */
    private Outcome approveBothConcurrently() throws Exception {
        Outcome outcome = new Outcome();
        CyclicBarrier barrier = new CyclicBarrier(2);
        CountDownLatch done = new CountDownLatch(2);
        Long idA = salesReturnRepository.findByReturnNumber(returnNumberA).orElseThrow().getId();
        Long idB = salesReturnRepository.findByReturnNumber(returnNumberB).orElseThrow().getId();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> futures = List.of(
                    pool.submit(() -> attemptApproval(idA, barrier, done, outcome, true)),
                    pool.submit(() -> attemptApproval(idB, barrier, done, outcome, false)));
            assertTrue(done.await(60, TimeUnit.SECONDS), "both approvals must finish within 60s");
            for (Future<?> f : futures) f.get(60, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        return outcome;
    }

    private void attemptApproval(Long id, CyclicBarrier barrier, CountDownLatch done,
                                 Outcome outcome, boolean isA) {
        try {
            barrier.await(30, TimeUnit.SECONDS);
            long start = System.nanoTime();
            if (isA) outcome.startA = start; else outcome.startB = start;
            try {
                salesReturnService.updateStatus(id, SalesReturnStatus.APPROVED);
                outcome.succeeded.incrementAndGet();
            } catch (Exception e) {
                outcome.refused.incrementAndGet();
                outcome.failures.add(e.getMessage());
            } finally {
                long end = System.nanoTime();
                if (isA) outcome.endA = end; else outcome.endB = end;
            }
        } catch (Exception barrierFailure) {
            outcome.failures.add("barrier: " + barrierFailure);
        } finally {
            done.countDown();
        }
    }

    /** Per-run result, including the timing windows that evidence real contention. */
    private static final class Outcome {
        final AtomicInteger succeeded = new AtomicInteger();
        final AtomicInteger refused = new AtomicInteger();
        final List<String> failures = java.util.Collections.synchronizedList(new ArrayList<>());
        volatile long startA;
        volatile long endA;
        volatile long startB;
        volatile long endB;

        /** True when the two approval windows intersect, i.e. the threads genuinely contended. */
        boolean overlapped() {
            return startA < endB && startB < endA;
        }
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
