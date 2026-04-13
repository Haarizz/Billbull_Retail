package com.billbull.backend.financials.tax;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TaxConfigurationRepository extends JpaRepository<TaxConfiguration, Long> {
}
