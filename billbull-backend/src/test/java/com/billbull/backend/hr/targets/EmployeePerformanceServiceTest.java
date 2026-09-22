package com.billbull.backend.hr.targets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

@ExtendWith(MockitoExtension.class)
class EmployeePerformanceServiceTest {

    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private EmployeeSalesTargetRepository targetRepository;
    @Mock private EmployeeRepository employeeRepository;

    private EmployeePerformanceService service;

    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);

    @BeforeEach
    void setUp() {
        service = new EmployeePerformanceService(invoiceRepository, targetRepository, employeeRepository);
        lenient().when(invoiceRepository.sumUnassignedSalesBetween(any(), any(), any()))
                .thenReturn(List.of());
    }

    private static Employee employee(long id, String code, String first, String last, String status) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setStatus(status);
        return e;
    }

    private static EmployeeSalesTarget target(long employeeId, String amount, String rate) {
        EmployeeSalesTarget t = new EmployeeSalesTarget();
        t.setEmployeeId(employeeId);
        t.setTargetMonth(SEP);
        t.setTargetAmount(new BigDecimal(amount));
        t.setCommissionRate(new BigDecimal(rate));
        return t;
    }

    // ── pure calculation ────────────────────────────────────────────────────

    @Test
    void achievementIsSalesOverTargetAsAPercentage() {
        assertEquals(new BigDecimal("50.00"),
                EmployeePerformanceService.achievementPercent(new BigDecimal("50000"), new BigDecimal("100000")));
        assertEquals(new BigDecimal("100.00"),
                EmployeePerformanceService.achievementPercent(new BigDecimal("100000"), new BigDecimal("100000")));
        assertEquals(new BigDecimal("125.50"),
                EmployeePerformanceService.achievementPercent(new BigDecimal("125500"), new BigDecimal("100000")));
    }

    @Test
    void achievementIsNullForAZeroOrMissingTargetRatherThanZeroOrInfinity() {
        assertNull(EmployeePerformanceService.achievementPercent(new BigDecimal("50000"), BigDecimal.ZERO));
        assertNull(EmployeePerformanceService.achievementPercent(new BigDecimal("50000"), null));
        // A negative target is nonsense data, not a divisor.
        assertNull(EmployeePerformanceService.achievementPercent(new BigDecimal("50000"), new BigDecimal("-1")));
    }

    @Test
    void commissionIsTheWorkedExample() {
        // Gross 10,000 - discount 1,000 + VAT 450 = invoiceTotal 9,450; 10% => 945.00
        assertEquals(new BigDecimal("945.00"),
                EmployeePerformanceService.commission(new BigDecimal("9450.00"), new BigDecimal("10")));
    }

    @Test
    void commissionRoundsHalfUpToTwoDecimals() {
        // 333.33 x 7.5% = 24.99975 -> 25.00
        assertEquals(new BigDecimal("25.00"),
                EmployeePerformanceService.commission(new BigDecimal("333.33"), new BigDecimal("7.5")));
        // 1.00 x 0.125% = 0.00125 -> 0.00
        assertEquals(new BigDecimal("0.00"),
                EmployeePerformanceService.commission(new BigDecimal("1.00"), new BigDecimal("0.13")));
    }

    @Test
    void commissionIsZeroForNoOrZeroRate() {
        assertEquals(new BigDecimal("0.00"),
                EmployeePerformanceService.commission(new BigDecimal("9450.00"), null));
        assertEquals(new BigDecimal("0.00"),
                EmployeePerformanceService.commission(new BigDecimal("9450.00"), BigDecimal.ZERO));
    }

    @Test
    void commissionFromTheMonthlyAggregateCanDifferFromSummedPerInvoiceCommission() {
        // Three invoices of 0.05 at 50%: per-invoice each rounds to 0.03 (sum 0.09), while the
        // monthly aggregate 0.15 x 50% = 0.075 -> 0.08. Pinning that we use the aggregate.
        BigDecimal monthly = EmployeePerformanceService.commission(new BigDecimal("0.15"), new BigDecimal("50"));
        BigDecimal perInvoiceSummed = EmployeePerformanceService.commission(new BigDecimal("0.05"), new BigDecimal("50"))
                .multiply(new BigDecimal("3"));
        assertEquals(new BigDecimal("0.08"), monthly);
        assertNotEquals(monthly, perInvoiceSummed);
    }

    @Test
    void monthBoundsCoverTheWholeMonth() {
        assertEquals(LocalDate.of(2026, 9, 1), EmployeePerformanceService.monthStart(LocalDate.of(2026, 9, 17)));
        assertEquals(LocalDate.of(2026, 9, 30), EmployeePerformanceService.monthEnd(LocalDate.of(2026, 9, 17)));
        // February in a leap year — the length must come from the month, not a constant.
        assertEquals(LocalDate.of(2028, 2, 29), EmployeePerformanceService.monthEnd(LocalDate.of(2028, 2, 3)));
    }

    @Test
    void targetStatusIsDerivedNotStored() {
        assertEquals("No Target", EmployeePerformanceService.targetStatus(new BigDecimal("10"), null));
        assertEquals("No Target", EmployeePerformanceService.targetStatus(new BigDecimal("10"), BigDecimal.ZERO));
        assertEquals("Target Reached",
                EmployeePerformanceService.targetStatus(new BigDecimal("100"), new BigDecimal("100")));
        assertEquals("On Track",
                EmployeePerformanceService.targetStatus(new BigDecimal("60"), new BigDecimal("100")));
        assertEquals("Below Target",
                EmployeePerformanceService.targetStatus(new BigDecimal("10"), new BigDecimal("100")));
    }

    // ── admin grid ──────────────────────────────────────────────────────────

    @Test
    void buildsRowsAndServerComputedTotalsFromOneAggregateQuery() {
        when(employeeRepository.findAll()).thenReturn(List.of(
                employee(1L, "EMP-1", "Cashier", "One", "Active"),
                employee(2L, "EMP-2", "Cashier", "Two", "Active")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(
                target(1L, "100000", "10"),
                target(2L, "80000", "8")));
        when(invoiceRepository.sumSalesBySalesperson(SEP, LocalDate.of(2026, 9, 30), null))
                .thenReturn(List.of(
                        new Object[] { 1L, new BigDecimal("50000.00"), 12L },
                        new Object[] { 2L, new BigDecimal("80000.00"), 20L }));

        EmployeePerformanceResponse res = service.getPerformance(SEP, null);

        assertEquals(2, res.getRows().size());

        EmployeePerformanceRow one = res.getRows().get(0);
        assertEquals("Cashier One", one.getEmployeeName());
        assertEquals(new BigDecimal("50000.00"), one.getSales());
        assertEquals(12L, one.getBills());
        assertEquals(new BigDecimal("50.00"), one.getAchievementPercent());
        assertEquals(new BigDecimal("5000.00"), one.getCommission());
        assertEquals(new BigDecimal("50000.00"), one.getRemainingTarget());
        assertEquals("On Track", one.getTargetStatus());

        EmployeePerformanceRow two = res.getRows().get(1);
        assertEquals(new BigDecimal("6400.00"), two.getCommission());
        assertEquals("Target Reached", two.getTargetStatus());
        assertEquals(new BigDecimal("0.00"), two.getRemainingTarget());

        assertEquals(new BigDecimal("180000.00"), res.getTotalTarget());
        assertEquals(new BigDecimal("130000.00"), res.getTotalSales());
        assertEquals(new BigDecimal("11400.00"), res.getTotalCommission());
        assertEquals(32L, res.getTotalBills());

        // ONE aggregate query, not one per employee.
        verify(invoiceRepository, times(1)).sumSalesBySalesperson(any(), any(), isNull());
    }

    @Test
    void overallAchievementIsTotalSalesOverTotalTargetNotTheMeanOfTheRows() {
        when(employeeRepository.findAll()).thenReturn(List.of(
                employee(1L, "EMP-1", "A", "One", "Active"),
                employee(2L, "EMP-2", "B", "Two", "Active")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(
                target(1L, "100000", "0"),
                target(2L, "10000", "0")));
        when(invoiceRepository.sumSalesBySalesperson(any(), any(), isNull()))
                .thenReturn(List.of(
                        new Object[] { 1L, new BigDecimal("10000.00"), 1L },   // 10%
                        new Object[] { 2L, new BigDecimal("10000.00"), 1L })); // 100%

        EmployeePerformanceResponse res = service.getPerformance(SEP, null);

        // Mean of the rows would be 55.00%; the correct figure is 20000/110000 = 18.18%.
        assertEquals(new BigDecimal("18.18"), res.getOverallAchievementPercent());
        assertNotEquals(new BigDecimal("55.00"), res.getOverallAchievementPercent());
    }

    @Test
    void anEmployeeWithATargetButNoSalesShowsZeroSalesAndZeroAchievement() {
        when(employeeRepository.findAll()).thenReturn(List.of(employee(1L, "EMP-1", "No", "Sales", "Active")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(target(1L, "100000", "10")));
        when(invoiceRepository.sumSalesBySalesperson(any(), any(), isNull())).thenReturn(List.of());

        EmployeePerformanceRow row = service.getPerformance(SEP, null).getRows().get(0);

        assertEquals(new BigDecimal("0.00"), row.getSales());
        assertEquals(new BigDecimal("0.00"), row.getAchievementPercent());
        assertEquals(new BigDecimal("0.00"), row.getCommission());
    }

    @Test
    void anEmployeeWithSalesButNoTargetShowsNullAchievement() {
        when(employeeRepository.findAll()).thenReturn(List.of(employee(1L, "EMP-1", "No", "Target", "Active")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());
        when(invoiceRepository.sumSalesBySalesperson(any(), any(), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { 1L, new BigDecimal("5000.00"), 3L }));

        EmployeePerformanceRow row = service.getPerformance(SEP, null).getRows().get(0);

        assertNull(row.getTargetAmount());
        assertNull(row.getAchievementPercent());
        assertNull(row.getRemainingTarget());
        assertEquals("No Target", row.getTargetStatus());
        // No target means no configured rate, so no commission — not a crash.
        assertEquals(new BigDecimal("0.00"), row.getCommission());
    }

    @Test
    void anInactiveEmployeeWithSalesStaysVisibleInHistoricalPerformance() {
        // Left mid-month: not in the Active list, but the month's sales are still theirs.
        when(employeeRepository.findAll()).thenReturn(List.of(
                employee(1L, "EMP-1", "Still", "Here", "Active"),
                employee(9L, "EMP-9", "Left", "Midmonth", "Inactive")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());
        when(invoiceRepository.sumSalesBySalesperson(any(), any(), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { 9L, new BigDecimal("7000.00"), 4L }));

        EmployeePerformanceResponse res = service.getPerformance(SEP, null);

        EmployeePerformanceRow leaver = res.getRows().stream()
                .filter(r -> r.getEmployeeId() == 9L).findFirst().orElseThrow();
        assertEquals(new BigDecimal("7000.00"), leaver.getSales());
        assertEquals("Inactive", leaver.getEmployeeStatus());
    }

    @Test
    void branchFilterNarrowsSalesAndSuppressesAchievementBecauseTargetsAreGlobal() {
        when(employeeRepository.findAll()).thenReturn(List.of(employee(1L, "EMP-1", "Multi", "Branch", "Active")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(target(1L, "100000", "10")));
        when(invoiceRepository.sumSalesBySalesperson(SEP, LocalDate.of(2026, 9, 30), 3L))
                .thenReturn(List.<Object[]>of(new Object[] { 1L, new BigDecimal("20000.00"), 5L }));

        EmployeePerformanceResponse res = service.getPerformance(SEP, 3L);

        assertEquals(3L, res.getBranchId());
        assertEquals(true, res.isBranchFiltered());
        EmployeePerformanceRow row = res.getRows().get(0);
        // Sales are branch-scoped, and the global target is still shown...
        assertEquals(new BigDecimal("20000.00"), row.getSales());
        assertEquals(new BigDecimal("100000.00"), row.getTargetAmount());
        // ...but the comparison between them is suppressed rather than rendered misleadingly.
        assertNull(row.getAchievementPercent());
        assertNull(row.getTargetStatus());
        assertNull(res.getOverallAchievementPercent());
        // Commission still applies: it is a rate on actual sales, not a target comparison.
        assertEquals(new BigDecimal("2000.00"), row.getCommission());
    }

    @Test
    void exposesTheUnassignedBucketSeparatelyFromEmployeeRows() {
        when(employeeRepository.findAll()).thenReturn(List.of());
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());
        when(invoiceRepository.sumSalesBySalesperson(any(), any(), isNull())).thenReturn(List.of());
        when(invoiceRepository.sumUnassignedSalesBetween(any(), any(), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { new BigDecimal("4200.00"), 9L }));

        EmployeePerformanceResponse res = service.getPerformance(SEP, null);

        assertEquals(new BigDecimal("4200.00"), res.getUnassignedSales());
        assertEquals(9L, res.getUnassignedBills());
        assertEquals(new BigDecimal("0.00"), res.getTotalSales());
    }

    // ── self service ────────────────────────────────────────────────────────

    @Test
    void selfViewIsAlwaysConsolidatedAcrossBranches() {
        Employee me = employee(1L, "EMP-1", "Me", "Myself", "Active");
        when(invoiceRepository.sumSalesForSalesperson(eq(1L), eq(SEP), eq(LocalDate.of(2026, 9, 30)), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { new BigDecimal("9450.00"), 2L }));
        when(targetRepository.findByEmployeeIdAndTargetMonth(1L, SEP))
                .thenReturn(Optional.of(target(1L, "100000", "10")));

        EmployeePerformanceRow row = service.getForEmployee(me, SEP, null);

        assertEquals(new BigDecimal("9450.00"), row.getSales());
        assertEquals(2L, row.getBills());
        assertEquals(new BigDecimal("945.00"), row.getCommission());
        assertEquals(new BigDecimal("9.45"), row.getAchievementPercent());
        assertEquals(new BigDecimal("90550.00"), row.getRemainingTarget());
    }

    @Test
    void selfViewWithNoTargetShowsSalesButNoAchievement() {
        Employee me = employee(1L, "EMP-1", "Me", "Myself", "Active");
        when(invoiceRepository.sumSalesForSalesperson(any(), any(), any(), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { new BigDecimal("500.00"), 1L }));
        when(targetRepository.findByEmployeeIdAndTargetMonth(1L, SEP)).thenReturn(Optional.empty());

        EmployeePerformanceRow row = service.getForEmployee(me, SEP, null);

        assertEquals(new BigDecimal("500.00"), row.getSales());
        assertNull(row.getAchievementPercent());
        assertNull(row.getTargetAmount());
    }

    @Test
    void selfEntryPointLoadsTheEmployeeByIdInsideTheService() {
        // The /me controller passes only an id; the Employee is loaded here, inside this service's
        // transaction, so no detached LAZY proxy is ever dereferenced.
        Employee me = employee(1L, "EMP-1", "Me", "Myself", "Active");
        when(employeeRepository.findById(1L)).thenReturn(Optional.of(me));
        when(invoiceRepository.sumSalesForSalesperson(eq(1L), any(), any(), isNull()))
                .thenReturn(List.<Object[]>of(new Object[] { new BigDecimal("9450.00"), 2L }));
        when(targetRepository.findByEmployeeIdAndTargetMonth(1L, SEP))
                .thenReturn(Optional.of(target(1L, "100000", "10")));

        EmployeePerformanceRow row = service.getForEmployeeId(1L, SEP, null);

        assertEquals("Me Myself", row.getEmployeeName());
        assertEquals(new BigDecimal("945.00"), row.getCommission());
    }

    @Test
    void selfEntryPointReturnsNullForAMissingOrNullEmployee() {
        when(employeeRepository.findById(404L)).thenReturn(Optional.empty());

        assertNull(service.getForEmployeeId(404L, SEP, null));
        assertNull(service.getForEmployeeId(null, SEP, null));
    }
}
