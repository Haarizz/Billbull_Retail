package com.billbull.backend.sales.voucher;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.Branch;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * The Credit Voucher expiry policy (§9–§17).
 *
 * <p>The cases that matter here are the ones where getting it wrong costs real money: a branch
 * that never configured anything must keep issuing exactly the 12-month vouchers it always did,
 * and no configuration must ever be able to produce a voucher that is expired on the day it is
 * printed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CreditVoucherExpiryResolverTest {

    private static final LocalDate ISSUE = LocalDate.of(2026, 8, 14);

    @Mock private PosSettingsRepository posSettingsRepository;
    @Mock private CreditVoucherPolicy policy;

    @InjectMocks private CreditVoucherExpiryResolver resolver;

    // =====================================================================
    // Resolution
    // =====================================================================

    @Test
    void anUnconfiguredBranchKeepsTheGlobalTwelveMonthDefault() {
        // §17 — the backward-compatibility case. No settings row at all.
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.empty());
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        assertEquals(LocalDate.of(2027, 8, 14), resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    @Test
    void aBranchWithSettingsButNoVoucherPolicyStillFallsBackToTheGlobalDefault() {
        // The far more common case in an existing deployment: the settings row exists (every
        // branch has one) but the new columns are null.
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings(null, null, null)));
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        assertEquals(LocalDate.of(2027, 8, 14), resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    @Test
    void automaticModeAddsTheConfiguredMonthsToTheIssueDate() {
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("AUTO", 6, null)));

        assertEquals(LocalDate.of(2027, 2, 14), resolver.resolveExpiryDate(branch(7L), ISSUE));
        verify(policy, never()).resolveExpiryDate(any());
    }

    @Test
    void automaticModeWithZeroMonthsMeansNeverExpires() {
        // Not "misconfigured" — several jurisdictions prohibit expiring store credit.
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("AUTO", 0, null)));

        assertNull(resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    @Test
    void manualModeUsesTheConfiguredDateExactly() {
        LocalDate fixed = LocalDate.of(2026, 11, 14);
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("MANUAL", null, fixed)));

        assertEquals(fixed, resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    @Test
    void aManualDateThatHasLapsedFallsBackRatherThanIssuingADeadVoucher() {
        // The admin set a fixed date months ago and it has since passed. Honouring it would hand
        // the customer a voucher that expired before it was printed; failing the call would strand
        // them at the till mid-refund. Neither is acceptable, so the default window is used.
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("MANUAL", null, ISSUE.minusDays(1))));
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        LocalDate resolved = resolver.resolveExpiryDate(branch(7L), ISSUE);

        assertEquals(LocalDate.of(2027, 8, 14), resolved);
        assertTrue(resolved.isAfter(ISSUE), "a resolved expiry must always be after the issue date");
    }

    @Test
    void aManualDateEqualToTheIssueDateIsAlsoRefused() {
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("MANUAL", null, ISSUE)));
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        assertEquals(LocalDate.of(2027, 8, 14), resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    @Test
    void aReturnWithNoBranchUsesTheGlobalDefaultWithoutTouchingSettings() {
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        assertEquals(LocalDate.of(2027, 8, 14), resolver.resolveExpiryDate(null, ISSUE));
        verify(posSettingsRepository, never()).findByBranchId(any());
    }

    @Test
    void anUnrecognisedModeFallsBackInsteadOfThrowing() {
        when(posSettingsRepository.findByBranchId(7L))
                .thenReturn(Optional.of(settings("SOMETHING_ELSE", 3, null)));
        when(policy.resolveExpiryDate(ISSUE)).thenReturn(ISSUE.plusMonths(12));

        assertEquals(LocalDate.of(2027, 8, 14), resolver.resolveExpiryDate(branch(7L), ISSUE));
    }

    // =====================================================================
    // Configuration validation (§13)
    // =====================================================================

    @Test
    void noConfiguredModeIsValid() {
        assertTrue(CreditVoucherExpiryResolver.validate(null, null, null, ISSUE).isEmpty());
        assertTrue(CreditVoucherExpiryResolver.validate("", null, null, ISSUE).isEmpty());
    }

    @Test
    void automaticRequiresANonNegativeMonthCount() {
        assertTrue(CreditVoucherExpiryResolver.validate("AUTO", 12, null, ISSUE).isEmpty());
        assertTrue(CreditVoucherExpiryResolver.validate("AUTO", 0, null, ISSUE).isEmpty());
        assertTrue(CreditVoucherExpiryResolver.validate("AUTO", null, null, ISSUE).isPresent());
        assertTrue(CreditVoucherExpiryResolver.validate("AUTO", -1, null, ISSUE).isPresent());
        assertTrue(CreditVoucherExpiryResolver.validate("AUTO", 601, null, ISSUE).isPresent());
    }

    @Test
    void manualRequiresAFutureDate() {
        assertTrue(CreditVoucherExpiryResolver.validate("MANUAL", null, ISSUE.plusDays(1), ISSUE).isEmpty());
        assertTrue(CreditVoucherExpiryResolver.validate("MANUAL", null, null, ISSUE).isPresent());
        assertTrue(CreditVoucherExpiryResolver.validate("MANUAL", null, ISSUE.minusDays(1), ISSUE).isPresent(),
                "a past expiry date must be refused");
        assertTrue(CreditVoucherExpiryResolver.validate("MANUAL", null, ISSUE, ISSUE).isPresent(),
                "today is not a valid expiry date — the voucher would be dead on issue");
    }

    @Test
    void anUnknownModeIsRefusedAtConfigurationTime() {
        assertTrue(CreditVoucherExpiryResolver.validate("WHENEVER", 12, null, ISSUE).isPresent());
    }

    @Test
    void modeIsCaseAndWhitespaceInsensitive() {
        assertTrue(CreditVoucherExpiryResolver.validate("  auto ", 12, null, ISSUE).isEmpty());
    }

    // =====================================================================

    private static Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        return b;
    }

    private static PosSettings settings(String mode, Integer months, LocalDate date) {
        PosSettings s = new PosSettings();
        s.setCreditVoucherExpiryMode(mode);
        s.setCreditVoucherExpiryMonths(months);
        s.setCreditVoucherExpiryDate(date);
        return s;
    }
}
