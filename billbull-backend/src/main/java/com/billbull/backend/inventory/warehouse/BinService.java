package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Branch-Level Inventory Phase 5 note: BinService needs NO branch-scoping change. Every list here
 * is keyed by locatorId or warehouseId, and a locator/warehouse belongs to exactly one branch, so
 * these reads are already branch-correct by inheritance (same reasoning as the warehouse-scoped
 * balance reads in Phase 4). There is no cross-branch bin-list endpoint to scope. Branch access is
 * enforced upstream at the warehouse level (WarehouseService).
 */
@Service
public class BinService {

    private final BinRepository binRepository;
    private final LocatorRepository locatorRepository;

    public BinService(BinRepository binRepository, LocatorRepository locatorRepository) {
        this.binRepository = binRepository;
        this.locatorRepository = locatorRepository;
    }

    @Transactional(readOnly = true)
    public List<BinResponse> getBinResponsesByLocator(Long locatorId) {
        return binRepository.findByLocatorId(locatorId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BinResponse> getBinResponsesByWarehouse(Long warehouseId) {
        return binRepository.findByWarehouseId(warehouseId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public BinResponse getBinResponseById(Long id) {
        Bin bin = binRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bin not found with id: " + id));
        return toResponse(bin);
    }

    @Transactional
    public BinResponse createBinAndGetResponse(Long locatorId, BinRequest request) {
        Locator locator = locatorRepository.findById(locatorId)
                .orElseThrow(() -> new RuntimeException("Locator not found with id: " + locatorId));

        if (binRepository.existsByCodeAndLocatorId(request.code(), locatorId)) {
            throw new RuntimeException("Bin with code '" + request.code() + "' already exists in this locator");
        }

        Bin bin = new Bin();
        bin.setCode(request.code());
        bin.setName(request.name());
        bin.setCapacity(request.capacity());
        bin.setBinType(request.binType());
        bin.setStatus(request.status() != null ? request.status() : "Active");
        bin.setLocator(locator);

        Bin saved = binRepository.save(bin);
        return toResponse(saved);
    }

    @Transactional
    public BinResponse updateBinAndGetResponse(Long id, BinRequest request) {
        Bin bin = binRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bin not found with id: " + id));

        bin.setCode(request.code());
        bin.setName(request.name());
        bin.setCapacity(request.capacity());
        bin.setBinType(request.binType());
        if (request.status() != null) {
            bin.setStatus(request.status());
        }

        Bin saved = binRepository.save(bin);
        return toResponse(saved);
    }

    @Transactional
    public void deleteBin(Long id) {
        Bin bin = binRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bin not found with id: " + id));
        binRepository.delete(bin);
    }

    public Long countByWarehouse(Long warehouseId) {
        return binRepository.countByWarehouseId(warehouseId);
    }

    public Long countByZone(Long zoneId) {
        return binRepository.countByZoneId(zoneId);
    }

    private BinResponse toResponse(Bin bin) {
        return new BinResponse(
                bin.getId(),
                bin.getCode(),
                bin.getName(),
                bin.getCapacity(),
                bin.getBinType(),
                bin.getStatus(),
                bin.getLocator().getId(),
                bin.getLocator().getName(),
                bin.getLocator().getZone().getId(),
                bin.getLocator().getZone().getWarehouse().getId());
    }
}
