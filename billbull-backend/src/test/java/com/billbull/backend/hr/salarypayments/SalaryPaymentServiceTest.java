package com.billbull.backend.hr.salarypayments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;

@ExtendWith(MockitoExtension.class)
class SalaryPaymentServiceTest {

    @Mock
    private SalaryPaymentRepository repository;

    @Mock
    private PostingEngineService postingEngineService;

    @InjectMocks
    private SalaryPaymentService service;

    @Test
    void payingARecordThatIsAlreadyPaidIsRejected() {
        SalaryPayment record = pendingRecord();
        record.setStatus("Paid");
        record.setPaymentDate(LocalDate.of(2026, 3, 5));
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(record));

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> service.processSinglePayment(request(1L)));

        assertTrue(ex.getMessage().contains("already marked Paid"), ex.getMessage());
        verify(repository, never()).save(any(SalaryPayment.class));
        verifyNoInteractions(postingEngineService);
    }

    @Test
    void payingADuplicatePendingRowForAnAlreadyPaidEmployeeIsRejected() {
        SalaryPayment duplicate = pendingRecord();
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(duplicate));
        // A different row for the same employee and period is already Paid.
        when(repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus("EMP001", 3, 2026, "Paid"))
                .thenReturn(true);

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> service.processSinglePayment(request(1L)));

        assertTrue(ex.getMessage().contains("already been paid for March 2026"), ex.getMessage());
        verify(repository, never()).save(any(SalaryPayment.class));
        verifyNoInteractions(postingEngineService);
    }

    @Test
    void firstPaymentForThePeriodGoesThrough() {
        SalaryPayment record = pendingRecord();
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(record));
        when(repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus("EMP001", 3, 2026, "Paid"))
                .thenReturn(false);
        when(repository.save(any(SalaryPayment.class))).thenAnswer(i -> i.getArgument(0));

        SalaryPayment saved = service.processSinglePayment(request(1L));

        assertEquals("Paid", saved.getStatus());
        verify(repository).save(record);
    }

    @Test
    void creatingARecordAccruesTheSalaryPayableLiability() {
        SalaryPaymentRequest req = new SalaryPaymentRequest();
        req.setEmployeeId("EMP001");
        req.setName("John Smith");
        req.setDept("Sales");
        req.setBase(new BigDecimal("4500.00"));
        req.setAllow(new BigDecimal("700.00"));
        req.setDeduct(new BigDecimal("200.00"));
        req.setMonth(3);
        req.setYear(2026);

        when(repository.findByEmployeeIdAndSalaryMonthAndSalaryYear("EMP001", 3, 2026))
                .thenReturn(List.of());
        when(repository.save(any(SalaryPayment.class))).thenAnswer(i -> i.getArgument(0));

        SalaryPayment created = service.createPaymentRecord(req);

        assertEquals("Pending", created.getStatus());
        assertEquals(new BigDecimal("5000.00"), created.getNetPayable());

        // Dr Salary Expense (gross) / Cr Salary Payable (net) — the liability is
        // recognised while the payment is still Pending, which is what makes the
        // 2200 balance equal the outstanding payroll.
        verify(postingEngineService).createJournalFromPayrollRun(
                eq("EMP001"), eq("John Smith"),
                eq(new BigDecimal("5200.00")), eq(new BigDecimal("5000.00")),
                eq(BigDecimal.ZERO), eq(new BigDecimal("200.00")),
                eq(2026), eq(3), eq("Sales"), any(LocalDate.class));
        // No disbursement until the record is actually paid.
        verifyNoMoreInteractions(postingEngineService);
    }

    @Test
    void payingARecordDisbursesAgainstTheAccruedPayable() {
        SalaryPayment record = pendingRecord();
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(record));
        when(repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus("EMP001", 3, 2026, "Paid"))
                .thenReturn(false);
        when(repository.save(any(SalaryPayment.class))).thenAnswer(i -> i.getArgument(0));

        service.processSinglePayment(request(1L));

        // Dr Salary Payable / Cr Bank clears what the accrual raised.
        verify(postingEngineService).createJournalFromWpsDisbursement(
                eq("SINGLE-1"), anyString(), eq(new BigDecimal("5000.00")),
                eq(LocalDate.of(2026, 3, 28)));
        // The accrual call is the legacy backfill — idempotent by reference, so it
        // does nothing for a record accrued at creation.
        verify(postingEngineService).createJournalFromPayrollRun(
                anyString(), anyString(), any(), any(), any(), any(),
                anyInt(), anyInt(), any(), any());
    }

    @Test
    void creatingASecondRecordForTheSamePeriodIsRejected() {
        SalaryPaymentRequest req = new SalaryPaymentRequest();
        req.setEmployeeId("EMP001");
        req.setMonth(3);
        req.setYear(2026);

        when(repository.findByEmployeeIdAndSalaryMonthAndSalaryYear("EMP001", 3, 2026))
                .thenReturn(List.of(pendingRecord()));

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> service.createPaymentRecord(req));

        assertTrue(ex.getMessage().contains("already exists for March 2026"), ex.getMessage());
        verify(repository, never()).save(any(SalaryPayment.class));
    }

    @Test
    void bulkPaymentSkipsEmployeesAlreadyPaidForThePeriod() {
        BulkPaymentRequest req = new BulkPaymentRequest();
        req.setEmployeeIds(List.of("EMP001"));
        req.setPaymentMethod("Bank Transfer");
        req.setDate(LocalDate.of(2026, 3, 28));
        req.setMonth(3);
        req.setYear(2026);

        when(repository.findByEmployeeIdInAndStatusAndSalaryMonthAndSalaryYear(
                List.of("EMP001"), "Pending", 3, 2026)).thenReturn(List.of(pendingRecord()));
        when(repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus("EMP001", 3, 2026, "Paid"))
                .thenReturn(true);

        String message = service.processBulkPayment(req);

        assertTrue(message.contains("already paid"), message);
        verify(repository, never()).saveAll(any());
        verifyNoInteractions(postingEngineService);
    }

    @Test
    void bulkPaymentOnlyTouchesTheRequestedPeriod() {
        BulkPaymentRequest req = new BulkPaymentRequest();
        req.setEmployeeIds(List.of("EMP001"));
        req.setPaymentMethod("Bank Transfer");
        req.setDate(LocalDate.of(2026, 3, 28));
        req.setMonth(3);
        req.setYear(2026);

        when(repository.findByEmployeeIdInAndStatusAndSalaryMonthAndSalaryYear(
                List.of("EMP001"), "Pending", 3, 2026)).thenReturn(List.of(pendingRecord()));
        when(repository.existsByEmployeeIdAndSalaryMonthAndSalaryYearAndStatus("EMP001", 3, 2026, "Paid"))
                .thenReturn(false);

        String message = service.processBulkPayment(req);

        assertTrue(message.contains("Paid 1 salary record for March 2026"), message);
        verify(repository).saveAll(any());
        // Never the period-blind lookup that swept in other months.
        verify(repository, never()).findByEmployeeIdInAndStatus(any(), anyString());
        verify(repository, never()).findBySalaryMonthAndSalaryYear(anyInt(), anyInt());
    }

    private SalaryPayment pendingRecord() {
        SalaryPayment record = new SalaryPayment();
        record.setId(1L);
        record.setEmployeeId("EMP001");
        record.setEmployeeName("John Smith");
        record.setNetPayable(new BigDecimal("5000.00"));
        record.setSalaryMonth(3);
        record.setSalaryYear(2026);
        record.setStatus("Pending");
        return record;
    }

    private ProcessPaymentRequest request(Long recordId) {
        ProcessPaymentRequest req = new ProcessPaymentRequest();
        req.setRecordId(recordId);
        req.setEmployeeId("EMP001");
        req.setPaymentMethod("Bank Transfer");
        req.setDate(LocalDate.of(2026, 3, 28));
        return req;
    }
}
