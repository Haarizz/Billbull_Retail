package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchAllocation;
import com.billbull.backend.inventory.batch.BatchAllocationRepository;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.batch.BatchStatus;
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

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        List<SalesReturn> returns = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(salesReturnRepository.findAll(), SalesReturn::getBranch));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                returns,
                SalesReturn::getReturnDate,
                SalesReturn::getReturnNumber,
                SalesReturn::getId);
        return returns;
    }

    public SalesReturn getReturnById(Long id) {
        return salesReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Return not found with ID: " + id));
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

        return salesReturnRepository.save(salesReturn);
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

        Double todayReturns  = salesReturnRepository.getTotalReturnsForDate(today);
        Double monthReturns  = salesReturnRepository.getTotalReturnsBetweenDates(monthStart, monthEnd);
        Double totalApproved = salesReturnRepository.getTotalApprovedReturns();
        long   totalCount    = salesReturnRepository.count();

        stats.put("todayReturns",         todayReturns  != null ? todayReturns  : 0.0);
        stats.put("thisMonthReturns",      monthReturns  != null ? monthReturns  : 0.0);
        stats.put("totalApprovedReturns",  totalApproved != null ? totalApproved : 0.0);
        stats.put("totalTransactions",     totalCount);

        return stats;
    }

    @Transactional
    public SalesReturn updateStatus(Long id, SalesReturnStatus status) {
        SalesReturn salesReturn = getReturnById(id);

        if (salesReturn.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be modified.");
        }

        salesReturn.setStatus(status);
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (status == SalesReturnStatus.APPROVED) {
            applyBatchReturns(saved);
            applyNonBatchStockReturns(saved);
            postJournalForApprovedReturn(saved);
        }
        return saved;
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
        return out;
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
        BigDecimal costOfGoodsReturned = resolveActualCogs(salesReturn);

        // --- 3. Post ---
        postingEngineService.createJournalFromSalesReturn(salesReturn, costOfGoodsReturned, revenueWasRecognized);
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
     * Looks up the actual cost price for each returned item from the product
     * master and calculates total COGS to reverse.
     *
     * If a product's cost cannot be determined (product not found or no
     * pricing record), its contribution to COGS is zero and a warning is
     * logged.  A manual journal entry will be required for that item.
     */
    private BigDecimal resolveActualCogs(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalCogs = BigDecimal.ZERO;

        for (SalesReturnItem item : salesReturn.getItems()) {
            String itemCode = item.getItemCode();
            int    returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;

            if (itemCode == null || returnQty <= 0) continue;

            // Damaged returns are scrapped — no stock movement, no inventory restoration.
            // Excluding them from COGS keeps the GL Inventory account in sync with the
            // physical stock-movement ledger. The damage loss is absorbed by COGS that
            // remains on the books from the original sale.
            if (!"Good".equalsIgnoreCase(item.getItemStatus())) {
                log.info("[SalesReturn] {} — item '{}' itemStatus='{}' (scrap); excluded from COGS reversal.",
                        salesReturn.getReturnNumber(), itemCode, item.getItemStatus());
                continue;
            }

            Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(itemCode);
            if (productOpt.isEmpty()) {
                log.warn("[SalesReturn] {} — item code '{}' not found in product master. COGS for this item = 0. Post manual journal.",
                        salesReturn.getReturnNumber(), itemCode);
                continue;
            }

            Product product = productOpt.get();
            Optional<com.billbull.backend.inventory.product.ProductPricing> pricingOpt =
                    productPricingRepository.findByProductId(product.getId());

            if (pricingOpt.isEmpty() || pricingOpt.get().getCost() == null) {
                log.warn("[SalesReturn] {} — no cost record for product '{}' ({}). COGS for this item = 0. Post manual journal.",
                        salesReturn.getReturnNumber(), itemCode, product.getId());
                continue;
            }

            BigDecimal unitCost   = pricingOpt.get().getCost();
            BigDecimal itemCogs   = unitCost.multiply(BigDecimal.valueOf(returnQty));
            totalCogs             = totalCogs.add(itemCogs);

            log.info("[SalesReturn] {} — item '{}' qty={} unitCost={} itemCogs={}",
                    salesReturn.getReturnNumber(), itemCode, returnQty, unitCost, itemCogs);
        }

        if (totalCogs.compareTo(BigDecimal.ZERO) == 0) {
            log.warn("[SalesReturn] {} — COGS resolved to ZERO for all items. " +
                             "Inventory and COGS accounts will NOT be adjusted. Review product cost records.",
                    salesReturn.getReturnNumber());
        }

        return totalCogs;
    }
}
