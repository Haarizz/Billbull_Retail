package com.billbull.backend.pos.businessdate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BusinessDayValidationService} — composes
 * {@link BusinessDayResolver} (pure) and {@link BusinessDayStateService} (mocked
 * here) into a single verdict. No Spring context needed.
 */
@ExtendWith(MockitoExtension.class)
class BusinessDayValidationServiceTest {

    @Mock private BusinessDayStateService businessDayStateService;

    private BusinessDayValidationService service;

    @BeforeEach
    void setUp() {
        service = new BusinessDayValidationService(businessDayStateService);
    }

    private static LocalDateTime at(int y, int m, int d, int h, int min) {
        return LocalDateTime.of(y, m, d, h, min);
    }

    @Test
    void noPreviousBusinessDayAndCandidateNotClosedResultsInAllow() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.isBusinessDayClosed(1L, LocalDate.of(2026, 1, 5))).thenReturn(false);

        BusinessDayValidationResult result = service.validate(1L, now, BusinessDaySettings.disabled());

        assertEquals(LocalDate.of(2026, 1, 5), result.candidateBusinessDay());
        assertEquals(BusinessDayValidationVerdict.ALLOW, result.verdict());
        assertEquals(BusinessDayBlockingReason.NONE, result.blockingReason());
        assertEquals(Optional.empty(), result.previousUnclosedBusinessDay());
    }

    @Test
    void sameBusinessDayAsUnclosedResultsInAllow() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(LocalDate.of(2026, 1, 5)));

        BusinessDayValidationResult result = service.validate(1L, now, BusinessDaySettings.disabled());

        assertEquals(BusinessDayValidationVerdict.ALLOW, result.verdict());
        assertEquals(BusinessDayBlockingReason.NONE, result.blockingReason());
    }

    @Test
    void previousBusinessDayStrictlyBeforeCandidateResultsInBlock() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(LocalDate.of(2026, 1, 1)));

        BusinessDayValidationResult result = service.validate(1L, now, BusinessDaySettings.disabled());

        assertEquals(BusinessDayValidationVerdict.BLOCK, result.verdict());
        assertEquals(BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN, result.blockingReason());
        assertEquals(Optional.of(LocalDate.of(2026, 1, 1)), result.previousUnclosedBusinessDay());
    }

    @Test
    void overnightBusinessDayIsResolvedBeforeComparison() {
        // 08:00 -> 02:00 overnight window; 00:30 on Jan 6 rolls back to Jan 5.
        BusinessDaySettings settings = new BusinessDaySettings(true, LocalTime.of(8, 0), LocalTime.of(2, 0));
        LocalDateTime now = at(2026, 1, 6, 0, 30);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(LocalDate.of(2026, 1, 5)));

        BusinessDayValidationResult result = service.validate(1L, now, settings);

        assertEquals(LocalDate.of(2026, 1, 5), result.candidateBusinessDay());
        assertEquals(BusinessDayValidationVerdict.ALLOW, result.verdict()); // same day as the unclosed one
    }

    @Test
    void noPreviousBusinessDayButCandidateAlreadyClosedResultsInBlock() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.isBusinessDayClosed(1L, LocalDate.of(2026, 1, 5))).thenReturn(true);

        BusinessDayValidationResult result = service.validate(1L, now, BusinessDaySettings.disabled());

        assertEquals(BusinessDayValidationVerdict.BLOCK, result.verdict());
        assertEquals(BusinessDayBlockingReason.BUSINESS_DAY_ALREADY_CLOSED, result.blockingReason());
    }

    @Test
    void unexpectedFutureUnclosedBusinessDayResultsInUnexpectedState() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.of(LocalDate.of(2026, 1, 9)));

        BusinessDayValidationResult result = service.validate(1L, now, BusinessDaySettings.disabled());

        assertEquals(BusinessDayValidationVerdict.UNEXPECTED_STATE, result.verdict());
        assertEquals(BusinessDayBlockingReason.UNEXPECTED_STATE, result.blockingReason());
    }

    @Test
    void invalidOrMissingSettingsFallBackToCalendarDateWithoutThrowing() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.isBusinessDayClosed(1L, LocalDate.of(2026, 1, 5))).thenReturn(false);

        BusinessDayValidationResult result = service.validate(1L, now, new BusinessDaySettings(true, null, null));

        assertEquals(LocalDate.of(2026, 1, 5), result.candidateBusinessDay());
        assertEquals(BusinessDayValidationVerdict.ALLOW, result.verdict());
    }

    // ---------------------------------------------------------------------
    // Stage 3B.2A.6 — Infrastructure Failure Policy: dependency failures must
    // surface as BusinessDayInfrastructureException, never as a
    // BusinessDayValidationResult (UNEXPECTED_STATE is a different, valid,
    // non-throwing outcome — never conflated with these).
    // ---------------------------------------------------------------------

    @Test
    void repositoryTimeoutFromFindUnclosedBusinessDaySurfacesAsInfrastructureException() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L))
                .thenThrow(new org.springframework.dao.QueryTimeoutException("timed out"));

        BusinessDayInfrastructureException ex = assertThrows(BusinessDayInfrastructureException.class,
                () -> service.validate(1L, now, BusinessDaySettings.disabled()));

        assertEquals(BusinessDayInfrastructureException.FailureCategory.REPOSITORY, ex.getCategory());
    }

    @Test
    void repositoryExceptionFromIsBusinessDayClosedSurfacesAsInfrastructureException() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenReturn(Optional.empty());
        when(businessDayStateService.isBusinessDayClosed(1L, LocalDate.of(2026, 1, 5)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("db down"));

        BusinessDayInfrastructureException ex = assertThrows(BusinessDayInfrastructureException.class,
                () -> service.validate(1L, now, BusinessDaySettings.disabled()));

        assertEquals(BusinessDayInfrastructureException.FailureCategory.REPOSITORY, ex.getCategory());
    }

    @Test
    void businessDayStateServiceGenericExceptionIsStillClassifiedAsRepository() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenThrow(new IllegalStateException("dependency broke"));

        BusinessDayInfrastructureException ex = assertThrows(BusinessDayInfrastructureException.class,
                () -> service.validate(1L, now, BusinessDaySettings.disabled()));

        assertEquals(BusinessDayInfrastructureException.FailureCategory.REPOSITORY, ex.getCategory());
        assertEquals(IllegalStateException.class, ex.getCause().getClass());
    }

    @Test
    void alreadyClassifiedInfrastructureExceptionPassesThroughUnwrapped() {
        LocalDateTime now = at(2026, 1, 5, 10, 0);
        BusinessDayInfrastructureException original = new BusinessDayInfrastructureException(
                BusinessDayInfrastructureException.FailureCategory.SETTINGS, "pre-classified", new RuntimeException());
        when(businessDayStateService.findUnclosedBusinessDay(1L)).thenThrow(original);

        BusinessDayInfrastructureException ex = assertThrows(BusinessDayInfrastructureException.class,
                () -> service.validate(1L, now, BusinessDaySettings.disabled()));

        assertEquals(original, ex); // not double-wrapped
    }
}
