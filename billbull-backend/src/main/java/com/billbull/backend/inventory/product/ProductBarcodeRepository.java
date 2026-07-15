package com.billbull.backend.inventory.product;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductBarcodeRepository extends JpaRepository<ProductBarcode, Long> {
    java.util.Optional<ProductBarcode> findFirstByBarcode(String barcode);

    // ===== Branch-Level Inventory Phase 9A — branch-first, global-fallback resolution. Used only
    // when inventory.branch-scope.enabled is on + a branch is active; the plain findFirstByBarcode
    // above remains the toggle-off / admin path (byte-identical). branchIds never empty (sentinel).
    /** First barcode matching the value whose branch is one of the active branches (branch-owned). */
    @Query("SELECT pb FROM ProductBarcode pb WHERE pb.barcode = :barcode AND pb.branchId IN :branchIds ORDER BY pb.id ASC")
    List<ProductBarcode> findByBarcodeInBranches(@Param("barcode") String barcode,
                                                 @Param("branchIds") java.util.Collection<Long> branchIds);

    /** First GLOBAL (branch_id IS NULL) barcode matching the value — the fallback. */
    @Query("SELECT pb FROM ProductBarcode pb WHERE pb.barcode = :barcode AND pb.branchId IS NULL ORDER BY pb.id ASC")
    List<ProductBarcode> findGlobalByBarcode(@Param("barcode") String barcode);

    List<ProductBarcode> findByProductId(Long productId);

    List<ProductBarcode> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    boolean existsByBarcode(String barcode);

    boolean existsByBarcodeAndProductIdNot(String barcode, Long productId);

    boolean existsByBarcodeAndProductBrandId(String barcode, Long brandId);

    boolean existsByBarcodeAndProductIdNotAndProductBrandId(String barcode, Long productId, Long brandId);
}