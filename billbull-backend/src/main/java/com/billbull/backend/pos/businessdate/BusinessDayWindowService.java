package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * <b>The</b> authoritative source of Business Day state for the whole application.
 *
 * <p>Composes the three inputs that determine it — the Business Day clock
 * ({@link BusinessDayClock}), the branch's configured window ({@link PosSettings})
 * and the pure window arithmetic ({@link PosOperatingHoursCalculator#resolveWindow})
 * — into a single {@link BusinessDayState}.
 *
 * <p>The lifecycle is ACTIVE → EXTENSION → CLOSED and nothing may move it backwards:
 * once the configured extension has elapsed the Business Day is CLOSED until the next
 * window starts. There is deliberately no supervisor path that reopens it.
 *
 * <p>Existing to prevent the failure mode this project was created to fix: several
 * components each deciding for themselves what day it is. No other class may
 * compute a phase, a closure time, or a Trading Date. {@link BusinessDayResolver}
 * remains the pure Trading Date function, but it is reached <i>through</i> the same
 * {@code resolveWindow} call this service uses, so the two cannot diverge.
 *
 * <p>Read-only: resolves and reports state, never creates or mutates it. A Business
 * Day still becomes Active only when a session commits against it.
 */
@Service
public class BusinessDayWindowService {

    private final BusinessDayClock clock;
    private final PosSettingsRepository settingsRepository;

    public BusinessDayWindowService(BusinessDayClock clock,
                                     PosSettingsRepository settingsRepository) {
        this.clock = clock;
        this.settingsRepository = settingsRepository;
    }

    /** The branch's Business Day state as of now. */
    @Transactional(readOnly = true)
    public BusinessDayState resolveCurrent(Long branchId) {
        return resolveAt(branchId, clock.now());
    }

    /**
     * The branch's Business Day state at an arbitrary moment — the same code path
     * {@link #resolveCurrent} uses, with the clock reading supplied by the caller so
     * one request can resolve state once and reuse it for several decisions rather
     * than re-reading the clock and risking two answers either side of a boundary.
     */
    @Transactional(readOnly = true)
    public BusinessDayState resolveAt(Long branchId, LocalDateTime now) {
        PosSettings settings = settingsRepository.findByBranchId(branchId).orElseGet(PosSettings::new);
        return resolveAt(branchId, now, settings);
    }

    /**
     * As {@link #resolveCurrent} but against a {@link PosSettings} snapshot the
     * caller has already loaded — avoids a second settings query for callers (like
     * the Day Status endpoint) that need the entity for other purposes too.
     */
    @Transactional(readOnly = true)
    public BusinessDayState resolveAt(Long branchId, PosSettings settings) {
        return resolveAt(branchId, clock.now(), settings);
    }

    /**
     * As {@link #resolveAt(Long, LocalDateTime)} but against a {@link PosSettings}
     * snapshot the caller has already loaded — {@code openSession()} loads settings
     * once for several purposes and must not re-query.
     */
    @Transactional(readOnly = true)
    public BusinessDayState resolveAt(Long branchId, LocalDateTime now, PosSettings settings) {
        BusinessDaySettings businessDaySettings = BusinessDaySettings.from(settings);
        BusinessDayWindow window = PosOperatingHoursCalculator.resolveWindow(now, businessDaySettings);

        boolean enforcementEnabled = !Boolean.FALSE.equals(settings.getBusinessDayWindowEnforcementEnabled());

        return new BusinessDayState(window, enforcementEnabled, now);
    }

    /**
     * The authoritative Trading Date for this branch right now — the value written
     * to {@code PosSession.tradingDate}. Constant across ACTIVE/EXTENSION/CLOSED and
     * across calendar midnight; advances only when the next window starts.
     */
    @Transactional(readOnly = true)
    public LocalDate currentTradingDate(Long branchId) {
        return resolveCurrent(branchId).window().tradingDate();
    }

    /** The clock every Business Day decision is made against — exposed so callers
     *  needing a timestamp for the same request read it from here, never from
     *  {@code LocalDateTime.now()}. */
    public BusinessDayClock clock() {
        return clock;
    }
}
