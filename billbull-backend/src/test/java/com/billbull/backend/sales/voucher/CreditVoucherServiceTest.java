package com.billbull.backend.sales.voucher;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.security.AuditLogService;

/**
 * Credit voucher lifecycle: issue, validate, redeem, cancel.
 *
 * <p>A voucher is store credit the business owes a customer, so the two things that must never
 * break are that it cannot be issued twice for one return, and cannot be spent for more than it
 * holds.
 */
@ExtendWith(MockitoExtension.class)
class CreditVoucherServiceTest {

    @Mock private CreditVoucherRepository voucherRepository;
    @Mock private CreditVoucherTransactionRepository transactionRepository;
    @Mock private CreditVoucherCodeGenerator codeGenerator;
    @Mock private CreditVoucherPolicy policy;
    @Mock private CreditVoucherExpiryResolver expiryResolver;
    @Mock private PostingEngineService postingEngine;
    @Mock private AuditLogService auditLogService;

    @InjectMocks private CreditVoucherService service;

    // =================================================================
    // Issue
    // =================================================================

    @Test
    void issuingCreatesAnActiveVoucherAtFullBalanceWithAnIssueLedgerEntry() {
        stubGeneration();
        when(voucherRepository.findBySourceReturnNumber("SR-1")).thenReturn(Optional.empty());
        when(expiryResolver.resolveExpiryDate(any(), any())).thenReturn(LocalDate.now().plusMonths(12));
        when(voucherRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        CreditVoucher v = service.issueForSalesReturn(9L, "SR-1", "INV-1", new BigDecimal("500.00"),
                "CUST-1", "Ahmed", "+971500000000", null);

        assertEquals(new BigDecimal("500.00"), v.getOriginalAmount());
        assertEquals(BigDecimal.ZERO, v.getUsedAmount());
        assertEquals(new BigDecimal("500.00"), v.getRemainingAmount());
        assertEquals(CreditVoucherStatus.ACTIVE, v.getStatus());
        assertEquals("SR-1", v.getSourceReturnNumber());
        assertEquals("INV-1", v.getSourceInvoiceNumber());
        assertEquals("CUST-1", v.getCustomerCode());
        assertNotNull(v.getExpiryDate(), "expiry must be persisted, not left for the client to invent");

        ArgumentCaptor<CreditVoucherTransaction> txn = ArgumentCaptor.forClass(CreditVoucherTransaction.class);
        verify(transactionRepository).save(txn.capture());
        assertEquals(CreditVoucherTransactionType.ISSUED, txn.getValue().getTransactionType());
        assertEquals(0, BigDecimal.ZERO.compareTo(txn.getValue().getBalanceBefore()));
        assertEquals(0, new BigDecimal("500.00").compareTo(txn.getValue().getBalanceAfter()));

        // Dr AR / Cr Credit Vouchers Issued — clears the credit the return left on AR.
        verify(postingEngine).createJournalFromCreditVoucherIssue(any(), anyString(),
                any(BigDecimal.class), any(), any());
    }

    @Test
    void issuingTwiceForOneReturnReturnsTheOriginalRatherThanMintingASecond() {
        CreditVoucher existing = voucher(new BigDecimal("500.00"));
        when(voucherRepository.findBySourceReturnNumber("SR-1")).thenReturn(Optional.of(existing));

        CreditVoucher v = service.issueForSalesReturn(9L, "SR-1", "INV-1", new BigDecimal("500.00"),
                null, null, null, null);

        assertSame(existing, v, "a retried confirmation must not issue a second voucher");
        verify(voucherRepository, never()).save(any());
        verify(postingEngine, never()).createJournalFromCreditVoucherIssue(any(), anyString(), any(), any(), any());
    }

    @Test
    void issuingRefusesANonPositiveAmount() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.issueForSalesReturn(9L, "SR-1", "INV-1", BigDecimal.ZERO,
                        null, null, null, null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void issuingRefusesWithoutASalesReturnReference() {
        // A voucher with no source return would be untraceable credit and un-idempotent.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.issueForSalesReturn(9L, null, "INV-1", new BigDecimal("10"),
                        null, null, null, null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void issuingRefusesBelowTheConfiguredMinimum() {
        // The minimum is checked before the idempotency lookup, so no repository stub is needed.
        when(policy.getMinimumAmount()).thenReturn(new BigDecimal("50"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.issueForSalesReturn(9L, "SR-1", "INV-1", new BigDecimal("20"),
                        null, null, null, null));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    void aWalkInReturnStillProducesAUsableBearerVoucher() {
        stubGeneration();
        when(voucherRepository.findBySourceReturnNumber("SR-1")).thenReturn(Optional.empty());
        when(voucherRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        CreditVoucher v = service.issueForSalesReturn(9L, "SR-1", "INV-1", new BigDecimal("100"),
                null, null, null, null);

        assertNull(v.getCustomerCode());
        assertEquals(CreditVoucherStatus.ACTIVE, v.getStatus(), "guest returns are supported, so this must issue");
    }

    // =================================================================
    // Redeem
    // =================================================================

    @Test
    void partialRedemptionLeavesTheRemainderOnTheVoucher() {
        CreditVoucher v = voucher(new BigDecimal("500.00"));
        stubForRedemption(v);

        service.redeem(1L, new BigDecimal("320.00"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null);

        assertEquals(0, new BigDecimal("320.00").compareTo(v.getUsedAmount()));
        assertEquals(0, new BigDecimal("180.00").compareTo(v.getRemainingAmount()));
        assertEquals(CreditVoucherStatus.PARTIALLY_REDEEMED, v.getStatus(),
                "a voucher must not be marked fully redeemed on first use");
    }

    @Test
    void redeemingTheExactBalanceFullyRedeemsIt() {
        CreditVoucher v = voucher(new BigDecimal("180.00"));
        stubForRedemption(v);

        service.redeem(1L, new BigDecimal("180.00"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null);

        assertEquals(0, BigDecimal.ZERO.compareTo(v.getRemainingAmount()));
        assertEquals(CreditVoucherStatus.FULLY_REDEEMED, v.getStatus());
    }

    @Test
    void successiveRedemptionsDrawTheBalanceDownToZero() {
        CreditVoucher v = voucher(new BigDecimal("500.00"));
        stubForRedemption(v);

        service.redeem(1L, new BigDecimal("320.00"), "INV-1", 1L, 1L, "T1", 76L, LocalDate.now(), null);
        assertEquals(CreditVoucherStatus.PARTIALLY_REDEEMED, v.getStatus());

        service.redeem(1L, new BigDecimal("100.00"), "INV-2", 2L, 1L, "T1", 76L, LocalDate.now(), null);
        assertEquals(0, new BigDecimal("80.00").compareTo(v.getRemainingAmount()));

        service.redeem(1L, new BigDecimal("80.00"), "INV-3", 3L, 1L, "T1", 76L, LocalDate.now(), null);
        assertEquals(0, BigDecimal.ZERO.compareTo(v.getRemainingAmount()));
        assertEquals(CreditVoucherStatus.FULLY_REDEEMED, v.getStatus());

        // used + remaining = original holds throughout.
        assertEquals(0, v.getUsedAmount().add(v.getRemainingAmount()).compareTo(v.getOriginalAmount()));
    }

    @Test
    void redeemingMoreThanTheBalanceIsRefusedRatherThanClamped() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        stubForRedemption(v);

        // Silently applying 100 would leave the sale under-settled while the receipt claims 150.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.redeem(1L, new BigDecimal("150.00"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals(0, new BigDecimal("100.00").compareTo(v.getRemainingAmount()), "balance must be untouched");
    }

    @Test
    void anExpiredVoucherIsRefusedEvenWhenItsStatusHasNotBeenSwept() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        v.setExpiryDate(LocalDate.now().minusDays(1));
        v.setStatus(CreditVoucherStatus.ACTIVE); // sweep has not run
        stubForRedemption(v);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.redeem(1L, new BigDecimal("10"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().toLowerCase().contains("expired"), ex.getReason());
    }

    @Test
    void aCancelledVoucherIsRefused() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        v.setStatus(CreditVoucherStatus.CANCELLED);
        stubForRedemption(v);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.redeem(1L, new BigDecimal("10"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    void aZeroBalanceVoucherIsRefused() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        v.redeem(new BigDecimal("100.00"));
        stubForRedemption(v);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.redeem(1L, new BigDecimal("10"), "INV-9", 9L, 1L, "T1", 76L, LocalDate.now(), null));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    void redemptionIsRefusedAtAnotherBranchWhenBranchRestrictionIsOn() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        com.billbull.backend.settings.branch.Branch issuing = new com.billbull.backend.settings.branch.Branch();
        ReflectionTestUtils.setField(issuing, "id", 1L);
        issuing.setName("Dubai HQ");
        v.setBranch(issuing);
        stubForRedemption(v);
        when(policy.isBranchRestricted()).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.redeem(1L, new BigDecimal("10"), "INV-9", 9L, 2L, "T1", 76L, LocalDate.now(), null));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Dubai HQ"), ex.getReason());
    }

    @Test
    void aRetriedRedemptionForTheSameInvoiceDoesNotDrawTheVoucherTwice() {
        CreditVoucher v = voucher(new BigDecimal("500.00"));
        when(voucherRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(v));

        CreditVoucherTransaction already = new CreditVoucherTransaction();
        already.setVoucher(v);
        when(transactionRepository.findByReferenceTypeAndReferenceNumberAndTransactionType(
                CreditVoucherService.REF_TYPE_SALES_INVOICE, "INV-9", CreditVoucherTransactionType.REDEEMED))
                .thenReturn(List.of(already));

        CreditVoucherTransaction result = service.redeem(1L, new BigDecimal("100"), "INV-9", 9L,
                1L, "T1", 76L, LocalDate.now(), null);

        assertSame(already, result);
        assertEquals(0, new BigDecimal("500.00").compareTo(v.getRemainingAmount()), "balance must be untouched");
        verify(postingEngine, never()).createJournalFromCreditVoucherRedemption(
                any(), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void redemptionRecordsAFullyAttributedLedgerEntry() {
        CreditVoucher v = voucher(new BigDecimal("500.00"));
        stubForRedemption(v);

        service.redeem(1L, new BigDecimal("120.00"), "INV-9", 9L, 3L, "T-77", 76L,
                LocalDate.of(2026, 8, 14), null);

        ArgumentCaptor<CreditVoucherTransaction> txn = ArgumentCaptor.forClass(CreditVoucherTransaction.class);
        verify(transactionRepository).save(txn.capture());
        CreditVoucherTransaction t = txn.getValue();

        assertEquals(CreditVoucherTransactionType.REDEEMED, t.getTransactionType());
        assertEquals(0, new BigDecimal("500.00").compareTo(t.getBalanceBefore()));
        assertEquals(0, new BigDecimal("380.00").compareTo(t.getBalanceAfter()));
        assertEquals("INV-9", t.getReferenceNumber());
        assertEquals("T-77", t.getPosTerminalId());
        assertEquals(Long.valueOf(76L), t.getPosSessionId());
        assertEquals(Long.valueOf(3L), t.getBranchId());
        assertEquals(LocalDate.of(2026, 8, 14), t.getBusinessDate());
    }

    // =================================================================
    // Balance invariant
    // =================================================================

    @Test
    void theEntityRefusesOverRedemptionAndNegativeAmounts() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));

        assertThrows(IllegalArgumentException.class, () -> v.redeem(new BigDecimal("100.01")));
        assertThrows(IllegalArgumentException.class, () -> v.redeem(BigDecimal.ZERO));
        assertThrows(IllegalArgumentException.class, () -> v.redeem(new BigDecimal("-5")));
        assertEquals(0, new BigDecimal("100.00").compareTo(v.getRemainingAmount()));
    }

    @Test
    void expiryIsEvaluatedAgainstTheDateNotTheStatus() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        v.setExpiryDate(LocalDate.of(2026, 8, 14));

        assertFalse(v.isExpiredOn(LocalDate.of(2026, 8, 14)), "the expiry day itself is still valid");
        assertTrue(v.isExpiredOn(LocalDate.of(2026, 8, 15)));

        v.setExpiryDate(null);
        assertFalse(v.isExpiredOn(LocalDate.of(2099, 1, 1)), "a null expiry means it never expires");
    }

    // =================================================================
    // Cancel
    // =================================================================

    @Test
    void cancellingReleasesTheRemainderAndKeepsTheVoucher() {
        CreditVoucher v = voucher(new BigDecimal("500.00"));
        v.redeem(new BigDecimal("200.00"));
        when(voucherRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(v));
        when(voucherRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        CreditVoucher cancelled = service.cancel(1L, "Issued in error");

        assertEquals(CreditVoucherStatus.CANCELLED, cancelled.getStatus());
        assertEquals(0, BigDecimal.ZERO.compareTo(cancelled.getRemainingAmount()));
        assertEquals(0, new BigDecimal("200.00").compareTo(cancelled.getUsedAmount()),
                "already-redeemed value is untouched by cancellation");

        // Only the unredeemed remainder (300) is released back.
        verify(postingEngine).createJournalFromCreditVoucherCancellation(any(), anyString(),
                org.mockito.ArgumentMatchers.argThat(a -> a.compareTo(new BigDecimal("300.00")) == 0),
                any(), any());
    }

    @Test
    void cancellingRequiresAReasonAndRefusesTerminalVouchers() {
        CreditVoucher v = voucher(new BigDecimal("100.00"));
        lenient().when(voucherRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(v));

        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.cancel(1L, "  ")).getStatusCode());

        v.redeem(new BigDecimal("100.00")); // now FULLY_REDEEMED
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.cancel(1L, "changed mind")).getStatusCode());
    }

    // =================================================================

    private void stubGeneration() {
        when(codeGenerator.generateVoucherNumber()).thenReturn("CV-2026-000001");
        when(codeGenerator.generateVoucherCode()).thenReturn("7KQ4-9PXM-2W8R");
        lenient().when(codeGenerator.buildBarcodeValue(anyString())).thenReturn("7KQ49PXM2W8R");
    }

    private void stubForRedemption(CreditVoucher v) {
        when(voucherRepository.findByIdForUpdate(anyLong())).thenReturn(Optional.of(v));
        lenient().when(voucherRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        lenient().when(transactionRepository.findByReferenceTypeAndReferenceNumberAndTransactionType(
                anyString(), anyString(), any())).thenReturn(List.of());
    }

    private static CreditVoucher voucher(BigDecimal amount) {
        CreditVoucher v = new CreditVoucher();
        ReflectionTestUtils.setField(v, "id", 1L);
        v.setVoucherNumber("CV-2026-000001");
        v.setVoucherCode("7KQ4-9PXM-2W8R");
        v.setOriginalAmount(amount);
        v.setUsedAmount(BigDecimal.ZERO);
        v.setRemainingAmount(amount);
        v.setIssueDate(LocalDate.now());
        v.setStatus(CreditVoucherStatus.ACTIVE);
        v.setSourceReturnNumber("SR-1");
        return v;
    }
}
