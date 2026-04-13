package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class WarehouseService {

    private final WarehouseRepository repository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;

    public WarehouseService(
            WarehouseRepository repository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository) {
        this.repository = repository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
    }

    public List<WarehouseResponse> list() {
        return repository.findAll()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public WarehouseResponse getById(Long id) {
        Warehouse warehouse = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));
        return mapToResponse(warehouse);
    }

    public WarehouseResponse create(WarehouseRequestDto req) {
        Warehouse warehouse = new Warehouse();
        warehouse.setName(req.getName());
        warehouse.setType(req.getType());
        warehouse.setAddress(req.getAddress());
        warehouse.setStatus(req.getStatus() != null ? req.getStatus() : "Active");
        warehouse.setCapacity(req.getCapacity() != null ? req.getCapacity() : 0);
        warehouse.setUtilization(req.getUtilization() != null ? req.getUtilization() : 0);

        repository.save(warehouse);
        return mapToResponse(warehouse);
    }

    public WarehouseResponse update(Long id, WarehouseRequestDto req) {
        Warehouse warehouse = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));

        warehouse.setName(req.getName());
        warehouse.setType(req.getType());
        warehouse.setAddress(req.getAddress());
        warehouse.setStatus(req.getStatus());
        warehouse.setCapacity(req.getCapacity());
        warehouse.setUtilization(req.getUtilization());

        repository.save(warehouse);
        return mapToResponse(warehouse);
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new RuntimeException("Warehouse not found");
        }
        repository.deleteById(id);
    }

    private WarehouseResponse mapToResponse(Warehouse w) {
        WarehouseResponse res = new WarehouseResponse();
        res.setId(w.getId());
        res.setName(w.getName());
        res.setType(w.getType());
        res.setAddress(w.getAddress());
        res.setStatus(w.getStatus());
        res.setCapacity(w.getCapacity());
        res.setUtilization(w.getUtilization());

        // Add zone/locator/bin counts
        res.setZoneCount((long) zoneRepository.findByWarehouseId(w.getId()).size());
        res.setLocatorCount(locatorRepository.countByWarehouseId(w.getId()));
        res.setBinCount(binRepository.countByWarehouseId(w.getId()));

        return res;
    }
}
