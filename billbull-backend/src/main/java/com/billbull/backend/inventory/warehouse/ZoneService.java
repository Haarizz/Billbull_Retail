package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ZoneService {

    private final ZoneRepository zoneRepository;
    private final WarehouseRepository warehouseRepository;

    public ZoneService(ZoneRepository zoneRepository, WarehouseRepository warehouseRepository) {
        this.zoneRepository = zoneRepository;
        this.warehouseRepository = warehouseRepository;
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> getZoneResponsesByWarehouse(Long warehouseId) {
        return zoneRepository.findByWarehouseId(warehouseId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ZoneResponse getZoneResponseById(Long id) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Zone not found with id: " + id));
        return toResponse(zone);
    }

    @Transactional
    public ZoneResponse createZoneAndGetResponse(Long warehouseId, ZoneRequest request) {
        Warehouse warehouse = warehouseRepository.findById(warehouseId)
                .orElseThrow(() -> new RuntimeException("Warehouse not found with id: " + warehouseId));

        if (zoneRepository.existsByCodeAndWarehouseId(request.code(), warehouseId)) {
            throw new RuntimeException("Zone with code '" + request.code() + "' already exists in this warehouse");
        }

        Zone zone = new Zone();
        zone.setCode(request.code());
        zone.setName(request.name());
        zone.setDescription(request.description());
        zone.setZoneType(request.zoneType());
        zone.setStatus(request.status() != null ? request.status() : "Active");
        zone.setWarehouse(warehouse);

        Zone saved = zoneRepository.save(zone);
        return toResponse(saved);
    }

    @Transactional
    public ZoneResponse updateZoneAndGetResponse(Long id, ZoneRequest request) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Zone not found with id: " + id));

        zone.setCode(request.code());
        zone.setName(request.name());
        zone.setDescription(request.description());
        zone.setZoneType(request.zoneType());
        if (request.status() != null) {
            zone.setStatus(request.status());
        }

        Zone saved = zoneRepository.save(zone);
        return toResponse(saved);
    }

    @Transactional
    public void deleteZone(Long id) {
        Zone zone = zoneRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Zone not found with id: " + id));
        zoneRepository.delete(zone);
    }

    public Long countByWarehouse(Long warehouseId) {
        return (long) zoneRepository.findByWarehouseId(warehouseId).size();
    }

    private ZoneResponse toResponse(Zone zone) {
        return new ZoneResponse(
                zone.getId(),
                zone.getCode(),
                zone.getName(),
                zone.getDescription(),
                zone.getZoneType(),
                zone.getStatus(),
                zone.getWarehouse().getId(),
                zone.getWarehouse().getName());
    }
}
