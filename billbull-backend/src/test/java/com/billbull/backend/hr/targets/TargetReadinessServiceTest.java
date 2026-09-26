package com.billbull.backend.hr.targets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.SalespersonService;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;

/**
 * GLOBAL target readiness — the tenant-wide precondition on POS selling.
 *
 * <p>The two rules that are easiest to get wrong, and are therefore pinned hardest here:
 * a commission of 0.00 is CONFIGURED (only NULL is missing), and readiness is evaluated over EVERY
 * active eligible employee, not just the one attributed to the sale in hand.
 */
@ExtendWith(MockitoExtension.class)
class TargetReadinessServiceTest {

    @Mock private SalesSettingsService salesSettingsService;
    @Mock private SalespersonService salespersonService;
    @Mock private EmployeeSalesTargetRepository targetRepository;

    private TargetReadinessService service;

    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);

    @BeforeEach
    void setUp() {
        service = new TargetReadinessService(salesSettingsService, salespersonService, targetRepository);
    }

    private void enforcement(boolean on) {
        SalesSettings settings = new SalesSettings();
        settings.setMonthlyTargetRequired(on);
        lenient().when(salesSettingsService.getSettings()).thenReturn(settings);
    }

    private static Employee emp(long id, String code, String first, String last, String role) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setRole(role);
        e.setStatus("Active");
        return e;
    }

    private static EmployeeSalesTarget target(long employeeId, String amount, String rate) {
        EmployeeSalesTarget t = new EmployeeSalesTarget();
        t.setEmployeeId(employeeId);
        t.setTargetMonth(SEP);
        t.setTargetAmount(amount != null ? new BigDecimal(amount) : null);
        t.setCommissionRate(rate != null ? new BigDecimal(rate) : null);
        return t;
    }

    // ── enforcement off ─────────────────────────────────────────────────────

    @Test
    void whenEnforcementIsOffItIsAlwaysReadyAndNothingIsEvenQueried() {
        enforcement(false);

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isRequired());
        assertTrue(result.isReady());
        assertTrue(result.getMissing().isEmpty());
        // A tenant that never turns this on pays nothing for it.
        verify(salespersonService, never()).listEligible();
        verify(targetRepository, never()).findByTargetMonth(SEP);
    }

    // ── fully configured ────────────────────────────────────────────────────

    @Test
    void readyWhenEveryEligibleEmployeeHasATargetAndACommission() {
        enforcement(true);
        when(salespersonService.listEligible()).thenReturn(List.of(
                emp(1L, "EMP-001", "Sales", "One", "Salesperson"),
                emp(2L, "EMP-002", "Cashier", "Two", "Cashier + Salesperson")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(
                target(1L, "100000", "10"),
                target(2L, "80000", "5")));

        TargetReadinessResponse result = service.evaluate(SEP);

        assertTrue(result.isRequired());
        assertTrue(result.isReady());
        assertTrue(result.getMissing().isEmpty());
        assertEquals(SEP, result.getMonth());
    }

    // ── THE zero-commission rule ────────────────────────────────────────────

    @Test
    void aZeroPercentCommissionIsConfiguredAndDoesNotBlockSelling() {
        enforcement(true);
        when(salespersonService.listEligible())
                .thenReturn(List.of(emp(1L, "EMP-001", "Sales", "One", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP))
                .thenReturn(List.of(target(1L, "100000", "0.00")));

        TargetReadinessResponse result = service.evaluate(SEP);

        assertTrue(result.isReady(), "an explicit 0% commission is a complete configuration");
    }

    @Test
    void aNullCommissionIsNotConfiguredAndDoesBlockSelling() {
        enforcement(true);
        when(salespersonService.listEligible())
                .thenReturn(List.of(emp(1L, "EMP-001", "Sales", "One", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP))
                .thenReturn(List.of(target(1L, "100000", null)));

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isReady());
        assertEquals(1, result.getMissing().size());
        assertTrue(result.getMissing().get(0).isMissingCommission());
        assertFalse(result.getMissing().get(0).isMissingTarget());
    }

    // ── missing target ──────────────────────────────────────────────────────

    @Test
    void anEmployeeWithNoTargetRowAtAllIsMissingBothHalves() {
        enforcement(true);
        when(salespersonService.listEligible())
                .thenReturn(List.of(emp(3L, "EMP-003", "No", "Target", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isReady());
        TargetReadinessResponse.MissingRow row = result.getMissing().get(0);
        assertTrue(row.isMissingTarget());
        assertTrue(row.isMissingCommission());
        assertEquals(3L, row.getEmployeeId());
        assertEquals("EMP-003", row.getEmployeeCode());
        assertEquals("No Target", row.getEmployeeName());
        assertEquals("Salesperson", row.getRole());
    }

    @Test
    void aZeroTargetIsNotAConfiguredTarget() {
        enforcement(true);
        when(salespersonService.listEligible())
                .thenReturn(List.of(emp(1L, "EMP-001", "Sales", "One", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP))
                .thenReturn(List.of(target(1L, "0", "10")));

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isReady());
        assertTrue(result.getMissing().get(0).isMissingTarget());
        assertFalse(result.getMissing().get(0).isMissingCommission());
    }

    // ── THE global rule ─────────────────────────────────────────────────────

    @Test
    void oneMisconfiguredEmployeeBlocksEveryoneEvenWhenTheOthersAreComplete() {
        enforcement(true);
        when(salespersonService.listEligible()).thenReturn(List.of(
                emp(1L, "EMP-001", "Sales", "A", "Salesperson"),
                emp(2L, "EMP-002", "Cashier", "C", "Cashier + Salesperson"),
                emp(3L, "EMP-003", "Sales", "B", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(
                target(1L, "100000", "10"),
                target(2L, "80000", "5")));
        // Salesperson B (id 3) has nothing configured at all.

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isReady());
        assertEquals(1, result.getMissing().size());
        assertEquals(3L, result.getMissing().get(0).getEmployeeId());
    }

    @Test
    void everyMisconfiguredEmployeeIsListed() {
        enforcement(true);
        when(salespersonService.listEligible()).thenReturn(List.of(
                emp(1L, "EMP-001", "Sales", "A", "Salesperson"),
                emp(2L, "EMP-002", "Cashier", "C", "Cashier + Salesperson"),
                emp(3L, "EMP-003", "Sales", "B", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of(
                target(1L, "100000", null),     // commission missing
                target(2L, "0", "5")));         // target missing
        // id 3: nothing at all

        TargetReadinessResponse result = service.evaluate(SEP);

        assertFalse(result.isReady());
        assertEquals(3, result.getMissing().size());
        assertEquals(List.of(1L, 2L, 3L),
                result.getMissing().stream().map(TargetReadinessResponse.MissingRow::getEmployeeId).toList());
    }

    // ── who the rule applies to ─────────────────────────────────────────────

    @Test
    void ineligibleAndInactiveEmployeesCannotBlockTheTills() {
        enforcement(true);
        // listEligible() is THE filter — it returns only Active + eligible-designation employees,
        // so a Cashier or a resigned Salesperson never reaches this service at all. Pinning the
        // empty case proves readiness is driven by that roster and nothing else.
        when(salespersonService.listEligible()).thenReturn(List.of());
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());

        TargetReadinessResponse result = service.evaluate(SEP);

        assertTrue(result.isReady());
    }

    // ── month handling ──────────────────────────────────────────────────────

    @Test
    void normalisesAnyDateInTheMonthToTheFirstDay() {
        enforcement(true);
        when(salespersonService.listEligible()).thenReturn(List.of());
        when(targetRepository.findByTargetMonth(SEP)).thenReturn(List.of());

        TargetReadinessResponse result = service.evaluate(LocalDate.of(2026, 9, 23));

        assertEquals(SEP, result.getMonth());
        verify(targetRepository).findByTargetMonth(SEP);
    }

    @Test
    void defaultsToTheCurrentMonthWhenNoneIsGiven() {
        enforcement(false);

        TargetReadinessResponse result = service.evaluate();

        assertEquals(LocalDate.now().withDayOfMonth(1), result.getMonth());
    }

    // ── readiness never touches sales data ──────────────────────────────────

    @Test
    void readinessIsAConfigurationQuestionAndUsesExactlyTwoQueries() {
        enforcement(true);
        when(salespersonService.listEligible())
                .thenReturn(List.of(emp(1L, "EMP-001", "Sales", "One", "Salesperson")));
        when(targetRepository.findByTargetMonth(SEP))
                .thenReturn(List.of(target(1L, "100000", "10")));

        service.evaluate(SEP);

        verify(salespersonService).listEligible();
        verify(targetRepository).findByTargetMonth(SEP);
        // No invoice repository is even injected: readiness must never be confused with
        // performance, which is what actually reads sales.
    }
}
