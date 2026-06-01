package com.billbull.backend.financials.period;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.List;

public interface AccountingPeriodRepository extends JpaRepository<AccountingPeriod, Long> {

    List<AccountingPeriod> findByStatusOrderByStartDateDesc(String status);

    List<AccountingPeriod> findAllByOrderByStartDateDesc();

    /**
     * Check if a given date falls within any closed period.
     */
    @Query("SELECT COUNT(p) > 0 FROM AccountingPeriod p WHERE p.status = 'Closed' AND :date BETWEEN p.startDate AND p.endDate")
    boolean existsClosedPeriodContainingDate(@Param("date") LocalDate date);

    /**
     * All periods whose range covers the given date, newest first. Normally a
     * single period; multiple only if overlapping ranges were configured.
     */
    @Query("SELECT p FROM AccountingPeriod p WHERE :date BETWEEN p.startDate AND p.endDate ORDER BY p.startDate DESC")
    List<AccountingPeriod> findCoveringPeriods(@Param("date") LocalDate date);
}
