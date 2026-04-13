package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class LocatorService {

    private final LocatorRepository locatorRepository;
    private final ZoneRepository zoneRepository;

    public LocatorService(LocatorRepository locatorRepository, ZoneRepository zoneRepository) {
        this.locatorRepository = locatorRepository;
        this.zoneRepository = zoneRepository;
    }

    @Transactional(readOnly = true)
    public List<LocatorResponse> getLocatorResponsesByZone(Long zoneId) {
        return locatorRepository.findByZoneId(zoneId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public LocatorResponse getLocatorResponseById(Long id) {
        Locator locator = locatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Locator not found with id: " + id));
        return toResponse(locator);
    }

    @Transactional
    public LocatorResponse createLocatorAndGetResponse(Long zoneId, LocatorRequest request) {
        Zone zone = zoneRepository.findById(zoneId)
                .orElseThrow(() -> new RuntimeException("Zone not found with id: " + zoneId));

        if (locatorRepository.existsByCodeAndZoneId(request.code(), zoneId)) {
            throw new RuntimeException("Locator with code '" + request.code() + "' already exists in this zone");
        }

        Locator locator = new Locator();
        locator.setCode(request.code());
        locator.setName(request.name());
        locator.setAisleNumber(request.aisleNumber());
        locator.setRackNumber(request.rackNumber());
        locator.setStatus(request.status() != null ? request.status() : "Active");
        locator.setZone(zone);

        Locator saved = locatorRepository.save(locator);
        return toResponse(saved);
    }

    @Transactional
    public LocatorResponse updateLocatorAndGetResponse(Long id, LocatorRequest request) {
        Locator locator = locatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Locator not found with id: " + id));

        locator.setCode(request.code());
        locator.setName(request.name());
        locator.setAisleNumber(request.aisleNumber());
        locator.setRackNumber(request.rackNumber());
        if (request.status() != null) {
            locator.setStatus(request.status());
        }

        Locator saved = locatorRepository.save(locator);
        return toResponse(saved);
    }

    @Transactional
    public void deleteLocator(Long id) {
        Locator locator = locatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Locator not found with id: " + id));
        locatorRepository.delete(locator);
    }

    public Long countByWarehouse(Long warehouseId) {
        return locatorRepository.countByWarehouseId(warehouseId);
    }

    private LocatorResponse toResponse(Locator locator) {
        return new LocatorResponse(
                locator.getId(),
                locator.getCode(),
                locator.getName(),
                locator.getAisleNumber(),
                locator.getRackNumber(),
                locator.getStatus(),
                locator.getZone().getId(),
                locator.getZone().getName(),
                locator.getZone().getWarehouse().getId());
    }
}
