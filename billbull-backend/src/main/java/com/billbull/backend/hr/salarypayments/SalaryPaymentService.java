package com.billbull.backend.hr.salarypayments;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SalaryPaymentService {

    @Autowired
    private SalaryPaymentRepository repository;

    // --- Fetch Lists ---

    public List<SalaryPayment> getPayrollList(int month, int year) {
        return repository.findBySalaryMonthAndSalaryYear(month, year);
    }

    public List<SalaryPayment> getTransactionHistory() {
        return repository.findByStatusOrderByPaymentDateDesc("Paid");
    }

    public PayrollStatsDTO getPayrollStats(int month, int year) {
        List<SalaryPayment> allRecords = repository.findBySalaryMonthAndSalaryYear(month, year);

        long totalEmployees = allRecords.size();
        BigDecimal totalPayable = allRecords.stream()
                .map(SalaryPayment::getNetPayable)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        long paidCount = allRecords.stream().filter(p -> "Paid".equals(p.getStatus())).count();
        long pendingCount = allRecords.stream().filter(p -> !"Paid".equals(p.getStatus())).count();

        PayrollStatsDTO stats = new PayrollStatsDTO();
        stats.setTotalEmployees(totalEmployees);
        stats.setTotalPayable(totalPayable);
        stats.setPaidCount(paidCount);
        stats.setPendingCount(pendingCount);
        
        return stats;
    }

    // --- Create / Update ---

    public SalaryPayment createPaymentRecord(SalaryPaymentRequest req) {
        SalaryPayment payment = new SalaryPayment();
        payment.setEmployeeId(req.getEmployeeId()); // Stores "EMP001"
        payment.setEmployeeName(req.getName());
        payment.setDepartment(req.getDept());
        payment.setDesignation(req.getRole());
        payment.setBaseSalary(req.getBase());
        payment.setAllowances(req.getAllow());
        payment.setDeductions(req.getDeduct());
        
        // Calculate Net
        BigDecimal net = req.getBase().add(req.getAllow()).subtract(req.getDeduct());
        payment.setNetPayable(net);
        
        payment.setStatus("Pending");
        
        // Default to current date if 0 provided
        int m = req.getMonth() > 0 ? req.getMonth() : java.time.LocalDate.now().getMonthValue();
        int y = req.getYear() > 0 ? req.getYear() : java.time.LocalDate.now().getYear();
        
        payment.setSalaryMonth(m);
        payment.setSalaryYear(y);

        return repository.save(payment);
    }

    @Transactional
    public SalaryPayment processSinglePayment(ProcessPaymentRequest req) {
        SalaryPayment record = null;

        // 1. Try finding by Record ID (Primary Key)
        if (req.getRecordId() != null) {
            record = repository.findById(req.getRecordId()).orElse(null);
        }

        // 2. If not found by ID, Fallback to search by Employee Code + Status
        if (record == null) {
            // Find any PENDING record for this employee
            List<String> ids = List.of(req.getEmployeeId());
            List<SalaryPayment> pending = repository.findByEmployeeIdInAndStatus(ids, "Pending");
            
            if (!pending.isEmpty()) {
                record = pending.get(0);
            } else {
                throw new RuntimeException("No Pending Payment record found for: " + req.getEmployeeId());
            }
        }

        record.setStatus("Paid");
        record.setPaymentMethod(req.getPaymentMethod());
        record.setPaymentDate(req.getDate());

        return repository.save(record);
    }

    @Transactional
    public void processBulkPayment(BulkPaymentRequest req) {
        // ✅ FIX: Instead of searching by Month/Year (which might default to wrong date),
        // we search for records matching the provided Employee Codes that are "Pending".
        
        List<SalaryPayment> toPay = repository.findByEmployeeIdInAndStatus(
            req.getEmployeeIds(), 
            "Pending"
        );

        if (toPay.isEmpty()) {
            System.out.println("No pending records found for the selected employees.");
            return;
        }

        for (SalaryPayment p : toPay) {
            p.setStatus("Paid");
            p.setPaymentMethod(req.getPaymentMethod());
            p.setPaymentDate(req.getDate());
        }

        repository.saveAll(toPay);
    }
}