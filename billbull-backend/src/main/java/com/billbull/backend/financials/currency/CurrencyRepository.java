package com.billbull.backend.financials.currency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CurrencyRepository extends JpaRepository<Currency, String> {

    List<Currency> findByIsActiveTrue();

    Optional<Currency> findByIsBaseTrue();
}
