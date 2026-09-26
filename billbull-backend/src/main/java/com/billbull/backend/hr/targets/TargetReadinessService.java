package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.SalespersonService;
import com.billbull.backend.sales.settings.SalesSettingsService;

/**
 * THE single definition of "is this month's salesperson target configuration complete?".
 *
 * <p>Used by both the advisory readiness endpoint and the authoritative POS checkout gate, so the
 * warning the cashier sees and the refusal the server issues can never disagree. There is
 * deliberately no second implementation in the frontend.
 *
 * <p><b>Global, not per-sale.</b> The rule is tenant-wide: if ANY active salesperson-eligible
 * employee is missing this month's configuration, POS sales are blocked — including sales
 * attributed to a fully-configured colleague, and including sales at other branches. That follows
 * from the target model itself, which is global per employee per month with no {@code branch_id}
 * (see {@link EmployeeSalesTarget}'s class comment).
 *
 * <p><b>Scope: POS only.</b> Back-office Sales Invoices are NOT gated by readiness in this phase.
 * Back-office attribution is a separate, manually-selected integration that until now wrote no
 * {@code salespersonEmployeeId} at all, so it contributes nothing to the figures a target measures;
 * blocking it would refuse sales the feature does not even track. Back-office selections are still
 * validated for eligibility.
 *
 * <p><b>No invoices, no caching.</b> Readiness asks a configuration question, not a performance
 * question — it never loads sales data (that is {@link EmployeePerformanceService}'s job). It is
 * two queries over a handful of rows and is re-evaluated on every checkout, because an employee
 * going inactive or a target being filled in must take effect immediately.
 */
@Service
public class TargetReadinessService {

    private final SalesSettingsService salesSettingsService;
    private final SalespersonService salespersonService;
    private final EmployeeSalesTargetRepository targetRepository;

    public TargetReadinessService(SalesSettingsService salesSettingsService,
                                  SalespersonService salespersonService,
                                  EmployeeSalesTargetRepository targetRepository) {
        this.salesSettingsService = salesSettingsService;
        this.salespersonService = salespersonService;
        this.targetRepository = targetRepository;
    }

    /**
     * Is a target amount usable? Zero or absent is not — an employee "targeted" at zero has not
     * been given a target, and {@link EmployeePerformanceService#achievementPercent} already
     * refuses to measure against one.
     */
    static boolean targetConfigured(EmployeeSalesTarget target) {
        return target != null
                && target.getTargetAmount() != null
                && target.getTargetAmount().compareTo(BigDecimal.ZERO) > 0;
    }

    /**
     * Is a commission rate configured? NULL is not. {@code 0.00} IS — a deliberate 0% commission is
     * a complete configuration and must never block a sale. This is the whole reason
     * {@code commission_rate} was made nullable in V104; testing {@code > 0} here would silently
     * reinstate the bug.
     */
    static boolean commissionConfigured(EmployeeSalesTarget target) {
        return target != null && target.getCommissionRate() != null;
    }

    /** Evaluates the current month. */
    @Transactional(readOnly = true)
    public TargetReadinessResponse evaluate() {
        return evaluate(null);
    }

    /**
     * @param month any date inside the month; null means the current month. Normalised to day 1.
     */
    @Transactional(readOnly = true)
    public TargetReadinessResponse evaluate(LocalDate month) {
        LocalDate normalized = month != null
                ? EmployeeSalesTargetService.normalizeMonth(month)
                : LocalDate.now().withDayOfMonth(1);

        TargetReadinessResponse response = new TargetReadinessResponse();
        response.setMonth(normalized);

        boolean required = salesSettingsService.getSettings().isMonthlyTargetRequired();
        response.setRequired(required);

        if (!required) {
            // Nothing is evaluated at all when enforcement is off — not even the queries. A tenant
            // that never turns this on pays nothing for it.
            response.setReady(true);
            response.setMissing(List.of());
            return response;
        }

        // Query 1: the employees the rule applies to. Only ACTIVE, only the two eligible
        // designations — an inactive salesperson or an ineligible role is irrelevant and must not
        // be able to block the tills.
        List<Employee> eligible = salespersonService.listEligible();

        // Query 2: this month's targets, in one shot. Same access pattern the admin grid uses.
        Map<Long, EmployeeSalesTarget> byEmployee = new HashMap<>();
        for (EmployeeSalesTarget t : targetRepository.findByTargetMonth(normalized)) {
            byEmployee.put(t.getEmployeeId(), t);
        }

        List<TargetReadinessResponse.MissingRow> missing = new ArrayList<>();
        for (Employee employee : eligible) {
            EmployeeSalesTarget target = byEmployee.get(employee.getId());
            boolean missingTarget = !targetConfigured(target);
            boolean missingCommission = !commissionConfigured(target);
            if (!missingTarget && !missingCommission) {
                continue;
            }
            TargetReadinessResponse.MissingRow row = new TargetReadinessResponse.MissingRow();
            row.setEmployeeId(employee.getId());
            row.setEmployeeCode(employee.getEmployeeCode());
            row.setEmployeeName(SalespersonService.fullName(employee));
            row.setRole(employee.getRole());
            row.setMissingTarget(missingTarget);
            row.setMissingCommission(missingCommission);
            missing.add(row);
        }

        response.setMissing(missing);
        response.setReady(missing.isEmpty());
        return response;
    }
}
