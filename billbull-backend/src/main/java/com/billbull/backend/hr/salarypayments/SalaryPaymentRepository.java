package com.billbull.backend.hr.salarypayments;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

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

    // One payroll line per employee per period — these back the duplicate-payment
    // guards in SalaryPaymentService.
    List<SalaryPayment> findByEmployeeIdAndSalaryMonthAndSalaryYear(
            String employeeId, int salaryMonth, int salaryYear);

    boolean existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus(
            String employeeId, int salaryMonth, int salaryYear, String status);

    // One employee's lines for a year — backs the global search payroll summary.
    List<SalaryPayment> findByEmployeeIdAndSalaryYear(String employeeId, int salaryYear);

    Optional<SalaryPayment> findFirstByEmployeeIdAndStatusOrderBySalaryYearDescSalaryMonthDesc(
            String employeeId, String status);

    // Bulk payment must stay inside the period it was launched for.
    List<SalaryPayment> findByEmployeeIdInAndStatusAndSalaryMonthAndSalaryYear(
            List<String> employeeIds, String status, int salaryMonth, int salaryYear);
}