package com.billbull.backend.inventory.warehouse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class WarehouseService {

    public record WarehouseTree(
            List<WarehouseResponse> warehouses,
            List<ZoneResponse> zones,
            List<LocatorResponse> locators,
            List<BinResponse> bins) {}

    private final WarehouseRepository repository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final BranchRepository branchRepository;
    private final BranchAccessService branchAccessService;
    // Branch-Level Inventory Phase 5: decides whether the branch-user warehouse list should also
    // include global (null-branch) warehouses. Dormant while inventory.branch-scope.enabled=false.
    private final com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;

    public WarehouseService(
            WarehouseRepository repository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository,
            BranchRepository branchRepository,
            BranchAccessService branchAccessService,
            com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver) {
        this.repository = repository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.branchRepository = branchRepository;
        this.branchAccessService = branchAccessService;
        this.branchScopeResolver = branchScopeResolver;
    }

    @Transactional(readOnly = true)
    public List<WarehouseResponse> list(Long branchId) {
        return getAccessibleWarehouses(branchId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public WarehouseTree getTree(Long branchId) {
        List<Warehouse> warehouses = getAccessibleWarehouses(branchId);
        List<WarehouseResponse> warehouseResponses = warehouses.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());

        if (warehouses.isEmpty()) {
            return new WarehouseTree(warehouseResponses, List.of(), List.of(), List.of());
        }

        Set<Long> warehouseIds = warehouses.stream().map(Warehouse::getId).collect(Collectors.toSet());

        List<Zone> zones = zoneRepository.findByWarehouseIdIn(warehouseIds);
        List<ZoneResponse> zoneResponses = zones.stream()
                .map(z -> new ZoneResponse(z.getId(), z.getCode(), z.getName(), z.getDescription(),
                        z.getZoneType(), z.getStatus(), z.getWarehouse().getId(), z.getWarehouse().getName()))
                .collect(Collectors.toList());

        if (zones.isEmpty()) {
            return new WarehouseTree(warehouseResponses, zoneResponses, List.of(), List.of());
        }

        Set<Long> zoneIds = zones.stream().map(Zone::getId).collect(Collectors.toSet());

        List<Locator> locators = locatorRepository.findByZoneIdIn(zoneIds);
        List<LocatorResponse> locatorResponses = locators.stream()
                .map(l -> new LocatorResponse(l.getId(), l.getCode(), l.getName(), l.getAisleNumber(),
                        l.getRackNumber(), l.getStatus(), l.getZone().getId(), l.getZone().getName(),
                        l.getZone().getWarehouse().getId()))
                .collect(Collectors.toList());

        if (locators.isEmpty()) {
            return new WarehouseTree(warehouseResponses, zoneResponses, locatorResponses, List.of());
        }

        Set<Long> locatorIds = locators.stream().map(Locator::getId).collect(Collectors.toSet());

        List<Bin> bins = binRepository.findByLocatorIdIn(locatorIds);
        List<BinResponse> binResponses = bins.stream()
                .map(b -> new BinResponse(b.getId(), b.getCode(), b.getName(), b.getCapacity(),
                        b.getBinType(), b.getStatus(), b.getLocator().getId(), b.getLocator().getName(),
                        b.getLocator().getZone().getId(), b.getLocator().getZone().getWarehouse().getId()))
                .collect(Collectors.toList());

        return new WarehouseTree(warehouseResponses, zoneResponses, locatorResponses, binResponses);
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
        if (!branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")) {
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
        if (branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")) {
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

    private List<Warehouse> getAccessibleWarehouses(Long requestedBranchId) {
        // Admin authority is UNCHANGED (existing role check preserved — see Phase 5 decision):
        // ADMIN / BRANCH_ADMIN see all warehouses (or a requested branch's) as before.
        if (branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")) {
            if (requestedBranchId != null) {
                return repository.findByBranch_Id(requestedBranchId);
            }
            return repository.findAll();
        }

        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId == null) {
            return List.of();
        }

        // Phase 5: when branch-scoping is enabled AND a branch is active, a branch user also sees
        // GLOBAL (null-branch) warehouses — they are shared and usable everywhere. When the toggle
        // is off (or no active branch), behaviour is byte-identical to today: own branch only,
        // globals excluded.
        return branchScopeResolver.activeListScope()
                .map(scope -> repository.findByBranchIdInOrGlobal(scope.branchIds()))
                .orElseGet(() -> repository.findByBranch_Id(branchId));
    }
}
