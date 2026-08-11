package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests the control that actually stops selling after Business Day closure.
 *
 * <p>Blocking session opening alone is not sufficient — a session opened at 20:00 is
 * still open at 23:30 — so these tests exist to prove the sale itself is refused.
 *
 * <p>Critically, they also pin the absence of any time-based grace: the gate's
 * decision depends only on the Business Day phase, never on the session. Releasing a
 * pending sale is the caller's per-transaction supervisor authorization (see
 * {@code PosCheckoutController}), which grants nothing to the next sale.
 */
@ExtendWith(MockitoExtension.class)
class BusinessDayCheckoutGateTest {

    @Mock private PosSettingsRepository settingsRepository;

    private static final Long BRANCH = 1L;

    /** 09:00 -> 21:00 with a 2h extension: closes at 23:00. */
    private PosSettings configuredSettings() {
        PosSettings settings = new PosSettings();
        settings.setOperatingHoursEnabled(true);
        settings.setOperatingStartTime(LocalTime.of(9, 0));
        settings.setOperatingEndTime(LocalTime.of(21, 0));
        settings.setBusinessDayExtensionMinutes(120);
        settings.setBusinessDayWindowEnforcementEnabled(true);
        return settings;
    }

    private BusinessDayCheckoutGate gateAt(LocalDateTime now, PosSettings settings) {
        when(settingsRepository.findByBranchId(BRANCH)).thenReturn(Optional.of(settings));
        return new BusinessDayCheckoutGate(
                new BusinessDayWindowService(new FixedClock(now), settingsRepository));
    }

    /** A BusinessDayClock pinned to one instant, so phase assertions never depend on
     *  when the suite happens to run. */
    private static class FixedClock extends BusinessDayClock {
        private final LocalDateTime fixed;
        FixedClock(LocalDateTime fixed) {
            super("Asia/Dubai");
            this.fixed = fixed;
        }
        @Override public LocalDateTime now() { return fixed; }
    }

    @Test
    void checkoutIsAllowedDuringActivePhase() {
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 12, 0), configuredSettings());
        assertDoesNotThrow(() -> gate.assertCheckoutAllowed(BRANCH));
    }

    @Test
    void checkoutIsAllowedRightUpToTheScheduledEndTime() {
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 20, 59), configuredSettings());
        assertDoesNotThrow(() -> gate.assertCheckoutAllowed(BRANCH));
    }

    @Test
    void checkoutIsAllowedThroughoutTheExtensionPeriod() {
        // The extension is a grace period for the whole branch, not a soft block —
        // selling continues normally, which is the entire point of having one.
        assertDoesNotThrow(() -> gateAt(LocalDateTime.of(2026, 8, 10, 21, 0), configuredSettings())
                .assertCheckoutAllowed(BRANCH));
        assertDoesNotThrow(() -> gateAt(LocalDateTime.of(2026, 8, 10, 22, 59), configuredSettings())
                .assertCheckoutAllowed(BRANCH));
    }

    @Test
    void checkoutIsRefusedTheInstantTheBusinessDayCloses() {
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 23, 0), configuredSettings());

        BusinessDayClosedException ex = assertThrows(BusinessDayClosedException.class,
                () -> gate.assertCheckoutAllowed(BRANCH));
        assertEquals(BusinessDayClosedResponse.CODE, ex.getResponse().getCode());
        assertEquals(LocalDateTime.of(2026, 8, 10, 23, 0), ex.getResponse().getClosedAt());
        assertEquals(LocalDateTime.of(2026, 8, 11, 9, 0), ex.getResponse().getNextStartAt());
    }

    @Test
    void thereIsNoGracePeriodAfterClosure() {
        // The regression this test exists for: a previous revision let ANY checkout
        // from an already-open session through for 15 minutes past closure, which
        // meant brand-new carts could still be rung up. Closure must mean closure —
        // one minute past, and five, are both refused, regardless of any session.
        for (int minutesPastClosure : new int[] { 1, 5, 14, 16, 60 }) {
            LocalDateTime now = LocalDateTime.of(2026, 8, 10, 23, 0).plusMinutes(minutesPastClosure);
            BusinessDayCheckoutGate gate = gateAt(now, configuredSettings());
            assertThrows(BusinessDayClosedException.class, () -> gate.assertCheckoutAllowed(BRANCH),
                    "checkout must be refused " + minutesPastClosure + " minutes past closure");
        }
    }

    @Test
    void refusalDoesNotDependOnTheSession() {
        // The gate takes no session argument at all — the decision is purely the
        // Business Day phase. Encoded as a test so a future change that reintroduces
        // session-dependent leniency has to delete this deliberately.
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 23, 30), configuredSettings());
        assertThrows(BusinessDayClosedException.class, () -> gate.assertCheckoutAllowed(BRANCH));
        // No session repository is wired into the gate; nothing to stub, nothing to verify.
    }

    @Test
    void checkoutRemainsRefusedThroughTheOvernightWaitUntilTheNextStart() {
        assertThrows(BusinessDayClosedException.class,
                () -> gateAt(LocalDateTime.of(2026, 8, 11, 0, 0), configuredSettings()).assertCheckoutAllowed(BRANCH));
        assertThrows(BusinessDayClosedException.class,
                () -> gateAt(LocalDateTime.of(2026, 8, 11, 8, 59), configuredSettings()).assertCheckoutAllowed(BRANCH));
        // The next Business Day opens and selling resumes.
        assertDoesNotThrow(() -> gateAt(LocalDateTime.of(2026, 8, 11, 9, 0), configuredSettings())
                .assertCheckoutAllowed(BRANCH));
    }

    @Test
    void tradingDateReportedOnRefusalIsTheClosedBusinessDayNotTheCalendarDate() {
        // At 02:00 on Aug 11 the refusal must still name Aug 10 — the Business Day
        // that closed — so the operator is told which day needs closing.
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 11, 2, 0), configuredSettings());
        BusinessDayClosedException ex = assertThrows(BusinessDayClosedException.class,
                () -> gate.assertCheckoutAllowed(BRANCH));
        assertEquals(java.time.LocalDate.of(2026, 8, 10), ex.getResponse().getTradingDate());
    }

    @Test
    void branchWithNoWindowConfiguredIsNeverGated() {
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 3, 0), new PosSettings());
        assertDoesNotThrow(() -> gate.assertCheckoutAllowed(BRANCH));
    }

    @Test
    void enforcementDisabledForTheBranchNeverGates() {
        PosSettings settings = configuredSettings();
        settings.setBusinessDayWindowEnforcementEnabled(false);
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 23, 45), settings);
        assertDoesNotThrow(() -> gate.assertCheckoutAllowed(BRANCH));
    }

    @Test
    void nullBranchIsNeverGated() {
        BusinessDayCheckoutGate gate = new BusinessDayCheckoutGate(new BusinessDayWindowService(
                new FixedClock(LocalDateTime.of(2026, 8, 10, 23, 45)), settingsRepository));
        // A malformed request must fail on its own merits, not be reported as a
        // Business Day closure.
        assertDoesNotThrow(() -> gate.assertCheckoutAllowed(null));
    }

    @Test
    void closureIsAbsoluteAndHasNoSupervisorExtensionPath() {
        // There is no state a supervisor can put the branch into that turns CLOSED
        // back into ACTIVE/EXTENSION: the gate reads the configured window only, so
        // every moment after closure and before the next start refuses.
        for (LocalDateTime t : List.of(
                LocalDateTime.of(2026, 8, 10, 23, 0),
                LocalDateTime.of(2026, 8, 10, 23, 45),
                LocalDateTime.of(2026, 8, 11, 1, 0),
                LocalDateTime.of(2026, 8, 11, 8, 59))) {
            BusinessDayCheckoutGate gate = gateAt(t, configuredSettings());
            assertThrows(BusinessDayClosedException.class, () -> gate.assertCheckoutAllowed(BRANCH),
                    "checkout must stay refused at " + t);
        }
    }

    @Test
    void theConfiguredScheduleIsUnchangedByClosure() {
        // Closure never rewrites the branch's configured window — tomorrow's window
        // is derived from the same settings, untouched.
        PosSettings settings = configuredSettings();
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 23, 30), settings);
        assertThrows(BusinessDayClosedException.class, () -> gate.assertCheckoutAllowed(BRANCH));

        assertEquals(LocalTime.of(9, 0), settings.getOperatingStartTime());
        assertEquals(LocalTime.of(21, 0), settings.getOperatingEndTime());
        assertEquals(120, settings.getBusinessDayExtensionMinutes());
    }

    @Test
    void refusalMarkedAsPendingCheckoutOffersTheSupervisorPath() {
        BusinessDayCheckoutGate gate = gateAt(LocalDateTime.of(2026, 8, 10, 23, 30), configuredSettings());
        BusinessDayClosedException ex = assertThrows(BusinessDayClosedException.class,
                () -> gate.assertCheckoutAllowed(BRANCH));

        // The raw refusal makes no such offer; only the checkout caller marks it,
        // so a refused session-open can never advertise a per-sale release.
        assertFalse(ex.getResponse().isSupervisorAuthorizationAvailable());
        assertTrue(ex.getResponse().asPendingCheckoutRefusal().isSupervisorAuthorizationAvailable());
    }
}
