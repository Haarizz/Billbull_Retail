package com.billbull.backend.pos.businessdate;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * The single source of "what time is it" for every Business Day decision.
 *
 * <p><b>Why this exists.</b> Before this class, Business Day arithmetic called
 * {@code LocalDateTime.now()}/{@code LocalDate.now()}/{@code LocalTime.now()}
 * directly, which resolves against the <i>JVM default timezone</i> — a value this
 * application never sets. {@code spring.jackson.time-zone=Asia/Dubai} does not
 * affect it (that property governs JSON serialization only). While the Business Day
 * merely labelled data, an unset host timezone produced a cosmetically wrong date.
 * Now that the Business Day decides whether a store may open a session and sell, the
 * same misconfiguration would refuse service during real trading hours. An implicit,
 * host-dependent zone is therefore no longer acceptable, and every Business Day call
 * site takes its clock from here instead.
 *
 * <p><b>Configuration.</b> {@code pos.businessday.timezone}, defaulting to
 * {@code Asia/Dubai} — the zone the deployment already assumes elsewhere
 * ({@code spring.jackson.time-zone}). Each tenant profile
 * ({@code application-<client>.properties}) may override it. An invalid or unknown
 * zone id fails fast at startup rather than silently falling back, because a silent
 * fallback is exactly the failure mode this class was written to eliminate.
 *
 * <p>Deliberately the <i>only</i> new timezone source: it does not consult the
 * browser, the database session timezone, or a per-branch column. Introducing a
 * second source would recreate the ambiguity this resolves.
 */
@Component
public class BusinessDayClock {

    private static final Logger log = LoggerFactory.getLogger(BusinessDayClock.class);

    private final ZoneId zone;

    public BusinessDayClock(@Value("${pos.businessday.timezone:Asia/Dubai}") String configuredZone) {
        this.zone = parseOrFail(configuredZone);
    }

    private static ZoneId parseOrFail(String configuredZone) {
        if (configuredZone == null || configuredZone.isBlank()) {
            throw new IllegalStateException(
                    "pos.businessday.timezone must not be blank — Business Day enforcement requires an explicit timezone.");
        }
        try {
            return ZoneId.of(configuredZone.trim());
        } catch (java.time.DateTimeException invalid) { // covers ZoneRulesException
            throw new IllegalStateException("pos.businessday.timezone is not a valid IANA zone id: '"
                    + configuredZone + "'. Business Day enforcement cannot start with an unresolvable timezone.", invalid);
        }
    }

    @PostConstruct
    void logResolvedZone() {
        // Logged once at startup: the single most useful line for diagnosing a
        // "POS blocked at the wrong hour" report, and the confirmation that the
        // Business Day is no longer at the mercy of the host's default zone.
        log.info("[BusinessDayEngine] Business Day timezone resolved to {} (JVM default is {}) — all Business Day "
                + "phase, Trading Date and closure decisions use the former.", zone, ZoneId.systemDefault());
    }

    /** Current wall-clock time in the Business Day timezone. Every Business Day
     *  decision — phase, Trading Date, closure, extension expiry, session gating —
     *  must originate here so they can never disagree with one another. */
    public LocalDateTime now() {
        return LocalDateTime.now(zone);
    }

    public ZoneId zone() {
        return zone;
    }
}
