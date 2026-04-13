package com.billbull.backend.financials.tax;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TaxFilingRepository extends JpaRepository<TaxFiling, Long> {
    List<TaxFiling> findByTaxConfigurationId(Long configId);
}
