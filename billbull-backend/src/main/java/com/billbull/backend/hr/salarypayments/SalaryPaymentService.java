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

    @Autowired
    private com.billbull.backend.financials.generalledger.postingengine.PostingEngineService postingEngineService;

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

        SalaryPayment saved = repository.save(record);

        // GL: Dr Salary Expense / Cr Salary Payable / Cr Deductions (PDF §13 / Phase 6.1)
        postPayrollJournal(saved);

        // GL: Dr Salary Payable / Cr Bank — WPS single payment (Phase 6.3)
        BigDecimal net = saved.getNetPayable() != null ? saved.getNetPayable() : BigDecimal.ZERO;
        if (net.compareTo(BigDecimal.ZERO) > 0) {
            postingEngineService.createJournalFromWpsDisbursement(
                    "SINGLE-" + saved.getId(),
                    saved.getEmployeeName() + "-" + saved.getSalaryYear() + "/" + String.format("%02d", saved.getSalaryMonth()),
                    net,
                    saved.getPaymentDate() != null ? saved.getPaymentDate() : java.time.LocalDate.now());
        }

        return saved;
    }

    private void postPayrollJournal(SalaryPayment p) {
        BigDecimal base   = p.getBaseSalary()  != null ? p.getBaseSalary()  : BigDecimal.ZERO;
        BigDecimal allow  = p.getAllowances()   != null ? p.getAllowances()   : BigDecimal.ZERO;
        BigDecimal ded    = p.getDeductions()   != null ? p.getDeductions()   : BigDecimal.ZERO;
        BigDecimal net    = p.getNetPayable()   != null ? p.getNetPayable()   : BigDecimal.ZERO;
        BigDecimal gross  = base.add(allow);
        postingEngineService.createJournalFromPayrollRun(
                p.getEmployeeId(),
                p.getEmployeeName() != null ? p.getEmployeeName() : p.getEmployeeId(),
                gross, net,
                BigDecimal.ZERO, // advance deduction tracked separately via SalaryAdvanceService
                ded,
                p.getSalaryYear(),
                p.getSalaryMonth(),
                p.getDepartment(), // cost center = department
                p.getPaymentDate() != null ? p.getPaymentDate() : java.time.LocalDate.now());
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

        java.time.LocalDate payDate = req.getDate() != null ? req.getDate() : java.time.LocalDate.now();
        BigDecimal totalNet = BigDecimal.ZERO;

        for (SalaryPayment p : toPay) {
            p.setStatus("Paid");
            p.setPaymentMethod(req.getPaymentMethod());
            p.setPaymentDate(payDate);
            BigDecimal net = p.getNetPayable() != null ? p.getNetPayable() : BigDecimal.ZERO;
            totalNet = totalNet.add(net);
        }

        repository.saveAll(toPay);

        // GL: individual salary JVs per employee (PDF §13 / Phase 6.1)
        for (SalaryPayment p : toPay) {
            postPayrollJournal(p);
        }

        // GL: single WPS entry for the batch total (Phase 6.3)
        if (totalNet.compareTo(BigDecimal.ZERO) > 0 && !toPay.isEmpty()) {
            SalaryPayment first = toPay.get(0);
            String runId = "BULK-" + first.getSalaryYear() + "-" + String.format("%02d", first.getSalaryMonth());
            String periodLabel = first.getSalaryYear() + "/" + String.format("%02d", first.getSalaryMonth());
            postingEngineService.createJournalFromWpsDisbursement(runId, periodLabel, totalNet, payDate);
        }
    }
}