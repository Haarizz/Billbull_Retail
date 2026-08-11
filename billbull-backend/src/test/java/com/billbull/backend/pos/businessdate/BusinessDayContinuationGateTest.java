package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;

/**
 * The "Continue / Resume Session" Business Day rule: an OPEN session belonging to a
 * previous Business Day may never be continued, regardless of which entry point asks.
 *
 * <p>The window is always built relative to the gate's own Business Day clock rather
 * than a pinned wall-clock time, so these assert the rule itself and not the hour CI
 * happens to run at.
 */
@ExtendWith(MockitoExtension.class)
class BusinessDayContinuationGateTest {

    @Mock private PosSettingsRepository settingsRepository;

    private BusinessDayClock clock;
    private BusinessDayContinuationGate gate;

    @BeforeEach
    void setUp() {
        clock = new BusinessDayClock("Asia/Dubai");
        gate = new BusinessDayContinuationGate(new BusinessDayWindowService(clock, settingsRepository));
        lenient().when(settingsRepository.findByBranchId(anyLong())).thenReturn(Optional.empty());
    }

    private LocalDate today() {
        return clock.now().toLocalDate();
    }

    private PosSession session(LocalDate tradingDate, PosSessionStatus status) {
        PosSession s = new PosSession();
        s.setId(67L);
        s.setBranchId(1L);
        s.setTerminalId("T002-95F6");
        s.setTradingDate(tradingDate);
        s.setStatus(status);
        return s;
    }

    @Test
    void openSessionFromPreviousBusinessDayCannotBeContinued() {
        PosSession stale = session(today().minusDays(1), PosSessionStatus.OPEN);

        PreviousBusinessDaySessionException ex = assertThrows(PreviousBusinessDaySessionException.class,
                () -> gate.assertMayContinue(stale));

        assertEquals(67L, ex.getSessionId());
        assertEquals("T002-95F6", ex.getTerminalId());
        assertEquals("OPEN", ex.getSessionStatus());
        assertEquals(today().minusDays(1), ex.getPreviousBusinessDay());
        // Must reuse the message contract the POS's "Previous Day Not Closed" modal
        // already keys off, not a new warning shape.
        assertTrue(ex.getReason().startsWith("PREVIOUS_DAY_SESSION_OPEN:"));
        assertTrue(ex.getReason().contains("Session #67"));
        assertTrue(ex.getReason().contains("Terminal T002-95F6"));
    }

    @Test
    void suspendedSessionFromPreviousBusinessDayCannotBeContinued() {
        assertThrows(PreviousBusinessDaySessionException.class,
                () -> gate.assertMayContinue(session(today().minusDays(3), PosSessionStatus.SUSPENDED)));
    }

    @Test
    void sessionOnCurrentBusinessDayContinuesNormally() {
        assertDoesNotThrow(() -> gate.assertMayContinue(session(today(), PosSessionStatus.OPEN)));
        assertTrue(gate.evaluate(session(today(), PosSessionStatus.OPEN)).isEmpty());
    }

    @Test
    void closedSessionIsNeverBlockedSoItCanStillBeReportedAndDayClosed() {
        assertDoesNotThrow(() -> gate.assertMayContinue(session(today().minusDays(1), PosSessionStatus.CLOSED)));
    }

    @Test
    void legacySessionWithoutTradingDateFallsBackToSessionDate() {
        PosSession legacy = session(null, PosSessionStatus.OPEN);
        legacy.setSessionDate(today().minusDays(1));
        assertThrows(PreviousBusinessDaySessionException.class, () -> gate.assertMayContinue(legacy));

        legacy.setSessionDate(today());
        assertDoesNotThrow(() -> gate.assertMayContinue(legacy));
    }

    @Test
    void sessionWithNoBusinessDayAtAllIsNotBlocked() {
        PosSession unknown = session(null, PosSessionStatus.OPEN);
        assertDoesNotThrow(() -> gate.assertMayContinue(unknown));
    }

    @Test
    void overnightWindowThatHasRolledPastMidnightIsStillTheCurrentBusinessDay() {
        // 09:00 → 02:00 window, positioned so "now" sits after midnight: the Trading
        // Date is still yesterday's calendar date, so yesterday's session is current,
        // not previous. Guards the overnight/timezone behavior against regression.
        LocalDateTime now = clock.now();
        PosSettings settings = new PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setBusinessDayWindowEnforcementEnabled(true);
        settings.setOperatingStartTime(now.plusHours(2).toLocalTime());
        settings.setOperatingEndTime(now.plusHours(1).toLocalTime()); // start > end ⇒ overnight
        settings.setBusinessDayExtensionMinutes(0);
        lenient().when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        PosSession yesterdays = session(today().minusDays(1), PosSessionStatus.OPEN);
        assertTrue(gate.evaluate(yesterdays).isEmpty(),
                "an overnight window's own Trading Date must never be treated as a previous Business Day");
    }
}
