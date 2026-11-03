package com.billbull.backend.sales.pricing;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerProductPriceRepository extends JpaRepository<CustomerProductPrice, Long> {

    /** One customer's mappings (removed ones excluded) for a set of products: the resolver's single cart query. */
    List<CustomerProductPrice> findByCustomerIdAndProductIdInAndIsActiveTrue(Long customerId, Collection<Long> productIds);

    List<CustomerProductPrice> findByCustomerIdAndProductIdAndIsActiveTrue(Long customerId, Long productId);

    long countByCustomerIdAndIsActiveTrueAndEnabledTrue(Long customerId);

    /**
     * A page of mappings (removed ones excluded), optionally for one customer, matching a product
     * code/name pattern, limited to rows the caller's branches may see. {@code currentOnly} keeps
     * the rows that apply on {@code today}.
     */
    @Query("SELECT c FROM CustomerProductPrice c WHERE c.isActive = true"
            + " AND (:customerId = -1L OR c.customerId = :customerId)"
            + " AND (:allBranches = true OR c.branchId IS NULL OR c.branchId IN :branchIds)"
            + " AND (:pattern = '%' OR EXISTS (SELECT 1 FROM Product p WHERE p.id = c.productId"
            + "      AND (LOWER(p.code) LIKE :pattern OR LOWER(p.name) LIKE :pattern)))"
            + " AND (:currentOnly = false OR (c.enabled = true AND c.effectiveFrom <= :today"
            + "      AND (c.effectiveTo IS NULL OR c.effectiveTo >= :today)))")
    Page<CustomerProductPrice> search(@Param("customerId") long customerId,
                                      @Param("allBranches") boolean allBranches,
                                      @Param("branchIds") Collection<Long> branchIds,
                                      @Param("pattern") String pattern,
                                      @Param("currentOnly") boolean currentOnly,
                                      @Param("today") LocalDate today,
                                      Pageable pageable);

    /**
     * Locks the customer row so concurrent writes of the same customer's mappings serialize and the
     * overlap check can't race (the database exclusion constraint backs it up where installed).
     */
    @Query(value = "SELECT id FROM customers WHERE id = :customerId FOR UPDATE", nativeQuery = true)
    List<Long> lockCustomer(@Param("customerId") Long customerId);
}
