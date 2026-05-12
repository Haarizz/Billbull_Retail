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
    private StockMovementService stockMovementService;

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        List<SalesReturn> returns = new ArrayList<>(salesReturnRepository.findAll());
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
        if (salesReturn.getId() != null) {
            SalesReturn existing = getReturnById(salesReturn.getId());
            if (existing.getStatus() == SalesReturnStatus.APPROVED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Approved returns cannot be modified. Create a reversal instead.");
            }
        }

        if (salesReturn.getId() == null
                && (salesReturn.getReturnNumber() == null || salesReturn.getReturnNumber().isEmpty())) {
            salesReturn.setReturnNumber(generateReturnNumber());
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
        String year   = String.valueOf(LocalDate.now().getYear());
        String prefix = "SR-" + year + "-";

        Optional<SalesReturn> lastReturn = salesReturnRepository.findTopByOrderByReturnNumberDesc();
        int lastNum = 0;

        if (lastReturn.isPresent()) {
            String lastReturnNum = lastReturn.get().getReturnNumber();
            if (lastReturnNum != null && lastReturnNum.startsWith(prefix)) {
                try {
                    String[] parts = lastReturnNum.split("-");
                    if (parts.length >= 3) {
                        lastNum = Integer.parseInt(parts[2]);
                    }
                } catch (NumberFormatException e) {
                    // fall back to 0
                }
            }
        }

        return prefix + String.format("%04d", lastNum + 1);
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
            postJournalForApprovedReturn(saved);
        }
        return saved;
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

            boolean quarantine = !"Good".equalsIgnoreCase(item.getItemStatus());
            BatchStatus targetBatchStatus = quarantine ? BatchStatus.QUARANTINE : BatchStatus.AVAILABLE;

            for (SalesReturnItemBatch sel : item.getBatches()) {
                Long parentId = sel.getOriginalAllocationId();
                int retQty = sel.getQuantity() != null ? sel.getQuantity() : 0;
                if (parentId == null || retQty <= 0) continue;

                BatchAllocation parent = batchAllocationRepository.findById(parentId)
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

                // Flip BatchMaster status
                BatchMaster bm = parent.getBatchMaster();
                if (bm != null) {
                    bm.setStatus(targetBatchStatus);
                    batchMasterRepository.save(bm);
                }

                // Post positive stock movement back into the bin/warehouse
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
                    log.warn("[SalesReturn] {} — batch {} has no warehouseId; skipping stock movement post.",
                            salesReturn.getReturnNumber(), parent.getBatchNumber());
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
