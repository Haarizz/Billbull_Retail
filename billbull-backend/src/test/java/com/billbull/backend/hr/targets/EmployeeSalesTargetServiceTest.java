package com.billbull.backend.hr.targets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.EmployeeRepository;

@ExtendWith(MockitoExtension.class)
class EmployeeSalesTargetServiceTest {

    @Mock private EmployeeSalesTargetRepository targetRepository;
    @Mock private EmployeeRepository employeeRepository;

    private EmployeeSalesTargetService service;

    private static final LocalDate SEP = LocalDate.of(2026, 9, 1);

    @BeforeEach
    void setUp() {
        service = new EmployeeSalesTargetService(targetRepository, employeeRepository);
        lenient().when(employeeRepository.existsById(any())).thenReturn(true);
        lenient().when(targetRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private EmployeeSalesTarget existing(Long employeeId, LocalDate month, String amount, String rate) {
        EmployeeSalesTarget t = new EmployeeSalesTarget();
        t.setId(1L);
        t.setEmployeeId(employeeId);
        t.setTargetMonth(month);
        t.setTargetAmount(new BigDecimal(amount));
        t.setCommissionRate(new BigDecimal(rate));
        return t;
    }

    // ── month normalisation ─────────────────────────────────────────────────

    @Test
    void normalizesAnyDateInTheMonthToTheFirstDay() {
        assertEquals(SEP, EmployeeSalesTargetService.normalizeMonth(LocalDate.of(2026, 9, 30)));
        assertEquals(SEP, EmployeeSalesTargetService.normalizeMonth(LocalDate.of(2026, 9, 1)));
        assertEquals(SEP, EmployeeSalesTargetService.normalizeMonth(LocalDate.of(2026, 9, 17)));
    }

    @Test
    void rejectsAMissingMonth() {
        assertThrows(ResponseStatusException.class,
                () -> EmployeeSalesTargetService.normalizeMonth(null));
    }

    @Test
    void persistsTheNormalizedMonthNotTheSuppliedDate() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.empty());

        service.upsert(5L, LocalDate.of(2026, 9, 23), new BigDecimal("100000"), new BigDecimal("10"));

        ArgumentCaptor<EmployeeSalesTarget> captor = ArgumentCaptor.forClass(EmployeeSalesTarget.class);
        verify(targetRepository).save(captor.capture());
        assertEquals(SEP, captor.getValue().getTargetMonth());
    }

    // ── create / update ─────────────────────────────────────────────────────

    @Test
    void createsANewTargetWhenNoneExistsForTheEmployeeAndMonth() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.empty());

        EmployeeSalesTarget saved = service.upsert(5L, SEP, new BigDecimal("100000"), new BigDecimal("10"));

        assertEquals(5L, saved.getEmployeeId());
        assertEquals(SEP, saved.getTargetMonth());
        assertEquals(new BigDecimal("100000.00"), saved.getTargetAmount());
        assertEquals(new BigDecimal("10.00"), saved.getCommissionRate());
    }

    @Test
    void updatesInPlaceInsteadOfCreatingADuplicateForTheSameEmployeeAndMonth() {
        EmployeeSalesTarget current = existing(5L, SEP, "100000.00", "10.00");
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.of(current));

        EmployeeSalesTarget saved = service.upsert(5L, SEP, new BigDecimal("120000"), new BigDecimal("8"));

        // Same row, new values — the (employee, month) unique key is honoured by reuse.
        assertEquals(1L, saved.getId());
        assertEquals(new BigDecimal("120000.00"), saved.getTargetAmount());
        assertEquals(new BigDecimal("8.00"), saved.getCommissionRate());
        verify(targetRepository, times(1)).save(any());
    }

    @Test
    void aSecondUpsertForADifferentMonthCreatesASeparateTarget() {
        LocalDate oct = LocalDate.of(2026, 10, 1);
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.empty());
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, oct)).thenReturn(Optional.empty());

        EmployeeSalesTarget september = service.upsert(5L, SEP, new BigDecimal("100000"), new BigDecimal("10"));
        EmployeeSalesTarget october = service.upsert(5L, oct, new BigDecimal("90000"), new BigDecimal("9"));

        assertEquals(SEP, september.getTargetMonth());
        assertEquals(oct, october.getTargetMonth());
        verify(targetRepository, times(2)).save(any());
    }

    // ── validation ──────────────────────────────────────────────────────────

    @Test
    void rejectsANegativeTargetAmount() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.upsert(5L, SEP, new BigDecimal("-1"), BigDecimal.TEN));
        assertTrue(ex.getMessage().contains("negative"));
        verify(targetRepository, never()).save(any());
    }

    @Test
    void rejectsACommissionRateBelowZero() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.upsert(5L, SEP, new BigDecimal("1000"), new BigDecimal("-0.01")));
        assertTrue(ex.getMessage().contains("negative"));
        verify(targetRepository, never()).save(any());
    }

    @Test
    void rejectsACommissionRateAboveOneHundred() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.upsert(5L, SEP, new BigDecimal("1000"), new BigDecimal("100.01")));
        assertTrue(ex.getMessage().contains("exceed 100"));
        verify(targetRepository, never()).save(any());
    }

    @Test
    void acceptsTheBoundaryValuesZeroAndOneHundred() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(any(), any())).thenReturn(Optional.empty());

        assertEquals(new BigDecimal("0.00"),
                service.upsert(5L, SEP, BigDecimal.ZERO, BigDecimal.ZERO).getCommissionRate());
        assertEquals(new BigDecimal("100.00"),
                service.upsert(5L, SEP, BigDecimal.ZERO, new BigDecimal("100")).getCommissionRate());
    }

    /**
     * DELIBERATELY CHANGED in Phase 2. A null target amount is still coerced to zero — zero is a
     * meaningful target ("none set") and the column stays NOT NULL. A null commission rate is NOT:
     * since commission_rate became nullable (V104), null is the only way to express "commission not
     * configured", which is what target-readiness blocks on. Coercing it to zero here would mark
     * every employee configured-at-0% and make the readiness check unable to fail.
     */
    @Test
    void coercesANullTargetAmountToZeroButPreservesANullCommissionRate() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.empty());

        EmployeeSalesTarget saved = service.upsert(5L, SEP, null, null);

        assertEquals(new BigDecimal("0.00"), saved.getTargetAmount());
        assertNull(saved.getCommissionRate(),
                "null commission must survive as 'not configured', not become 0%");
    }

    @Test
    void anExplicitZeroCommissionIsStoredAsAConfiguredZero() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP)).thenReturn(Optional.empty());

        EmployeeSalesTarget saved = service.upsert(5L, SEP, new BigDecimal("100000"), BigDecimal.ZERO);

        assertEquals(new BigDecimal("0.00"), saved.getCommissionRate());
    }

    @Test
    void clearingACommissionOnAnExistingRowMakesItUnconfiguredAgain() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(5L, SEP))
                .thenReturn(Optional.of(existing(5L, SEP, "100000", "10")));

        EmployeeSalesTarget saved = service.upsert(5L, SEP, new BigDecimal("100000"), null);

        assertNull(saved.getCommissionRate());
    }

    @Test
    void rejectsAMissingEmployee() {
        assertThrows(ResponseStatusException.class,
                () -> service.upsert(null, SEP, BigDecimal.TEN, BigDecimal.ONE));
    }

    @Test
    void rejectsAnEmployeeThatDoesNotExist() {
        when(employeeRepository.existsById(999L)).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.upsert(999L, SEP, BigDecimal.TEN, BigDecimal.ONE));
        assertTrue(ex.getMessage().contains("Employee not found"));
    }

    // ── bulk ────────────────────────────────────────────────────────────────

    @Test
    void bulkSaveWritesNothingAtAllWhenAnyRowIsInvalid() {
        EmployeeSalesTargetUpsertRequest ok = new EmployeeSalesTargetUpsertRequest();
        ok.setEmployeeId(1L);
        ok.setTargetMonth(SEP);
        ok.setTargetAmount(new BigDecimal("100"));
        ok.setCommissionRate(new BigDecimal("5"));

        EmployeeSalesTargetUpsertRequest bad = new EmployeeSalesTargetUpsertRequest();
        bad.setEmployeeId(2L);
        bad.setTargetMonth(SEP);
        bad.setTargetAmount(new BigDecimal("100"));
        bad.setCommissionRate(new BigDecimal("150"));

        assertThrows(ResponseStatusException.class, () -> service.upsertAll(List.of(ok, bad)));
        // The valid row must not have been written either — a bad row in the grid cannot
        // leave the save half-applied.
        verify(targetRepository, never()).save(any());
    }

    @Test
    void bulkSaveAppliesEveryValidRow() {
        when(targetRepository.findByEmployeeIdAndTargetMonth(any(), any())).thenReturn(Optional.empty());

        EmployeeSalesTargetUpsertRequest a = new EmployeeSalesTargetUpsertRequest();
        a.setEmployeeId(1L);
        a.setTargetMonth(LocalDate.of(2026, 9, 14));
        a.setTargetAmount(new BigDecimal("100000"));
        a.setCommissionRate(new BigDecimal("10"));

        EmployeeSalesTargetUpsertRequest b = new EmployeeSalesTargetUpsertRequest();
        b.setEmployeeId(2L);
        b.setTargetMonth(SEP);
        b.setTargetAmount(new BigDecimal("80000"));
        b.setCommissionRate(new BigDecimal("8"));

        List<EmployeeSalesTarget> saved = service.upsertAll(List.of(a, b));

        assertEquals(2, saved.size());
        assertEquals(SEP, saved.get(0).getTargetMonth());
        assertEquals(new BigDecimal("80000.00"), saved.get(1).getTargetAmount());
    }

    @Test
    void bulkSaveOfAnEmptyListIsANoOp() {
        assertTrue(service.upsertAll(List.of()).isEmpty());
        assertTrue(service.upsertAll(null).isEmpty());
        verify(targetRepository, never()).save(any());
    }
}
