package com.billbull.backend.hr.salarypayments;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SalaryPaymentService {

    private static final String PAID = "Paid";
    private static final String PENDING = "Pending";

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
        int month = req.getMonth() > 0 ? req.getMonth() : java.time.LocalDate.now().getMonthValue();
        int year = req.getYear() > 0 ? req.getYear() : java.time.LocalDate.now().getYear();

        // Payroll is one line per employee per period. A second row is what made
        // duplicate payment possible in the first place: the employee showed up
        // twice in the list, once Paid and once still Pending.
        repository.findByEmployeeIdAndSalaryMonthAndSalaryYear(req.getEmployeeId(), month, year)
                .stream().findFirst()
                .ifPresent(existing -> {
                    throw new IllegalStateException(
                            "A salary record for " + req.getEmployeeId() + " already exists for "
                                    + periodLabel(month, year) + " (status: " + existing.getStatus()
                                    + "). Edit that record instead of adding another.");
                });

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
        
        payment.setStatus(PENDING);
        payment.setSalaryMonth(month);
        payment.setSalaryYear(year);

        SalaryPayment saved = repository.save(payment);

        // GL accrual, posted now rather than at payment time: Dr Salary Expense /
        // Cr Salary Payable (2200) / Cr Deductions. This is what makes the Salary
        // Payable balance equal the outstanding (Pending) payroll — previously the
        // accrual and the disbursement were both posted at payment, so they
        // cancelled out and 2200 sat at zero no matter how much was owed.
        postPayrollAccrual(saved, java.time.LocalDate.now());

        return saved;
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
            List<SalaryPayment> pending = repository.findByEmployeeIdInAndStatus(ids, PENDING);
            
            if (!pending.isEmpty()) {
                record = pending.get(0);
            } else {
                throw new RuntimeException("No Pending Payment record found for: " + req.getEmployeeId());
            }
        }

        guardAgainstDuplicatePayment(record);

        record.setStatus(PAID);
        record.setPaymentMethod(req.getPaymentMethod());
        record.setPaymentDate(req.getDate());

        SalaryPayment saved = repository.save(record);

        // Backfill only. Records created before the accrual moved to record
        // creation have no accrual posted, and disbursing without one would drive
        // Salary Payable negative. The posting engine keys the payroll journal on
        // PAYROLL-{employee}-{year}-{month} and returns the existing entry for a
        // repeat reference, so for records accrued at creation this is a no-op.
        postPayrollAccrual(saved, saved.getPaymentDate());

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

    /**
     * Refuses to pay a salary line twice for the same employee and period.
     *
     * Two ways it could happen: the record itself is already Paid (a stale list
     * or a double-click), or a *different* row exists for the same employee and
     * period that is already Paid (the duplicate-row case). Both matter beyond
     * the extra disbursement — paying again re-posts the payroll journal and a
     * second WPS disbursement, double-counting salary expense and the bank
     * credit in the GL.
     */
    private void guardAgainstDuplicatePayment(SalaryPayment record) {
        String period = periodLabel(record.getSalaryMonth(), record.getSalaryYear());

        if (PAID.equals(record.getStatus())) {
            throw new IllegalStateException(
                    "This salary record is already marked Paid for " + period
                            + (record.getPaymentDate() != null ? " (paid on " + record.getPaymentDate() + ")" : "")
                            + ".");
        }

        boolean alreadyPaidElsewhere = repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus(
                record.getEmployeeId(), record.getSalaryMonth(), record.getSalaryYear(), PAID);
        if (alreadyPaidElsewhere) {
            throw new IllegalStateException(
                    "Employee " + record.getEmployeeId() + " has already been paid for " + period
                            + " on another record. Remove the duplicate row instead of paying it.");
        }
    }

    private static String periodLabel(int month, int year) {
        if (month < 1 || month > 12) {
            return String.valueOf(year);
        }
        return java.time.Month.of(month).getDisplayName(
                java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + year;
    }

    /**
     * Dr Salary Expense / Cr Salary Payable (+ deductions) for one payroll line.
     *
     * Idempotent per employee and period via the posting engine's reference key,
     * so it is safe to call from both the creation and the payment path.
     */
    private void postPayrollAccrual(SalaryPayment p, java.time.LocalDate accrualDate) {
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
                accrualDate != null ? accrualDate : java.time.LocalDate.now());
    }

    @Transactional
    public String processBulkPayment(BulkPaymentRequest req) {
        int month = req.getMonth() > 0 ? req.getMonth() : java.time.LocalDate.now().getMonthValue();
        int year = req.getYear() > 0 ? req.getYear() : java.time.LocalDate.now().getYear();

        // Scoped to the period the run was launched for. Searching by employee +
        // "Pending" alone swept in every unpaid period an employee had, paying
        // months the operator never selected.
        List<SalaryPayment> candidates = repository.findByEmployeeIdInAndStatusAndSalaryMonthAndSalaryYear(
                req.getEmployeeIds(), PENDING, month, year);

        // Drop anyone already paid for this period on another row — same guard as
        // the single payment path, so a duplicate row cannot slip through in bulk.
        List<String> skipped = candidates.stream()
                .filter(p -> repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus(
                        p.getEmployeeId(), month, year, PAID))
                .map(SalaryPayment::getEmployeeId)
                .distinct()
                .collect(Collectors.toList());

        List<SalaryPayment> toPay = candidates.stream()
                .filter(p -> !skipped.contains(p.getEmployeeId()))
                .collect(Collectors.toList());

        if (toPay.isEmpty()) {
            return skipped.isEmpty()
                    ? "No pending salary records found for " + periodLabel(month, year) + "."
                    : "No payment made — " + String.join(", ", skipped)
                            + " already paid for " + periodLabel(month, year) + ".";
        }

        java.time.LocalDate payDate = req.getDate() != null ? req.getDate() : java.time.LocalDate.now();
        BigDecimal totalNet = BigDecimal.ZERO;

        for (SalaryPayment p : toPay) {
            p.setStatus(PAID);
            p.setPaymentMethod(req.getPaymentMethod());
            p.setPaymentDate(payDate);
            BigDecimal net = p.getNetPayable() != null ? p.getNetPayable() : BigDecimal.ZERO;
            totalNet = totalNet.add(net);
        }

        repository.saveAll(toPay);

        // Backfill for records accrued before the accrual moved to creation time;
        // a no-op for anything already accrued (see postPayrollAccrual).
        for (SalaryPayment p : toPay) {
            postPayrollAccrual(p, payDate);
        }

        // GL: single WPS entry for the batch total (Phase 6.3)
        if (totalNet.compareTo(BigDecimal.ZERO) > 0 && !toPay.isEmpty()) {
            SalaryPayment first = toPay.get(0);
            String runId = "BULK-" + first.getSalaryYear() + "-" + String.format("%02d", first.getSalaryMonth());
            String periodLabel = first.getSalaryYear() + "/" + String.format("%02d", first.getSalaryMonth());
            postingEngineService.createJournalFromWpsDisbursement(runId, periodLabel, totalNet, payDate);
        }

        String message = "Paid " + toPay.size() + " salary record"
                + (toPay.size() == 1 ? "" : "s") + " for " + periodLabel(month, year) + ".";
        if (!skipped.isEmpty()) {
            message += " Skipped " + String.join(", ", skipped) + " — already paid for this period.";
        }
        return message;
    }
}