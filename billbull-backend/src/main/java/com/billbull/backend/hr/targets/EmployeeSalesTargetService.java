package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.EmployeeRepository;

/**
 * Create/update of employee monthly targets. Validation lives here, not in the controller, so the
 * bulk endpoint and the single-row endpoint cannot drift apart.
 */
@Service
public class EmployeeSalesTargetService {

    private static final BigDecimal MAX_RATE = new BigDecimal("100");

    private final EmployeeSalesTargetRepository targetRepository;
    private final EmployeeRepository employeeRepository;

    public EmployeeSalesTargetService(EmployeeSalesTargetRepository targetRepository,
                                      EmployeeRepository employeeRepository) {
        this.targetRepository = targetRepository;
        this.employeeRepository = employeeRepository;
    }

    /** Normalises any date inside a month to that month's first day. */
    public static LocalDate normalizeMonth(LocalDate month) {
        if (month == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target month is required.");
        }
        return month.withDayOfMonth(1);
    }

    public List<EmployeeSalesTarget> findForMonth(LocalDate month) {
        return targetRepository.findByTargetMonth(normalizeMonth(month));
    }

    public EmployeeSalesTarget findForEmployeeAndMonth(Long employeeId, LocalDate month) {
        if (employeeId == null) return null;
        return targetRepository.findByEmployeeIdAndTargetMonth(employeeId, normalizeMonth(month))
                .orElse(null);
    }

    /**
     * Upsert on (employee, month) — the unique key. A second save for the same employee/month
     * updates the existing row rather than creating a duplicate, which is what makes the admin
     * grid's "save all" idempotent.
     */
    @Transactional
    public EmployeeSalesTarget upsert(Long employeeId, LocalDate month,
                                      BigDecimal targetAmount, BigDecimal commissionRate) {
        if (employeeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Employee is required.");
        }
        if (!employeeRepository.existsById(employeeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Employee not found: " + employeeId);
        }
        LocalDate normalized = normalizeMonth(month);
        BigDecimal amount = validateTargetAmount(targetAmount);
        BigDecimal rate = validateCommissionRate(commissionRate);

        EmployeeSalesTarget target = targetRepository
                .findByEmployeeIdAndTargetMonth(employeeId, normalized)
                .orElseGet(() -> {
                    EmployeeSalesTarget fresh = new EmployeeSalesTarget();
                    fresh.setEmployeeId(employeeId);
                    fresh.setTargetMonth(normalized);
                    return fresh;
                });
        target.setTargetAmount(amount);
        target.setCommissionRate(rate);
        target.setActive(true);
        return targetRepository.save(target);
    }

    @Transactional
    public List<EmployeeSalesTarget> upsertAll(List<EmployeeSalesTargetUpsertRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        // Validate every row before writing any, so a bad row in a bulk save does not leave the
        // grid half-applied.
        requests.forEach(r -> {
            if (r.getEmployeeId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Employee is required.");
            }
            normalizeMonth(r.getTargetMonth());
            validateTargetAmount(r.getTargetAmount());
            validateCommissionRate(r.getCommissionRate());
        });
        return requests.stream()
                .map(r -> upsert(r.getEmployeeId(), r.getTargetMonth(),
                        r.getTargetAmount(), r.getCommissionRate()))
                .toList();
    }

    private BigDecimal validateTargetAmount(BigDecimal amount) {
        BigDecimal value = amount != null ? amount : BigDecimal.ZERO;
        if (value.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target amount cannot be negative.");
        }
        return value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /**
     * Null in, null out — {@code null} means "commission not configured" and is preserved as such
     * rather than coerced to zero. Coercion is what the old implementation did, and it is why the
     * column could not distinguish a deliberate 0% commission from an unset one. Zero is still a
     * perfectly valid configured rate; only absence is absence.
     *
     * @see EmployeeSalesTarget#getCommissionRate()
     */
    private BigDecimal validateCommissionRate(BigDecimal rate) {
        if (rate == null) {
            return null;
        }
        if (rate.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Commission rate cannot be negative.");
        }
        if (rate.compareTo(MAX_RATE) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Commission rate cannot exceed 100.");
        }
        return rate.setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
