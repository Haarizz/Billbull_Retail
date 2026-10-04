package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplication;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationStatus;
import com.billbull.backend.sales.voucher.CreditVoucher;
import com.billbull.backend.sales.voucher.CreditVoucherService;
import com.billbull.backend.security.AuditLogService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Unwinds an APPROVED Sales Return.
 *
 * <p><b>Why this exists.</b> {@code SalesReturnService} refuses to modify an approved return
 * ("Approved returns cannot be modified. Create a reversal instead.") and refuses to delete one,
 * but until now no reversal existed anywhere — not an endpoint, not a service, not a screen. The
 * error message pointed at something that was never built, so a mis-keyed return was permanent
 * and the only way out was hand-written journal entries. That is how one tenant ended up with a
 * correcting JV that left four GL accounts out of step with the ledger, because a manual JV does
 * not maintain {@code gl_account_balances}.
 *
 * <p><b>What a reversal is.</b> A new set of entries that cancels the old ones, never an edit of
 * them. The original return keeps its rows, its journals and its number; afterwards it reads
 * {@link SalesReturnStatus#REVERSED} and drops out of every report, because every sales-return
 * query filters on {@code status = APPROVED}. A reviewer can still see exactly what was posted
 * and exactly what undid it.
 *
 * <p><b>The reversal mirrors what was actually posted, not what would be posted today.</b> Each
 * contra amount is read back from the original journal entries rather than recomputed from the
 * return: the revenue account is whichever one the original debited, the inventory contra is the
 * original's 1200 debit, and the settlement contra is the original's 1100 debit. Costs, prices
 * and recognition rules may all have moved since, and a reversal that does not net its original
 * to zero is worse than no reversal at all.
 *
 * <p><b>Dated today, not back-dated.</b> A reversal is an event in its own right. Back-dating it
 * onto the original return date would silently restate a period that may already have been
 * reported on, and the period-lock trigger would refuse it outright once that month closed.
 *
 * <h2>Not supported yet: batch and serial returns</h2>
 * A return carrying batch lines is refused rather than half-unwound. Approving one writes
 * {@code sales_return_item_batches} rows, updates batch master quantities and consumes serials
 * from the originating invoice; backing all of that out correctly is a larger piece of work than
 * the stock-movement mirror below, and getting it wrong corrupts traceable stock rather than
 * merely a balance. Refusing loudly is the safe direction to fail — the operator still has the
 * manual route, and knows they are on it.
 */
@Service
public class SalesReturnReversalService {

    private static final Logger log = LoggerFactory.getLogger(SalesReturnReversalService.class);

    /** Reason code recorded on the supervisor authorization for a reversal. */
    public static final String AUTHORIZATION_REASON = "RETURN_REVERSAL";

    private final SalesReturnRepository salesReturnRepository;
    private final SalesReturnAuthorizationService authorizationService;
    private final PostingEngineService postingEngineService;
    private final StockMovementRepository stockMovementRepository;
    private final SalesReturnCreditApplicationRepository creditApplicationRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final InvoiceBalanceService invoiceBalanceService;
    private final CreditVoucherService creditVoucherService;
    private final SalesReturnCashReversalService cashReversalService;
    private final AuditLogService auditLogService;

    @PersistenceContext
    private EntityManager entityManager;

    public SalesReturnReversalService(SalesReturnRepository salesReturnRepository,
                                      SalesReturnAuthorizationService authorizationService,
                                      PostingEngineService postingEngineService,
                                      StockMovementRepository stockMovementRepository,
                                      SalesReturnCreditApplicationRepository creditApplicationRepository,
                                      SalesInvoiceRepository salesInvoiceRepository,
                                      InvoiceBalanceService invoiceBalanceService,
                                      CreditVoucherService creditVoucherService,
                                      SalesReturnCashReversalService cashReversalService,
                                      AuditLogService auditLogService) {
        this.salesReturnRepository = salesReturnRepository;
        this.authorizationService = authorizationService;
        this.postingEngineService = postingEngineService;
        this.stockMovementRepository = stockMovementRepository;
        this.creditApplicationRepository = creditApplicationRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.invoiceBalanceService = invoiceBalanceService;
        this.creditVoucherService = creditVoucherService;
        this.cashReversalService = cashReversalService;
        this.auditLogService = auditLogService;
    }

    /**
     * Reverses one approved return. Every leg shares this transaction, so a failure anywhere
     * rolls back the whole reversal — a return is never left half-unwound, with its stock back
     * out but its journals still standing.
     *
     * @param id                  the return to reverse
     * @param reason              why; mandatory, because a reversal restates a period someone may
     *                            already have reported on
     * @param supervisorUsername  supervisor sign-off, always required for a reversal
     * @param supervisorPassword  supervisor sign-off, always required for a reversal
     */
    @Transactional
    public SalesReturn reverse(Long id, String reason,
                               String supervisorUsername, String supervisorPassword) {

        // Same lock the approval path takes, for the same reason: two concurrent reversals must
        // not both post contra journals and both take the stock back out.
        salesReturnRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Sales Return not found with ID: " + id));

        SalesReturn salesReturn = salesReturnRepository.findByIdWithItems(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Sales Return not found with ID: " + id));

        assertReversible(salesReturn, reason);
        authorizationService.authorize(salesReturn, AUTHORIZATION_REASON,
                supervisorUsername, supervisorPassword);

        LocalDate reversalDate = LocalDate.now();

        // Order mirrors the approval in reverse: value comes back from the customer first, then
        // the allocation, then the stock, then the journals that describe all of it.
        reverseSettlement(salesReturn, reversalDate);
        reverseCreditApplication(salesReturn);
        reverseStockMovements(salesReturn, reversalDate);
        reverseJournals(salesReturn, reversalDate);

        salesReturn.setStatus(SalesReturnStatus.REVERSED);
        salesReturn.setReversedAt(LocalDateTime.now());
        salesReturn.setReversedBy(currentUsername());
        salesReturn.setReversalReason(reason.trim());
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        auditLogService.logDomainEvent("SALES_RETURN", saved.getReturnNumber(), "RETURN_REVERSED",
                "Reversed " + saved.getReturnNumber() + " (" + saved.getTotalAmount() + ", "
                        + saved.getRefundMethod() + ") posted " + saved.getReturnDate()
                        + ", reversed " + reversalDate + ". Reason: " + saved.getReversalReason());

        log.info("[SalesReturn] {} reversed on {} by {} — reason: {}",
                saved.getReturnNumber(), reversalDate, saved.getReversedBy(), saved.getReversalReason());

        return saved;
    }

    // ── Guards ──────────────────────────────────────────────────────────────────────────

    private void assertReversible(SalesReturn salesReturn, String reason) {
        if (salesReturn.getStatus() != SalesReturnStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only an approved return can be reversed. " + salesReturn.getReturnNumber()
                            + " is " + salesReturn.getStatus() + ".");
        }
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason is required to reverse " + salesReturn.getReturnNumber()
                            + ": the reversal restates a period that may already have been reported on.");
        }

        // See the class javadoc — refused rather than half-unwound.
        boolean hasBatchLines = salesReturn.getItems() != null && salesReturn.getItems().stream()
                .anyMatch(i -> i.getBatches() != null && !i.getBatches().isEmpty());
        if (hasBatchLines) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Reversing a batch-tracked return is not supported yet. "
                            + salesReturn.getReturnNumber() + " carries batch lines, and backing out"
                            + " the batch allocations and master quantities needs to be done by hand"
                            + " so traceable stock is not corrupted.");
        }
    }

    // ── Legs ────────────────────────────────────────────────────────────────────────────

    /**
     * Gives back whatever value the customer received: a card/bank refund comes back from the
     * processor, a voucher is cancelled, drawer cash goes back in. CUSTOMER_CREDIT has no
     * settlement to undo — the allocation reversal below is its whole effect.
     */
    private void reverseSettlement(SalesReturn salesReturn, LocalDate reversalDate) {
        SalesReturnRefundMethod method = salesReturn.getRefundMethod();
        if (method == null) return;

        switch (method) {
            case CARD_REFUND, BANK_TRANSFER -> {
                BigDecimal settled = arDebitOn(salesReturn.getReturnNumber() + "-RFND");
                if (settled.compareTo(BigDecimal.ZERO) > 0) {
                    postingEngineService.createJournalFromSalesReturnReversalSettlement(
                            salesReturn, settled, method == SalesReturnRefundMethod.BANK_TRANSFER,
                            reversalDate);
                } else {
                    // Pre-Phase-2 rows never got a settlement leg. Nothing to contra, and saying
                    // so beats silently posting a zero-value entry.
                    log.warn("[SalesReturn] {} is a {} with no -RFND entry to reverse — the original"
                                    + " settlement was never posted, so none is contra'd.",
                            salesReturn.getReturnNumber(), method);
                }
            }
            case CREDIT_VOUCHER -> creditVoucherService
                    .findBySalesReturnNumber(salesReturn.getReturnNumber())
                    .ifPresent(voucher -> cancelVoucher(salesReturn, voucher));
            case CASH_REFUND -> cashReversalService.recordCashRefundReversal(salesReturn);
            case CUSTOMER_CREDIT -> { /* no settlement was made; the allocation is the effect */ }
        }
    }

    /**
     * A voucher the customer has already spent cannot be taken back by cancelling it — that would
     * strip value they lawfully redeemed. Refused so the operator settles it another way.
     */
    private void cancelVoucher(SalesReturn salesReturn, CreditVoucher voucher) {
        BigDecimal used = voucher.getUsedAmount() != null ? voucher.getUsedAmount() : BigDecimal.ZERO;
        if (used.compareTo(BigDecimal.ZERO) > 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot reverse " + salesReturn.getReturnNumber() + ": voucher "
                            + voucher.getVoucherNumber() + " has already been redeemed for " + used
                            + ". Cancelling it would take back value the customer has spent.");
        }
        creditVoucherService.cancel(voucher.getId(),
                "Sales Return " + salesReturn.getReturnNumber() + " reversed");
    }

    /**
     * Returns the allocation to the invoice. The row's status moves to REVERSED rather than a new
     * row being written: {@code sumAppliedByInvoiceNumber} counts only APPLIED rows, and the
     * partial unique index allows just one APPLIED row per return and invoice, so a second row
     * would change no balance and could not be inserted alongside the first anyway.
     */
    private void reverseCreditApplication(SalesReturn salesReturn) {
        List<SalesReturnCreditApplication> applied = creditApplicationRepository
                .findByReturnNumber(salesReturn.getReturnNumber()).stream()
                .filter(a -> a.getStatus() == SalesReturnCreditApplicationStatus.APPLIED)
                .toList();
        if (applied.isEmpty()) return;

        for (SalesReturnCreditApplication row : applied) {
            row.setStatus(SalesReturnCreditApplicationStatus.REVERSED);
            creditApplicationRepository.save(row);
        }
        creditApplicationRepository.flush();

        // The invoice balance is never written directly — recomputed from the allocation ledgers,
        // which now exclude the row above, so the receivable goes back up by exactly what the
        // return had credited.
        if (salesReturn.getLinkedInvoice() != null && !salesReturn.getLinkedInvoice().isBlank()) {
            invoiceBalanceService.recomputeInvoiceBalanceByNumber(salesReturn.getLinkedInvoice());
        }
    }

    /**
     * Mirrors every inbound movement the return wrote, as an outbound of the same quantity at the
     * same cost — the goods leave stock again. Written as new rows rather than deleting the old
     * ones, because {@code stock_movements} is an append-only ledger and deleting history would
     * make the on-hand derivation unauditable.
     */
    private void reverseStockMovements(SalesReturn salesReturn, LocalDate reversalDate) {
        List<StockMovement> inbound = stockMovementRepository
                .findBySourceTypeAndReferenceNo(StockSourceType.SALES_RETURN, salesReturn.getReturnNumber())
                .stream()
                .filter(m -> m.getQuantity() != null && m.getQuantity().compareTo(BigDecimal.ZERO) > 0)
                .toList();

        String reversalRef = salesReturn.getReturnNumber() + "-REV";
        if (!stockMovementRepository.findBySourceTypeAndReferenceNo(
                StockSourceType.SALES_RETURN, reversalRef).isEmpty()) {
            log.info("[SalesReturn] {} already has reversal stock movements — not written again.",
                    salesReturn.getReturnNumber());
            return;
        }

        for (StockMovement in : inbound) {
            StockMovement out = new StockMovement();
            out.setSourceType(StockSourceType.SALES_RETURN);
            out.setSourceId(in.getSourceId());
            out.setProductId(in.getProductId());
            out.setWarehouseId(in.getWarehouseId());
            out.setBranchId(in.getBranchId());
            out.setZoneId(in.getZoneId());
            out.setLocatorId(in.getLocatorId());
            out.setBinId(in.getBinId());
            out.setQuantity(in.getQuantity().negate());
            out.setMovementDate(reversalDate);
            out.setReferenceNo(reversalRef);
            out.setBatchNumber(in.getBatchNumber());
            out.setSerialNumber(in.getSerialNumber());
            out.setExpiryDate(in.getExpiryDate());
            // Same cost as the inbound leg, so the reversal removes exactly the value the return
            // added. Recomputing at today's WAC would leave a difference behind.
            out.setUnitCost(in.getUnitCost());
            stockMovementRepository.save(out);
        }

        if (!inbound.isEmpty()) {
            log.info("[SalesReturn] {} — {} inbound stock movement(s) mirrored out under {}.",
                    salesReturn.getReturnNumber(), inbound.size(), reversalRef);
        }
    }

    /** The contra journals: the base entry always, the inventory leg only if one was posted. */
    private void reverseJournals(SalesReturn salesReturn, LocalDate reversalDate) {
        postingEngineService.createJournalFromSalesReturnReversal(
                salesReturn, reversalDate, revenueWasRecognizedOn(salesReturn.getReturnNumber()));

        BigDecimal inventoryDebit = inventoryDebitOn(salesReturn.getReturnNumber() + "-INV");
        if (inventoryDebit.compareTo(BigDecimal.ZERO) > 0) {
            postingEngineService.createJournalFromSalesReturnReversalInventory(
                    salesReturn, inventoryDebit, reversalDate);
        }
    }

    // ── Reading back what was actually posted ───────────────────────────────────────────

    /**
     * True when the original return debited Sales Revenue rather than Deferred Revenue. Read from
     * the posted entry instead of re-deriving it, so the contra credits back whichever account was
     * actually used even if the invoice's delivery state has changed since.
     */
    private boolean revenueWasRecognizedOn(String reference) {
        Long salesRevenueLines = entityManager.createQuery(
                        "SELECT COUNT(jl) FROM JournalLine jl WHERE jl.journalEntry.reference = :ref "
                                + "AND jl.accountCode = :code AND jl.debit > 0", Long.class)
                .setParameter("ref", reference)
                .setParameter("code", PostingEngineService.ACC_SALES_REVENUE)
                .getSingleResult();
        return salesRevenueLines != null && salesRevenueLines > 0;
    }

    private BigDecimal inventoryDebitOn(String reference) {
        return sumDebit(reference, PostingEngineService.ACC_INVENTORY);
    }

    private BigDecimal arDebitOn(String reference) {
        return sumDebit(reference, PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
    }

    private BigDecimal sumDebit(String reference, String accountCode) {
        BigDecimal sum = entityManager.createQuery(
                        "SELECT COALESCE(SUM(jl.debit), 0) FROM JournalLine jl "
                                + "WHERE jl.journalEntry.reference = :ref AND jl.accountCode = :code",
                        BigDecimal.class)
                .setParameter("ref", reference)
                .setParameter("code", accountCode)
                .getSingleResult();
        return sum != null ? sum : BigDecimal.ZERO;
    }

    private String currentUsername() {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        return auth != null ? auth.getName() : "System";
    }
}
