package com.billbull.backend.hr.targets;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Employee sales performance: eligible sales, achievement and commission for a month.
 *
 * <p>Sales are read from ONE {@code GROUP BY} aggregate over {@code sales_invoices} — never by
 * looping employees with a SUM each, and never by loading invoices into Java. Targets are read
 * with one query for the month. The two are joined in memory over a handful of employee rows.
 */
@Service
public class EmployeePerformanceService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final SalesInvoiceRepository invoiceRepository;
    private final EmployeeSalesTargetRepository targetRepository;
    private final EmployeeRepository employeeRepository;

    public EmployeePerformanceService(SalesInvoiceRepository invoiceRepository,
                                      EmployeeSalesTargetRepository targetRepository,
                                      EmployeeRepository employeeRepository) {
        this.invoiceRepository = invoiceRepository;
        this.targetRepository = targetRepository;
        this.employeeRepository = employeeRepository;
    }

    // ── Pure calculation (unit-testable without any collaborator) ────────────────────────────

    /**
     * {@code sales / target × 100}, or null when there is no usable target.
     *
     * <p>Null rather than zero or infinity: a missing target is "not measured", not "0% achieved",
     * and the UI renders it as "—".
     */
    public static BigDecimal achievementPercent(BigDecimal sales, BigDecimal target) {
        if (target == null || target.signum() <= 0) {
            return null;
        }
        return nz(sales).multiply(HUNDRED).divide(target, 2, RoundingMode.HALF_UP);
    }

    /**
     * Commission is EARNED ONLY ONCE THE MONTHLY TARGET IS REACHED, and is then calculated on the
     * FULL monthly eligible sales — not on the excess above the target, and not on the target
     * amount:
     *
     * <pre>
     *   monthlySales &lt; target   →  0.00          (Not Eligible)
     *   monthlySales &gt;= target  →  monthlySales × rate / 100
     * </pre>
     *
     * <p>So a 25,000 target at 10% pays nothing on 20,000 of sales, 2,500 on exactly 25,000 and
     * 3,000 on 30,000 — never 500 (the excess) and never 2,500 (the target) on 30,000.
     *
     * <p>A missing or zero target means the threshold can never be crossed, so NO commission is
     * payable however high the sales or the rate. That is deliberate and is what makes "SetTargets
     * off + a commission rate on file" pay nothing: the rate alone does not earn anything.
     *
     * <p>A configured rate of exactly 0.00 is a complete configuration that happens to pay 0.00 —
     * it is eligible, not unconfigured. Only {@code null} means "no rate configured".
     *
     * <p>Computed from the monthly aggregate and rounded ONCE at the end, not per invoice and then
     * summed — the two differ by rounding and the monthly figure is the one the target is measured
     * against.
     */
    public static BigDecimal commission(BigDecimal monthlySales, BigDecimal rate, BigDecimal target) {
        if (!commissionEligible(monthlySales, target) || rate == null || rate.signum() <= 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return nz(monthlySales).multiply(rate)
                .divide(HUNDRED, 2, RoundingMode.HALF_UP);
    }

    /**
     * Has the employee earned commission this month? Requires a usable target AND sales that have
     * reached it. Independent of the rate: a 0% rate is eligible and simply pays 0.00, which is
     * why this is reported separately from the amount — "0.00 because 0%" and "0.00 because the
     * target was missed" are different answers and the UI must not show them the same way.
     */
    public static boolean commissionEligible(BigDecimal monthlySales, BigDecimal target) {
        if (target == null || target.signum() <= 0) return false;
        return nz(monthlySales).compareTo(target) >= 0;
    }

    /** Presentation-only label paired with {@link #commissionEligible}. */
    public static String commissionStatus(BigDecimal monthlySales, BigDecimal target) {
        return commissionEligible(monthlySales, target) ? "Eligible" : "Not Eligible";
    }

    /** Presentation-only status. Deliberately derived, never persisted. */
    public static String targetStatus(BigDecimal sales, BigDecimal target) {
        if (target == null || target.signum() <= 0) return "No Target";
        int cmp = nz(sales).compareTo(target);
        if (cmp >= 0) return "Target Reached";
        // Pro-rata is out of scope for Phase 1; "On Track" simply means past the half-way mark.
        return nz(sales).multiply(HUNDRED).divide(target, 2, RoundingMode.HALF_UP)
                .compareTo(new BigDecimal("50")) >= 0 ? "On Track" : "Below Target";
    }

    public static LocalDate monthStart(LocalDate month) {
        return EmployeeSalesTargetService.normalizeMonth(month);
    }

    public static LocalDate monthEnd(LocalDate month) {
        LocalDate start = monthStart(month);
        return start.withDayOfMonth(start.lengthOfMonth());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private static BigDecimal money(BigDecimal v) {
        return nz(v).setScale(2, RoundingMode.HALF_UP);
    }

    // ── Admin grid ──────────────────────────────────────────────────────────────────────────

    /**
     * @param branchId null = All Branches (consolidated). A non-null branch filters the SALES side
     *                 only — the target stays global per employee, because an employee sells across
     *                 branches and there is no branch-scoped target.
     */
    @Transactional(readOnly = true)
    public EmployeePerformanceResponse getPerformance(LocalDate month, Long branchId) {
        LocalDate from = monthStart(month);
        LocalDate to = monthEnd(month);

        // 1. One aggregate query for every salesperson's sales in the period.
        Map<Long, BigDecimal> salesByEmployee = new HashMap<>();
        Map<Long, Long> billsByEmployee = new HashMap<>();
        for (Object[] row : invoiceRepository.sumSalesBySalesperson(from, to, branchId)) {
            Long employeeId = (Long) row[0];
            salesByEmployee.put(employeeId, money(toBigDecimal(row[1])));
            billsByEmployee.put(employeeId, ((Number) row[2]).longValue());
        }

        // 2. One query for the month's targets.
        Map<Long, EmployeeSalesTarget> targetsByEmployee = new HashMap<>();
        for (EmployeeSalesTarget t : targetRepository.findByTargetMonth(from)) {
            targetsByEmployee.put(t.getEmployeeId(), t);
        }

        // 3. One query for the employee directory. Every employee is loaded (not just Active ones)
        //    because an employee who leaves mid-month must stay visible in that month's history —
        //    the sales and the target belong to the employee, not to their current status.
        Map<Long, Employee> employeesById = new HashMap<>();
        for (Employee e : employeeRepository.findAll()) {
            employeesById.put(e.getId(), e);
        }

        // Rows = currently-Active employees (so a new hire can be given a target) ∪ anyone who has
        // a target or sales this month (so leavers do not vanish from history).
        Set<Long> employeeIds = new LinkedHashSet<>();
        employeesById.values().stream()
                .filter(e -> e.getStatus() != null && "active".equalsIgnoreCase(e.getStatus().trim()))
                .sorted(java.util.Comparator.comparing(EmployeePerformanceService::displayName,
                        String.CASE_INSENSITIVE_ORDER))
                .forEach(e -> employeeIds.add(e.getId()));
        employeeIds.addAll(targetsByEmployee.keySet());
        employeeIds.addAll(salesByEmployee.keySet());

        boolean branchFiltered = branchId != null;

        List<EmployeePerformanceRow> rows = new ArrayList<>();
        BigDecimal totalTarget = BigDecimal.ZERO;
        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalCommission = BigDecimal.ZERO;
        long totalBills = 0;

        for (Long employeeId : employeeIds) {
            Employee employee = employeesById.get(employeeId);
            if (employee == null) continue;

            EmployeeSalesTarget target = targetsByEmployee.get(employeeId);
            BigDecimal targetAmount = target != null ? money(target.getTargetAmount()) : null;
            // The CONFIGURED rate, which may legitimately be null ("not configured") and must stay
            // null on the way out so the Set Targets grid re-opens blank instead of pre-filling a
            // phantom 0% that a re-save would then persist as a real configuration.
            BigDecimal rate = target != null ? target.getCommissionRate() : null;
            BigDecimal sales = salesByEmployee.getOrDefault(employeeId, BigDecimal.ZERO.setScale(2));
            long bills = billsByEmployee.getOrDefault(employeeId, 0L);

            EmployeePerformanceRow row = new EmployeePerformanceRow();
            row.setEmployeeId(employeeId);
            row.setEmployeeCode(employee.getEmployeeCode());
            row.setEmployeeName(displayName(employee));
            row.setRole(employee.getRole());
            row.setDepartment(employee.getDepartment());
            // Legacy free-text branch label, deliberately: Employee.branchEntity is LAZY and
            // touching it per row would be the N+1 this whole service exists to avoid.
            row.setBranchName(employee.getBranch());
            row.setEmployeeStatus(employee.getStatus());
            row.setTargetAmount(targetAmount);
            row.setCommissionRate(rate != null ? rate.setScale(2, RoundingMode.HALF_UP) : null);
            row.setSales(sales);
            row.setBills(bills);
            // Suppressed under a branch filter: a single branch's sales against a global target is
            // not a meaningful percentage, and showing one anyway is the kind of number people act
            // on without reading the filter.
            row.setAchievementPercent(branchFiltered ? null : achievementPercent(sales, targetAmount));
            // Commission is now a TARGET COMPARISON, so it is suppressed under a branch filter
            // for exactly the reason achievement is: one branch's sales measured against a global
            // target would report a genuinely eligible employee as "Not Eligible".
            row.setCommission(branchFiltered ? null : commission(sales, rate, targetAmount));
            row.setCommissionEligible(!branchFiltered && commissionEligible(sales, targetAmount));
            row.setCommissionStatus(branchFiltered ? null : commissionStatus(sales, targetAmount));
            row.setRemainingTarget(targetAmount != null
                    ? targetAmount.subtract(sales).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
                    : null);
            row.setTargetStatus(branchFiltered ? null : targetStatus(sales, targetAmount));
            rows.add(row);

            if (targetAmount != null) totalTarget = totalTarget.add(targetAmount);
            totalSales = totalSales.add(sales);
            if (row.getCommission() != null) totalCommission = totalCommission.add(row.getCommission());
            totalBills += bills;
        }

        BigDecimal unassignedSales = BigDecimal.ZERO.setScale(2);
        long unassignedBills = 0;
        List<Object[]> unassigned = invoiceRepository.sumUnassignedSalesBetween(from, to, branchId);
        if (!unassigned.isEmpty() && unassigned.get(0) != null) {
            unassignedSales = money(toBigDecimal(unassigned.get(0)[0]));
            unassignedBills = ((Number) unassigned.get(0)[1]).longValue();
        }

        EmployeePerformanceResponse response = new EmployeePerformanceResponse();
        response.setMonth(from);
        response.setBranchId(branchId);
        response.setBranchFiltered(branchFiltered);
        response.setRows(rows);
        response.setTotalTarget(money(totalTarget));
        response.setTotalSales(money(totalSales));
        response.setTotalBills(totalBills);
        // SUM(sales) / SUM(target) — NOT the mean of the per-row percentages.
        response.setOverallAchievementPercent(
                branchFiltered ? null : achievementPercent(totalSales, money(totalTarget)));
        // Null, not zero, under a branch filter — the per-row figures it would sum are suppressed.
        response.setTotalCommission(branchFiltered ? null : money(totalCommission));
        response.setUnassignedSales(unassignedSales);
        response.setUnassignedBills(unassignedBills);
        return response;
    }

    // ── Self-service ────────────────────────────────────────────────────────────────────────

    /**
     * Self-service entry point: loads the employee by id inside this read-only transaction, so no
     * detached proxy is ever dereferenced. The id comes from the authenticated principal's linked
     * employee — never from a request parameter. Null when that employee no longer exists.
     */
    @Transactional(readOnly = true)
    public EmployeePerformanceRow getForEmployeeId(Long employeeId, LocalDate month, Long branchId) {
        if (employeeId == null) return null;
        return employeeRepository.findById(employeeId)
                .map(employee -> getForEmployee(employee, month, branchId))
                .orElse(null);
    }

    /**
     * One employee's own figures. The employee id is resolved by the caller from the authenticated
     * principal's linked employee — never from a request parameter.
     */
    @Transactional(readOnly = true)
    public EmployeePerformanceRow getForEmployee(Employee employee, LocalDate month, Long branchId) {
        LocalDate from = monthStart(month);
        LocalDate to = monthEnd(month);

        BigDecimal sales = BigDecimal.ZERO.setScale(2);
        long bills = 0;
        List<Object[]> agg = invoiceRepository.sumSalesForSalesperson(employee.getId(), from, to, branchId);
        if (!agg.isEmpty() && agg.get(0) != null) {
            sales = money(toBigDecimal(agg.get(0)[0]));
            bills = ((Number) agg.get(0)[1]).longValue();
        }

        EmployeeSalesTarget target = targetRepository
                .findByEmployeeIdAndTargetMonth(employee.getId(), from).orElse(null);
        BigDecimal targetAmount = target != null ? money(target.getTargetAmount()) : null;
        BigDecimal rate = target != null ? target.getCommissionRate() : null;

        EmployeePerformanceRow row = new EmployeePerformanceRow();
        row.setEmployeeId(employee.getId());
        row.setEmployeeCode(employee.getEmployeeCode());
        row.setEmployeeName(displayName(employee));
        row.setRole(employee.getRole());
        row.setDepartment(employee.getDepartment());
        row.setBranchName(employee.getBranch());
        row.setEmployeeStatus(employee.getStatus());
        row.setTargetAmount(targetAmount);
        row.setCommissionRate(rate != null ? rate.setScale(2, RoundingMode.HALF_UP) : null);
        row.setSales(sales);
        row.setBills(bills);
        row.setAchievementPercent(achievementPercent(sales, targetAmount));
        row.setCommission(commission(sales, rate, targetAmount));
        row.setCommissionEligible(commissionEligible(sales, targetAmount));
        row.setCommissionStatus(commissionStatus(sales, targetAmount));
        row.setRemainingTarget(targetAmount != null
                ? targetAmount.subtract(sales).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
                : null);
        row.setTargetStatus(targetStatus(sales, targetAmount));
        return row;
    }

    public static String displayName(Employee employee) {
        return (employee.getFirstName() + " "
                + (employee.getMiddleName() != null ? employee.getMiddleName() + " " : "")
                + employee.getLastName()).trim().replaceAll("\\s+", " ");
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal bd) return bd;
        return new BigDecimal(value.toString());
    }
}
