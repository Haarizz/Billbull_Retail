package com.billbull.backend.inventory.batch;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.settings.InventorySettingsService;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnItemEntity;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceItem;

@Service
public class PurchaseBatchCreationService {

    public static final String PURCHASE_SOURCE_TYPE = "PU";
    public static final String DOC_TYPE_PURCHASE_INVOICE = "PURCHASE_INVOICE";
    public static final String DOC_TYPE_GRN = "GRN";

    private final BatchMasterRepository batchRepository;
    private final BatchPrintQueueRepository printQueueRepository;
    private final InventorySettingsService inventorySettingsService;
    private final ProductRepository productRepository;
    private final ProductPackingRepository packingRepository;

    public PurchaseBatchCreationService(
            BatchMasterRepository batchRepository,
            BatchPrintQueueRepository printQueueRepository,
            InventorySettingsService inventorySettingsService,
            ProductRepository productRepository,
            ProductPackingRepository packingRepository) {
        this.batchRepository = batchRepository;
        this.printQueueRepository = printQueueRepository;
        this.inventorySettingsService = inventorySettingsService;
        this.productRepository = productRepository;
        this.packingRepository = packingRepository;
    }

    @Transactional
    public List<BatchMaster> replaceForPurchaseInvoice(PurchaseInvoice invoice) {
        if (invoice == null || invoice.getId() == null) {
            return List.of();
        }

        deleteUnprinted(DOC_TYPE_PURCHASE_INVOICE, invoice.getId());
        if (isAgainstGrn(invoice)) {
            return List.of();
        }

        List<BatchMaster> batches = buildForPurchaseInvoice(invoice);
        return saveBatchesAndMaybeQueue(batches);
    }

    @Transactional
    public void ensureForPurchaseInvoice(PurchaseInvoice invoice) {
        if (invoice == null || invoice.getId() == null || isAgainstGrn(invoice)) {
            return;
        }

        if (!requiresInvoiceBatches(invoice)) {
            return;
        }

        boolean countsMatch = true;
        for (PurchaseInvoiceItem item : invoice.getItems()) {
            Product product = requireProductByCode(item.getItemCode(), invoice.getInvoiceNumber());
            if (!product.isBatch()) {
                continue;
            }
            int expectedQty = resolveBaseQty(product.getId(), item.getUom(), item.getQty())
                    + resolveBaseQty(product.getId(), item.getFocUnit(), item.getFocQty());
            int actualQty = batchRepository
                    .findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdOrderByUnitIndexAsc(
                            DOC_TYPE_PURCHASE_INVOICE, invoice.getId(), item.getId())
                    .size();
            if (actualQty != expectedQty) {
                countsMatch = false;
                break;
            }
        }

        if (countsMatch) {
            return;
        }

        boolean hasPrinted = batchRepository
                .findBySourceDocumentTypeAndSourceDocumentId(DOC_TYPE_PURCHASE_INVOICE, invoice.getId())
                .stream()
                .anyMatch(BatchMaster::isPrinted);
        if (hasPrinted) {
            throw new IllegalStateException(
                    "Cannot regenerate purchase batches for invoice " + invoice.getInvoiceNumber()
                            + " because one or more existing batches have already been printed.");
        }

        replaceForPurchaseInvoice(invoice);
    }

    @Transactional
    public void deleteUnprintedPurchaseInvoiceBatches(Long invoiceId) {
        if (invoiceId != null) {
            deleteUnprinted(DOC_TYPE_PURCHASE_INVOICE, invoiceId);
        }
    }

    @Transactional
    public List<BatchMaster> createForGrnPost(GrnEntity grn, Map<Long, Long> productBinMap) {
        if (grn == null || grn.getId() == null) {
            return List.of();
        }

        deleteUnprinted(DOC_TYPE_GRN, grn.getId());
        List<BatchMaster> batches = buildForGrn(grn, productBinMap != null ? productBinMap : Map.of());
        return saveBatchesAndMaybeQueue(batches);
    }

    @Transactional(readOnly = true)
    public List<BatchMaster> findForPurchaseInvoiceLine(Long invoiceId, Long lineId) {
        if (invoiceId == null || lineId == null) {
            return List.of();
        }
        return batchRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdOrderByUnitIndexAsc(
                DOC_TYPE_PURCHASE_INVOICE, invoiceId, lineId);
    }

    @Transactional(readOnly = true)
    public List<BatchMaster> findForGrnLine(Long grnId, Long lineId) {
        if (grnId == null || lineId == null) {
            return List.of();
        }
        return batchRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdOrderByUnitIndexAsc(
                DOC_TYPE_GRN, grnId, lineId);
    }

    private List<BatchMaster> buildForPurchaseInvoice(PurchaseInvoice invoice) {
        List<BatchMaster> batches = new ArrayList<>();
        if (invoice.getItems() == null || invoice.getItems().isEmpty()) {
            return batches;
        }

        LocalDate generatedDate = LocalDate.now();
        Map<String, Integer> nextLotByProduct = new HashMap<>();
        Long warehouseId = invoice.getWarehouse() != null ? invoice.getWarehouse().getId() : null;
        Long zoneId = invoice.getZone() != null ? invoice.getZone().getId() : null;
        Long locatorId = invoice.getLocator() != null ? invoice.getLocator().getId() : null;
        Long binId = invoice.getBin() != null ? invoice.getBin().getId() : null;

        for (PurchaseInvoiceItem item : invoice.getItems()) {
            Product product = requireProductByCode(item.getItemCode(), invoice.getInvoiceNumber());
            if (!product.isBatch()) {
                continue;
            }

            int baseQty = resolveBaseQty(product.getId(), item.getUom(), item.getQty())
                    + resolveBaseQty(product.getId(), item.getFocUnit(), item.getFocQty());
            if (baseQty <= 0) {
                continue;
            }

            BigDecimal unitCost = resolveBaseUnitCost(product.getId(), item.getUom(), item.getUnitCost());
            int lotIndex = nextLotIndex(product, generatedDate, nextLotByProduct);
            for (int unitIndex = 1; unitIndex <= baseQty; unitIndex++) {
                batches.add(newBatch(
                        product,
                        invoice.getInvoiceNumber(),
                        DOC_TYPE_PURCHASE_INVOICE,
                        invoice.getId(),
                        item.getId(),
                        warehouseId,
                        zoneId,
                        locatorId,
                        binId,
                        lotIndex,
                        unitIndex,
                        generatedDate,
                        null,
                        unitCost));
            }
        }
        return batches;
    }

    private List<BatchMaster> buildForGrn(GrnEntity grn, Map<Long, Long> productBinMap) {
        List<BatchMaster> batches = new ArrayList<>();
        if (grn.getItems() == null || grn.getItems().isEmpty()) {
            return batches;
        }

        LocalDate generatedDate = LocalDate.now();
        Map<String, Integer> nextLotByProduct = new HashMap<>();
        Long warehouseId = grn.getWarehouse() != null ? grn.getWarehouse().getId() : null;
        Long zoneId = grn.getZone() != null ? grn.getZone().getId() : null;
        Long locatorId = grn.getLocator() != null ? grn.getLocator().getId() : null;
        Long headerBinId = grn.getBin() != null ? grn.getBin().getId() : null;

        for (GrnItemEntity item : grn.getItems()) {
            Product product = item.getProduct();
            if (product == null) {
                throw new IllegalStateException("GRN item is missing a product for " + grn.getGrnNo());
            }
            if (!product.isBatch()) {
                continue;
            }

            int accepted = item.getAcceptedQty() != null ? item.getAcceptedQty() : 0;
            int foc = item.getFocQty() != null ? item.getFocQty() : 0;
            int baseAccepted = resolveBaseQty(product.getId(), item.getUom(), accepted);
            int baseFoc = resolveBaseQty(product.getId(), item.getFocUnit(), foc);
            int baseQty = baseAccepted + baseFoc;
            if (baseQty <= 0) {
                continue;
            }

            Long effectiveBinId = productBinMap.getOrDefault(product.getId(), headerBinId);
            BigDecimal unitCost = resolveBaseUnitCost(
                    product.getId(),
                    item.getUom(),
                    item.getNetCost() != null ? item.getNetCost() : item.getUnitCost());
            int lotIndex = nextLotIndex(product, generatedDate, nextLotByProduct);
            for (int unitIndex = 1; unitIndex <= baseQty; unitIndex++) {
                batches.add(newBatch(
                        product,
                        grn.getGrnNo(),
                        DOC_TYPE_GRN,
                        grn.getId(),
                        item.getId(),
                        warehouseId,
                        zoneId,
                        locatorId,
                        effectiveBinId,
                        lotIndex,
                        unitIndex,
                        generatedDate,
                        null,
                        unitCost));
            }
        }
        return batches;
    }

    private BatchMaster newBatch(
            Product product,
            String sourceRefNo,
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId,
            Long warehouseId,
            Long zoneId,
            Long locatorId,
            Long binId,
            int lotIndex,
            int unitIndex,
            LocalDate generatedDate,
            LocalDate expiryDate,
            BigDecimal unitCost) {
        if (sourceDocumentId == null || sourceLineId == null) {
            throw new IllegalStateException("Batch source document and line IDs are required");
        }
        if (sourceRefNo == null || sourceRefNo.isBlank()) {
            throw new IllegalStateException("Batch source reference number is required");
        }

        String batchNumber = BatchNumberGenerator.generate(
                StockIdentifier.PU,
                generatedDate,
                lotIndex,
                product.getCode(),
                unitIndex);
        if (batchRepository.existsByBatchNumber(batchNumber)) {
            throw new IllegalStateException("Batch number already exists: " + batchNumber);
        }
        if (batchRepository.existsBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndUnitIndex(
                sourceDocumentType, sourceDocumentId, sourceLineId, unitIndex)) {
            throw new IllegalStateException(
                    "Batch already exists for " + sourceDocumentType + " #" + sourceDocumentId
                            + " line #" + sourceLineId + " unit #" + unitIndex);
        }

        BatchMaster batch = new BatchMaster();
        batch.setBatchNumber(batchNumber);
        batch.setSourceType(PURCHASE_SOURCE_TYPE);
        batch.setSourceRefNo(sourceRefNo);
        batch.setSourceDocumentType(sourceDocumentType);
        batch.setSourceDocumentId(sourceDocumentId);
        batch.setSourceLineId(sourceLineId);
        batch.setProductId(product.getId());
        batch.setProductCode(product.getCode());
        batch.setProductName(product.getName());
        batch.setWarehouseId(warehouseId);
        batch.setZoneId(zoneId);
        batch.setLocatorId(locatorId);
        batch.setBinId(binId);
        batch.setUnitIndex(unitIndex);
        batch.setQtyUnitNo(unitIndex);
        batch.setQuantity(1);
        batch.setGeneratedDate(generatedDate);
        batch.setEntryDate(generatedDate);
        batch.setExpiryDate(expiryDate);
        batch.setUnitCost(unitCost);
        batch.setStatus(BatchStatus.AVAILABLE);
        return batch;
    }

    private List<BatchMaster> saveBatchesAndMaybeQueue(List<BatchMaster> batches) {
        if (batches.isEmpty()) {
            return List.of();
        }

        List<BatchMaster> saved = batchRepository.saveAll(batches);
        batchRepository.flush();

        if (inventorySettingsService.getSettings().isBarcodePrintOnBatchCreate()) {
            List<BatchPrintQueue> queueRows = new ArrayList<>(saved.size());
            for (BatchMaster batch : saved) {
                if (!printQueueRepository.existsByBatch(batch)) {
                    queueRows.add(newQueueRow(batch));
                }
            }
            printQueueRepository.saveAll(queueRows);
        }

        return saved;
    }

    private BatchPrintQueue newQueueRow(BatchMaster batch) {
        BatchPrintQueue queue = new BatchPrintQueue();
        queue.setBatch(batch);
        queue.setBatchNumber(batch.getBatchNumber());
        queue.setSourceType(batch.getSourceType());
        queue.setSourceRefNo(batch.getSourceRefNo());
        queue.setProductId(batch.getProductId());
        queue.setProductCode(batch.getProductCode());
        queue.setProductName(batch.getProductName());
        queue.setStatus(BatchPrintQueueStatus.PENDING);
        queue.setQueuedAt(LocalDateTime.now());
        return queue;
    }

    private void deleteUnprinted(String sourceDocumentType, Long sourceDocumentId) {
        List<BatchMaster> removable = batchRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndPrintedFalse(sourceDocumentType, sourceDocumentId);
        if (removable.isEmpty()) {
            return;
        }
        printQueueRepository.deleteByBatchIn(removable);
        batchRepository.deleteAll(removable);
        batchRepository.flush();
    }

    private boolean requiresInvoiceBatches(PurchaseInvoice invoice) {
        if (invoice.getItems() == null) {
            return false;
        }
        for (PurchaseInvoiceItem item : invoice.getItems()) {
            Product product = requireProductByCode(item.getItemCode(), invoice.getInvoiceNumber());
            int baseQty = resolveBaseQty(product.getId(), item.getUom(), item.getQty())
                    + resolveBaseQty(product.getId(), item.getFocUnit(), item.getFocQty());
            if (product.isBatch() && baseQty > 0) {
                return true;
            }
        }
        return false;
    }

    private boolean isAgainstGrn(PurchaseInvoice invoice) {
        return "AGAINST_GRN".equalsIgnoreCase(invoice.getSourceType()) && invoice.getGrnId() != null;
    }

    private Product requireProductByCode(String itemCode, String refNo) {
        if (itemCode == null || itemCode.isBlank()) {
            throw new IllegalStateException("Invoice item code is required before batch creation for " + refNo);
        }
        return productRepository.findByCodeAndIsActiveTrue(itemCode)
                .orElseThrow(() -> new IllegalStateException(
                        "Product not found for code '" + itemCode + "'. Cannot create batches for " + refNo));
    }

    private int nextLotIndex(Product product, LocalDate generatedDate, Map<String, Integer> nextLotByProduct) {
        String productCode = product.getCode();
        Integer cached = nextLotByProduct.get(productCode);
        if (cached != null) {
            nextLotByProduct.put(productCode, cached + 1);
            return cached;
        }

        int maxLot = 0;
        for (BatchMaster existing : batchRepository.findBySourceTypeAndProductCodeAndGeneratedDate(
                PURCHASE_SOURCE_TYPE, productCode, generatedDate)) {
            maxLot = Math.max(maxLot, BatchNumberGenerator.parseLotIndex(existing.getBatchNumber()).orElse(0));
        }

        int next = maxLot + 1;
        nextLotByProduct.put(productCode, next + 1);
        return next;
    }

    private int resolveBaseQty(Long productId, String unitName, Integer qty) {
        int safeQty = qty != null ? qty : 0;
        if (safeQty <= 0 || unitName == null || unitName.isBlank()) {
            return safeQty;
        }
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? BigDecimal.valueOf(safeQty).multiply(p.getConversion())
                                .setScale(0, RoundingMode.HALF_UP).intValue()
                        : safeQty)
                .orElse(safeQty);
    }

    private BigDecimal resolveBaseUnitCost(Long productId, String unitName, BigDecimal uomCost) {
        if (uomCost == null || unitName == null || unitName.isBlank()) {
            return uomCost;
        }
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> (p.getConversion() != null && p.getConversion().compareTo(BigDecimal.ZERO) > 0)
                        ? uomCost.divide(p.getConversion(), 4, RoundingMode.HALF_UP)
                        : uomCost)
                .orElse(uomCost);
    }
}
