package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.pos.session.PosSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Characterization tests for the session-driven Day Close resolution algorithm —
 * see PosDayCloseIntegrationTest for the end-to-end wiring, and the "Replace Skip
 * Date with Session-Based Business Day Resolution" spec examples this mirrors.
 */
@ExtendWith(MockitoExtension.class)
class PosPendingDayCloseResolverTest {

    @Mock private PosDayCloseRepository dayCloseRepository;
    @Mock private PosSessionRepository sessionRepository;

    private PosPendingDayCloseResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new PosPendingDayCloseResolver(dayCloseRepository, sessionRepository);
    }

    @Test
    void skipsOverCalendarGapsToTheEarliestSessionAfterLastClose() {
        // Example 1: last close July 25, sessions only on July 29 -> pending = July 29,
        // never 26/27/28.
        LocalDate lastClosed = LocalDate.of(2026, 7, 25);
        LocalDate firstSession = LocalDate.of(2026, 7, 29);
        when(dayCloseRepository.findMaxCloseDateByBranchId(1L)).thenReturn(Optional.of(lastClosed));
        when(sessionRepository.findEarliestTradingDateAfter(1L, lastClosed)).thenReturn(Optional.of(firstSession));

        Optional<LocalDate> pending = resolver.resolvePendingBusinessDate(1L);

        assertTrue(pending.isPresent());
        assertEquals(firstSession, pending.get());
    }

    @Test
    void returnsNothingPendingWhenNoSessionExistsAfterLastClose() {
        // Example 2: last close July 25, no sessions since -> no pending Day Close,
        // no manual skip required.
        LocalDate lastClosed = LocalDate.of(2026, 7, 25);
        when(dayCloseRepository.findMaxCloseDateByBranchId(1L)).thenReturn(Optional.of(lastClosed));
        when(sessionRepository.findEarliestTradingDateAfter(1L, lastClosed)).thenReturn(Optional.empty());

        Optional<LocalDate> pending = resolver.resolvePendingBusinessDate(1L);

        assertTrue(pending.isEmpty());
    }

    @Test
    void advancesToTheNextEarliestSessionAfterEachClose() {
        // Example 3: last close July 25, sessions on July 28 and July 30. Once July 28
        // is closed, the next pending date becomes July 30 (26/27/29 are never surfaced).
        LocalDate lastClosed = LocalDate.of(2026, 7, 28);
        LocalDate nextSession = LocalDate.of(2026, 7, 30);
        when(dayCloseRepository.findMaxCloseDateByBranchId(1L)).thenReturn(Optional.of(lastClosed));
        when(sessionRepository.findEarliestTradingDateAfter(1L, lastClosed)).thenReturn(Optional.of(nextSession));

        Optional<LocalDate> pending = resolver.resolvePendingBusinessDate(1L);

        assertEquals(nextSession, pending.get());
    }

    @Test
    void fallsBackToEarliestEverSessionWhenBranchHasNeverClosed() {
        when(dayCloseRepository.findMaxCloseDateByBranchId(1L)).thenReturn(Optional.empty());
        LocalDate firstEverSession = LocalDate.of(2026, 1, 10);
        when(sessionRepository.findEarliestTradingDate(1L)).thenReturn(Optional.of(firstEverSession));

        Optional<LocalDate> pending = resolver.resolvePendingBusinessDate(1L);

        assertEquals(firstEverSession, pending.get());
    }

    /** Backward compatibility: rows written before tradingDate existed are backfilled
     *  (V68 migration, COALESCE(opened_at::date, session_date)) rather than left null —
     *  the resolver needs no special-casing and just reads whatever the backfilled
     *  column contains, same as any other row. */
    @Test
    void resolvesCorrectlyAgainstBackfilledHistoricalTradingDates() {
        LocalDate lastClosed = LocalDate.of(2026, 6, 1);
        LocalDate backfilledTradingDate = LocalDate.of(2026, 6, 3); // migrated legacy row
        when(dayCloseRepository.findMaxCloseDateByBranchId(1L)).thenReturn(Optional.of(lastClosed));
        when(sessionRepository.findEarliestTradingDateAfter(1L, lastClosed)).thenReturn(Optional.of(backfilledTradingDate));

        Optional<LocalDate> pending = resolver.resolvePendingBusinessDate(1L);

        assertEquals(backfilledTradingDate, pending.get());
    }
}
