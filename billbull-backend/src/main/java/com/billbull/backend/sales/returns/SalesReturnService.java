package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.batch.BatchStatus;
import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.serial.SerialStatus;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.InvoiceBalanceService;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplication;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationRepository;
import com.billbull.backend.sales.returns.credit.SalesReturnCreditApplicationStatus;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.voucher.CreditVoucher;
import com.billbull.backend.sales.voucher.CreditVoucherResponse;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
@Slf4j
public class SalesReturnService {

    @Autowired
    private SalesReturnRepository salesReturnRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private BatchSelectionService batchSelectionService;

    @Autowired
    private BatchAllocationRepository batchAllocationRepository;

    @Autowired
    private DeliveryNoteRepository deliveryNoteRepository;

    @Autowired
    private com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository;

    @Autowired
    private StockMovementService stockMovementService;

    @Autowired
    private SalesDocumentNumberingService numberingService;

    @Autowired
    private BranchAccessService branchAccessService;

    @Autowired
    private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    @Autowired
    private SerialMasterRepository serialMasterRepository;

    @Autowired
    private SalesReturnAuthorizationService authorizationService;

    @Autowired
    private SalesReturnCashRefundService cashRefundService;

    @Autowired
    private com.billbull.backend.sales.voucher.CreditVoucherService creditVoucherService;

    @Autowired
    private SalesReturnCustomerAccountResolver customerAccountResolver;

    @Autowired
    private com.billbull.backend.pos.session.PosSessionRepository posSessionRepository;

    @Autowired
    private com.billbull.backend.pos.businessdate.BusinessDayWindowService businessDayWindowService;

    @Autowired
    private com.billbull.backend.pos.businessdate.BusinessDayClock businessDayClock;

    @Autowired
    private com.billbull.backend.pos.audit.PosAuditService posAuditService;

    @Autowired
    private com.billbull.backend.security.AuditLogService auditLogService;

    @Autowired
    private SalesReturnRestockPlanner restockPlanner;

    /** The one owner of amountPaid / returnCredited / balance / status on a sales invoice. */
    @Autowired
    private InvoiceBalanceService invoiceBalanceService;

    /** The return-credit allocation ledger — where the unpaid portion of a return is recorded. */
    @Autowired
    private SalesReturnCreditApplicationRepository returnCreditApplicationRepository;

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        // ARCHFIX §1.6: items/batches are LAZY — fetch items via JOIN FETCH, then init the nested
        // batches (batched) inside this transaction so the response serializes fully.
        List<SalesReturn> returns = new ArrayList<>(
                ownershipAccessService.filterOwned(
                        branchAccessService.filterBranchScopedByBranch(salesReturnRepository.findAllWithItems(), SalesReturn::getBranch),
                        SalesReturn::getCreatedByUserId));
        returns.forEach(this::initReturnGraph);
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                returns,
                SalesReturn::getReturnDate,
                SalesReturn::getReturnNumber,
                SalesReturn::getId);
        return returns;
    }

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllByDateRange(java.time.LocalDate from, java.time.LocalDate to) {
        List<SalesReturn> returns = new ArrayList<>(
                ownershipAccessService.filterOwned(
                        branchAccessService.filterBranchScopedByBranch(salesReturnRepository.findByReturnDateBetween(from, to), SalesReturn::getBranch),
                        SalesReturn::getCreatedByUserId));
        returns.forEach(this::initReturnGraph);
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                returns,
                SalesReturn::getReturnDate,
                SalesReturn::getReturnNumber,
                SalesReturn::getId);
        return returns;
    }

    @Transactional(readOnly = true)
    public SalesReturn getReturnById(Long id) {
        SalesReturn ret = salesReturnRepository.findByIdWithItems(id)
                .orElseThrow(() -> new RuntimeException("Sales Return not found with ID: " + id));
        ownershipAccessService.assertCanAccessRecord(ret.getCreatedByUserId(), "Sales Return");
        initReturnGraph(ret);
        return ret;
    }

    /** Force-initialise the LAZY item batches (and items) within an open session so the entity can
     *  be serialized after the transaction closes (open-in-view=false). ARCHFIX §1.6. */
    private void initReturnGraph(SalesReturn ret) {
        if (ret.getItems() != null) {
            ret.getItems().forEach(item -> org.hibernate.Hibernate.initialize(item.getBatches()));
        }
    }

    @Transactional
    public SalesReturn saveReturn(SalesReturn salesReturn) {
        SalesReturn existingReturn = null;
        if (salesReturn.getId() != null) {
            existingReturn = getReturnById(salesReturn.getId());
            if (existingReturn.getStatus() == SalesReturnStatus.APPROVED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Approved returns cannot be modified. Create a reversal instead.");
            }
        }

        // Branch guard + stamp/lock (PDF §3.4).
        if (existingReturn != null) {
            Long existingBranchId = existingReturn.getBranch() != null ? existingReturn.getBranch().getId() : null;
            branchAccessService.assertTransactionBranchAccessible(existingBranchId, "Sales Return");
            salesReturn.setBranch(existingReturn.getBranch());
        } else {
            salesReturn.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        }

        if (salesReturn.getId() == null) {
            salesReturn.setReturnNumber(numberingService.resolveNumberForCreate(
                    SalesDocumentType.SALES_RETURN,
                    salesReturn.getReturnNumber()));
        } else if (existingReturn != null) {
            salesReturn.setReturnNumber(numberingService.resolveNumberForUpdate(
                    SalesDocumentType.SALES_RETURN,
                    existingReturn.getReturnNumber(),
                    salesReturn.getReturnNumber()));
        }

        // The creation endpoint may never hand out an APPROVED return (§R7). Approval is what
        // moves stock, posts to the GL and pays cash out of the drawer, and it runs only through
        // updateStatus — under the row lock, after authorization, after the quantity revalidation.
        // A POST that could set APPROVED directly would mint a return with every one of those
        // effects recorded as done and none of them performed: a phantom credit note. The server
        // decides the creation status regardless of what the client sends.
        assertCreationStatusAllowed(salesReturn.getStatus());

        if (salesReturn.getStatus() == null) {
            salesReturn.setStatus(SalesReturnStatus.DRAFT);
        }

        // §16 — the business date is the server's to decide, never the client's. See
        // resolveAuthoritativeBusinessDate: COALESCE(session tradingDate, branch Business Day).
        stampAuthoritativeBusinessDate(salesReturn, existingReturn);

        if (salesReturn.getItems() != null) {
            salesReturn.getItems().forEach(item -> item.setSalesReturn(salesReturn));
        }

        normaliseLineConditions(salesReturn);
        applyEntryPointDefaults(salesReturn);
        prorateDiscountFromInvoice(salesReturn);

        // One branch must own every leg of a return. Checked at creation so the cashier is told
        // immediately, and again at approval so a draft raised before this guard existed cannot
        // post a split.
        assertReturnBranchMatchesInvoice(salesReturn);

        boolean isNew = salesReturn.getId() == null;
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (isNew && saved.getEntryPoint() == SalesReturnEntryPoint.POS) {
            // RETURN_INITIATED has existed on PosAuditAction with no caller. A POS return that is
            // started and abandoned leaves no other trace, which is exactly the pattern a
            // loss-prevention review looks for.
            posAuditService.logReturnInitiated(
                    saved.getPosSessionId(), saved.getPosTerminalId(),
                    saved.getBranch() != null ? saved.getBranch().getId() : null,
                    saved.getId(), saved.getLinkedInvoice());
        }

        return saved;
    }

    /**
     * Keeps the structured per-line {@link SalesReturnCondition} (§12) and the legacy
     * {@code itemStatus} string in agreement, in whichever direction the caller supplied.
     *
     * <p>{@code itemStatus} is what the restock and COGS branches in this service actually
     * read, so it must never contradict the condition the cashier chose. New clients send
     * {@code condition}; older ones send only {@code itemStatus}; both end up consistent.
     */
    private void normaliseLineConditions(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null) return;

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getCondition() != null) {
                // Condition is authoritative — derive the legacy string from it.
                item.setItemStatus(item.getCondition().toLegacyItemStatus());
            } else {
                SalesReturnCondition derived = SalesReturnCondition.fromLegacyItemStatus(item.getItemStatus());
                if (derived == null) {
                    // Neither supplied. Default to GOOD (restock), matching the behaviour before
                    // conditions existed, where a blank status was treated as non-scrap.
                    derived = SalesReturnCondition.GOOD;
                }
                item.setCondition(derived);
                item.setItemStatus(derived.toLegacyItemStatus());
            }
        }
    }

    /** Fills in entry-point provenance and the refunded amount when the caller omitted them. */
    private void applyEntryPointDefaults(SalesReturn salesReturn) {
        if (salesReturn.getEntryPoint() == null) {
            // A return carrying POS session context came from POS even if the client did not say so.
            salesReturn.setEntryPoint(salesReturn.getPosSessionId() != null
                    ? SalesReturnEntryPoint.POS
                    : SalesReturnEntryPoint.SALES_RETURN);
        }
        if (salesReturn.getRefundAmount() == null && salesReturn.getRefundMethod() != null) {
            salesReturn.setRefundAmount(salesReturn.getTotalAmount());
        }
    }

    // ---------------------------------------------------------------
    // 'R7' Creation status - the server decides, never the client
    // ---------------------------------------------------------------

    /**
     * Rejects an APPROVED status supplied to the creation/update endpoint.
     *
     * <p>Approval is not a value a document can be created with: it is the transition that
     * locks the return row, resolves authorization, revalidates returnable quantities under
     * the invoice lock, restocks, posts the GL, and pays cash out of the drawer. All of that
     * lives in {@link #updateStatus}. A POST that could write APPROVED directly would record a
     * return whose every effect is claimed as done and none of it performed - a phantom credit
     * note with no stock movement, no journal and no payout.
     *
     * <p>CANCELLED stays allowed: cancelling a draft is a plain field change with no side effect.
     */
    private void assertCreationStatusAllowed(SalesReturnStatus requested) {
        if (requested == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "A sales return cannot be created or saved as APPROVED. Save it first, then"
                            + " approve it through PUT /api/sales/returns/{id}/status?status=APPROVED,"
                            + " which is the only path that moves stock, posts to the ledger and"
                            + " settles the refund.");
        }
    }

    // ---------------------------------------------------------------
    // Business date - server-authoritative, one value for every leg
    // ---------------------------------------------------------------

    /**
     * Stamps the return's authoritative business date onto both {@code returnDate} and
     * {@code tradingDate}, ignoring whatever the client sent.
     *
     * <p>The client used to derive {@code returnDate} as
     * {@code new Date().toISOString().slice(0,10)} - a <em>UTC</em> calendar date. In a UTC+4
     * branch every return taken between midnight and 04:00 local was therefore dated to the
     * previous day before any trading-day logic ran, which split the return from the drawer
     * payout that funded it.
     *
     * <p>Writing the same value to both columns is what makes every downstream leg agree: the
     * return journal, the inventory journal and the card/bank settlement journal all post on
     * {@code returnDate}; the stock movement and the credit voucher now take it explicitly; the
     * customer statement and the X/Z reports query {@code returnDate}; and the dashboard POS
     * badge matches {@code COALESCE(tradingDate, returnDate)}. With the two columns equal, that
     * COALESCE is the same date as everything else by construction.
     *
     * <p>Stamped on creation only. A draft keeps the business date it was raised on, so a return
     * saved before midnight and approved after it still posts to the day the goods came back -
     * and no client can shift an existing return's accounting date by re-saving it.
     */
    private void stampAuthoritativeBusinessDate(SalesReturn salesReturn, SalesReturn existingReturn) {
        if (existingReturn != null) {
            // Carry the original forward verbatim; an update may not move the accounting date.
            salesReturn.setReturnDate(existingReturn.getReturnDate());
            salesReturn.setTradingDate(existingReturn.getTradingDate());
            return;
        }
        LocalDate businessDate = resolveAuthoritativeBusinessDate(salesReturn);
        salesReturn.setReturnDate(businessDate);
        salesReturn.setTradingDate(businessDate);
    }

    /**
     * The one business date for this return, resolved exactly as POS checkout resolves the date
     * it stamps on the sales invoice ({@code PosCheckoutController.posBusinessDate}):
     * {@code COALESCE(session.tradingDate, session.sessionDate, branch Business Day)}.
     *
     * <p>Mirroring the invoice is the point. A return and the sale it reverses have to land on
     * the same business day for the day's reports to net, and the invoice's rule is already the
     * system's answer to "which day is it" at a POS terminal.
     *
     * <p>Back-office returns have no session, so they take the branch's current Business Day from
     * {@code BusinessDayWindowService} - the same authority POS session management and day close
     * use. The Business Day clock is the last resort, and it reads the configured POS timezone
     * rather than the server's, which is the whole point.
     */
    LocalDate resolveAuthoritativeBusinessDate(SalesReturn salesReturn) {
        Long sessionId = salesReturn.getPosSessionId();
        if (sessionId != null) {
            com.billbull.backend.pos.session.PosSession session =
                    posSessionRepository.findById(sessionId).orElse(null);
            if (session != null) {
                if (session.getTradingDate() != null) return session.getTradingDate();
                if (session.getSessionDate() != null) return session.getSessionDate();
            }
            log.warn("[SalesReturn] POS session {} carries no business date; falling back to the"
                    + " branch Business Day for {}.", sessionId, salesReturn.getReturnNumber());
        }

        Long branchId = salesReturn.getBranch() != null ? salesReturn.getBranch().getId() : null;
        try {
            LocalDate tradingDate = businessDayWindowService.currentTradingDate(branchId);
            if (tradingDate != null) return tradingDate;
        } catch (RuntimeException e) {
            log.warn("[SalesReturn] Could not resolve the Business Day for branch {}: {}. Using the"
                    + " Business Day clock instead.", branchId, e.getMessage());
        }
        return businessDayClock.now().toLocalDate();
    }

    // ---------------------------------------------------------------
    // Branch attribution - one branch owns every leg of a return
    // ---------------------------------------------------------------

    /**
     * Refuses a return whose own branch differs from the branch that raised the linked invoice.
     *
     * <p>A cross-branch return splits itself in two: the revenue/VAT/AR reversal posts in the
     * branch the return was raised in, while the goods go back to the warehouse on the selling
     * branch's delivery note. Branch B's P&amp;L then carries a reversal for a sale it never
     * made, and branch A's stock rises for a credit note it never issued.
     *
     * <p>Modelling that honestly needs inter-branch due-to/due-from accounts and a defined
     * transfer price, neither of which exists in this chart of accounts - so the rule is that it
     * is not permitted, and the selling branch owns every leg.
     *
     * <p>{@code assertTransactionBranchAccessible} already stopped this for a BRANCH_ADMIN, whose
     * branch scope excludes the other branch's invoice. It never stopped a global ADMIN, for whom
     * that check returns true for every branch: an admin with the Branch Selector on B could
     * raise a return against A's invoice and get exactly the split above. This closes the gap for
     * every role, by comparing the two branches rather than the caller's rights.
     */
    private void assertReturnBranchMatchesInvoice(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return;

        Long returnBranchId = salesReturn.getBranch() != null ? salesReturn.getBranch().getId() : null;
        if (returnBranchId == null) return; // legacy/branchless document - nothing to split

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty()) return; // a missing invoice is reported by the callers that need it

        Long invoiceBranchId = invoiceOpt.get().getBranchId();
        if (invoiceBranchId == null) return; // legacy invoice with no branch

        if (!invoiceBranchId.equals(returnBranchId)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Invoice " + linkedInvoice + " was sold by another branch ("
                            + describeBranch(invoiceOpt.get().getBranchName(), invoiceBranchId)
                            + "), and this return would be raised in "
                            + describeBranch(salesReturn.getBranch().getName(), returnBranchId)
                            + ". Cross-branch returns are not supported: the revenue reversal and"
                            + " the returned stock would land in different branches' books. Switch"
                            + " to the selling branch and process the return there.");
        }
    }

    private static String describeBranch(String name, Long id) {
        return name != null && !name.isBlank() ? name : "branch #" + id;
    }

    /**
     * Backfills discountPercent/discountAmount on each return line from the matching line
     * on the linked original invoice (matched by itemCode), prorating the invoice line's
     * discount amount (item discount + footer-discount share) by returnQty/soldQty so partial
     * returns carry a proportional discount.
     * Leaves any discount already supplied by the caller untouched.
     */
    void prorateDiscountFromInvoice(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return;

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty() || invoiceOpt.get().getItems() == null) return;

        Map<SalesInvoiceItem, BigDecimal> footerShares =
                com.billbull.backend.sales.invoice.InvoiceFooterDiscountShares.of(invoiceOpt.get());
        // Two indexes, strongest identity first. The id map is exact; the code map keeps the
        // first matching line, which is only ever consulted for a return line that carries no
        // invoice line id (a legacy row, or a client that does not send it).
        Map<Long, SalesInvoiceItem> invoiceItemById = new HashMap<>();
        Map<String, SalesInvoiceItem> invoiceItemByCode = new HashMap<>();
        for (SalesInvoiceItem ii : invoiceOpt.get().getItems()) {
            if (ii.getId() != null) {
                invoiceItemById.put(ii.getId(), ii);
            }
            if (ii.getItemCode() != null) {
                invoiceItemByCode.putIfAbsent(ii.getItemCode(), ii);
            }
        }

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getDiscountAmount() != null) continue; // caller already supplied a value
            SalesInvoiceItem invoiceItem = resolveInvoiceLine(item, invoiceItemById, invoiceItemByCode);
            if (invoiceItem == null) continue;

            item.setDiscountPercent(invoiceItem.getDiscount());

            int soldQty = invoiceItem.getQuantity() != null ? invoiceItem.getQuantity() : 0;
            int returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;
            BigDecimal invoiceLineDiscountAmt = invoiceItem.getPrice() != null && invoiceItem.getDiscount() != null
                    ? invoiceItem.getPrice()
                            .multiply(BigDecimal.valueOf(soldQty))
                            .multiply(BigDecimal.valueOf(invoiceItem.getDiscount() / 100.0)
                                    .setScale(6, java.math.RoundingMode.HALF_UP))
                    : BigDecimal.ZERO;
            // The line's footer-discount share is part of the discount the customer received.
            BigDecimal footerShare = footerShares.get(invoiceItem);
            if (footerShare != null) {
                invoiceLineDiscountAmt = invoiceLineDiscountAmt.add(footerShare);
            }

            if (soldQty > 0 && returnQty > 0) {
                BigDecimal proratedDiscount = invoiceLineDiscountAmt
                        .multiply(BigDecimal.valueOf(returnQty))
                        .divide(BigDecimal.valueOf(soldQty), 2, java.math.RoundingMode.HALF_UP);
                item.setDiscountAmount(proratedDiscount);
            } else {
                item.setDiscountAmount(BigDecimal.ZERO);
            }
        }
    }

    /**
     * The original invoice line a return line came from, by the strongest identity available.
     *
     * <p>Prefers the persisted {@code invoiceItemId} and falls back to the item code. The
     * fallback is what the whole module used to do, and it is wrong in exactly one shape: the
     * same product on one invoice twice, at different prices or different costs. The first
     * matching line then won for both return lines, so one of them was prorated and valued
     * against money the customer never paid for it.
     *
     * <p>Shared by proration and by the restock plan's cost resolution, so a return line cannot
     * be priced off one invoice line and costed off another.
     */
    static SalesInvoiceItem resolveInvoiceLine(SalesReturnItem item,
                                               Map<Long, SalesInvoiceItem> byId,
                                               Map<String, SalesInvoiceItem> byCode) {
        if (item == null) return null;
        if (item.getInvoiceItemId() != null) {
            SalesInvoiceItem exact = byId.get(item.getInvoiceItemId());
            if (exact != null) return exact;
            log.warn("[SalesReturn] return line for '{}' names invoice item id {} which is not on"
                            + " the linked invoice — falling back to the item-code match.",
                    item.getItemCode(), item.getInvoiceItemId());
        }
        return item.getItemCode() != null ? byCode.get(item.getItemCode()) : null;
    }

    @Transactional
    public void deleteReturn(Long id) {
        SalesReturn existing = getReturnById(id);
        if (existing.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be deleted.");
        }
        salesReturnRepository.deleteById(id);
    }

    public String generateReturnNumber() {
        return numberingService.preview(SalesDocumentType.SALES_RETURN);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getReturnStats() {
        Map<String, Object> stats = new HashMap<>();

        LocalDate today        = LocalDate.now();
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart   = currentMonth.atDay(1);
        LocalDate monthEnd     = currentMonth.atEndOfMonth();
        List<SalesReturn> scopedReturns = ownershipAccessService.filterOwned(
                branchAccessService.filterExactBranchScopedByBranch(
                        salesReturnRepository.findAll(),
                        SalesReturn::getBranch),
                SalesReturn::getCreatedByUserId);

        double todayReturns = scopedReturns.stream()
                .filter(salesReturn -> salesReturn.getReturnDate() != null && salesReturn.getReturnDate().isEqual(today))
                .map(SalesReturn::getTotalAmount)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        double monthReturns = scopedReturns.stream()
                .filter(salesReturn -> salesReturn.getReturnDate() != null
                        && !salesReturn.getReturnDate().isBefore(monthStart)
                        && !salesReturn.getReturnDate().isAfter(monthEnd))
                .map(SalesReturn::getTotalAmount)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        double totalApproved = scopedReturns.stream()
                .filter(salesReturn -> salesReturn.getStatus() == SalesReturnStatus.APPROVED)
                .map(SalesReturn::getTotalAmount)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        long totalCount = scopedReturns.size();

        stats.put("todayReturns",         todayReturns);
        stats.put("thisMonthReturns",      monthReturns);
        stats.put("totalApprovedReturns",  totalApproved);
        stats.put("totalTransactions",     totalCount);

        return stats;
    }

    @Transactional
    public SalesReturn updateStatus(Long id, SalesReturnStatus status) {
        return updateStatus(id, status, null, null);
    }

    /**
     * Transitions a return's status, running every side effect of approval in one transaction.
     *
     * <p>Order matters and is deliberate (§13): the row is locked, then authorization is
     * established, then quantities are revalidated, and only after all of that does anything
     * move — stock, GL, and finally the drawer cash-out. An unauthorized or stale request
     * therefore fails with nothing having been written, rather than leaving a half-applied
     * refund behind.
     *
     * @param supervisorUsername supervisor credentials, required only when policy flags this
     *                           return for sign-off; ignored otherwise
     */
    @Transactional
    public SalesReturn updateStatus(Long id, SalesReturnStatus status,
                                    String supervisorUsername, String supervisorPassword) {
        // Take the row lock BEFORE reading status. This is what makes confirmation idempotent:
        // a double-clicked or retried approval blocks here, then sees APPROVED and is rejected,
        // so stock, journals and the cash payout each happen exactly once.
        salesReturnRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Sales Return not found with ID: " + id));

        SalesReturn salesReturn = getReturnById(id);

        if (salesReturn.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be modified.");
        }

        // Kept in scope for the approval audit entry below, which records why sign-off was (or
        // was not) required alongside who gave it.
        String requiredAuthorization = null;

        // The row-locked linked invoice, held for the whole transaction once the quantity guard
        // takes it. The economic split must be computed from THIS instance — see §6 of the
        // Phase 2 brief: a split read from a second, unlocked query could be stale, and two
        // concurrent returns would then both claim the same outstanding balance.
        SalesInvoice lockedInvoice = null;

        if (status == SalesReturnStatus.APPROVED) {
            // §15/§10 — authorization is resolved from persisted state and enforced here, so a
            // direct API call cannot skip it by omitting whatever flag the UI would have sent.
            requiredAuthorization = authorizationService.resolveRequiredAuthorization(salesReturn);
            if (requiredAuthorization != null) {
                authorizationService.authorize(salesReturn, requiredAuthorization,
                        supervisorUsername, supervisorPassword);
            }

            // §14 — the refund method has to be one this customer can actually be settled with.
            // Checked here, not only in the UI: the screen greys the control out, but that is a
            // hint, and a return posted through the API directly must not be able to book a
            // ledger credit against a customer who has no ledger.
            assertRefundMethodSettleable(salesReturn);

            // One branch owns every leg: the revenue reversal and the returned stock cannot be
            // allowed to land in two different branches' books.
            assertReturnBranchMatchesInvoice(salesReturn);

            // §29 — revalidate against persisted data under a lock BEFORE anything is written.
            // Whatever the client was shown when it built this return is stale by now. The
            // returned row is the LOCKED invoice; the economic split below is computed from it
            // inside this same lock, which is what stops two concurrent returns from both
            // consuming the same outstanding balance.
            lockedInvoice = assertReturnableQuantitiesStillAvailable(salesReturn);
        }

        salesReturn.setStatus(status);
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (status == SalesReturnStatus.APPROVED) {
            // §C — the economic split, resolved FIRST and from the locked invoice, because every
            // step below depends on it: what the settlement pays out, what the allocation
            // credits, and which refund methods are legitimate at all. This also overwrites the
            // client-supplied refundAmount with the server's figure, so no browser can decide
            // how much money leaves the drawer.
            SalesReturnSettlementSplit split = resolveSettlementSplit(saved, lockedInvoice);
            assertSettlementMethodMatchesSplit(saved, split);

            // One restock decision, resolved before anything is written, read by all three of the
            // steps that used to decide it for themselves: the batch stock pass, the non-batch
            // stock pass, and the inventory journal. See SalesReturnRestockPlan.
            SalesReturnRestockPlan restockPlan = restockPlanner.plan(saved);
            assertRestockCostsResolved(saved, restockPlan);

            applyBatchReturns(saved, restockPlan);
            applyNonBatchStockReturns(saved, restockPlan);
            // Unchanged on purpose: Cr AR for the FULL return value, every method, every time.
            // The settlement leg below debits back only the paid portion, so the net credit to
            // AR is exactly the unpaid portion — which is exactly what the allocation reduces
            // the invoice balance by. GL AR and the AR sub-ledger therefore agree by
            // construction, with no new journal shape and no per-method branching.
            postJournalForApprovedReturn(saved, restockPlan);
            // The unpaid portion, as an allocation row plus a canonical balance recompute.
            // Never a direct write to invoice.balance.
            applyReturnCreditToInvoice(saved, split, lockedInvoice);
            applySerialReturns(saved);
            // Last, because these are the steps that hand value to the customer, and they now
            // move the paid portion and nothing else. All share this transaction, so a failure
            // anywhere above rolls them back with everything else — a return is never reported
            // as refunded without the matching drawer movement, and never reported as settled by
            // voucher without the voucher actually existing.
            cashRefundService.recordCashRefund(saved);
            issueCreditVoucherIfRequired(saved, split);
            postRefundSettlementIfRequired(saved, split);

            // Audited only here, after every effect has succeeded. Reached for every approval,
            // not only the supervisor-gated ones: RETURN_AUTHORIZED records that a supervisor
            // signed off, which is a different fact from "this return was approved and posted",
            // and an ordinary approval previously produced no audit record at all.
            auditApproval(saved, requiredAuthorization, split);
        }
        return saved;
    }

    /**
     * Audit trail for a completed approval, on both of the trails that matter.
     *
     * <p>{@code AuditLogService} is the security/domain trail a compliance review reads;
     * {@code PosAuditService} is the per-terminal POS trail the X-Report and shift
     * investigations read. Both are fire-and-forget on their own transactions, so neither can
     * roll back an approval that has already handed the customer value.
     */
    private void auditApproval(SalesReturn saved, String requiredAuthorization,
                               SalesReturnSettlementSplit split) {
        java.math.BigDecimal settled = split.paidPortion();

        auditLogService.logDomainEvent("SALES_RETURN", saved.getReturnNumber(), "RETURN_APPROVED",
                String.format("Return %s approved: total %s, invoice outstanding %s,"
                                + " receivable credited %s, settled %s by %s, invoice %s,"
                                + " customer %s, business date %s, branch %s. Authorization: %s.",
                        saved.getReturnNumber(), saved.getTotalAmount(),
                        split.invoiceOutstanding(), split.unpaidPortion(), settled,
                        saved.getRefundMethod(), saved.getLinkedInvoice(),
                        saved.getCustomerCode() != null ? saved.getCustomerCode() : "walk-in",
                        saved.getReturnDate(),
                        saved.getBranch() != null ? saved.getBranch().getName() : "unassigned",
                        requiredAuthorization != null
                                ? requiredAuthorization + " signed off by " + saved.getAuthorizedByUsername()
                                : "not required by policy"));

        posAuditService.logReturnApproved(
                saved.getPosSessionId(), saved.getPosTerminalId(),
                saved.getBranch() != null ? saved.getBranch().getId() : null,
                saved.getId(), saved.getReturnNumber(),
                saved.getRefundMethod() != null ? saved.getRefundMethod().name() : null,
                settled);
    }

    /**
     * Refuses the approval when any resaleable line has no resolvable cost.
     *
     * <p>Restocking a unit whose cost is unknown raises on-hand quantity with nothing to value it
     * at, which is the one outcome the three-tier cost hierarchy exists to prevent. The message
     * names the offending item codes, because the posting engine's own guard rejects with a
     * generic "resolve the product WAC" that forces a cashier to read the logs.
     *
     * <p>Previously this fired only when the <em>whole</em> return resolved to zero cost, so a
     * two-line return where one line had a cost approved happily and silently dropped the other
     * line's inventory value.
     */
    private void assertRestockCostsResolved(SalesReturn salesReturn, SalesReturnRestockPlan plan) {
        List<String> missing = plan.unresolvedCostItemCodes();
        if (missing.isEmpty()) return;

        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                "Cannot approve " + salesReturn.getReturnNumber() + ": no Cost Price is set for "
                        + String.join(", ", missing)
                        + ". Set the Cost Price under Inventory → Products → Pricing for "
                        + (missing.size() > 1 ? "these items" : "this item") + ", then retry.");
    }

    /**
     * Rejects a refund method the customer on this return cannot be settled with (§14).
     *
     * <p>Today that is Customer Credit on a walk-in sale: the method posts to the customer's
     * ledger, and an anonymous sale has no ledger to post to. Booking it anyway would record a
     * credit against the "WALK-IN" placeholder, where it would be both unredeemable by the
     * customer and a permanent phantom balance in the AR sub-ledger.
     *
     * <p>The error names Credit Voucher as the alternative because it is the instrument that
     * solves the same problem for an anonymous customer — bearer credit, no account needed.
     */
    private void assertRefundMethodSettleable(SalesReturn salesReturn) {
        if (salesReturn.getRefundMethod() == null) return;

        String blocked = customerAccountResolver.blockedReason(
                salesReturn.getRefundMethod(), salesReturn.getCustomerCode());
        if (blocked != null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY, blocked);
        }
    }

    /**
     * Issues the store-credit voucher for a return settled as {@code CREDIT_VOUCHER} (§7).
     *
     * <p>Runs in the approval transaction so voucher creation and the return commit together. If
     * issuance fails the whole approval rolls back rather than leaving a return that claims to
     * have refunded via a voucher that was never created (§8).
     *
     * <p>The issued voucher is attached to the returned entity so the caller gets its real,
     * persisted code, balance and expiry in the same response — the frontend never invents any of
     * those (§25).
     */
    private void issueCreditVoucherIfRequired(SalesReturn salesReturn, SalesReturnSettlementSplit split) {
        if (salesReturn.getRefundMethod() != SalesReturnRefundMethod.CREDIT_VOUCHER) {
            return;
        }

        // The paid portion, and never the full total: a voucher is redeemable value handed to
        // the customer, and value they have not yet paid for cannot be handed back. A return
        // with no paid portion never reaches here — assertSettlementMethodMatchesSplit refuses
        // the method outright, with a reason, rather than issuing a zero-value voucher.
        java.math.BigDecimal amount = split.paidPortion();

        CreditVoucher voucher = creditVoucherService.issueForSalesReturn(
                salesReturn.getId(),
                salesReturn.getReturnNumber(),
                salesReturn.getLinkedInvoice(),
                amount,
                salesReturn.getCustomerCode(),
                salesReturn.getCustomerName(),
                salesReturn.getCustomerMobile(),
                salesReturn.getBranch(),
                // The return's business date, so the voucher, its liability journal and the
                // return itself all land on the same day's reports.
                salesReturn.getReturnDate());

        salesReturn.setIssuedVoucher(CreditVoucherResponse.from(voucher));
    }

    /**
     * Clears the AR credit for a return refunded to a card or by bank transfer.
     *
     * <p>The return journal always posts {@code Cr Accounts Receivable} for the full total, and
     * every refund method has to say what clears it. Cash does so through the drawer movement
     * {@link SalesReturnCashRefundService} books, a voucher through its issue journal, and
     * Customer Credit deliberately leaves the credit on the account. Card and bank refunds had
     * nothing: the money left the business but AR stayed credited and the bank/merchant account
     * never moved, so both the trial balance and the customer's statement were wrong by the
     * refund amount.
     *
     * <p>Posted last, alongside the other settlement steps, and inside the same transaction —
     * a failure here rolls the whole approval back.
     */
    private void postRefundSettlementIfRequired(SalesReturn salesReturn, SalesReturnSettlementSplit split) {
        SalesReturnRefundMethod method = salesReturn.getRefundMethod();
        if (method != SalesReturnRefundMethod.CARD_REFUND && method != SalesReturnRefundMethod.BANK_TRANSFER) {
            return;
        }

        // Settles the paid portion only. The old fallback to totalAmount is gone: it was the
        // path by which a client-supplied figure (or a null) decided how much money left the
        // business, and the server now owns that number outright.
        java.math.BigDecimal amount = split.paidPortion();
        if (amount.signum() <= 0) {
            // Unreachable via assertSettlementMethodMatchesSplit, which refuses the method when
            // there is nothing to pay back. Guarded anyway so a future caller cannot post a
            // zero-value settlement journal.
            return;
        }

        postingEngineService.createJournalFromSalesReturnRefundSettlement(
                salesReturn, amount, method == SalesReturnRefundMethod.BANK_TRANSFER);
    }

    // ---------------------------------------------------------------
    // Phase 2 — the economic split
    // ---------------------------------------------------------------

    /**
     * Computes the return's economic split from the linked invoice's real payment history and
     * stamps the paid portion onto {@code refundAmount}.
     *
     * <pre>
     * returnValue        = sales_returns.total_amount
     * invoiceOutstanding = InvoiceBalanceService.effectiveOutstanding(lockedInvoice)
     * unpaidPortion      = min(returnValue, invoiceOutstanding)
     * paidPortion        = returnValue - unpaidPortion
     * </pre>
     *
     * <p><b>The server is the accounting authority.</b> {@code refundAmount} arrives from the
     * client — the return screen sends the full refund total — and used to be accepted as the
     * amount actually paid out, with every settlement path reading
     * {@code refundAmount ?? totalAmount}. It is now <em>overwritten</em>, not defaulted: a
     * client that sends a larger figure, or no figure, cannot change how much money leaves the
     * drawer. Nothing downstream reads the client's value again.
     *
     * <p>Must be called with {@code lockedInvoice} being the row-locked instance taken by
     * {@link #assertReturnableQuantitiesStillAvailable}. The outstanding is read from the
     * allocation ledgers through the one canonical definition, so it is already net of earlier
     * return credits — which is what stops two successive returns against the same part-paid
     * invoice from both claiming the same unpaid portion.
     *
     * <p>No linked invoice means no receivable to split against, so the whole return is a paid
     * portion. That is the same answer the model gives for a fully paid sale, and it is the
     * conservative one: it never credits AR for a receivable nobody can point to.
     */
    private SalesReturnSettlementSplit resolveSettlementSplit(SalesReturn salesReturn, SalesInvoice lockedInvoice) {
        BigDecimal returnValue = salesReturn.getTotalAmount();

        SalesReturnSettlementSplit split;
        if (lockedInvoice == null) {
            split = SalesReturnSettlementSplit.fullyPaid(returnValue);
            log.warn("[SalesReturn] {} has no resolvable linked invoice — the whole return value {}"
                            + " is treated as a paid portion (no receivable to credit).",
                    salesReturn.getReturnNumber(), split.returnValue());
        } else {
            split = SalesReturnSettlementSplit.of(
                    returnValue, invoiceBalanceService.effectiveOutstanding(lockedInvoice));
        }

        // Invariant 1 (§22): returnValue == unpaidPortion + paidPortion. True by construction —
        // asserted because it is the identity the whole model rests on, and a silent break here
        // would show up only as an unexplained AR drift weeks later.
        if (!split.isConsistent()) {
            throw new IllegalStateException("Return split does not reconcile for "
                    + salesReturn.getReturnNumber() + ": value " + split.returnValue()
                    + " != unpaid " + split.unpaidPortion() + " + paid " + split.paidPortion());
        }

        BigDecimal clientSupplied = salesReturn.getRefundAmount();
        salesReturn.setRefundAmount(split.paidPortion());
        salesReturnRepository.save(salesReturn);

        if (clientSupplied != null && clientSupplied.compareTo(split.paidPortion()) != 0) {
            log.info("[SalesReturn] {} — client-supplied refundAmount {} overridden with the"
                            + " server-derived paid portion {} (return {} vs invoice outstanding {}).",
                    salesReturn.getReturnNumber(), clientSupplied, split.paidPortion(),
                    split.returnValue(), split.invoiceOutstanding());
        }
        log.info("[SalesReturn] {} split: value={} invoiceOutstanding={} unpaidPortion={} paidPortion={}",
                salesReturn.getReturnNumber(), split.returnValue(), split.invoiceOutstanding(),
                split.unpaidPortion(), split.paidPortion());
        return split;
    }

    /**
     * Refuses a refund method that cannot settle this return's paid portion (§11 / §04).
     *
     * <p>The refund method applies to the paid portion and to nothing else. When the paid
     * portion is zero, the customer has not yet paid for the goods they are returning, so there
     * is no money, voucher or store credit that could legitimately be handed back — the only
     * settlement is the AR allocation. Under the old model a cashier could press Cash Refund on
     * a part-paid invoice, hand over the cash, and leave the customer still owing the full
     * balance; that outcome is now unreachable rather than merely discouraged.
     *
     * <p>Enforced server-side even though the return screen disables the controls, for the same
     * reason {@link #assertRefundMethodSettleable} is: the screen is a hint, and a return posted
     * straight through the API must not be able to route around the accounting.
     *
     * <p><b>CUSTOMER_CREDIT with a paid portion is blocked pending finance sign-off.</b> Under
     * the target model that case issues held customer credit — {@code Dr 1100 / Cr 2062
     * Customer Credit Notes Unapplied} — but account 2062 does not exist in this chart of
     * accounts and its creation is an unapproved business decision (economic model §J decision
     * 7). Posting the paid portion with no settlement leg would credit GL 1100 for value the
     * sub-ledger never records, so the method is refused with a stated reason rather than
     * silently booking an unbacked credit. CUSTOMER_CREDIT remains fully available for the
     * ordinary case — an unpaid or part-paid invoice, where the whole return is an AR
     * allocation.
     */
    private void assertSettlementMethodMatchesSplit(SalesReturn salesReturn, SalesReturnSettlementSplit split) {
        SalesReturnRefundMethod method = salesReturn.getRefundMethod();
        if (method == null) return;

        if (!split.hasPaidPortion() && method.movesValueToCustomer()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot settle " + salesReturn.getReturnNumber() + " by "
                            + method.getLabel() + ": the customer has not paid for these goods."
                            + " Invoice " + salesReturn.getLinkedInvoice() + " still has "
                            + split.invoiceOutstanding() + " outstanding, so the full return value of "
                            + split.returnValue() + " reduces what they owe instead of being paid back."
                            + " Settle this return as Customer Credit.");
        }

        if (method == SalesReturnRefundMethod.CUSTOMER_CREDIT && split.hasPaidPortion()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot settle " + salesReturn.getReturnNumber() + " as Customer Credit: "
                            + split.paidPortion() + " of this return has already been paid by the"
                            + " customer and would have to be held as customer credit, which needs"
                            + " the Customer Credit Notes Unapplied liability account to be set up"
                            + " first. Refund the paid portion by cash, card, bank transfer or"
                            + " credit voucher.");
        }
    }

    /**
     * Represents the unpaid portion as an allocation row and recomputes the invoice balance.
     *
     * <p>This is the only thing that reduces the linked invoice's outstanding, and it does so
     * through the ledger rather than by writing the column: the balance stays a projection
     * derived by {@link InvoiceBalanceService#recomputeInvoiceBalance}. A direct
     * {@code invoice.setBalance(...)} here would survive exactly until the next receipt against
     * that invoice, whose own recompute would silently erase it — which is precisely when the
     * credit matters most.
     *
     * <p>No GL entry of its own. The return journal already credited AR for the full return
     * value and the settlement leg debits back only the paid portion, so the residue <em>is</em>
     * the receivable reduction; posting an allocation journal would double-count it.
     *
     * <p>Idempotent on {@code (return_number, invoice_number)} where status is APPLIED — the
     * approval row lock is the primary guard, the unique index is the one that holds regardless,
     * and the pre-check here turns a constraint violation into a no-op on a retry.
     */
    private void applyReturnCreditToInvoice(SalesReturn salesReturn, SalesReturnSettlementSplit split,
                                            SalesInvoice lockedInvoice) {
        if (!split.hasUnpaidPortion()) {
            log.debug("[SalesReturn] {} has no unpaid portion — no allocation row written.",
                    salesReturn.getReturnNumber());
            return;
        }
        if (lockedInvoice == null) {
            // resolveSettlementSplit cannot produce an unpaid portion without a locked invoice.
            log.warn("[SalesReturn] {} resolved an unpaid portion of {} with no linked invoice —"
                            + " allocation skipped.",
                    salesReturn.getReturnNumber(), split.unpaidPortion());
            return;
        }

        String invoiceNumber = lockedInvoice.getInvoiceNumber();
        if (returnCreditApplicationRepository.existsByReturnNumberAndInvoiceNumberAndStatus(
                salesReturn.getReturnNumber(), invoiceNumber,
                SalesReturnCreditApplicationStatus.APPLIED)) {
            log.info("[SalesReturn] {} already has an APPLIED credit allocation against {} —"
                            + " not written again.",
                    salesReturn.getReturnNumber(), invoiceNumber);
            return;
        }

        returnCreditApplicationRepository.save(SalesReturnCreditApplication.applied(
                salesReturn.getId(),
                salesReturn.getReturnNumber(),
                invoiceNumber,
                // The allocation belongs to the invoice's customer, which is the account whose
                // receivable it cancels — not to whatever the return row happens to carry.
                lockedInvoice.getCustomerCode() != null
                        ? lockedInvoice.getCustomerCode()
                        : salesReturn.getCustomerCode(),
                split.unpaidPortion(),
                // The return's authoritative business date, so the document, its journals, the
                // stock movement, the drawer movement and this row all land on one day.
                salesReturn.getReturnDate()));

        BigDecimal balance = invoiceBalanceService.recomputeInvoiceBalance(lockedInvoice);
        log.info("[SalesReturn] {} allocated {} against invoice {} — balance recomputed to {}.",
                salesReturn.getReturnNumber(), split.unpaidPortion(), invoiceNumber, balance);
    }

    // ---------------------------------------------------------------
    // §29 Concurrency guard
    // ---------------------------------------------------------------

    /**
     * Re-checks every line's returnable quantity against persisted data, holding a write lock
     * on the original invoice row for the duration of the transaction.
     *
     * <p>Why the invoice row: every return against an invoice must pass through it, so locking
     * it serialises concurrent approvals. Without this, two terminals could each read
     * "available = 2" for a non-batch product and both approve a return of 2, over-returning
     * the sale. Batch-controlled lines were already safe — {@link #applyBatchReturns} locks each
     * BatchAllocation — but non-batch lines had no equivalent guard.
     *
     * <p>Deliberately fails the whole return rather than silently trimming quantities: a cashier
     * who has already handed over cash for 2 units must be told the second unit was rejected,
     * not have it disappear from the receipt.
     *
     * @return the row-locked invoice, which the caller uses to compute the economic split
     *         <em>inside this same lock</em> (§C refinement 1). {@code null} when the return has
     *         no linked invoice or no lines, in which case there is no outstanding to split
     *         against. Returning the locked instance rather than re-reading it is the point: a
     *         split computed from a second, unlocked read could be stale, and two concurrent
     *         returns could then both consume the same outstanding balance.
     */
    private SalesInvoice assertReturnableQuantitiesStillAvailable(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return null;

        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) {
            // Unlinked returns have no invoice to over-return against; nothing to serialise on.
            log.warn("[SalesReturn] {} has no linked invoice — skipping returnable-quantity revalidation.",
                    salesReturn.getReturnNumber());
            return null;
        }

        Optional<SalesInvoice> lockedOpt = salesInvoiceRepository.findByInvoiceNumberForUpdate(linkedInvoice);
        if (lockedOpt.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot approve " + salesReturn.getReturnNumber() + ": linked invoice '"
                            + linkedInvoice + "' no longer exists.");
        }
        SalesInvoice invoice = lockedOpt.get();

        // Sold quantity per item code, excluding voided lines.
        Map<String, Integer> soldByCode = new HashMap<>();
        if (invoice.getItems() != null) {
            for (SalesInvoiceItem ii : invoice.getItems()) {
                if (ii.getItemCode() == null || Boolean.TRUE.equals(ii.getVoided())) continue;
                soldByCode.merge(ii.getItemCode(), ii.getQuantity() != null ? ii.getQuantity() : 0, Integer::sum);
            }
        }

        // Already-approved returns against this invoice, read inside the lock. Only APPROVED
        // rows have moved stock, so only they consume returnable quantity — and this return
        // is still DRAFT at this point, so it cannot count itself.
        Map<String, Integer> returnedByCode = new HashMap<>();
        for (SalesReturn prior : salesReturnRepository.findByLinkedInvoiceWithItems(linkedInvoice)) {
            if (prior.getStatus() != SalesReturnStatus.APPROVED) continue;
            if (prior.getId() != null && prior.getId().equals(salesReturn.getId())) continue;
            if (prior.getItems() == null) continue;
            for (SalesReturnItem ri : prior.getItems()) {
                if (ri.getItemCode() == null) continue;
                returnedByCode.merge(ri.getItemCode(),
                        ri.getReturnQty() != null ? ri.getReturnQty() : 0, Integer::sum);
            }
        }

        List<String> violations = new ArrayList<>();
        for (SalesReturnItem item : salesReturn.getItems()) {
            String code = item.getItemCode();
            int requested = item.getReturnQty() != null ? item.getReturnQty() : 0;
            if (code == null || requested <= 0) continue;

            int sold = soldByCode.getOrDefault(code, 0);
            if (sold == 0) {
                violations.add(code + " is not on invoice " + linkedInvoice);
                continue;
            }
            int available = sold - returnedByCode.getOrDefault(code, 0);
            if (requested > available) {
                violations.add(code + ": requested " + requested + " but only " + Math.max(0, available)
                        + " of " + sold + " remain returnable");
            }
        }

        if (!violations.isEmpty()) {
            log.warn("[SalesReturn] {} rejected at approval — returnable quantities changed: {}",
                    salesReturn.getReturnNumber(), violations);
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "This return can no longer be completed because the invoice has changed since it was"
                            + " started (another return may have been processed). " + String.join("; ", violations)
                            + ". Reload the invoice and try again.");
        }

        return invoice;
    }

    // ---------------------------------------------------------------
    // applyNonBatchStockReturns — posts the inbound StockMovement for every
    // non-batch line the restock plan says puts goods back into stock, stamped
    // with the plan's resolved unit cost and the return's business date.
    //
    // The plan — not this method — decides whether a line restocks, so the
    // inventory journal debits exactly what these movements are worth. Lines the
    // plan excludes (scrap, or no destination warehouse) are already logged there.
    // ---------------------------------------------------------------
    private void applyNonBatchStockReturns(SalesReturn salesReturn, SalesReturnRestockPlan plan) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getBatches() != null && !item.getBatches().isEmpty()) {
                continue; // batch-controlled line handled by applyBatchReturns
            }
            SalesReturnRestockPlan.LineRestock line = plan.forLine(item);
            if (!line.restocks()) continue;

            Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(item.getItemCode());
            if (productOpt.isEmpty()) {
                // Unreachable in practice: the plan cannot resolve a cost for an item that is not
                // in the product master, so such a line is rejected before this point.
                log.warn("[SalesReturn] {} — item '{}' not found in product master; cannot post return stock movement.",
                        salesReturn.getReturnNumber(), item.getItemCode());
                continue;
            }

            stockMovementService.reverseOutboundStock(
                    StockSourceType.SALES_RETURN,
                    salesReturn.getId(),
                    productOpt.get().getId(),
                    line.warehouseId(),
                    line.restockQty(),
                    salesReturn.getReturnNumber(),
                    line.unitCost(),
                    salesReturn.getReturnDate());

            log.info("[SalesReturn] {} — non-batch line '{}' restocked qty={} at unit cost {} to"
                            + " warehouseId={} on business date {}.",
                    salesReturn.getReturnNumber(), item.getItemCode(), line.restockQty(),
                    line.unitCost(), line.warehouseId(), salesReturn.getReturnDate());
        }
    }

    // ---------------------------------------------------------------
    // Returnable batches lookup
    // ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ReturnableBatchResponse> getReturnableBatchesForInvoice(String invoiceNumber) {
        if (invoiceNumber == null || invoiceNumber.isBlank()) {
            return List.of();
        }
        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(invoiceNumber);
        if (invoiceOpt.isEmpty()) {
            return List.of();
        }
        SalesInvoice invoice = invoiceOpt.get();

        List<BatchAllocation> allocations = batchSelectionService.findReturnableAllocations(
                BatchSelectionService.DOC_TYPE_SALES_INVOICE, invoice.getId());

        if (allocations.isEmpty() && invoice.getLinkedDeliveryNote() != null && !invoice.getLinkedDeliveryNote().isBlank()) {
            List<String> dnNumbers = Arrays.stream(invoice.getLinkedDeliveryNote().split(","))
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .toList();
            if (!dnNumbers.isEmpty()) {
                List<DeliveryNote> notes = deliveryNoteRepository.findByDnNumberIn(dnNumbers);
                allocations = new ArrayList<>();
                for (DeliveryNote note : notes) {
                    allocations.addAll(batchSelectionService.findReturnableAllocations(
                            BatchSelectionService.DOC_TYPE_DELIVERY_NOTE, note.getId()));
                }
            }
        }

        // Final fallback: allocations may still live against the originating Sales Order
        // (e.g. direct SO→Invoice flow that bypassed a Delivery Note).
        if (allocations.isEmpty() && invoice.getLinkedSalesOrder() != null && !invoice.getLinkedSalesOrder().isBlank()) {
            Optional<com.billbull.backend.sales.salesorder.SalesOrder> soOpt =
                    salesOrderRepository.findBySoNumber(invoice.getLinkedSalesOrder());
            if (soOpt.isPresent()) {
                allocations = new ArrayList<>(batchSelectionService.findReturnableAllocations(
                        BatchSelectionService.DOC_TYPE_SALES_ORDER, soOpt.get().getId()));
            }
        }

        if (allocations.isEmpty()) {
            boolean hasBatchControlled = invoice.getItems() != null && invoice.getItems().stream()
                    .map(SalesInvoiceItem::getItemCode)
                    .filter(code -> code != null && !code.isBlank())
                    .anyMatch(code -> productRepository.findByCodeAndIsActiveTrue(code)
                            .map(Product::isBatch).orElse(false));
            if (hasBatchControlled) {
                log.warn("[SalesReturn] Invoice '{}' has batch-controlled items but no returnable BatchAllocation rows were found via SALES_INVOICE, DELIVERY_NOTE (linked='{}'), or SALES_ORDER (linked='{}'). Returning empty — UI will not show batch selection.",
                        invoiceNumber, invoice.getLinkedDeliveryNote(), invoice.getLinkedSalesOrder());
            }
        }

        Map<String, SalesInvoiceItem> itemByCode = new HashMap<>();
        if (invoice.getItems() != null) {
            for (SalesInvoiceItem ii : invoice.getItems()) {
                if (ii.getItemCode() != null) {
                    itemByCode.putIfAbsent(ii.getItemCode(), ii);
                }
            }
        }

        List<SalesReturn> existingReturns = salesReturnRepository.findByLinkedInvoiceWithItems(invoiceNumber);
        Map<String, Integer> alreadyReturnedByCode = new HashMap<>();
        for (SalesReturn r : existingReturns) {
            if ("DRAFT".equals(r.getStatus()) || "REJECTED".equals(r.getStatus())) continue;
            if (r.getItems() == null) continue;
            for (com.billbull.backend.sales.returns.SalesReturnItem ri : r.getItems()) {
                if (ri.getItemCode() != null) {
                    alreadyReturnedByCode.put(ri.getItemCode(), 
                        alreadyReturnedByCode.getOrDefault(ri.getItemCode(), 0) + (ri.getReturnQty() != null ? ri.getReturnQty() : 0));
                }
            }
        }

        List<ReturnableBatchResponse> out = new ArrayList<>();
        for (BatchAllocation a : allocations) {
            int already = batchSelectionService.sumAlreadyReturned(a.getId());
            int qty = a.getQuantity() != null ? a.getQuantity() : 0;
            int returnable = Math.max(0, qty - already);
            if (returnable <= 0) continue;

            ReturnableBatchResponse r = new ReturnableBatchResponse();
            r.allocationId = a.getId();
            r.batchMasterId = a.getBatchMaster() != null ? a.getBatchMaster().getId() : null;
            r.batchNumber = a.getBatchNumber();
            r.binId = a.getBinId();
            r.binCode = a.getBinCode();
            r.expiryDate = a.getExpiryDate();
            r.originalQty = qty;
            r.alreadyReturnedQty = already;
            r.returnableQty = returnable;
            r.sourceLineId = a.getSourceLineId();
            r.itemCode = a.getProductCode();
            SalesInvoiceItem ii = itemByCode.get(a.getProductCode());
            if (ii != null) {
                r.itemName = ii.getDescription() != null ? ii.getDescription() : ii.getItemCode();
                r.unit = ii.getUnit();
            }
            out.add(r);
        }

        for (SalesInvoiceItem ii : itemByCode.values()) {
            boolean hasAllocation = out.stream().anyMatch(r -> r.itemCode != null && r.itemCode.equals(ii.getItemCode()));
            if (!hasAllocation) {
                int already = alreadyReturnedByCode.getOrDefault(ii.getItemCode(), 0);
                int qty = ii.getQuantity() != null ? ii.getQuantity() : 0;
                int returnable = Math.max(0, qty - already);
                if (returnable > 0) {
                    ReturnableBatchResponse r = new ReturnableBatchResponse();
                    r.itemCode = ii.getItemCode();
                    r.itemName = ii.getDescription() != null ? ii.getDescription() : ii.getItemCode();
                    r.unit = ii.getUnit();
                    r.originalQty = qty;
                    r.alreadyReturnedQty = already;
                    r.returnableQty = returnable;
                    out.add(r);
                }
            }
        }
        
        return out;
    }

    // ---------------------------------------------------------------
    // §5.5 applySerialReturns — validate the returned serial against the serial sold on the
    // original invoice line, then move the unit to the state its actual condition warrants.
    // ---------------------------------------------------------------

    /**
     * Moves each returned unit's serial out of SOLD, into the state its <b>line condition</b>
     * warrants (§20B).
     *
     * <p>Two defects fixed here, both of which matter more now that the inventory journal
     * consumes the restock plan.
     *
     * <p><b>Condition was ignored.</b> Every returned serial became RETURNED regardless of
     * whether the unit came back resaleable or physically broken, so the serial register could
     * not tell a good return from a write-off. A scrap condition now lands on DEFECTIVE. As it
     * stands neither state is resaleable — {@code DeliveryNoteService} only picks AVAILABLE or
     * RESERVED — so this changes no stock outcome today; it makes the distinction durable, so a
     * later change that makes RETURNED units saleable again cannot quietly release a damaged
     * unit with it.
     *
     * <p><b>The serial was matched by item code, last line winning.</b> On an invoice carrying
     * the same product twice, each with its own serial, the map kept only the last line's serial
     * and flipped that unit for every return line of that product — marking a unit returned that
     * the customer still has, while leaving the returned one SOLD. Matching runs through the
     * resolved invoice line first ({@link #resolveInvoiceLine}), and each serial is consumed at
     * most once per return.
     */
    private void applySerialReturns(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;
        if (salesReturn.getLinkedInvoice() == null || salesReturn.getLinkedInvoice().isBlank()) return;

        Optional<SalesInvoice> invoiceOpt =
                salesInvoiceRepository.findByInvoiceNumber(salesReturn.getLinkedInvoice());
        if (invoiceOpt.isEmpty() || invoiceOpt.get().getItems() == null) return;

        Map<Long, SalesInvoiceItem> invoiceItemById = new HashMap<>();
        Map<String, SalesInvoiceItem> invoiceItemByCode = new HashMap<>();
        // Serials still unclaimed per item code, in invoice-line order, for return lines that
        // carry no invoice line id. One serial is consumed per matching return line instead of
        // the same one being reused.
        Map<String, List<String>> unclaimedSerialsByCode = new LinkedHashMap<>();
        for (SalesInvoiceItem si : invoiceOpt.get().getItems()) {
            if (si.getId() != null) invoiceItemById.put(si.getId(), si);
            if (si.getItemCode() == null) continue;
            invoiceItemByCode.putIfAbsent(si.getItemCode(), si);
            if (si.getSerialNumber() != null && !si.getSerialNumber().isBlank()) {
                unclaimedSerialsByCode
                        .computeIfAbsent(si.getItemCode(), k -> new ArrayList<>())
                        .add(si.getSerialNumber());
            }
        }

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getItemCode() == null) continue;

            String soldSerial = null;
            SalesInvoiceItem matchedLine = resolveInvoiceLine(item, invoiceItemById, invoiceItemByCode);
            if (item.getInvoiceItemId() != null && matchedLine != null
                    && matchedLine.getSerialNumber() != null && !matchedLine.getSerialNumber().isBlank()) {
                soldSerial = matchedLine.getSerialNumber();
                List<String> pool = unclaimedSerialsByCode.get(item.getItemCode());
                if (pool != null) pool.remove(soldSerial);
            } else {
                List<String> pool = unclaimedSerialsByCode.get(item.getItemCode());
                if (pool != null && !pool.isEmpty()) {
                    soldSerial = pool.remove(0);
                }
            }
            if (soldSerial == null) continue;

            SalesReturnCondition condition = item.getEffectiveCondition();
            // Unknown condition is treated as scrap, the same direction
            // SalesReturnCondition.fromLegacyItemStatus already fails in: never silently promote
            // a unit whose condition nobody recorded.
            SerialStatus target = condition != null && condition.isRestockable()
                    ? SerialStatus.RETURNED
                    : SerialStatus.DEFECTIVE;

            final String serialNumber = soldSerial;
            serialMasterRepository.findBySerialNumberForUpdate(serialNumber).ifPresent(serial -> {
                if (serial.getStatus() == SerialStatus.SOLD) {
                    serial.setStatus(target);
                    serialMasterRepository.save(serial);
                    log.info("[SalesReturn] {} — serial {} for item '{}' returned in condition {};"
                                    + " marked {}.",
                            salesReturn.getReturnNumber(), serialNumber, item.getItemCode(),
                            condition, target);
                }
            });
        }
    }

    // ---------------------------------------------------------------
    // applyBatchReturns — split allocations, flip BatchMaster status,
    // post positive StockMovement on APPROVED.
    // ---------------------------------------------------------------

    private void applyBatchReturns(SalesReturn salesReturn, SalesReturnRestockPlan plan) {
        if (salesReturn.getItems() == null) return;

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getBatches() == null || item.getBatches().isEmpty()) {
                continue; // non-batch line or no batches selected — skip
            }
            SalesReturnRestockPlan.LineRestock restock = plan.forLine(item);

            // Validate sum matches returnQty
            int batchSum = item.getBatches().stream()
                    .mapToInt(b -> b.getQuantity() != null ? b.getQuantity() : 0)
                    .sum();
            int returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;
            if (batchSum != returnQty) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Batch quantities (" + batchSum + ") must equal return quantity ("
                                + returnQty + ") for item " + item.getItemCode());
            }

            for (SalesReturnItemBatch sel : item.getBatches()) {
                Long parentId = sel.getOriginalAllocationId();
                int retQty = sel.getQuantity() != null ? sel.getQuantity() : 0;
                if (parentId == null || retQty <= 0) continue;

                // Pessimistic lock — prevents two concurrent returns from over-allocating
                // the same parent allocation.
                BatchAllocation parent = batchAllocationRepository.findByIdForUpdate(parentId)
                        .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                                org.springframework.http.HttpStatus.BAD_REQUEST,
                                "Allocation not found: " + parentId));

                // Validate batch number matches the original sold allocation.
                // Prevents a client from referencing a real allocation but returning a different batch.
                if (sel.getBatchNumber() != null && parent.getBatchNumber() != null
                        && !sel.getBatchNumber().equals(parent.getBatchNumber())) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.BAD_REQUEST,
                            "Return batch '" + sel.getBatchNumber() + "' does not match the original"
                                    + " sold batch '" + parent.getBatchNumber() + "' on allocation "
                                    + parentId + " for item " + item.getItemCode());
                }
                // Validate the product is the same — guards against mis-referencing allocations
                // from a different product on the same invoice.
                if (item.getItemCode() != null && parent.getProductCode() != null
                        && !item.getItemCode().equals(parent.getProductCode())) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.BAD_REQUEST,
                            "Return item '" + item.getItemCode() + "' references an allocation"
                                    + " belonging to product '" + parent.getProductCode() + "'");
                }

                int parentQty = parent.getQuantity() != null ? parent.getQuantity() : 0;
                int alreadyReturned = batchSelectionService.sumAlreadyReturned(parent.getId());
                int returnable = parentQty - alreadyReturned;
                if (retQty > returnable) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.BAD_REQUEST,
                            "Return quantity " + retQty + " exceeds returnable " + returnable
                                    + " for allocation " + parentId);
                }

                if (retQty == parentQty && alreadyReturned == 0) {
                    // Flip whole row
                    parent.setStatus(BatchAllocationStatus.RETURNED);
                    batchAllocationRepository.save(parent);
                } else {
                    // Split: decrement parent, insert sibling RETURNED row
                    parent.setQuantity(parentQty - retQty);
                    batchAllocationRepository.save(parent);

                    BatchAllocation ret = new BatchAllocation();
                    ret.setSourceDocumentType(BatchSelectionService.DOC_TYPE_SALES_RETURN);
                    ret.setSourceDocumentId(salesReturn.getId());
                    ret.setSourceLineId(item.getId());
                    ret.setProductId(parent.getProductId());
                    ret.setProductCode(parent.getProductCode());
                    ret.setBinId(parent.getBinId());
                    ret.setBinCode(parent.getBinCode());
                    ret.setBatchMaster(parent.getBatchMaster());
                    ret.setBatchNumber(parent.getBatchNumber());
                    ret.setExpiryDate(parent.getExpiryDate());
                    ret.setQuantity(retQty);
                    ret.setAllocationMethod(parent.getAllocationMethod());
                    ret.setStatus(BatchAllocationStatus.RETURNED);
                    ret.setSelectedBy(parent.getSelectedBy());
                    ret.setSelectedAt(LocalDateTime.now());
                    ret.setParentAllocationId(parent.getId());
                    batchAllocationRepository.save(ret);
                }

                // Whether this lot physically returns to its bin is the restock plan's call,
                // and the same call the inventory journal's amount is built from. A scrap
                // condition or a batch master with no warehouse yields no destination here, and
                // the allocation flip above is kept either way for traceability — the BatchMaster
                // status is left untouched, because quarantine stays an admin action rather than a
                // per-line side effect.
                Long warehouseId = restock.restocks() ? restock.batchWarehouseId(parentId) : null;
                if (warehouseId != null) {
                    stockMovementService.reverseOutboundStock(
                            StockSourceType.SALES_RETURN,
                            salesReturn.getId(),
                            parent.getProductId(),
                            warehouseId,
                            parent.getBinId(),
                            null,
                            null,
                            parent.getBatchNumber(),
                            parent.getExpiryDate(),
                            retQty,
                            salesReturn.getReturnNumber(),
                            restock.unitCost(),
                            salesReturn.getReturnDate());
                } else {
                    log.info("[SalesReturn] {} — line {} allocation {} split/flipped to RETURNED"
                                    + " without a stock movement (condition {} / no batch warehouse).",
                            salesReturn.getReturnNumber(), item.getItemCode(), parent.getId(),
                            item.getCondition());
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Private — journal posting logic
    // ---------------------------------------------------------------

    /**
     * Posts the approved return's journals.
     *
     * <p>Two decisions feed it. The revenue account depends on whether revenue was already
     * recognized (the linked invoice was delivered) — Sales Revenue if so, Deferred Revenue if
     * not. The inventory leg depends entirely on {@code plan}: it posts if and only if at least
     * one line actually restocked, for exactly the value of the stock movements that were
     * written. Nothing here re-derives either fact from line conditions.
     */
    private void postJournalForApprovedReturn(SalesReturn salesReturn, SalesReturnRestockPlan plan) {
        boolean revenueWasRecognized = resolveRevenueRecognized(salesReturn);

        BigDecimal restockCost = plan.totalRestockCost();
        boolean restocksInventory = plan.restocksAnything();

        if (!plan.unresolvedWarehouseItemCodes().isEmpty()) {
            log.warn("[SalesReturn] {} — {} resaleable line(s) had no destination warehouse and are"
                            + " excluded from both the stock movements and the inventory journal: {}."
                            + " Account 1200 is not debited for goods the system could not place.",
                    salesReturn.getReturnNumber(), plan.unresolvedWarehouseItemCodes().size(),
                    String.join(", ", plan.unresolvedWarehouseItemCodes()));
        }

        postingEngineService.createJournalFromSalesReturn(
                salesReturn, restockCost, revenueWasRecognized, restocksInventory);
    }

    /**
     * Returns true if the linked invoice has already been delivered
     * (i.e., revenue was recognized at DN delivery).
     *
     * Falls back to true (assumes recognized) when the linked invoice
     * cannot be found — this is the safer choice for accounting:
     * it debits Sales Revenue rather than Deferred Revenue, which
     * is verifiable in the GL.
     */
    private boolean resolveRevenueRecognized(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) {
            log.warn("[SalesReturn] {} has no linkedInvoice — assuming revenue was recognized (defaulting to Sales Revenue debit).",
                    salesReturn.getReturnNumber());
            return true; // safe default — debit Sales Revenue
        }

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty()) {
            log.warn("[SalesReturn] {} — linked invoice '{}' not found in DB. Assuming revenue was recognized.",
                    salesReturn.getReturnNumber(), linkedInvoice);
            return true;
        }

        SalesInvoice invoice = invoiceOpt.get();
        boolean recognized = invoice.getDeliveryStatus() == DeliveryStatus.DELIVERED;
        log.info("[SalesReturn] {} — linked invoice '{}' deliveryStatus={}, revenueWasRecognized={}",
                salesReturn.getReturnNumber(), linkedInvoice, invoice.getDeliveryStatus(), recognized);
        return recognized;
    }

}
