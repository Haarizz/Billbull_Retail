package com.billbull.backend.inventory.units;

import java.util.List;

import org.springframework.stereotype.Service;

import jakarta.transaction.Transactional;

@Service
@Transactional
public class UnitService {

    private final UnitRepository unitRepo;
    private final UnitUsageService unitUsageService; // explained below
    private final com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver;
    private final com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch;

    public UnitService(UnitRepository unitRepo,
            UnitUsageService unitUsageService,
            com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver,
            com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch) {
        this.unitRepo = unitRepo;
        this.unitUsageService = unitUsageService;
        this.scopeResolver = scopeResolver;
        this.masterBranch = masterBranch;
    }

    private java.util.Collection<Long> activeScope() {
        return scopeResolver.activeListScope()
                .map(com.billbull.backend.settings.branch.BranchAccessService.ListScope::branchIds)
                .orElse(null);
    }

    // ------------------------
    // LIST
    // ------------------------
    public List<UnitResponse> list() {
        java.util.Collection<Long> scope = activeScope();
        List<Unit> rows = scope != null
                ? unitRepo.findActiveInBranchScope(scope)
                : unitRepo.findByIsActiveTrueOrderByNameAsc();
        return rows.stream()
                .map(unit -> new UnitResponse(
                        unit,
                        unitUsageService.countProductsUsingUnit(unit.getId())))
                .toList();
    }

    // ------------------------
    // CREATE
    // ------------------------
    public UnitResponse create(UnitRequest req) {

        java.util.Collection<Long> scope = activeScope();
        boolean nameExists = scope != null
                ? unitRepo.existsActiveByNameInBranchScope(req.getName(), scope)
                : unitRepo.existsByNameIgnoreCaseAndIsActiveTrue(req.getName());
        if (nameExists) {
            throw new IllegalArgumentException(scope != null
                    ? "Unit name already exists in this branch" : "Unit name already exists");
        }

        boolean symbolExists = scope != null
                ? unitRepo.existsActiveBySymbolInBranchScope(req.getSymbol(), scope)
                : unitRepo.existsBySymbolIgnoreCaseAndIsActiveTrue(req.getSymbol());
        if (symbolExists) {
            throw new IllegalArgumentException(scope != null
                    ? "Unit symbol already exists in this branch" : "Unit symbol already exists");
        }

        Unit unit = new Unit(
                req.getName(),
                req.getSymbol(),
                req.getDescription());
        unit.setBranch(masterBranch.resolveBranchForCreate()); // Phase 6B stamp (null = global / toggle off)

        if (req.getBaseUnitId() != null) {
            unit.setBaseUnit(unitRepo.findById((long) req.getBaseUnitId())
                    .orElseThrow(() -> new IllegalArgumentException("Base unit not found")));
        }
        unit.setConversionRate(req.getConversionRate() != null ? req.getConversionRate() : java.math.BigDecimal.ONE);

        unitRepo.save(unit);

        return new UnitResponse(unit, 0);
    }

    // ------------------------
    // UPDATE
    // ------------------------
    public UnitResponse update(Long id, UnitRequest req) {

        Unit unit = unitRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unit not found"));

        unit.setName(req.getName());
        unit.setSymbol(req.getSymbol());
        unit.setDescription(req.getDescription());

        if (req.getBaseUnitId() != null) {
            // Prevent circular dependency (unit cannot be its own base unit)
            if (req.getBaseUnitId().equals(id)) {
                throw new IllegalArgumentException("Unit cannot be its own base unit");
            }
            unit.setBaseUnit(unitRepo.findById((long) req.getBaseUnitId())
                    .orElseThrow(() -> new IllegalArgumentException("Base unit not found")));
        } else {
            unit.setBaseUnit(null);
        }
        unit.setConversionRate(req.getConversionRate() != null ? req.getConversionRate() : java.math.BigDecimal.ONE);

        unitRepo.save(unit);

        return new UnitResponse(
                unit,
                unitUsageService.countProductsUsingUnit(id));
    }

    // ------------------------
    // DELETE (SOFT)
    // ------------------------
    public void delete(Long id) {

        long usageCount = unitUsageService.countProductsUsingUnit(id);

        if (usageCount > 0) {
            throw new IllegalStateException(
                    "Unit is used by products and cannot be deleted");
        }

        Unit unit = unitRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unit not found"));

        unit.setActive(false);
        unitRepo.save(unit);
    }
}