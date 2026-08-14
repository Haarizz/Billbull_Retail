package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.batch.BatchStatus;
import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.serial.SerialStatus;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementService;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
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
    private ProductPricingRepository productPricingRepository;

    @Autowired
    private BatchSelectionService batchSelectionService;

    @Autowired
    private BatchAllocationRepository batchAllocationRepository;

    @Autowired
    private BatchMasterRepository batchMasterRepository;

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
    private com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumptionRepository consumptionRepo;

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

        if (salesReturn.getStatus() == null) {
            salesReturn.setStatus(SalesReturnStatus.DRAFT);
        }

        if (salesReturn.getReturnDate() == null) {
            salesReturn.setReturnDate(LocalDate.now());
        }

        if (salesReturn.getItems() != null) {
            salesReturn.getItems().forEach(item -> item.setSalesReturn(salesReturn));
        }

        normaliseLineConditions(salesReturn);
        applyEntryPointDefaults(salesReturn);
        prorateDiscountFromInvoice(salesReturn);

        return salesReturnRepository.save(salesReturn);
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

    /**
     * Backfills discountPercent/discountAmount on each return line from the matching line
     * on the linked original invoice (matched by itemCode), prorating the invoice line's
     * discount amount by returnQty/soldQty so partial returns carry a proportional discount.
     * Leaves any discount already supplied by the caller untouched.
     */
    private void prorateDiscountFromInvoice(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return;

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty() || invoiceOpt.get().getItems() == null) return;

        Map<String, SalesInvoiceItem> invoiceItemByCode = new HashMap<>();
        for (SalesInvoiceItem ii : invoiceOpt.get().getItems()) {
            if (ii.getItemCode() != null) {
                invoiceItemByCode.putIfAbsent(ii.getItemCode(), ii);
            }
        }

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getDiscountAmount() != null) continue; // caller already supplied a value
            SalesInvoiceItem invoiceItem = invoiceItemByCode.get(item.getItemCode());
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

        if (status == SalesReturnStatus.APPROVED) {
            // §15/§10 — authorization is resolved from persisted state and enforced here, so a
            // direct API call cannot skip it by omitting whatever flag the UI would have sent.
            String requiredAuthorization = authorizationService.resolveRequiredAuthorization(salesReturn);
            if (requiredAuthorization != null) {
                authorizationService.authorize(salesReturn, requiredAuthorization,
                        supervisorUsername, supervisorPassword);
            }

            // §14 — the refund method has to be one this customer can actually be settled with.
            // Checked here, not only in the UI: the screen greys the control out, but that is a
            // hint, and a return posted through the API directly must not be able to book a
            // ledger credit against a customer who has no ledger.
            assertRefundMethodSettleable(salesReturn);

            // §29 — revalidate against persisted data under a lock BEFORE anything is written.
            // Whatever the client was shown when it built this return is stale by now.
            assertReturnableQuantitiesStillAvailable(salesReturn);
        }

        salesReturn.setStatus(status);
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (status == SalesReturnStatus.APPROVED) {
            applyBatchReturns(saved);
            applyNonBatchStockReturns(saved);
            postJournalForApprovedReturn(saved);
            applySerialReturns(saved);
            // Last, because these are the steps that hand value to the customer. Both share this
            // transaction, so a failure anywhere above rolls them back with everything else — a
            // return is never reported as refunded without the matching drawer movement, and never
            // reported as settled by voucher without the voucher actually existing.
            cashRefundService.recordCashRefund(saved);
            issueCreditVoucherIfRequired(saved);
        }
        return saved;
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
    private void issueCreditVoucherIfRequired(SalesReturn salesReturn) {
        if (salesReturn.getRefundMethod() != SalesReturnRefundMethod.CREDIT_VOUCHER) {
            return;
        }

        java.math.BigDecimal amount = salesReturn.getRefundAmount() != null
                ? salesReturn.getRefundAmount()
                : salesReturn.getTotalAmount();

        CreditVoucher voucher = creditVoucherService.issueForSalesReturn(
                salesReturn.getId(),
                salesReturn.getReturnNumber(),
                salesReturn.getLinkedInvoice(),
                amount,
                salesReturn.getCustomerCode(),
                salesReturn.getCustomerName(),
                salesReturn.getCustomerMobile(),
                salesReturn.getBranch());

        salesReturn.setIssuedVoucher(CreditVoucherResponse.from(voucher));
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
     */
    private void assertReturnableQuantitiesStillAvailable(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;

        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) {
            // Unlinked returns have no invoice to over-return against; nothing to serialise on.
            log.warn("[SalesReturn] {} has no linked invoice — skipping returnable-quantity revalidation.",
                    salesReturn.getReturnNumber());
            return;
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
    }

    // ---------------------------------------------------------------
    // applyNonBatchStockReturns — for return lines without batch selections
    // (non-batch-controlled products), post a positive StockMovement on
    // "Good" condition so on-hand quantity reflects the return. Damaged
    // lines are scrapped: no stock movement, and their cost is excluded
    // from the COGS reversal in resolveActualCogs.
    // ---------------------------------------------------------------
    private void applyNonBatchStockReturns(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;

        Long resolvedWarehouseId = resolveReturnWarehouseId(salesReturn);

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getBatches() != null && !item.getBatches().isEmpty()) {
                continue; // batch-controlled line handled by applyBatchReturns
            }
            int returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;
            if (returnQty <= 0) continue;

            boolean isScrap = !"Good".equalsIgnoreCase(item.getItemStatus());
            if (isScrap) {
                log.info("[SalesReturn] {} — non-batch line '{}' marked Damaged (scrap); no stock movement posted.",
                        salesReturn.getReturnNumber(), item.getItemCode());
                continue;
            }

            Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(item.getItemCode());
            if (productOpt.isEmpty()) {
                log.warn("[SalesReturn] {} — item '{}' not found in product master; cannot post return stock movement.",
                        salesReturn.getReturnNumber(), item.getItemCode());
                continue;
            }

            if (resolvedWarehouseId == null) {
                log.warn("[SalesReturn] {} — could not resolve a source warehouse for non-batch return of '{}'; stock movement NOT posted. Inventory and GL will mismatch until a manual adjustment is made.",
                        salesReturn.getReturnNumber(), item.getItemCode());
                continue;
            }

            stockMovementService.reverseOutboundStock(
                    StockSourceType.SALES_RETURN,
                    salesReturn.getId(),
                    productOpt.get().getId(),
                    resolvedWarehouseId,
                    returnQty,
                    salesReturn.getReturnNumber());

            log.info("[SalesReturn] {} — non-batch line '{}' restocked qty={} to warehouseId={}.",
                    salesReturn.getReturnNumber(), item.getItemCode(), returnQty, resolvedWarehouseId);
        }
    }

    /**
     * Resolves the warehouse where returned goods physically arrive.
     * Order: linked invoice's first DN → first DN of any linked invoice match → null.
     * Returning null forces the caller to log+skip rather than guess.
     */
    private Long resolveReturnWarehouseId(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return null;

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty()) return null;

        SalesInvoice invoice = invoiceOpt.get();
        if (invoice.getLinkedDeliveryNote() == null || invoice.getLinkedDeliveryNote().isBlank()) return null;

        List<String> dnNumbers = Arrays.stream(invoice.getLinkedDeliveryNote().split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
        if (dnNumbers.isEmpty()) return null;

        List<DeliveryNote> notes = deliveryNoteRepository.findByDnNumberIn(dnNumbers);
        for (DeliveryNote note : notes) {
            if (note.getWarehouse() != null && note.getWarehouse().getId() != null) {
                return note.getWarehouse().getId();
            }
        }
        return null;
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
    // §5.5 applySerialReturns — validate returned serial matches sold serial on the
    // original invoice, then flip SerialStatus → RETURNED.
    // ---------------------------------------------------------------
    private void applySerialReturns(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) return;

        // Build a map of itemCode → serialNumber from the original linked invoice.
        Map<String, String> soldSerialByCode = new java.util.HashMap<>();
        if (salesReturn.getLinkedInvoice() != null && !salesReturn.getLinkedInvoice().isBlank()) {
            salesInvoiceRepository
                    .findByInvoiceNumber(salesReturn.getLinkedInvoice())
                    .ifPresent(inv -> {
                        if (inv.getItems() != null) {
                            for (com.billbull.backend.sales.invoice.SalesInvoiceItem si : inv.getItems()) {
                                if (si.getSerialNumber() != null && !si.getSerialNumber().isBlank()
                                        && si.getItemCode() != null) {
                                    soldSerialByCode.put(si.getItemCode(), si.getSerialNumber());
                                }
                            }
                        }
                    });
        }

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getItemCode() == null) continue;
            String soldSerial = soldSerialByCode.get(item.getItemCode());
            if (soldSerial == null) continue;

            serialMasterRepository.findBySerialNumberForUpdate(soldSerial).ifPresent(serial -> {
                if (serial.getStatus() == SerialStatus.SOLD) {
                    serial.setStatus(SerialStatus.RETURNED);
                    serialMasterRepository.save(serial);
                    log.info("[SalesReturn] {} — serial {} marked RETURNED for item '{}'.",
                            salesReturn.getReturnNumber(), soldSerial, item.getItemCode());
                }
            });
        }
    }

    // ---------------------------------------------------------------
    // applyBatchReturns — split allocations, flip BatchMaster status,
    // post positive StockMovement on APPROVED.
    // ---------------------------------------------------------------

    private void applyBatchReturns(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null) return;

        for (SalesReturnItem item : salesReturn.getItems()) {
            if (item.getBatches() == null || item.getBatches().isEmpty()) {
                continue; // non-batch line or no batches selected — skip
            }

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

            boolean isScrap = !"Good".equalsIgnoreCase(item.getItemStatus());

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

                // Restock only "Good" returns. "Damaged" = scrap — allocation flip is kept
                // for traceability, but no stock physically returns to the bin and the
                // BatchMaster status is left untouched (manual quarantine remains an
                // admin action, not a per-line side-effect).
                if (!isScrap) {
                    BatchMaster bm = parent.getBatchMaster();
                    Long warehouseId = bm != null ? bm.getWarehouseId() : null;
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
                                salesReturn.getReturnNumber());
                    } else {
                        log.warn("[SalesReturn] {} — batch {} has no warehouseId on BatchMaster; "
                                + "skipping restock stock movement.",
                                salesReturn.getReturnNumber(), parent.getBatchNumber());
                    }
                } else {
                    log.info("[SalesReturn] {} — line {} marked Damaged (scrap); allocation {} "
                            + "split/flipped to RETURNED, no stock movement posted.",
                            salesReturn.getReturnNumber(), item.getItemCode(), parent.getId());
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Private — journal posting logic
    // ---------------------------------------------------------------

    /**
     * Determines:
     *  1. Whether revenue was already recognized (linked invoice was delivered)
     *     so the correct account is debited (Sales Revenue vs Deferred Revenue).
     *  2. The actual COGS to reverse using real product cost from the product
     *     master, instead of a fictional percentage.
     */
    private void postJournalForApprovedReturn(SalesReturn salesReturn) {
        // --- 1. Determine revenue account (recognized vs deferred) ---
        boolean revenueWasRecognized = resolveRevenueRecognized(salesReturn);

        // --- 2. Calculate COGS using actual product cost ---
        CogsResolution cogs = resolveActualCogs(salesReturn);

        // Fail fast with the specific item(s) at fault — PostingEngineService's guard would
        // otherwise reject with a generic "no product cost" message that forces a cashier to
        // dig through logs to find out which line is actually missing a Cost Price.
        if (cogs.total.compareTo(BigDecimal.ZERO) <= 0 && !cogs.missingCostItemCodes.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                    "Cannot approve " + salesReturn.getReturnNumber() + ": no Cost Price is set for "
                    + String.join(", ", cogs.missingCostItemCodes)
                    + ". Set the Cost Price under Inventory → Products → Pricing for "
                    + (cogs.missingCostItemCodes.size() > 1 ? "these items" : "this item") + ", then retry.");
        }

        // --- 3. Post ---
        postingEngineService.createJournalFromSalesReturn(salesReturn, cogs.total, revenueWasRecognized);
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

    /**
     * Resolves the COGS to reverse for an approved sales return.
     *
     * Priority order:
     *   1. Original DN delivery cost snapshot (DeliveryNoteBatchConsumption rows) — exact
     *      batch/WAC cost at the time of the original sale; prevents WAC distortion.
     *   2. Cost-at-sale snapshot on the original invoice line (SalesInvoiceItem.cost) — set
     *      at checkout for POS sales (and at order/delivery time for SO/DN sales). Survives
     *      the product's cost later being changed or cleared in the product master.
     *   3. Current product master cost (ProductPricing.cost) — last-resort fallback for
     *      legacy rows from before either snapshot existed.
     *
     * Damaged returns are excluded — no stock is restored, so COGS stays on the books.
     */
    private static final class CogsResolution {
        final BigDecimal total;
        final List<String> missingCostItemCodes;
        CogsResolution(BigDecimal total, List<String> missingCostItemCodes) {
            this.total = total;
            this.missingCostItemCodes = missingCostItemCodes;
        }
    }

    private CogsResolution resolveActualCogs(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) {
            return new CogsResolution(BigDecimal.ZERO, List.of());
        }

        // Resolve source DN id once (may be null for non-DN-linked returns)
        Long sourceDnId = resolveSourceDnId(salesReturn);

        // Resolve the original invoice's line items once, keyed by item code, for the
        // cost-at-sale fallback (tier 2).
        Map<String, BigDecimal> invoiceCostByCode = new java.util.HashMap<>();
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice != null && !linkedInvoice.isBlank()) {
            salesInvoiceRepository.findByInvoiceNumber(linkedInvoice).ifPresent(inv -> {
                if (inv.getItems() != null) {
                    inv.getItems().forEach(ii -> {
                        if (ii.getItemCode() != null && ii.getCost() != null && ii.getCost().compareTo(BigDecimal.ZERO) > 0) {
                            invoiceCostByCode.putIfAbsent(ii.getItemCode(), ii.getCost());
                        }
                    });
                }
            });
        }

        BigDecimal totalCogs = BigDecimal.ZERO;
        List<String> missingCostItemCodes = new ArrayList<>();

        for (SalesReturnItem item : salesReturn.getItems()) {
            String itemCode  = item.getItemCode();
            int    returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;

            if (itemCode == null || returnQty <= 0) continue;

            if (!"Good".equalsIgnoreCase(item.getItemStatus())) {
                log.info("[SalesReturn] {} — item '{}' status='{}' (scrap); excluded from COGS reversal.",
                        salesReturn.getReturnNumber(), itemCode, item.getItemStatus());
                continue;
            }

            BigDecimal itemCogs = BigDecimal.ZERO;

            // 1. Try original DN cost snapshot
            if (sourceDnId != null) {
                BigDecimal dnCost = consumptionRepo.sumTotalCostByDnAndItem(sourceDnId, itemCode);
                if (dnCost != null && dnCost.compareTo(BigDecimal.ZERO) > 0) {
                    // Scale by (returnQty / originalDeliveredQty) for partial returns
                    List<com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumption> rows =
                            consumptionRepo.findByDeliveryNoteId(sourceDnId).stream()
                                    .filter(r -> itemCode.equals(r.getItemCode()))
                                    .toList();
                    int deliveredQty = rows.stream().mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
                    if (deliveredQty > 0) {
                        BigDecimal unitCost = dnCost.divide(BigDecimal.valueOf(deliveredQty), 4, java.math.RoundingMode.HALF_UP);
                        itemCogs = unitCost.multiply(BigDecimal.valueOf(Math.min(returnQty, deliveredQty)));
                        log.info("[SalesReturn] {} — item '{}' using original DN cost: qty={} unitCost={} itemCogs={}",
                                salesReturn.getReturnNumber(), itemCode, returnQty, unitCost, itemCogs);
                    }
                }
            }

            // 2. Fall back to the original invoice line's cost-at-sale snapshot
            if (itemCogs.compareTo(BigDecimal.ZERO) == 0) {
                BigDecimal saleCost = invoiceCostByCode.get(itemCode);
                if (saleCost != null) {
                    itemCogs = saleCost.multiply(BigDecimal.valueOf(returnQty));
                    log.info("[SalesReturn] {} — item '{}' using invoice cost-at-sale: qty={} unitCost={} itemCogs={}",
                            salesReturn.getReturnNumber(), itemCode, returnQty, saleCost, itemCogs);
                }
            }

            // 3. Last resort: current product-master cost
            if (itemCogs.compareTo(BigDecimal.ZERO) == 0) {
                Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(itemCode);
                if (productOpt.isEmpty()) {
                    log.warn("[SalesReturn] {} — item '{}' not in product master; COGS=0, post manual journal.",
                            salesReturn.getReturnNumber(), itemCode);
                    missingCostItemCodes.add(itemCode);
                    continue;
                }
                Optional<com.billbull.backend.inventory.product.ProductPricing> pricingOpt =
                        productPricingRepository.findByProductId(productOpt.get().getId());
                // An explicit 0.00 counts as missing, not as a real cost: it yields the same
                // zero COGS as a null but would otherwise slip past the caller's friendly guard
                // (which keys off this list) and surface as the posting engine's generic
                // "resolve the product WAC" error, naming no item.
                if (pricingOpt.isEmpty() || pricingOpt.get().getCost() == null
                        || pricingOpt.get().getCost().compareTo(BigDecimal.ZERO) <= 0) {
                    log.warn("[SalesReturn] {} — no cost for product '{}'; COGS=0, post manual journal.",
                            salesReturn.getReturnNumber(), itemCode);
                    missingCostItemCodes.add(itemCode);
                    continue;
                }
                BigDecimal unitCost = pricingOpt.get().getCost();
                itemCogs = unitCost.multiply(BigDecimal.valueOf(returnQty));
                log.warn("[SalesReturn] {} — item '{}' using product-master cost (no DN history or invoice snapshot): unitCost={} itemCogs={}",
                        salesReturn.getReturnNumber(), itemCode, unitCost, itemCogs);
            }

            totalCogs = totalCogs.add(itemCogs);
        }

        if (totalCogs.compareTo(BigDecimal.ZERO) == 0) {
            log.warn("[SalesReturn] {} — COGS resolved to ZERO. Review cost records.",
                    salesReturn.getReturnNumber());
        }
        return new CogsResolution(totalCogs, missingCostItemCodes);
    }

    /** Returns the delivery note id linked to the return's source invoice, or null. */
    private Long resolveSourceDnId(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) return null;
        List<com.billbull.backend.sales.delivery.DeliveryNote> dns =
                deliveryNoteRepository.findByLinkedInvoiceNumber(linkedInvoice);
        return dns.isEmpty() ? null : dns.get(0).getId();
    }
}
