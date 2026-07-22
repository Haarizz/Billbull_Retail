package com.billbull.backend.pos.layaway;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface PosLayawayRepository extends JpaRepository<PosLayaway, Long> {

    Optional<PosLayaway> findByLayawayNumber(String layawayNumber);

    /** Open layaways whose due date has passed — expiry-release sweep candidates. */
    @Query("""
            SELECT l FROM PosLayaway l
            WHERE l.dueDate IS NOT NULL AND l.dueDate < :today
              AND l.status IN (com.billbull.backend.pos.layaway.PosLayawayStatus.ACTIVE,
                                com.billbull.backend.pos.layaway.PosLayawayStatus.PARTIALLY_PAID,
                                com.billbull.backend.pos.layaway.PosLayawayStatus.READY_TO_CONVERT)
            """)
    List<PosLayaway> findOverdueOpenLayaways(@Param("today") LocalDate today);

    @Query("SELECT MAX(l.layawayNumber) FROM PosLayaway l")
    String findMaxLayawayNumber();

    /**
     * Filtered list for the Layaways modal. Every filter is optional (null = ignore).
     * Branch is matched when supplied so each terminal sees its own branch's layaways.
     *
     * Native query so each optional param can be CAST at every occurrence — an
     * untyped null bind in PostgreSQL resolves to bytea and breaks LOWER()/LIKE
     * (see StockMovementRepository for the same pattern). {@code status} is the
     * enum name (String); the caller lowercases {@code customer}/{@code number}
     * so only the columns are lowered here.
     */
    @Query(value = """
            SELECT * FROM pos_layaways pl
            WHERE (CAST(:branchId AS bigint) IS NULL OR pl.branch_id = CAST(:branchId AS bigint))
              AND (CAST(:status AS varchar) IS NULL OR pl.status = CAST(:status AS varchar))
              AND (CAST(:customer AS varchar) IS NULL
                   OR LOWER(pl.customer_name) LIKE CONCAT('%', CAST(:customer AS varchar), '%')
                   OR LOWER(pl.customer_phone) LIKE CONCAT('%', CAST(:customer AS varchar), '%'))
              AND (CAST(:number AS varchar) IS NULL
                   OR LOWER(pl.layaway_number) LIKE CONCAT('%', CAST(:number AS varchar), '%'))
            ORDER BY pl.created_at DESC
            """, nativeQuery = true)
    List<PosLayaway> search(
            @Param("branchId") Long branchId,
            @Param("status") String status,
            @Param("customer") String customer,
            @Param("number") String number,
            Pageable pageable);
}
