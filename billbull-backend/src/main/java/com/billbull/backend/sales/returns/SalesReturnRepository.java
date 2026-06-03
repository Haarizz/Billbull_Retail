package com.billbull.backend.sales.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface SalesReturnRepository extends JpaRepository<SalesReturn, Long> {

    Optional<SalesReturn> findByReturnNumber(String returnNumber);

    Optional<SalesReturn> findTopByOrderByReturnNumberDesc();

    List<SalesReturn> findByReturnDateBetween(LocalDate from, LocalDate to);

    boolean existsByReturnNumber(String returnNumber);

    @Query("SELECT r.returnNumber FROM SalesReturn r WHERE r.returnNumber LIKE CONCAT(:prefix, '%')")
    List<String> findReturnNumbersByPrefix(@Param("prefix") String prefix);

    @Query("SELECT SUM(r.totalAmount) FROM SalesReturn r WHERE r.returnDate = :date")
    Double getTotalReturnsForDate(@Param("date") LocalDate date);

    @Query("SELECT SUM(r.totalAmount) FROM SalesReturn r WHERE r.returnDate BETWEEN :startDate AND :endDate")
    Double getTotalReturnsBetweenDates(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT SUM(r.totalAmount) FROM SalesReturn r WHERE r.status = 'APPROVED'")
    Double getTotalApprovedReturns();

    /** Sales-report loader: date-bounded returns with line items fetched in one query. */
    @Query("SELECT DISTINCT r FROM SalesReturn r LEFT JOIN FETCH r.items "
            + "WHERE (:dateFrom IS NULL OR r.returnDate >= :dateFrom) "
            + "AND (:dateTo IS NULL OR r.returnDate <= :dateTo)")
    List<SalesReturn> findForReports(@Param("dateFrom") LocalDate dateFrom,
            @Param("dateTo") LocalDate dateTo);
}
