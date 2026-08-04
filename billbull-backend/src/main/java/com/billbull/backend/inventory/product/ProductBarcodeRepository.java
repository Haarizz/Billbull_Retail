package com.billbull.backend.inventory.product;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductBarcodeRepository extends JpaRepository<ProductBarcode, Long> {

    // Scan resolution must tolerate the same drift the grid's LIKE-based search already tolerates
    // (case, and stray leading/trailing whitespace picked up from imports/manual entry) — otherwise
    // a barcode shows up in the loose text search but the exact-match scanner resolver misses it.
    // TRIM+LOWER both sides so DB-side whitespace/case noise never breaks an otherwise-correct scan.
    @Query("SELECT pb FROM ProductBarcode pb WHERE LOWER(TRIM(pb.barcode)) = LOWER(TRIM(:barcode)) ORDER BY pb.id ASC")
    List<ProductBarcode> findAllByBarcodeNormalized(@Param("barcode") String barcode);

    default java.util.Optional<ProductBarcode> findFirstByBarcode(String barcode) {
        List<ProductBarcode> hits = findAllByBarcodeNormalized(barcode);
        return hits.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(hits.get(0));
    }

    // ===== Branch-Level Inventory Phase 9A — branch-first, global-fallback resolution. Used only
    // when inventory.branch-scope.enabled is on + a branch is active; the plain findFirstByBarcode
    // above remains the toggle-off / admin path (byte-identical). branchIds never empty (sentinel).
    /** First barcode matching the value whose branch is one of the active branches (branch-owned). */
    @Query("SELECT pb FROM ProductBarcode pb WHERE LOWER(TRIM(pb.barcode)) = LOWER(TRIM(:barcode)) AND pb.branchId IN :branchIds ORDER BY pb.id ASC")
    List<ProductBarcode> findByBarcodeInBranches(@Param("barcode") String barcode,
                                                 @Param("branchIds") java.util.Collection<Long> branchIds);

    /** First GLOBAL (branch_id IS NULL) barcode matching the value — the fallback. */
    @Query("SELECT pb FROM ProductBarcode pb WHERE LOWER(TRIM(pb.barcode)) = LOWER(TRIM(:barcode)) AND pb.branchId IS NULL ORDER BY pb.id ASC")
    List<ProductBarcode> findGlobalByBarcode(@Param("barcode") String barcode);

    List<ProductBarcode> findByProductId(Long productId);

    List<ProductBarcode> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    boolean existsByBarcode(String barcode);

    boolean existsByBarcodeAndProductIdNot(String barcode, Long productId);

    boolean existsByBarcodeAndProductBrandId(String barcode, Long brandId);

    boolean existsByBarcodeAndProductIdNotAndProductBrandId(String barcode, Long productId, Long brandId);
}