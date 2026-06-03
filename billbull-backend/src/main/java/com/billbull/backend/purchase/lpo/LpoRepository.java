package com.billbull.backend.purchase.lpo;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LpoRepository extends JpaRepository<Lpo, Long> {

    Optional<Lpo> findByLpoNumber(String lpoNumber);

    List<Lpo> findByStatus(LpoStatus status);

    boolean existsByIdAndStockPostedTrue(Long id);

    boolean existsByVendorCode(String vendorCode);

    /**
     * Branch-scoped, filtered, sorted page of LPOs — all pushed into SQL so only
     * one page of rows is materialised. See {@code BranchAccessService.ListScope}
     * for the {@code allBranches}/{@code branchIds} contract. {@code search} must
     * be lower-cased by the caller; pass {@code ""} for no search.
     */
    @Query("SELECT l FROM Lpo l WHERE "
            + "(:allBranches = true OR l.branchId IS NULL OR l.branchId IN :branchIds) "
            + "AND (:status IS NULL OR l.status = :status) "
            + "AND (:search = '' OR LOWER(l.lpoNumber) LIKE CONCAT('%', :search, '%') "
            + "OR LOWER(l.vendorName) LIKE CONCAT('%', :search, '%')) "
            + "AND (:dateFrom IS NULL OR l.lpoDate >= :dateFrom) "
            + "AND (:dateTo IS NULL OR l.lpoDate <= :dateTo) "
            + "AND (:vendor = '' OR l.vendorName = :vendor OR l.vendorCode = :vendor) "
            + "ORDER BY l.id DESC")
    Page<Lpo> searchPage(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds,
            @Param("status") LpoStatus status,
            @Param("search") String search,
            @Param("dateFrom") java.time.LocalDate dateFrom,
            @Param("dateTo") java.time.LocalDate dateTo,
            @Param("vendor") String vendor,
            Pageable pageable);

    @Query("SELECT l.status, COUNT(l) FROM Lpo l WHERE "
            + "(:allBranches = true OR l.branchId IS NULL OR l.branchId IN :branchIds) "
            + "GROUP BY l.status")
    List<Object[]> countByStatusScoped(@Param("allBranches") boolean allBranches,
            @Param("branchIds") Collection<Long> branchIds);

    @Query("SELECT DISTINCT l FROM Lpo l LEFT JOIN FETCH l.items "
            + "WHERE (:dateFrom IS NULL OR l.lpoDate >= :dateFrom) "
            + "AND (:dateTo IS NULL OR l.lpoDate <= :dateTo) "
            + "ORDER BY l.lpoDate DESC")
    List<Lpo> findForReports(@Param("dateFrom") java.time.LocalDate dateFrom,
            @Param("dateTo") java.time.LocalDate dateTo);
}
