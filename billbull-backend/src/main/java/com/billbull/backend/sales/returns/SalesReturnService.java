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
    private com.billbull.backend.sales.delivery.DeliveryNoteBatchConsumptionRepository consumptionRepo;

    @Autowired
    private SerialMasterRepository serialMasterRepository;

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        // ARCHFIX §1.6: items/batches are LAZY — fetch items via JOIN FETCH, then init the nested
        // batches (batched) inside this transaction so the response serializes fully.
        List<SalesReturn> returns = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(salesReturnRepository.findAllWithItems(), SalesReturn::getBranch));
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
                branchAccessService.filterBranchScopedByBranch(salesReturnRepository.findByReturnDateBetween(from, to), SalesReturn::getBranch));
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
        List<SalesReturn> scopedReturns = branchAccessService.filterExactBranchScopedByBranch(
                salesReturnRepository.findAll(),
                SalesReturn::getBranch);

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
            applySerialReturns(saved);
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
                if (pricingOpt.isEmpty() || pricingOpt.get().getCost() == null) {
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
