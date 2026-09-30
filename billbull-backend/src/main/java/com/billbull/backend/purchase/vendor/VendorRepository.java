package com.billbull.backend.purchase.vendor;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface VendorRepository extends JpaRepository<Vendor, Long> {

    List<Vendor> findByIsActiveTrue();

    Optional<Vendor> findByName(String name);

    Optional<Vendor> findByCode(String code);

    /**
     * Typeahead search for the global search modal. Returns a constructor
     * projection rather than entities so a keystroke never hydrates a Vendor
     * (with its branch-allocation collection) and the row count is capped by the
     * database via {@code Pageable}, not in memory.
     *
     * <p>Matches the identification fields only — name, code, email, contact,
     * mobile, phone and tax id. Bank details are neither searched nor returned.
     * Scoped to active vendors, the same population the list endpoint serves.
     *
     * <p>Branch-scoped server-side. {@code allBranches = true} applies no branch
     * predicate; otherwise a vendor is in scope when its own branch is in
     * {@code branchIds}, when any of its branch allocations is, or when it carries no
     * branch attribution at all (legacy rows stay visible, as elsewhere). The allocation
     * clause matters: a vendor's {@code branch} FK is only its default, and a vendor
     * allocated to the caller's branch must not vanish because its default is elsewhere.
     * The scope comes from {@code BranchAccessService.currentSearchScope()}; this query
     * never looks at a role.
     */
    @Query("SELECT new com.billbull.backend.purchase.vendor.VendorSearchResponse("
            + "v.id, v.code, v.name, v.email, v.contact, v.mobile, v.status, b.name) "
            + "FROM Vendor v LEFT JOIN v.branch b "
            + "WHERE v.isActive = true AND ("
            + "  LOWER(v.name) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "  OR LOWER(v.code) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "  OR LOWER(v.email) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "  OR LOWER(v.contact) LIKE LOWER(CONCAT('%', :q, '%')) "
            + "  OR v.mobile LIKE CONCAT('%', :q, '%') "
            + "  OR v.primaryPhone LIKE CONCAT('%', :q, '%') "
            + "  OR LOWER(v.taxId) LIKE LOWER(CONCAT('%', :q, '%'))) "
            + "AND (:allBranches = TRUE OR b.id IS NULL OR b.id IN :branchIds "
            + "  OR EXISTS (SELECT 1 FROM VendorBranchAllocation a "
            + "             WHERE a.vendor = v AND a.branch.id IN :branchIds)) "
            + "ORDER BY v.name ASC, v.code ASC")
    List<VendorSearchResponse> searchVendors(@Param("q") String q,
            @Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds,
            Pageable pageable);

    /**
     * The first few vendors, for the global search modal's empty-query preview.
     *
     * <p>Same projection, same branch predicate and same ordering as
     * {@link #searchVendors}, with the match clause dropped rather than matched against
     * an empty string — a vendor with a null name would fall out of a {@code LIKE '%%'}
     * chain, and the preview is meant to be the head of the list, not the head of what
     * happens to be non-null. The row cap is applied by the database via {@code Pageable}.
     */
    @Query("SELECT new com.billbull.backend.purchase.vendor.VendorSearchResponse("
            + "v.id, v.code, v.name, v.email, v.contact, v.mobile, v.status, b.name) "
            + "FROM Vendor v LEFT JOIN v.branch b "
            + "WHERE v.isActive = true "
            + "AND (:allBranches = TRUE OR b.id IS NULL OR b.id IN :branchIds "
            + "  OR EXISTS (SELECT 1 FROM VendorBranchAllocation a "
            + "             WHERE a.vendor = v AND a.branch.id IN :branchIds)) "
            + "ORDER BY v.name ASC, v.code ASC")
    List<VendorSearchResponse> previewVendors(@Param("allBranches") boolean allBranches,
            @Param("branchIds") java.util.Collection<Long> branchIds,
            Pageable pageable);
}
