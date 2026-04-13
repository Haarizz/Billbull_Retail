package com.billbull.backend.inventory.units;

import org.springframework.stereotype.Service;

@Service
public class UnitUsageService {

    private final com.billbull.backend.inventory.product.ProductPackingRepository packingRepo;

    public UnitUsageService(com.billbull.backend.inventory.product.ProductPackingRepository packingRepo) {
        this.packingRepo = packingRepo;
    }

    public long countProductsUsingUnit(Long unitId) {
        return packingRepo.countDistinctProductIdByUnitIdAndIsActiveTrue(unitId);
    }
}
