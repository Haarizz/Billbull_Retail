package com.billbull.backend.hr.salarypayments;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, Long> {
    
    // Fetch records for a specific month and year
    List<SalaryPayment> findBySalaryMonthAndSalaryYear(int salaryMonth, int salaryYear);
    
    // Fetch only paid transactions for history view (sorted by date desc)
    List<SalaryPayment> findByStatusOrderByPaymentDateDesc(String status);
    
    // Fetch pending payments for stats
    long countByStatusAndSalaryMonthAndSalaryYear(String status, int salaryMonth, int salaryYear);

    // ✅ NEW: Find pending records for specific employees (Fixes Bulk Payment)
    List<SalaryPayment> findByEmployeeIdInAndStatus(List<String> employeeIds, String status);
}