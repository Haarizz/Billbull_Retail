package com.billbull.backend.inventory.units;

import java.util.List;

import org.springframework.stereotype.Service;

import jakarta.transaction.Transactional;

@Service
@Transactional
public class UnitService {

    private final UnitRepository unitRepo;
    private final UnitUsageService unitUsageService; // explained below

    public UnitService(UnitRepository unitRepo,
            UnitUsageService unitUsageService) {
        this.unitRepo = unitRepo;
        this.unitUsageService = unitUsageService;
    }

    // ------------------------
    // LIST
    // ------------------------
    public List<UnitResponse> list() {
        return unitRepo.findByIsActiveTrueOrderByNameAsc()
                .stream()
                .map(unit -> new UnitResponse(
                        unit,
                        unitUsageService.countProductsUsingUnit(unit.getId())))
                .toList();
    }

    // ------------------------
    // CREATE
    // ------------------------
    public UnitResponse create(UnitRequest req) {

        if (unitRepo.existsByNameIgnoreCaseAndIsActiveTrue(req.getName())) {
            throw new IllegalArgumentException("Unit name already exists");
        }

        if (unitRepo.existsBySymbolIgnoreCaseAndIsActiveTrue(req.getSymbol())) {
            throw new IllegalArgumentException("Unit symbol already exists");
        }

        Unit unit = new Unit(
                req.getName(),
                req.getSymbol(),
                req.getDescription());

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