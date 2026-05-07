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
import com.billbull.backend.security.RolePermissionService;

@Service
@Transactional
public class BatchSelectionService {

    public static final String DOC_TYPE_DELIVERY_NOTE = "DELIVERY_NOTE";
    public static final String MANUAL_PERMISSION = "batch_manual_select";

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

        Product product = requireProduct(itemCode);
        Bin bin = resolveUniqueBin(locationCode);
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
        return response;
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

        int required = normalizeRequiredQuantity(
                request != null && request.requiredQuantity != null ? request.requiredQuantity : requiredQuantity);
        if (required != requiredQuantity) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Required quantity does not match the delivery line base quantity");
        }

        Bin bin = resolveItemBin(item);
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

        releaseDeliveryLine(dn.getId(), item.getId());

        List<BatchMaster> selected = method == BatchAllocationMethod.AUTO_FEFO
                ? selectAndLockFefo(product, bin, required)
                : selectAndLockManual(product, bin, required, request != null ? request.batchMasterIds : List.of());

        List<BatchAllocation> allocations = new ArrayList<>(selected.size());
        LocalDateTime selectedAt = LocalDateTime.now();
        String selectedBy = currentUsername();

        for (BatchMaster batch : selected) {
            batch.setStatus(BatchStatus.RESERVED);
            allocations.add(newDeliveryAllocation(dn, item, product, bin, batch, method, selectedBy, selectedAt));
        }

        batchRepository.saveAll(selected);
        List<BatchAllocation> saved = allocationRepository.saveAll(allocations);
        allocationRepository.flush();
        batchRepository.flush();
        return saved;
    }

    public void releaseDeliveryLine(Long deliveryNoteId, Long itemId) {
        if (deliveryNoteId == null || itemId == null) {
            return;
        }
        releaseAllocations(allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndStatus(
                        DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, itemId, BatchAllocationStatus.RESERVED));
    }

    public void releaseDeliveryNote(Long deliveryNoteId) {
        if (deliveryNoteId == null) {
            return;
        }
        releaseAllocations(allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
                        DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, BatchAllocationStatus.RESERVED));
    }

    public void restoreConsumedDeliveryNote(Long deliveryNoteId) {
        if (deliveryNoteId == null) {
            return;
        }
        List<BatchAllocation> allocations = allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
                        DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, BatchAllocationStatus.CONSUMED);
        for (BatchAllocation allocation : allocations) {
            BatchMaster batch = allocation.getBatchMaster();
            batch.setStatus(BatchStatus.AVAILABLE);
            allocation.setStatus(BatchAllocationStatus.RELEASED);
        }
        allocationRepository.saveAll(allocations);
    }

    public void markConsumed(Collection<BatchAllocation> allocations) {
        if (allocations == null || allocations.isEmpty()) {
            return;
        }
        for (BatchAllocation allocation : allocations) {
            BatchMaster batch = allocation.getBatchMaster();
            if (batch.getStatus() != BatchStatus.RESERVED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Batch " + batch.getBatchNumber() + " is not reserved and cannot be consumed");
            }
            batch.setStatus(BatchStatus.SOLD);
            allocation.setStatus(BatchAllocationStatus.CONSUMED);
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
    public List<BatchAllocation> getAllocationsForDeliveryLine(Long deliveryNoteId, Long itemId) {
        if (deliveryNoteId == null || itemId == null) {
            return List.of();
        }
        return allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineId(
                DOC_TYPE_DELIVERY_NOTE, deliveryNoteId, itemId);
    }

    @Transactional(readOnly = true)
    public Map<Long, List<DeliveryBatchSelectionResponse>> getDeliverySelections(Long deliveryNoteId) {
        if (deliveryNoteId == null) {
            return Map.of();
        }
        List<BatchAllocation> allocations = allocationRepository
                .findBySourceDocumentTypeAndSourceDocumentIdAndStatusIn(
                        DOC_TYPE_DELIVERY_NOTE,
                        deliveryNoteId,
                        List.of(BatchAllocationStatus.RESERVED, BatchAllocationStatus.CONSUMED));
        Map<Long, List<DeliveryBatchSelectionResponse>> byLine = new LinkedHashMap<>();
        for (BatchAllocation allocation : allocations) {
            byLine.computeIfAbsent(allocation.getSourceLineId(), key -> new ArrayList<>())
                    .add(toDeliveryResponse(allocation));
        }
        return byLine;
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

    private BatchAllocation newDeliveryAllocation(
            DeliveryNote dn,
            DeliveryNoteItem item,
            Product product,
            Bin bin,
            BatchMaster batch,
            BatchAllocationMethod method,
            String selectedBy,
            LocalDateTime selectedAt) {

        BatchAllocation allocation = new BatchAllocation();
        allocation.setSourceDocumentType(DOC_TYPE_DELIVERY_NOTE);
        allocation.setSourceDocumentId(dn.getId());
        allocation.setSourceLineId(item.getId());
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
        if (request == null || request.locationCode == null || request.locationCode.isBlank()) {
            return;
        }
        if (!bin.getCode().equalsIgnoreCase(request.locationCode.trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch selection location does not match the delivery line bin");
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
