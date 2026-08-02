package com.billbull.backend.pos.admin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PosCashMovementCategoryRepository extends JpaRepository<PosCashMovementCategory, Long> {

    boolean existsByCodeIgnoreCase(String code);
    boolean existsByCodeIgnoreCaseAndIdNot(String code, Long id);

    /** Phase 5 dashboard "Categories Used" stat. */
    long countByIsActiveTrue();

    boolean existsByNameIgnoreCaseAndIsActiveTrue(String name);
    boolean existsByNameIgnoreCaseAndIsActiveTrueAndIdNot(String name, Long id);

    /** Enterprise master-data list/filter — every filter optional (null = don't filter). */
    @Query("SELECT c FROM PosCashMovementCategory c WHERE "
            + "(:active IS NULL OR c.isActive = :active) AND "
            + "(:movementType IS NULL OR c.movementType = :movementType OR c.movementType = 'BOTH') AND "
            + "(CAST(:search AS string) IS NULL OR LOWER(c.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) "
            + "     OR LOWER(c.code) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))) "
            + "ORDER BY c.displayOrder ASC, c.name ASC")
    Page<PosCashMovementCategory> search(@Param("active") Boolean active,
                                          @Param("movementType") PosCashMovementCategoryMovementType movementType,
                                          @Param("search") String search,
                                          Pageable pageable);

    /** Active categories usable when creating a cash movement of the given direction — backs
     *  the lightweight "selectable" lookup consumed by the POS Cash Drop/Out dialogs. */
    @Query("SELECT c FROM PosCashMovementCategory c WHERE c.isActive = true AND "
            + "(c.movementType = :movementType OR c.movementType = 'BOTH') "
            + "ORDER BY c.displayOrder ASC, c.name ASC")
    java.util.List<PosCashMovementCategory> findSelectable(@Param("movementType") PosCashMovementCategoryMovementType movementType);
}
