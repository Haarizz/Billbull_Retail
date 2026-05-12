package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteItem;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderItem;
import com.billbull.backend.security.RolePermissionService;

@Service
@Transactional
public class BatchSelectionService {

    public static final String DOC_TYPE_DELIVERY_NOTE = "DELIVERY_NOTE";
    public static final String DOC_TYPE_SALES_ORDER = "SALES_ORDER";
    public static final String DOC_TYPE_SALES_INVOICE = "SALES_INVOICE";
    public static final String DOC_TYPE_SALES_RETURN = "SALES_RETURN";
    public static final String MANUAL_PERMISSION = "batch_manual_select";

    private static final List<BatchAllocationStatus> ACTIVE_STATUSES =
            List.of(BatchAllocationStatus.RESERVED, BatchAllocationStatus.CONSUMED);

    private final BatchMasterRepository batchRepository;
    private final BatchAllocationRepository allocationRepository;
    private final ProductRepository productRepository;
    private final BinRepository binRepository;
    private final RolePermissionService permissionService;

    public BatchSelectionService(
            BatchMasterRepository batchRepository,
            BatchAllocationRepository allocationRepository,
            ProductRepository productRepository,
            BinRepository binRepository,
            RolePermissionService permissionService) {
        this.batchRepository = batchRepository;
        this.allocationRepository = allocationRepository;
        this.productRepository = productRepository;
        this.binRepository = binRepository;
        this.permissionService = permissionService;
    }

    @Transactional(readOnly = true)
    public BatchSelectionOptionsResponse getSelectionOptions(
            String itemCode,
            String locationCode,
            Integer requiredQuantity) {
        return getSelectionOptions(itemCode, locationCode, null, requiredQuantity);
    }

    @Transactional(readOnly = true)
    public BatchSelectionOptionsResponse getSelectionOptions(
            String itemCode,
            String locationCode,
            Long binId,
            Integer requiredQuantity) {

        Product product = requireProduct(itemCode);
        Bin bin = resolveBin(binId, locationCode);
        int required = normalizeRequiredQuantity(requiredQuantity);

        List<BatchMaster> available = batchRepository.findAvailableForSelection(product.getCode(), bin.getId());
        LocalDate today = LocalDate.now();
        List<BatchMaster> eligible = available.stream()
                .filter(batch -> isEligibleForSale(product, batch, today))
                .toList();

        List<BatchMaster> selected = eligible.stream().limit(required).toList();

        BatchSelectionOptionsResponse response = new BatchSelectionOptionsResponse();
        response.itemCode = product.getCode();
        response.productName = product.getName();
        response.locationCode = bin.getCode();
        response.requiredQuantity = required;
        response.fefoEnabled = product.isFefoEnabled();
        response.minExpiryDaysForSale = minExpiryDays(product);
        response.selectedQuantity = selected.size();
        response.shortageQuantity = Math.max(required - selected.size(), 0);
        response.sufficient = response.shortageQuantity == 0;
        response.message = Boolean.TRUE.equals(response.sufficient)
                ? null
                : "Insufficient Batch Stock. Eligible available units: " + selected.size()
                        + " | Required: " + required;
        response.availableBatches = available.stream()
                .map(batch -> toSelectionRow(product, batch, false, today))
                .toList();
        response.fefoSelection = selected.stream()
                .map(batch -> toSelectionRow(product, batch, true, today))
                .toList();
        response.binId = bin.getId();

        Long warehouseId = bin.getLocator() != null
                && bin.getLocator().getZone() != null
                && bin.getLocator().getZone().getWarehouse() != null
                ? bin.getLocator().getZone().getWarehouse().getId()
                : null;
        response.warehouseId = warehouseId;
        if (warehouseId != null) {
            response.availableBins = binRepository.findByWarehouseId(warehouseId).stream()
                    .map(b -> new BatchSelectionOptionsResponse.BinOption(b.getId(), b.getCode(), b.getName()))
                    .toList();
        }
        return response;
    }

    public List<BatchAllocation> saveSalesOrderLineSelection(
            SalesOrder order,
            SalesOrderItem item,
            BatchSelectionRequest request,
            int requiredQuantity) {
        if (order == null || order.getId() == null || item == null || item.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved sales order and item are required");
        }
        Product product = requireBatchProduct(item.getItemCode());
        Bin bin = resolveSourceBin(request, item.getBinId());
        item.setBinId(bin.getId());
        return saveSourceLineSelection(
                DOC_TYPE_SALES_ORDER,
                order.getId(),
                item.getId(),
                product,
                bin,
                request,
                requiredQuantity);
    }

    public List<BatchAllocation> saveSalesInvoiceLineSelection(
            SalesInvoice invoice,
            SalesInvoiceItem item,
            BatchSelectionRequest request,
            int requiredQuantity) {
        if (invoice == null || invoice.getId() == null || item == null || item.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved sales invoice and item are required");
        }
        if (invoice.getSalesType() != SalesType.DIRECT_SALE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invoice batch selection is only available for Direct Sale invoices. Use the Sales Order or Delivery Note batch selection for linked flows.");
        }
        Product product = requireBatchProduct(item.getItemCode());
        Bin bin = resolveSourceBin(request, item.getBinId());
        item.setBinId(bin.getId());
        return saveSourceLineSelection(
                DOC_TYPE_SALES_INVOICE,
                invoice.getId(),
                item.getId(),
                product,
                bin,
                request,
                requiredQuantity);
    }

    public List<BatchAllocation> saveDeliveryLineSelection(
            DeliveryNote dn,
            DeliveryNoteItem item,
            BatchSelectionRequest request,
            int requiredQuantity) {

        if (dn == null || dn.getId() == null || item == null || item.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved delivery note and item are required");
        }
        Product product = item.getProduct();
        if (product == null || !product.isBatch()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Batch selection is only valid for batch-controlled items");
        }

        Bin bin = resolveItemBin(item);
        return saveSourceLineSelection(
                DOC_TYPE_DELIVERY_NOTE,
                dn.getId(),
                item.getId(),
                product,
                bin,
                request,
                requiredQuantity);
    }

    private List<BatchAllocation> saveSourceLineSelection(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId,
            Product product,
            Bin bin,
            BatchSelectionRequest request,
            int requiredQuantity) {

        int required = normalizeRequiredQuantity(
                request != null && request.requiredQuantity != null ? request.requiredQuantity : requiredQuantity);
        if (required != requiredQuantity) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Required quantity does not match the document line base quantity");
        }

        validateRequestedLocation(request, bin);
        BatchAllocationMethod method = request != null && request.mode != null
                ? request.mode
                : (product.isFefoEnabled() ? BatchAllocationMethod.AUTO_FEFO : BatchAllocationMethod.MANUAL);

        if (method == BatchAllocationMethod.AUTO_FEFO && !product.isFefoEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "FEFO is disabled for this product. Manual batch selection is required.");
        }
        if (method == BatchAllocationMethod.MANUAL && !permissionService.currentUserCanEdit(MANUAL_PERMISSION)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Manual batch selection permission is required");
        }

        releaseSourceLine(sourceDocumentType, sourceDocumentId, sourceLineId);

        List<BatchMaster> selected = method == BatchAllocationMethod.AUTO_FEFO
                ? selectAndLockFefo(product, bin, required)
                : selectAndLockManual(product, bin, required, request != null ? request.batchMasterIds : List.of());

        assertNoActiveAllocations(selected);

        List<BatchAllocation> allocations = new ArrayList<>(selected.size());
        LocalDateTime selectedAt = LocalDateTime.now();
        String selectedBy = currentUsername();

        for (BatchMaster batch : selected) {
            batch.setStatus(BatchStatus.RESERVED);
            allocations.add(newAllocation(
                    sourceDocumentType,
                    sourceDocumentId,
                    sourceLineId,
                    product,
                    bin,
                    batch,
                    method,
                    selectedBy,
                    selectedAt));
        }

        batchRepository.saveAll(selected);
        List<BatchAllocation> saved = allocationRepository.saveAll(allocations);
        allocationRepository.flush();
        batchRepository.flush();
        return saved;
    }

    public void releaseDeliveryLine(Long deliveryNoteId, Long itemId) {
        releaseSourceLine(DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, itemId);
    }

    public void releaseDeliveryNote(Long deliveryNoteId) {
        releaseSourceDocument(DOC_TYPE_DELIVERY_NOTE, deliveryNoteId);
    }

    public void releaseSalesOrder(Long salesOrderId) {
        releaseSourceDocument(DOC_TYPE_SALES_ORDER, salesOrderId);
    }

    public void releaseSalesInvoice(Long salesInvoiceId) {
        releaseSourceDocument(DOC_TYPE_SALES_INVOICE, salesInvoiceId);
    }

    public void releaseSourceLine(String sourceDocumentType, Long sourceDocumentId, Long sourceLineId) {
        if (sourceDocumentType == null || sourceDocumentId == null || sourceLineId == null) {
            return;
        }
        releaseAllocations(allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndStatus(
                        sourceDocumentType, sourceDocumentId, sourceLineId, BatchAllocationStatus.RESERVED));
    }

    public void releaseSourceDocument(String sourceDocumentType, Long sourceDocumentId) {
        if (sourceDocumentType == null || sourceDocumentId == null) {
            return;
        }
        releaseAllocations(allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
                        sourceDocumentType, sourceDocumentId, BatchAllocationStatus.RESERVED));
    }

    public void restoreConsumedDeliveryNote(Long deliveryNoteId) {
        if (deliveryNoteId == null) {
            return;
        }
        List<BatchAllocation> allocations = new ArrayList<>(allocationRepository
                .findByDepletedByDocumentTypeAndDepletedByDocumentIdAndStatus(
                        DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, BatchAllocationStatus.CONSUMED));
        allocations.addAll(allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
                DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, BatchAllocationStatus.CONSUMED));

        for (BatchAllocation allocation : allocations) {
            BatchMaster batch = allocation.getBatchMaster();
            if (DOC_TYPE_DELIVERY_NOTE.equals(allocation.getSourceDocumentType())) {
                batch.setStatus(BatchStatus.AVAILABLE);
                allocation.setStatus(BatchAllocationStatus.RELEASED);
            } else {
                batch.setStatus(BatchStatus.RESERVED);
                allocation.setStatus(BatchAllocationStatus.RESERVED);
            }
            allocation.setDepletedByDocumentType(null);
            allocation.setDepletedByDocumentId(null);
            allocation.setDepletedByLineId(null);
            allocation.setDepletedAt(null);
        }
        allocationRepository.saveAll(allocations);
    }

    public void markConsumed(Collection<BatchAllocation> allocations) {
        markConsumedForDelivery(null, null, allocations);
    }

    public void markConsumedForDelivery(
            DeliveryNote dn,
            DeliveryNoteItem item,
            Collection<BatchAllocation> allocations) {
        if (allocations == null || allocations.isEmpty()) {
            return;
        }
        LocalDateTime depletedAt = LocalDateTime.now();
        for (BatchAllocation allocation : allocations) {
            BatchMaster batch = allocation.getBatchMaster();
            if (batch.getStatus() != BatchStatus.RESERVED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Batch " + batch.getBatchNumber() + " is not reserved and cannot be consumed");
            }
            batch.setStatus(BatchStatus.CONSUMED);
            allocation.setStatus(BatchAllocationStatus.CONSUMED);
            if (dn != null) {
                allocation.setDepletedByDocumentType(DOC_TYPE_DELIVERY_NOTE);
                allocation.setDepletedByDocumentId(dn.getId());
            }
            if (item != null) {
                allocation.setDepletedByLineId(item.getId());
            }
            allocation.setDepletedAt(depletedAt);
        }
        allocationRepository.saveAll(allocations);
    }

    @Transactional(readOnly = true)
    public List<BatchAllocation> getReservedForDeliveryLine(Long deliveryNoteId, Long itemId) {
        if (deliveryNoteId == null || itemId == null) {
            return List.of();
        }
        return allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndStatus(
                DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, itemId, BatchAllocationStatus.RESERVED);
    }

    @Transactional(readOnly = true)
    public List<BatchAllocation> getReservedForDeliverySource(DeliveryNote dn, DeliveryNoteItem item) {
        if (dn == null || item == null) {
            return List.of();
        }
        if (item.getSalesOrderItemId() != null) {
            List<BatchAllocation> allocations = allocationRepository.findBySourceDocumentTypeAndSourceLineIdAndStatus(
                    DOC_TYPE_SALES_ORDER, item.getSalesOrderItemId(), BatchAllocationStatus.RESERVED);
            if (!allocations.isEmpty()) {
                return allocations;
            }
        }
        if (item.getSourceLineId() != null && dn.getSourceDocumentType() != null) {
            List<BatchAllocation> allocations = allocationRepository.findBySourceDocumentTypeAndSourceLineIdAndStatus(
                    dn.getSourceDocumentType(), item.getSourceLineId(), BatchAllocationStatus.RESERVED);
            if (!allocations.isEmpty()) {
                return allocations;
            }
        }
        return getReservedForDeliveryLine(dn.getId(), item.getId());
    }

    @Transactional(readOnly = true)
    public List<BatchAllocation> getAllocationsForDeliveryLine(Long deliveryNoteId, Long itemId) {
        if (deliveryNoteId == null || itemId == null) {
            return List.of();
        }
        return allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineId(
                DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, itemId);
    }

    @Transactional(readOnly = true)
    public List<DeliveryBatchSelectionResponse> getSelectionsForDeliveryLine(DeliveryNote dn, DeliveryNoteItem item) {
        if (dn == null || item == null) {
            return List.of();
        }

        List<BatchAllocation> allocations = new ArrayList<>();
        allocations.addAll(allocationRepository
                .findByDepletedByDocumentTypeAndDepletedByDocumentIdAndDepletedByLineIdAndStatus(
                        DOC_TYPE_DELIVERY_NOTE,
                        dn.getId(),
                        item.getId(),
                        BatchAllocationStatus.CONSUMED));

        if (allocations.isEmpty()) {
            if (item.getSalesOrderItemId() != null) {
                allocations.addAll(allocationRepository.findBySourceDocumentTypeAndSourceLineIdAndStatusIn(
                        DOC_TYPE_SALES_ORDER, item.getSalesOrderItemId(), ACTIVE_STATUSES));
            }
            if (allocations.isEmpty() && item.getSourceLineId() != null && dn.getSourceDocumentType() != null) {
                allocations.addAll(allocationRepository.findBySourceDocumentTypeAndSourceLineIdAndStatusIn(
                        dn.getSourceDocumentType(), item.getSourceLineId(), ACTIVE_STATUSES));
            }
            if (allocations.isEmpty()) {
                allocations.addAll(allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineId(
                                DOC_TYPE_DELIVERY_NOTE, dn.getId(), item.getId())
                        .stream()
                        .filter(allocation -> ACTIVE_STATUSES.contains(allocation.getStatus()))
                        .toList());
            }
        }

        return allocations.stream().map(this::toDeliveryResponse).toList();
    }

    @Transactional(readOnly = true)
    public Map<Long, List<DeliveryBatchSelectionResponse>> getSelections(String sourceDocumentType, Long sourceDocumentId) {
        if (sourceDocumentType == null || sourceDocumentId == null) {
            return Map.of();
        }
        List<BatchAllocation> allocations = allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndStatusIn(
                        sourceDocumentType,
                        sourceDocumentId,
                        ACTIVE_STATUSES);
        Map<Long, List<DeliveryBatchSelectionResponse>> byLine = new LinkedHashMap<>();
        for (BatchAllocation allocation : allocations) {
            byLine.computeIfAbsent(allocation.getSourceLineId(), key -> new ArrayList<>())
                    .add(toDeliveryResponse(allocation));
        }
        return byLine;
    }

    @Transactional(readOnly = true)
    public Map<Long, List<DeliveryBatchSelectionResponse>> getDeliverySelections(Long deliveryNoteId) {
        return getSelections(DOC_TYPE_DELIVERY_NOTE, deliveryNoteId);
    }

    @Transactional(readOnly = true)
    public List<BatchAllocation> findReturnableAllocations(String sourceDocumentType, Long sourceDocumentId) {
        if (sourceDocumentType == null || sourceDocumentId == null) {
            return List.of();
        }
        return allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndStatusIn(
                sourceDocumentType, sourceDocumentId, ACTIVE_STATUSES);
    }

    @Transactional(readOnly = true)
    public int sumAlreadyReturned(Long parentAllocationId) {
        if (parentAllocationId == null) return 0;
        return allocationRepository
                .findByParentAllocationIdAndStatus(parentAllocationId, BatchAllocationStatus.RETURNED)
                .stream()
                .mapToInt(a -> a.getQuantity() != null ? a.getQuantity() : 0)
                .sum();
    }

    public BatchAllocationRepository getAllocationRepository() {
        return allocationRepository;
    }

    public BatchMasterRepository getBatchRepository() {
        return batchRepository;
    }

    public DeliveryBatchSelectionResponse toDeliveryResponse(BatchAllocation allocation) {
        DeliveryBatchSelectionResponse response = new DeliveryBatchSelectionResponse();
        response.allocationId = allocation.getId();
        response.batchMasterId = allocation.getBatchMaster().getId();
        response.batchNumber = allocation.getBatchNumber();
        response.expiryDate = allocation.getExpiryDate();
        response.quantity = allocation.getQuantity();
        response.allocationMethod = allocation.getAllocationMethod();
        response.status = allocation.getStatus();
        response.binId = allocation.getBinId();
        response.binCode = allocation.getBinCode();

        BatchMaster batch = allocation.getBatchMaster();
        response.manufacturingDate = batch.getManufacturingDate();
        response.entryDate = batch.getEntryDate();
        response.qtyUnitNo = batch.getQtyUnitNo();
        return response;
    }

    private List<BatchMaster> selectAndLockFefo(Product product, Bin bin, int required) {
        List<Long> candidateIds = batchRepository.findAvailableForSelection(product.getCode(), bin.getId()).stream()
                .filter(batch -> isEligibleForSale(product, batch, LocalDate.now()))
                .limit(required)
                .map(BatchMaster::getId)
                .toList();

        if (candidateIds.size() < required) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Insufficient Batch Stock. Eligible available units: " + candidateIds.size()
                            + " | Required: " + required);
        }

        return lockAndValidate(product, bin, required, candidateIds);
    }

    private List<BatchMaster> selectAndLockManual(
            Product product,
            Bin bin,
            int required,
            List<Long> requestedIds) {

        if (requestedIds == null || requestedIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select batches before saving manual selection");
        }

        Set<Long> distinctIds = new HashSet<>(requestedIds);
        if (distinctIds.size() != requestedIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate batch rows are not allowed");
        }
        if (distinctIds.size() != required) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Selected units must equal required quantity. Selected: " + distinctIds.size()
                            + " | Required: " + required);
        }

        return lockAndValidate(product, bin, required, requestedIds);
    }

    private List<BatchMaster> lockAndValidate(Product product, Bin bin, int required, List<Long> batchIds) {
        List<BatchMaster> locked = batchRepository.findByIdInForUpdate(batchIds);
        Map<Long, BatchMaster> byId = new LinkedHashMap<>();
        for (BatchMaster batch : locked) {
            byId.put(batch.getId(), batch);
        }

        List<BatchMaster> ordered = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (Long id : batchIds) {
            BatchMaster batch = byId.get(id);
            if (batch == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Batch row not found: " + id);
            }
            validateSelectable(product, bin, batch, today);
            ordered.add(batch);
        }

        if (ordered.size() != required) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Selected units must equal required quantity. Selected: " + ordered.size()
                            + " | Required: " + required);
        }

        return ordered;
    }

    private void validateSelectable(Product product, Bin bin, BatchMaster batch, LocalDate today) {
        if (batch.getStatus() != BatchStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Batch " + batch.getBatchNumber() + " is no longer available");
        }
        if (!product.getId().equals(batch.getProductId())
                || !product.getCode().equalsIgnoreCase(batch.getProductCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch " + batch.getBatchNumber() + " does not belong to " + product.getCode());
        }
        if (batch.getBinId() == null || !batch.getBinId().equals(bin.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch " + batch.getBatchNumber() + " is not in bin " + bin.getCode());
        }

        String blockedReason = blockedReason(product, batch, today);
        if (blockedReason != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch " + batch.getBatchNumber() + " cannot be selected: " + blockedReason);
        }
    }

    private void assertNoActiveAllocations(List<BatchMaster> selected) {
        if (selected == null || selected.isEmpty()) {
            return;
        }
        List<Long> batchIds = selected.stream().map(BatchMaster::getId).toList();
        List<BatchAllocation> conflicts = allocationRepository.findActiveByBatchIdsForUpdate(batchIds, ACTIVE_STATUSES);
        if (conflicts != null && !conflicts.isEmpty()) {
            BatchAllocation conflict = conflicts.get(0);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Batch " + conflict.getBatchNumber() + " already has an active allocation on "
                            + conflict.getSourceDocumentType() + " #" + conflict.getSourceDocumentId()
                            + ". Release that allocation before selecting this batch again.");
        }
    }

    private BatchAllocation newAllocation(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId,
            Product product,
            Bin bin,
            BatchMaster batch,
            BatchAllocationMethod method,
            String selectedBy,
            LocalDateTime selectedAt) {

        BatchAllocation allocation = new BatchAllocation();
        allocation.setSourceDocumentType(sourceDocumentType);
        allocation.setSourceDocumentId(sourceDocumentId);
        allocation.setSourceLineId(sourceLineId);
        allocation.setProductId(product.getId());
        allocation.setProductCode(product.getCode());
        allocation.setBinId(bin.getId());
        allocation.setBinCode(bin.getCode());
        allocation.setBatchMaster(batch);
        allocation.setBatchNumber(batch.getBatchNumber());
        allocation.setExpiryDate(batch.getExpiryDate());
        allocation.setQuantity(1);
        allocation.setAllocationMethod(method);
        allocation.setStatus(BatchAllocationStatus.RESERVED);
        allocation.setSelectedBy(selectedBy);
        allocation.setSelectedAt(selectedAt);
        return allocation;
    }

    private void releaseAllocations(List<BatchAllocation> allocations) {
        if (allocations == null || allocations.isEmpty()) {
            return;
        }
        for (BatchAllocation allocation : allocations) {
            BatchMaster batch = allocation.getBatchMaster();
            if (batch.getStatus() == BatchStatus.RESERVED) {
                batch.setStatus(BatchStatus.AVAILABLE);
            }
            allocation.setStatus(BatchAllocationStatus.RELEASED);
        }
        allocationRepository.saveAll(allocations);
    }

    private BatchSelectionRow toSelectionRow(Product product, BatchMaster batch, boolean selected, LocalDate today) {
        BatchSelectionRow row = new BatchSelectionRow();
        row.batchMasterId = batch.getId();
        row.batchNumber = batch.getBatchNumber();
        row.expiryDate = batch.getExpiryDate();
        row.manufacturingDate = batch.getManufacturingDate();
        row.entryDate = batch.getEntryDate();
        row.qtyUnitNo = batch.getQtyUnitNo();
        row.availableUnits = batch.getQuantity() != null ? batch.getQuantity() : 1;
        row.selectedQuantity = selected ? 1 : 0;
        row.daysRemaining = batch.getExpiryDate() != null
                ? ChronoUnit.DAYS.between(today, batch.getExpiryDate())
                : null;
        row.warningLevel = warningLevel(product, batch, today);
        row.blockedReason = blockedReason(product, batch, today);
        return row;
    }

    private boolean isEligibleForSale(Product product, BatchMaster batch, LocalDate today) {
        return blockedReason(product, batch, today) == null;
    }

    private String blockedReason(Product product, BatchMaster batch, LocalDate today) {
        LocalDate expiry = batch.getExpiryDate();
        LocalDate minSaleDate = today.plusDays(minExpiryDays(product));

        if (expiry == null) {
            return product.isExpiryEnabled() ? "missing expiry date" : null;
        }
        if (expiry.isBefore(today)) {
            return "expired on " + expiry;
        }
        if (expiry.isBefore(minSaleDate)) {
            return "below minimum shelf life of " + minExpiryDays(product) + " days";
        }
        return null;
    }

    private ExpiryWarningLevel warningLevel(Product product, BatchMaster batch, LocalDate today) {
        String blockedReason = blockedReason(product, batch, today);
        if (blockedReason != null) {
            return ExpiryWarningLevel.RED;
        }

        LocalDate expiry = batch.getExpiryDate();
        if (expiry == null) {
            return ExpiryWarningLevel.GREEN;
        }
        long days = ChronoUnit.DAYS.between(today, expiry);
        if (days < 7) {
            return ExpiryWarningLevel.RED;
        }
        if (days <= 30) {
            return ExpiryWarningLevel.AMBER;
        }
        return ExpiryWarningLevel.GREEN;
    }

    private Product requireProduct(String itemCode) {
        if (itemCode == null || itemCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "itemCode is required");
        }
        return productRepository.findByCodeAndIsActiveTrue(itemCode.trim())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Product not found: " + itemCode));
    }

    private Product requireBatchProduct(String itemCode) {
        Product product = requireProduct(itemCode);
        if (!product.isBatch()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch selection is only valid for batch-controlled items");
        }
        return product;
    }

    private Bin resolveSourceBin(BatchSelectionRequest request, Long existingBinId) {
        if (request != null && request.binId != null) {
            return resolveBin(request.binId, request.locationCode);
        }
        if (existingBinId != null) {
            return resolveBin(existingBinId, request != null ? request.locationCode : null);
        }
        return resolveBin(null, request != null ? request.locationCode : null);
    }

    private Bin resolveBin(Long binId, String locationCode) {
        if (binId != null) {
            return binRepository.findByIdEager(binId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bin not found: " + binId));
        }
        return resolveUniqueBin(locationCode);
    }

    private Bin resolveUniqueBin(String locationCode) {
        if (locationCode == null || locationCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "locationCode is required");
        }
        List<Bin> bins = binRepository.findAllByCode(locationCode.trim());
        if (bins.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bin not found: " + locationCode);
        }
        if (bins.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Duplicate bin code '" + locationCode + "' found. Use a unique bin code before selecting batches.");
        }
        return bins.get(0);
    }

    private Bin resolveItemBin(DeliveryNoteItem item) {
        if (item.getBinId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select a delivery bin before selecting batches for " + item.getItemCode());
        }
        return binRepository.findByIdEager(item.getBinId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bin not found: " + item.getBinId()));
    }

    private void validateRequestedLocation(BatchSelectionRequest request, Bin bin) {
        if (request == null) {
            return;
        }
        if (request.binId != null && !request.binId.equals(bin.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch selection bin does not match the document line bin");
        }
        if (request.locationCode == null || request.locationCode.isBlank()) {
            return;
        }
        if (!bin.getCode().equalsIgnoreCase(request.locationCode.trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch selection location does not match the document line bin");
        }
    }

    private int normalizeRequiredQuantity(Integer requiredQuantity) {
        int required = requiredQuantity != null ? requiredQuantity : 0;
        if (required <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "requiredQuantity must be positive");
        }
        return required;
    }

    private int minExpiryDays(Product product) {
        return product.getMinExpiryDaysForSale() != null && product.getMinExpiryDaysForSale() > 0
                ? product.getMinExpiryDaysForSale()
                : 0;
    }

    private String currentUsername() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "system";
    }
}
