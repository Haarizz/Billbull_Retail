package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

import java.util.List;
import java.util.Objects;
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

    @Transactional(readOnly = true)
    public List<WarehouseResponse> list() {
        return getAccessibleWarehouses()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public WarehouseResponse getById(Long id) {
        Warehouse warehouse = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));
        return mapToResponse(warehouse);
    }

    public WarehouseResponse create(WarehouseRequestDto req) {
        Branch branch = resolveBranchForWrite(req.getBranchId(), null);
        Warehouse warehouse = new Warehouse();
        applyRequest(warehouse, req, branch);

        repository.save(warehouse);
        return mapToResponse(warehouse);
    }

    public WarehouseResponse update(Long id, WarehouseRequestDto req) {
        Warehouse warehouse = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Warehouse not found"));
        assertWarehouseWritable(warehouse);
        Branch branch = resolveBranchForWrite(req.getBranchId(), warehouse.getBranch());

        applyRequest(warehouse, req, branch);

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

    private void applyRequest(Warehouse warehouse, WarehouseRequestDto req, Branch branch) {
        warehouse.setName(req.getName().trim());
        warehouse.setType(req.getType().trim());
        warehouse.setAddress(req.getAddress().trim());
        warehouse.setStatus(hasText(req.getStatus()) ? req.getStatus().trim() : "Active");
        warehouse.setCapacity(req.getCapacity() != null ? req.getCapacity() : 0);
        warehouse.setUtilization(req.getUtilization() != null ? req.getUtilization() : 0);
        warehouse.setBranch(branch);
    }

    private Branch resolveBranchForWrite(Long requestedBranchId, Branch existingBranch) {
        if (!branchAccessService.currentUserHasRole("ADMIN")) {
            Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
            if (requestedBranchId != null && !Objects.equals(requestedBranchId, currentBranch.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "You can only assign warehouses to your own branch.");
            }
            return currentBranch;
        }

        if (requestedBranchId != null) {
            return branchRepository.findById(requestedBranchId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Branch not found: " + requestedBranchId));
        }

        if (existingBranch != null) {
            return existingBranch;
        }

        Branch currentBranch = branchAccessService.getCurrentUserBranchOrNull();
        if (currentBranch != null) {
            return currentBranch;
        }

        return branchRepository.findByIsDefaultTrue()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Branch is required for warehouse setup. Select a branch first."));
    }

    private void assertWarehouseWritable(Warehouse warehouse) {
        if (branchAccessService.currentUserHasRole("ADMIN")) {
            return;
        }

        Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
        if (warehouse.getBranch() == null || !Objects.equals(warehouse.getBranch().getId(), currentBranch.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You can only modify warehouses in your assigned branch.");
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
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
