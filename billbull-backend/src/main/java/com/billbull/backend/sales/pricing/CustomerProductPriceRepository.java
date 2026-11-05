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

    /** A customer's mappings (removed ones excluded) — copying a price list. */
    List<CustomerProductPrice> findByCustomerIdAndIsActiveTrue(Long customerId);

    /**
     * The Price Levels workspace list: like {@link #search} but also matching the customer's code or
     * name, filtering by status ({@code ALL}, {@code CURRENT}, {@code FUTURE}, {@code EXPIRED},
     * {@code DISABLED}, {@code LIVE} = current or future) and, optionally, to prices below the
     * product's global cost.
     */
    @Query("SELECT c FROM CustomerProductPrice c WHERE c.isActive = true"
            + " AND (:customerId = -1L OR c.customerId = :customerId)"
            + " AND (:allBranches = true OR c.branchId IS NULL OR c.branchId IN :branchIds)"
            + " AND (:pattern = '%'"
            + "      OR EXISTS (SELECT 1 FROM Product p WHERE p.id = c.productId"
            + "         AND (LOWER(p.code) LIKE :pattern OR LOWER(p.name) LIKE :pattern))"
            + "      OR EXISTS (SELECT 1 FROM Customer cu WHERE cu.id = c.customerId"
            + "         AND (LOWER(cu.code) LIKE :pattern OR LOWER(cu.name) LIKE :pattern)))"
            + " AND (:status = 'ALL'"
            + "      OR (:status = 'DISABLED' AND c.enabled = false)"
            + "      OR (:status = 'CURRENT' AND c.enabled = true AND c.effectiveFrom <= :today"
            + "          AND (c.effectiveTo IS NULL OR c.effectiveTo >= :today))"
            + "      OR (:status = 'FUTURE' AND c.enabled = true AND c.effectiveFrom > :today)"
            + "      OR (:status = 'EXPIRED' AND c.enabled = true AND c.effectiveTo < :today)"
            + "      OR (:status = 'LIVE' AND c.enabled = true AND (c.effectiveTo IS NULL OR c.effectiveTo >= :today)))"
            + " AND (:belowCost = false OR EXISTS (SELECT 1 FROM ProductPricing pp"
            + "      WHERE pp.product.id = c.productId AND pp.cost > 0 AND c.price < pp.cost))")
    Page<CustomerProductPrice> workspaceSearch(@Param("customerId") long customerId,
                                               @Param("allBranches") boolean allBranches,
                                               @Param("branchIds") Collection<Long> branchIds,
                                               @Param("pattern") String pattern,
                                               @Param("status") String status,
                                               @Param("belowCost") boolean belowCost,
                                               @Param("today") LocalDate today,
                                               Pageable pageable);

    /** Live (enabled, not ended) mappings and the distinct customers holding them, within branch scope. */
    @Query("SELECT COUNT(c), COUNT(DISTINCT c.customerId) FROM CustomerProductPrice c WHERE c.isActive = true"
            + " AND c.enabled = true AND (c.effectiveTo IS NULL OR c.effectiveTo >= :today)"
            + " AND (:allBranches = true OR c.branchId IS NULL OR c.branchId IN :branchIds)")
    List<Object[]> liveCounts(@Param("allBranches") boolean allBranches,
                              @Param("branchIds") Collection<Long> branchIds,
                              @Param("today") LocalDate today);

    /** Live mappings priced below the product's global cost, within branch scope. */
    @Query("SELECT COUNT(c) FROM CustomerProductPrice c WHERE c.isActive = true"
            + " AND c.enabled = true AND (c.effectiveTo IS NULL OR c.effectiveTo >= :today)"
            + " AND (:allBranches = true OR c.branchId IS NULL OR c.branchId IN :branchIds)"
            + " AND EXISTS (SELECT 1 FROM ProductPricing pp WHERE pp.product.id = c.productId"
            + "      AND pp.cost > 0 AND c.price < pp.cost)")
    long countLiveBelowCost(@Param("allBranches") boolean allBranches,
                            @Param("branchIds") Collection<Long> branchIds,
                            @Param("today") LocalDate today);

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
