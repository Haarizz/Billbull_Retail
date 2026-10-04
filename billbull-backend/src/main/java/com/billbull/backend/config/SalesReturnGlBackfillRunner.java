package com.billbull.backend.config;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnSettlementSplit;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * One-off GL repair for Sales Returns approved BEFORE the Phase 2 settlement work landed.
 *
 * <p>Those returns posted their revenue/VAT reversal correctly — {@code Cr 1100} for the full
 * return value — but two legs are missing or wrong on the historical rows:
 *
 * <ol>
 *   <li><b>No {@code {returnNumber}-RFND} settlement.</b> A card or bank refund left 1100
 *       credited for money that had physically left the business, and 1013 / 1010 never moved.
 *   <li><b>A {@code {returnNumber}-INV} entry with no stock behind it.</b> Before the restock
 *       plan became the single verdict for the inventory leg, a return raised to correct a
 *       payment method or a duplicated sale still debited 1200 and reversed COGS, while no
 *       stock movement was ever written.
 * </ol>
 *
 * <p><b>Why this is a runner and not a SQL script, and not a manual JV either.</b> Neither leg is
 * a data correction. Posting through the engine writes {@code journal_entries},
 * {@code journal_lines}, {@code ledger_entries}, the running balance on {@code accounts}, and the
 * pre-aggregated {@code gl_account_balances}, and it takes its entry number from the branch
 * voucher sequence. An UPDATE/INSERT script has to get all of that right or the trial balance, the
 * account ledger and the dashboards start disagreeing with each other.
 *
 * <p>A manual journal voucher is not equivalent: {@code PostingEngineService.upsertGlBalances} is
 * reachable only from {@code PostingEngineService.persist}, so a JV posted through
 * {@code JournalEntryService.postEntry} updates every surface EXCEPT
 * {@code gl_account_balances}, and {@code GlBalanceRebuildJob} only detects the resulting drift —
 * its rebuild endpoint does not exist yet. A manual correction JV is what left four accounts in
 * the royaltools ledger out of step by 1,256.00. Going through the posting engine is the only
 * path that maintains all six.
 *
 * <p><b>Nothing runs unless it is named.</b> There is no "fix everything" mode: the return numbers
 * are listed explicitly per tenant, because whether a return's goods came back is a question only
 * the branch can answer, and the posting date is an accounting decision. Dry run is the default and
 * reports what it would post without writing. Both postings are idempotent on their reference, so a
 * second run is a no-op.
 *
 * <pre>
 * salesreturn.gl-backfill.enabled=true
 * salesreturn.gl-backfill.dry-run=true
 * salesreturn.gl-backfill.settle-returns=SR-2026-0001,SR-2026-0002
 * salesreturn.gl-backfill.reverse-inventory-returns=SR-2026-0002
 * salesreturn.gl-backfill.posting-date=2026-10-04
 * </pre>
 *
 * <p>{@code posting-date} exists for tenants whose original return dates sit in closed periods,
 * which {@code PeriodLockTriggerInstaller}'s database trigger refuses — deliberately, and a raw SQL
 * insert would be refused the same way. Left unset, each entry posts on its own return date, which
 * is the correct treatment wherever the period is still open.
 *
 * <p>A return with no paid portion is refused rather than settled: the customer never paid for
 * those goods, so there is nothing for a card or bank refund to give back, and the row needs an
 * accounting decision (credit the invoice, or treat the payout as a loss) before anything is
 * posted. This is the same rule {@code SalesReturnService.assertSettlementMethodMatchesSplit} now
 * enforces at approval time.
 */
@Component
public class SalesReturnGlBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SalesReturnGlBackfillRunner.class);

    private final SalesReturnRepository salesReturnRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final InvoiceBalanceService invoiceBalanceService;
    private final PostingEngineService postingEngineService;

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${salesreturn.gl-backfill.enabled:false}")
    private boolean enabled;

    @Value("${salesreturn.gl-backfill.dry-run:true}")
    private boolean dryRun;

    @Value("${salesreturn.gl-backfill.settle-returns:}")
    private String settleReturns;

    @Value("${salesreturn.gl-backfill.reverse-inventory-returns:}")
    private String reverseInventoryReturns;

    @Value("${salesreturn.gl-backfill.posting-date:}")
    private String postingDateRaw;

    public SalesReturnGlBackfillRunner(SalesReturnRepository salesReturnRepository,
                                       SalesInvoiceRepository salesInvoiceRepository,
                                       InvoiceBalanceService invoiceBalanceService,
                                       PostingEngineService postingEngineService) {
        this.salesReturnRepository = salesReturnRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.invoiceBalanceService = invoiceBalanceService;
        this.postingEngineService = postingEngineService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) return;

        List<String> toSettle = parseList(settleReturns);
        List<String> toReverse = parseList(reverseInventoryReturns);
        if (toSettle.isEmpty() && toReverse.isEmpty()) {
            log.warn("Sales Return GL backfill is enabled but no return numbers are listed. "
                    + "Set salesreturn.gl-backfill.settle-returns and/or .reverse-inventory-returns.");
            return;
        }

        LocalDate postingDate = parsePostingDate();
        log.info("Sales Return GL backfill starting — dryRun={}, postingDate={}, settle={}, reverseInventory={}",
                dryRun, postingDate != null ? postingDate : "(each return's own date)", toSettle, toReverse);

        // Each return is attempted on its own and its failure is contained: an exception escaping
        // ApplicationRunner.run aborts application startup, which would take the whole tenant down
        // over one unpostable row. Each posting is atomic inside the posting engine's own
        // transaction, so a row that fails leaves no half-written entry behind.
        BigDecimal settled = BigDecimal.ZERO;
        for (String returnNumber : toSettle) {
            try {
                settled = settled.add(backfillRefundSettlement(returnNumber, postingDate));
            } catch (RuntimeException e) {
                log.error("  settle {}: FAILED — {}", returnNumber, e.getMessage(), e);
            }
        }

        BigDecimal reversed = BigDecimal.ZERO;
        for (String returnNumber : toReverse) {
            try {
                reversed = reversed.add(reverseInventoryLeg(returnNumber, postingDate));
            } catch (RuntimeException e) {
                log.error("  reverse {}: FAILED — {}", returnNumber, e.getMessage(), e);
            }
        }

        log.info("Sales Return GL backfill finished — dryRun={}, settlements {} for {}, inventory reversals {} for {}",
                dryRun, toSettle.size(), settled, toReverse.size(), reversed);
    }

    /**
     * Posts the missing {@code -RFND} settlement for one return. Returns the amount posted (or the
     * amount a dry run would post), or zero when the row was skipped or refused.
     */
    private BigDecimal backfillRefundSettlement(String returnNumber, LocalDate postingDate) {
        SalesReturn salesReturn = salesReturnRepository.findByReturnNumber(returnNumber).orElse(null);
        if (salesReturn == null) {
            log.warn("  settle {}: no such return — skipped", returnNumber);
            return BigDecimal.ZERO;
        }
        if (salesReturn.getStatus() != SalesReturnStatus.APPROVED) {
            log.warn("  settle {}: status is {}, not APPROVED — skipped", returnNumber, salesReturn.getStatus());
            return BigDecimal.ZERO;
        }

        SalesReturnRefundMethod method = salesReturn.getRefundMethod();
        if (method != SalesReturnRefundMethod.CARD_REFUND && method != SalesReturnRefundMethod.BANK_TRANSFER) {
            log.warn("  settle {}: refund method is {} — only CARD_REFUND and BANK_TRANSFER are settled by "
                    + "a -RFND entry, so this row is skipped", returnNumber, method);
            return BigDecimal.ZERO;
        }

        String ref = returnNumber + "-RFND";
        if (postingEngineService.hasJournalForReference(ref)) {
            log.info("  settle {}: {} already posted — nothing to do", returnNumber, ref);
            return BigDecimal.ZERO;
        }

        // The paid portion is the only amount any money-moving method may give back. Recomputed
        // from the invoice's current allocation ledgers, which is the best the schema can answer:
        // the balance at the time of the return is not retained anywhere.
        SalesInvoice invoice = salesReturn.getLinkedInvoice() != null
                ? salesInvoiceRepository.findByInvoiceNumber(salesReturn.getLinkedInvoice()).orElse(null)
                : null;
        BigDecimal outstanding = invoice != null
                ? invoiceBalanceService.effectiveOutstanding(invoice)
                : BigDecimal.ZERO;
        SalesReturnSettlementSplit split =
                SalesReturnSettlementSplit.of(salesReturn.getTotalAmount(), outstanding);

        if (!split.hasPaidPortion()) {
            log.error("  settle {}: REFUSED — invoice {} still carries {} outstanding, so the return has no "
                            + "paid portion and {} had nothing legitimate to refund. The customer was paid out "
                            + "AND is still billed: this needs an accounting decision (credit the invoice, or "
                            + "recognise the payout as a loss) before anything is posted.",
                    returnNumber, salesReturn.getLinkedInvoice(), outstanding, method);
            return BigDecimal.ZERO;
        }

        BigDecimal amount = split.paidPortion();
        boolean viaBank = method == SalesReturnRefundMethod.BANK_TRANSFER;
        if (dryRun) {
            log.info("  settle {}: WOULD post {} — Dr 1100 {} / Cr {} {}", returnNumber, ref, amount,
                    viaBank ? "1010 Bank" : "1013 Merchant Clearing", amount);
            return amount;
        }

        postingEngineService.createJournalFromSalesReturnRefundSettlement(
                withPostingDate(salesReturn, postingDate), amount, viaBank);
        log.info("  settle {}: posted {} for {}", returnNumber, ref, amount);
        return amount;
    }

    /**
     * Reverses the {@code -INV} inventory leg of one return whose goods never came back. Returns
     * the amount posted (or the amount a dry run would post), or zero when the row was skipped.
     */
    private BigDecimal reverseInventoryLeg(String returnNumber, LocalDate postingDate) {
        SalesReturn salesReturn = salesReturnRepository.findByReturnNumber(returnNumber).orElse(null);
        if (salesReturn == null) {
            log.warn("  reverse {}: no such return — skipped", returnNumber);
            return BigDecimal.ZERO;
        }
        if (salesReturn.getStatus() != SalesReturnStatus.APPROVED) {
            log.warn("  reverse {}: status is {}, not APPROVED — skipped", returnNumber, salesReturn.getStatus());
            return BigDecimal.ZERO;
        }

        String invRef = returnNumber + "-INV";
        if (!postingEngineService.hasJournalForReference(invRef)) {
            log.info("  reverse {}: no {} entry exists — nothing to reverse", returnNumber, invRef);
            return BigDecimal.ZERO;
        }
        if (postingEngineService.hasJournalForReference(returnNumber + "-INVREV")) {
            log.info("  reverse {}: already reversed — nothing to do", returnNumber);
            return BigDecimal.ZERO;
        }

        // Safety interlock: if stock DID come back, the -INV entry is correct and the real gap is
        // the missing movement. Reversing here would then understate inventory instead of fixing it.
        long inboundMovements = ((Number) entityManager.createQuery(
                        "SELECT COUNT(sm) FROM StockMovement sm WHERE sm.referenceNo = :ref AND sm.quantity > 0")
                .setParameter("ref", returnNumber)
                .getSingleResult()).longValue();
        if (inboundMovements > 0) {
            log.warn("  reverse {}: {} inbound stock movement(s) exist, so goods DID come back and {} is "
                            + "correct — refusing to reverse. Fix the stock side, not the GL.",
                    returnNumber, inboundMovements, invRef);
            return BigDecimal.ZERO;
        }

        BigDecimal inventoryDebit = (BigDecimal) entityManager.createQuery(
                        "SELECT COALESCE(SUM(jl.debit), 0) FROM JournalLine jl "
                                + "WHERE jl.journalEntry.reference = :ref AND jl.accountCode = '1200'")
                .setParameter("ref", invRef)
                .getSingleResult();
        if (inventoryDebit == null || inventoryDebit.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("  reverse {}: {} has no 1200 debit — skipped", returnNumber, invRef);
            return BigDecimal.ZERO;
        }

        if (dryRun) {
            log.info("  reverse {}: WOULD post {}-INVREV — Dr 5001 {} / Cr 1200 {}",
                    returnNumber, returnNumber, inventoryDebit, inventoryDebit);
            return inventoryDebit;
        }

        postingEngineService.createJournalFromSalesReturnInventoryReversal(
                salesReturn, inventoryDebit, postingDate);
        log.info("  reverse {}: posted {}-INVREV for {}", returnNumber, returnNumber, inventoryDebit);
        return inventoryDebit;
    }

    /**
     * The settlement posting dates itself from {@code salesReturn.returnDate}, so an override is
     * applied by moving that date on the in-memory entity only. Detached first so the change can
     * never be flushed back: the stored return keeps its real business date, which is what every
     * report and the Z report for that day are built on.
     *
     * <p>Each posting runs in the posting engine's own transaction rather than one wrapping this
     * runner, so no {@code @Transactional} is declared on these methods — a self-invoked one would
     * bypass the proxy and do nothing, which is worse than being absent.
     */
    private SalesReturn withPostingDate(SalesReturn salesReturn, LocalDate postingDate) {
        if (postingDate != null) {
            entityManager.detach(salesReturn);
            salesReturn.setReturnDate(postingDate);
        }
        return salesReturn;
    }

    private LocalDate parsePostingDate() {
        if (postingDateRaw == null || postingDateRaw.isBlank()) return null;
        return LocalDate.parse(postingDateRaw.trim());
    }

    private List<String> parseList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String part : Arrays.asList(raw.split(","))) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) out.add(trimmed);
        }
        return out;
    }
}
