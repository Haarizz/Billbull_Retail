package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class WarehouseService {

    private final WarehouseRepository repository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final BranchRepository branchRepository;
    private final BranchAccessService branchAccessService;

    public WarehouseService(
            WarehouseRepository repository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository,
            BranchRepository branchRepository,
            BranchAccessService branchAccessService) {
        this.repository = repository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.branchRepository = branchRepository;
        this.branchAccessService = branchAccessService;
    }

    public List<WarehouseResponse> list() {
        return getAccessibleWarehouses()
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
        Branch branch = resolveRequiredBranch(req.getBranchId());
        Warehouse warehouse = new Warehouse();
        warehouse.setName(req.getName());
        warehouse.setType(req.getType());
        warehouse.setAddress(req.getAddress());
        warehouse.setStatus(req.getStatus() != null ? req.getStatus() : "Active");
        warehouse.setCapacity(req.getCapacity() != null ? req.getCapacity() : 0);
        warehouse.setUtilization(req.getUtilization() != null ? req.getUtilization() : 0);
        warehouse.setBranch(branch);

        repository.save(warehouse);
        return mapToResponse(warehouse);
    }

    public WarehouseResponse update(Long id, WarehouseRequestDto req) {
        Warehouse warehouse = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));
        Branch branch = resolveRequiredBranch(req.getBranchId());

        warehouse.setName(req.getName());
        warehouse.setType(req.getType());
        warehouse.setAddress(req.getAddress());
        warehouse.setStatus(req.getStatus());
        warehouse.setCapacity(req.getCapacity());
        warehouse.setUtilization(req.getUtilization());
        warehouse.setBranch(branch);

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
        if (w.getBranch() != null) {
            res.setBranchId(w.getBranch().getId());
            res.setBranchName(w.getBranch().getName());
            res.setBranchCode(w.getBranch().getCode());
        }

        return res;
    }

    private Branch resolveRequiredBranch(Long branchId) {
        if (branchId == null) {
            throw new RuntimeException("Branch is required for warehouse setup.");
        }

        return branchRepository.findById(branchId)
                .orElseThrow(() -> new RuntimeException("Branch not found"));
    }

    private List<Warehouse> getAccessibleWarehouses() {
        if (branchAccessService.currentUserHasRole("ADMIN")) {
            return repository.findAll();
        }

        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId == null) {
            return List.of();
        }
        return repository.findByBranch_Id(branchId);
    }
}
