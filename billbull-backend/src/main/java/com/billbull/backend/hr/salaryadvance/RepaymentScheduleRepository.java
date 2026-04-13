package com.billbull.backend.hr.salaryadvance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface RepaymentScheduleRepository extends JpaRepository<RepaymentSchedule, Long> {
    
    List<RepaymentSchedule> findAllByOrderByApprovalDateDesc();

    // To check for existing active loans
    boolean existsByEmployeeIdAndStatus(String employeeId, AdvanceStatus status);
}