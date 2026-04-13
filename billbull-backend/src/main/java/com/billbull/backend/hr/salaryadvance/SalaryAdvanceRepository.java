package com.billbull.backend.hr.salaryadvance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface SalaryAdvanceRepository extends JpaRepository<SalaryAdvanceRequest, Long> {
    List<SalaryAdvanceRequest> findAllByOrderByRequestDateDesc();
}