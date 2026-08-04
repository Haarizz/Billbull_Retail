package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.pos.session.PosSessionRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BusinessDayStateService} — a read-only reporter over
 * {@link PosSessionRepository}. No wiring into any production decision in Phase 1
 * or 2, so these tests only verify the service correctly delegates to and
 * interprets the repository query, plus (Phase 2) records shadow metrics/logs
 * without throwing or influencing anything.
 */
@ExtendWith(MockitoExtension.class)
class BusinessDayStateServiceTest {

    @Mock private PosSessionRepository sessionRepository;
    @Mock private PosDayCloseRepository dayCloseRepository;
    private SimpleMeterRegistry meterRegistry;

    private BusinessDayStateService service;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        service = new BusinessDayStateService(sessionRepository, dayCloseRepository, meterRegistry);
    }

    @Test
    void findUnclosedBusinessDayDelegatesToRepository() {
        LocalDate unclosed = LocalDate.of(2026, 6, 21);
        when(sessionRepository.findOldestUnclosedTradingDate(1L)).thenReturn(Optional.of(unclosed));

        Optional<LocalDate> result = service.findUnclosedBusinessDay(1L);

        assertTrue(result.isPresent());
        assertEquals(unclosed, result.get());
        verify(sessionRepository).findOldestUnclosedTradingDate(1L);
    }

    @Test
    void findUnclosedBusinessDayReturnsEmptyWhenNothingUnclosed() {
        when(sessionRepository.findOldestUnclosedTradingDate(1L)).thenReturn(Optional.empty());

        assertTrue(service.findUnclosedBusinessDay(1L).isEmpty());
    }

    @Test
    void hasNoActiveBusinessDayIsTrueWhenNothingUnclosed() {
        when(sessionRepository.findOldestUnclosedTradingDate(1L)).thenReturn(Optional.empty());

        assertTrue(service.hasNoActiveBusinessDay(1L));
    }

    @Test
    void hasNoActiveBusinessDayIsFalseWhenAnUnclosedDayExists() {
        when(sessionRepository.findOldestUnclosedTradingDate(1L)).thenReturn(Optional.of(LocalDate.of(2026, 6, 21)));

        assertFalse(service.hasNoActiveBusinessDay(1L));
    }

    /** Shadow-mode diagnostic — exercised directly since Phase 1 wires it into no
     *  production call site; must not throw regardless of debug logging state. */
    @Test
    void logShadowComparisonDoesNotThrowRegardlessOfAgreement() {
        service.logShadowComparison(1L, LocalDate.of(2026, 6, 21), LocalDate.of(2026, 6, 21));
        service.logShadowComparison(1L, LocalDate.of(2026, 6, 21), LocalDate.of(2026, 6, 24));
        service.logShadowComparison(1L, null, LocalDate.of(2026, 6, 24));
    }

    // ---------------------------------------------------------------------
    // Phase 2 — shadow validation metrics (always recorded; diagnostics only)
    // ---------------------------------------------------------------------

    @Test
    void recordShadowValidationIncrementsMatchCounterWhenValuesAgree() {
        LocalDate d = LocalDate.of(2026, 7, 29);

        service.recordShadowValidation(1L, d, d, false);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_MATCH, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_DIFFER, "branchId", "1").count());
    }

    @Test
    void recordShadowValidationIncrementsDifferCounterWhenValuesDisagree() {
        service.recordShadowValidation(1L, LocalDate.of(2026, 7, 26), LocalDate.of(2026, 7, 29), false);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_DIFFER, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_MATCH, "branchId", "1").count());
    }

    @Test
    void recordShadowValidationIncrementsOvernightCounterOnlyWhenConfigured() {
        LocalDate d = LocalDate.of(2026, 7, 29);

        service.recordShadowValidation(1L, d, d, true);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_OVERNIGHT, "branchId", "1").count());
    }

    @Test
    void recordShadowValidationDoesNotThrowWhenLegacyValueIsNull() {
        // A branch that has never seeded PosBusinessDate — defensive, shouldn't happen
        // in practice (seed() always returns a value), but must not blow up shadow mode.
        service.recordShadowValidation(1L, null, LocalDate.of(2026, 7, 29), false);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_DIFFER, "branchId", "1").count());
    }

    @Test
    void recordNoActiveBusinessDayIncrementsItsOwnCounter() {
        service.recordNoActiveBusinessDay(1L);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_NO_ACTIVE, "branchId", "1").count());
    }

    // ---------------------------------------------------------------------
    // Phase 3B.1 — previous-unclosed-day shadow diff logging (no metrics, log
    // only on disagreement)
    // ---------------------------------------------------------------------

    @Test
    void logPreviousUnclosedDayDisagreementDoesNotThrowOnAgreementOrDisagreement() {
        service.logPreviousUnclosedDayDisagreement(1L, true, Optional.of(LocalDate.of(2026, 1, 1)));
        service.logPreviousUnclosedDayDisagreement(1L, false, Optional.empty());
        service.logPreviousUnclosedDayDisagreement(1L, true, Optional.empty());
        service.logPreviousUnclosedDayDisagreement(1L, false, Optional.of(LocalDate.of(2026, 1, 1)));
    }

    // ---------------------------------------------------------------------
    // isBusinessDayClosed
    // ---------------------------------------------------------------------

    @Test
    void isBusinessDayClosedDelegatesToRepository() {
        LocalDate date = LocalDate.of(2026, 1, 1);
        when(dayCloseRepository.existsByBranchIdAndCloseDate(1L, date)).thenReturn(true);

        assertTrue(service.isBusinessDayClosed(1L, date));
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2A — validation outcome metrics/logging
    // ---------------------------------------------------------------------

    private BusinessDayValidationResult result(BusinessDayValidationVerdict verdict, BusinessDayBlockingReason reason) {
        return new BusinessDayValidationResult(LocalDate.of(2026, 1, 1), Optional.empty(), verdict, reason);
    }

    @Test
    void recordValidationOutcomeMatchAllowWhenBothAllow() {
        service.recordValidationOutcome(1L, true, result(BusinessDayValidationVerdict.ALLOW, BusinessDayBlockingReason.NONE));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_ALLOW, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_MATCH_ALLOW, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_DIFF_NEW_BLOCKS, "branchId", "1").count());
    }

    @Test
    void recordValidationOutcomeMatchBlockWhenBothBlock() {
        service.recordValidationOutcome(1L, false, result(BusinessDayValidationVerdict.BLOCK, BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_BLOCK, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_MATCH_BLOCK, "branchId", "1").count());
    }

    @Test
    void recordValidationOutcomeDiffNewBlocksWhenLegacyAllowedButNewBlocks() {
        service.recordValidationOutcome(1L, true, result(BusinessDayValidationVerdict.BLOCK, BusinessDayBlockingReason.BUSINESS_DAY_ALREADY_CLOSED));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_DIFF_NEW_BLOCKS, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_MATCH_ALLOW, "branchId", "1").count());
    }

    @Test
    void recordValidationOutcomeDiffNewAllowsWhenLegacyBlockedButNewAllows() {
        service.recordValidationOutcome(1L, false, result(BusinessDayValidationVerdict.ALLOW, BusinessDayBlockingReason.NONE));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_DIFF_NEW_ALLOWS, "branchId", "1").count());
    }

    @Test
    void recordValidationOutcomeUnexpectedStateIncrementsItsOwnCounterAndTreatedAsBlockForAgreement() {
        service.recordValidationOutcome(1L, true, result(BusinessDayValidationVerdict.UNEXPECTED_STATE, BusinessDayBlockingReason.UNEXPECTED_STATE));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_UNEXPECTED_STATE, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_DIFF_NEW_BLOCKS, "branchId", "1").count());
    }

    @Test
    void recordValidationErrorIncrementsErrorCounterAndDoesNotThrow() {
        service.recordValidationError(1L, new RuntimeException("boom"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_ERROR, "branchId", "1").count());
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2A.6 — Infrastructure Failure Policy metrics
    // ---------------------------------------------------------------------

    @Test
    void recordInfrastructureFailureRepositoryIncrementsUmbrellaAndCategorySpecificCounters() {
        service.recordInfrastructureFailure(1L, BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                new RuntimeException("db timeout"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_INFRASTRUCTURE_ERROR, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_REPOSITORY_ERROR, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_SETTINGS_ERROR, "branchId", "1").count());
    }

    @Test
    void recordInfrastructureFailureSettingsIncrementsUmbrellaAndSettingsCounter() {
        service.recordInfrastructureFailure(1L, BusinessDayInfrastructureException.FailureCategory.SETTINGS,
                new RuntimeException("settings lookup failed"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_INFRASTRUCTURE_ERROR, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_SETTINGS_ERROR, "branchId", "1").count());
    }

    @Test
    void recordInfrastructureFailureUnexpectedIncrementsOnlyUmbrella() {
        service.recordInfrastructureFailure(1L, BusinessDayInfrastructureException.FailureCategory.UNEXPECTED,
                new RuntimeException("clock source failure"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_INFRASTRUCTURE_ERROR, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_REPOSITORY_ERROR, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_SETTINGS_ERROR, "branchId", "1").count());
    }

    @Test
    void recordInfrastructureFailureAlsoIncrementsLegacyValidationErrorMetricForBackwardCompatibility() {
        service.recordInfrastructureFailure(1L, BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                new RuntimeException("boom"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_ERROR, "branchId", "1").count());
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2B — Enforcement (feature-flag controlled) metrics
    // ---------------------------------------------------------------------

    @Test
    void recordFeatureFlagRequestIncrementsEnabledCounterWhenTrue() {
        service.recordFeatureFlagRequest(1L, true);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_FLAG_ENABLED_REQUESTS, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_FLAG_DISABLED_REQUESTS, "branchId", "1").count());
    }

    @Test
    void recordFeatureFlagRequestIncrementsDisabledCounterWhenFalse() {
        service.recordFeatureFlagRequest(1L, false);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_FLAG_DISABLED_REQUESTS, "branchId", "1").count());
        assertEquals(0.0, meterRegistry.counter(BusinessDayStateService.METRIC_FLAG_ENABLED_REQUESTS, "branchId", "1").count());
    }

    @Test
    void recordEnforcementDecisionIncrementsAllowCounter() {
        BusinessDayValidationResult allow = new BusinessDayValidationResult(
                LocalDate.of(2026, 1, 1), Optional.empty(), BusinessDayValidationVerdict.ALLOW, BusinessDayBlockingReason.NONE);

        service.recordEnforcementDecision(1L, allow);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_ENFORCEMENT_ALLOW, "branchId", "1").count());
    }

    @Test
    void recordEnforcementDecisionIncrementsBlockCounter() {
        BusinessDayValidationResult block = new BusinessDayValidationResult(
                LocalDate.of(2026, 1, 1), Optional.of(LocalDate.of(2025, 12, 30)),
                BusinessDayValidationVerdict.BLOCK, BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN);

        service.recordEnforcementDecision(1L, block);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_ENFORCEMENT_BLOCK, "branchId", "1").count());
    }

    @Test
    void recordEnforcementDecisionIncrementsUnexpectedStateCounter() {
        BusinessDayValidationResult unexpected = new BusinessDayValidationResult(
                LocalDate.of(2026, 1, 1), Optional.of(LocalDate.of(2026, 1, 5)),
                BusinessDayValidationVerdict.UNEXPECTED_STATE, BusinessDayBlockingReason.UNEXPECTED_STATE);

        service.recordEnforcementDecision(1L, unexpected);

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_ENFORCEMENT_UNEXPECTED_STATE, "branchId", "1").count());
    }

    @Test
    void recordEnforcementFallbackIncrementsFallbackAndInfrastructureMetrics() {
        service.recordEnforcementFallback(1L, BusinessDayInfrastructureException.FailureCategory.SETTINGS,
                new RuntimeException("settings down"));

        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_ENFORCEMENT_FALLBACK, "branchId", "1").count());
        // Reuses the existing infrastructure-failure recording, so those metrics fire too.
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_INFRASTRUCTURE_ERROR, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_SETTINGS_ERROR, "branchId", "1").count());
        assertEquals(1.0, meterRegistry.counter(BusinessDayStateService.METRIC_VALIDATION_ERROR, "branchId", "1").count());
    }
}
