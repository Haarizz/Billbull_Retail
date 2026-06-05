package com.billbull.backend.financials.currency;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;

public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, Long> {

    /** Most recent rate on or before the given date. */
    @Query("SELECT r FROM ExchangeRate r WHERE r.fromCurrency = :from AND r.toCurrency = :to AND r.rateDate <= :date ORDER BY r.rateDate DESC")
    Optional<ExchangeRate> findLatestOnOrBefore(
            @Param("from") String from,
            @Param("to") String to,
            @Param("date") LocalDate date);
}
