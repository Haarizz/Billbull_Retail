package com.billbull.backend.inventory.product;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductPriceChangeRepository extends JpaRepository<ProductPriceChange, Long> {

    /**
     * Price changes in a window, newest first. The range is pushed into SQL (and {@code Pageable}
     * caps the result) so the audit report never has to load the whole catalogue to show a day's
     * worth of edits.
     *
     * <p>The optional bounds are written {@code CAST(:param AS timestamp) IS NULL}, not a bare
     * {@code :param IS NULL}. Hibernate renders the bare form as {@code ? is null}, and because
     * Hibernate binds java.time values without a concrete type OID, PostgreSQL has nothing to
     * infer that placeholder's type from and rejects the whole statement at parse time with
     * "could not determine data type of parameter $1" — whatever dates the caller passes, so the
     * report never loaded at all. Same defect and same remedy as {@code LpoRepository.search};
     * note the sibling {@code :status IS NULL} style predicates there are fine, because non
     * temporal types do bind with a concrete OID.
     */
    @Query("SELECT c FROM ProductPriceChange c "
            + "WHERE c.isActive = true "
            + "AND (CAST(:from AS timestamp) IS NULL OR c.createdAt >= :from) "
            + "AND (CAST(:to AS timestamp) IS NULL OR c.createdAt <= :to) "
            + "ORDER BY c.createdAt DESC")
    List<ProductPriceChange> findInRange(@Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            Pageable pageable);

    /** Same window, restricted to products in the given branch scope (global products included). */
    @Query("SELECT c FROM ProductPriceChange c, Product p "
            + "WHERE p.id = c.productId "
            + "AND c.isActive = true "
            + "AND (p.branch IS NULL OR p.branch.id IN :scope) "
            + "AND (CAST(:from AS timestamp) IS NULL OR c.createdAt >= :from) "
            + "AND (CAST(:to AS timestamp) IS NULL OR c.createdAt <= :to) "
            + "ORDER BY c.createdAt DESC")
    List<ProductPriceChange> findInRangeInBranchScope(@Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("scope") Collection<Long> scope,
            Pageable pageable);
}
