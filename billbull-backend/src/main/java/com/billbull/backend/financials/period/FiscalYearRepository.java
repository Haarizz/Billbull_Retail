package com.billbull.backend.financials.period;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface FiscalYearRepository extends JpaRepository<FiscalYear, Long> {

    Optional<FiscalYear> findByCode(String code);

    List<FiscalYear> findAllByOrderByStartDateDesc();

    List<FiscalYear> findByStatusOrderByStartDateDesc(String status);

    @Query("SELECT fy FROM FiscalYear fy WHERE :date BETWEEN fy.startDate AND fy.endDate ORDER BY fy.startDate DESC")
    List<FiscalYear> findCovering(@Param("date") LocalDate date);

    boolean existsByCode(String code);
}
