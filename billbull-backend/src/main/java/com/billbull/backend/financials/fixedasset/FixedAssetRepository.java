package com.billbull.backend.financials.fixedasset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface FixedAssetRepository extends JpaRepository<FixedAsset, Long> {

    Optional<FixedAsset> findByAssetCode(String assetCode);

    List<FixedAsset> findByStatus(FixedAsset.AssetStatus status);

    List<FixedAsset> findByBranchIdAndStatus(Long branchId, FixedAsset.AssetStatus status);

    /** Assets that are ACTIVE and whose depreciation start date is on or before the given run date. */
    @Query("SELECT fa FROM FixedAsset fa WHERE fa.status = 'ACTIVE' AND fa.depreciationStartDate <= :runDate")
    List<FixedAsset> findActiveAssetsForDepreciation(LocalDate runDate);
}
