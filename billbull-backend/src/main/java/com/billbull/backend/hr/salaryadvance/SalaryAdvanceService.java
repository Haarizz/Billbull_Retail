package com.billbull.backend.hr.salaryadvance;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SalaryAdvanceService {

    @Autowired
    private SalaryAdvanceRepository requestRepo;

    @Autowired
    private RepaymentScheduleRepository scheduleRepo;

    // --- CREATE ---
    public SalaryAdvanceRequest createRequest(SalaryAdvanceRequest request, MultipartFile file) {
        request.setStatus(AdvanceStatus.PENDING_APPROVAL);
        request.setPaidAmount(BigDecimal.ZERO); // Virtual field logic handled in entity or here
        request.setApprovedAmount(BigDecimal.ZERO);
        
        if (file != null && !file.isEmpty()) {
            // In real app, save file to storage (AWS S3 / Local)
            request.setAttachmentFileName(file.getOriginalFilename());
        }
        return requestRepo.save(request);
    }

    // --- FETCH ---
    public List<SalaryAdvanceRequest> getAllRequests() {
        return requestRepo.findAllByOrderByRequestDateDesc();
    }

    public List<RepaymentSchedule> getAllSchedules() {
        return scheduleRepo.findAllByOrderByApprovalDateDesc();
    }

    // --- ACTIONS ---
    @Transactional
    public void approveRequest(Long id) {
        SalaryAdvanceRequest req = requestRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Request not found"));

        // 1. Check if employee already has an ACTIVE schedule
        boolean hasActive = scheduleRepo.existsByEmployeeIdAndStatus(req.getEmployeeId(), AdvanceStatus.ACTIVE);
        if (hasActive) {
            throw new RuntimeException("Action Denied: Employee already has an active repayment schedule.");
        }

        // 2. Update Request
        req.setStatus(AdvanceStatus.ACTIVE);
        req.setApprovedAmount(req.getRequestedAmount()); // Auto-approve requested amount for simplicity
        requestRepo.save(req);

        // 3. Create Schedule
        RepaymentSchedule schedule = new RepaymentSchedule();
        schedule.setRequest(req);
        schedule.setEmployeeId(req.getEmployeeId());
        schedule.setEmployeeName(req.getEmployeeName());
        schedule.setDepartment(req.getDepartment());
        schedule.setType(req.getType());
        
        BigDecimal total = req.getRequestedAmount();
        int months = req.getRepaymentPeriodMonths() > 0 ? req.getRepaymentPeriodMonths() : 1;
        BigDecimal installment = total.divide(BigDecimal.valueOf(months), 0, RoundingMode.HALF_UP);

        schedule.setTotalAmount(total);
        schedule.setPaidAmount(BigDecimal.ZERO);
        schedule.setRemainingAmount(total);
        schedule.setInstallmentAmount(installment);
        schedule.setTotalMonths(months);
        schedule.setStatus(AdvanceStatus.ACTIVE);
        schedule.setNextDeductionDate(LocalDate.now().plusMonths(1).withDayOfMonth(1)); // 1st of next month
        schedule.setApproverName("Admin"); // Mock approver
        schedule.setApprovalDate(LocalDate.now());

        scheduleRepo.save(schedule);
    }

    public void rejectRequest(Long id) {
        SalaryAdvanceRequest req = requestRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Request not found"));
        req.setStatus(AdvanceStatus.REJECTED);
        requestRepo.save(req);
    }

    public void deleteRequest(Long id) {
        requestRepo.deleteById(id);
    }

    // --- REPAYMENT LOGIC ---
    
    @Transactional
    public RepaymentSchedule markInstallmentPaid(Long scheduleId) {
        RepaymentSchedule schedule = scheduleRepo.findById(scheduleId)
                .orElseThrow(() -> new RuntimeException("Schedule not found"));

        if (schedule.getStatus() == AdvanceStatus.COMPLETED) return schedule;

        BigDecimal newPaid = schedule.getPaidAmount().add(schedule.getInstallmentAmount());
        
        // Cap paid at total
        if (newPaid.compareTo(schedule.getTotalAmount()) > 0) {
            newPaid = schedule.getTotalAmount();
        }

        BigDecimal remaining = schedule.getTotalAmount().subtract(newPaid);

        schedule.setPaidAmount(newPaid);
        schedule.setRemainingAmount(remaining);

        // Check Completion
        if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
            schedule.setStatus(AdvanceStatus.COMPLETED);
            // Sync with Request
            SalaryAdvanceRequest req = schedule.getRequest();
            req.setStatus(AdvanceStatus.COMPLETED);
            requestRepo.save(req);
        }

        return scheduleRepo.save(schedule);
    }

    @Transactional
    public RepaymentSchedule revokePayment(Long scheduleId) {
        RepaymentSchedule schedule = scheduleRepo.findById(scheduleId)
                .orElseThrow(() -> new RuntimeException("Schedule not found"));

        if (schedule.getPaidAmount().compareTo(BigDecimal.ZERO) <= 0) return schedule;

        BigDecimal newPaid = schedule.getPaidAmount().subtract(schedule.getInstallmentAmount());
        if (newPaid.compareTo(BigDecimal.ZERO) < 0) newPaid = BigDecimal.ZERO;

        BigDecimal remaining = schedule.getTotalAmount().subtract(newPaid);

        schedule.setPaidAmount(newPaid);
        schedule.setRemainingAmount(remaining);
        
        // If it was completed, reactivate it
        if (schedule.getStatus() == AdvanceStatus.COMPLETED) {
            schedule.setStatus(AdvanceStatus.ACTIVE);
            // Sync Request
            SalaryAdvanceRequest req = schedule.getRequest();
            req.setStatus(AdvanceStatus.ACTIVE);
            requestRepo.save(req);
        }

        return scheduleRepo.save(schedule);
    }

    // --- STATS ---
    public Map<String, Object> getStats() {
        List<RepaymentSchedule> allSchedules = scheduleRepo.findAll();
        List<SalaryAdvanceRequest> allRequests = requestRepo.findAll();

        long activeAdvances = allSchedules.stream()
                .filter(s -> s.getStatus() == AdvanceStatus.ACTIVE).count();

        BigDecimal outstanding = allSchedules.stream()
                .map(RepaymentSchedule::getRemainingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long pendingRequests = allRequests.stream()
                .filter(r -> r.getStatus() == AdvanceStatus.PENDING_APPROVAL).count();

        long approvedThisMonth = allRequests.stream()
                .filter(r -> (r.getStatus() == AdvanceStatus.ACTIVE || r.getStatus() == AdvanceStatus.COMPLETED))
                .filter(r -> r.getRequestDate().getMonth() == LocalDate.now().getMonth())
                .count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("activeAdvances", activeAdvances);
        stats.put("outstandingAmount", outstanding);
        stats.put("pendingRequests", pendingRequests);
        stats.put("approvedThisMonth", approvedThisMonth);
        
        return stats;
    }
}