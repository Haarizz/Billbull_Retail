package com.billbull.backend.financials.chartofaccounts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CostCenterRepository extends JpaRepository<CostCenter, String> {

    // Find cost center by unique code (e.g. "CC-001")
    CostCenter findByCode(String code);
}
