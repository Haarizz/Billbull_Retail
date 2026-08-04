package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.pos.session.PosSessionRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Objects;
import java.util.Optional;

/**
 * Read-only reporter of the branch's current Business Day lifecycle state — never
 * an owner or creator of state, only a query over what already exists in
 * {@code PosSession}/{@code PosDayClose}. Answers exactly one question: "does this
 * branch currently have an unclosed Business Day, and if so, which one?" No
 * unclosed day means <b>No Active Business Day</b>.
 *
 * <p>Named deliberately as a <i>state</i> service rather than "Active Business Day"
 * service — it reports on state, it does not represent or embody the active day
 * itself (see the Business Day terminology reference doc for why that distinction
 * matters).
 *
 * <p><b>Phase 3B.1:</b> {@link #findUnclosedBusinessDay} is now the authoritative
 * source for {@code PosSessionService.openSession()}'s "does a previous Business
 * Day remain unclosed" detection, replacing the legacy sessionDate/pointer-based
 * scan for that one question only — the allow/block decision path, exception
 * type, HTTP status, and message format are unchanged; only the detection source
 * moved. Everything else remains shadow-only: no Candidate Business Day
 * validation, no login-gate migration, no metrics beyond what Phase 2/3A already
 * added — those are Stage 3B.2's job. See docs/business-day-architecture.md.
 */
@Service
public class BusinessDayStateService {

    private static final Logger log = LoggerFactory.getLogger(BusinessDayStateService.class);

    // Shadow-validation diagnostics only (Phase 2) — never read by any runtime
    // decision. Metric names follow the dotted convention already used elsewhere
    // in this codebase (see RateLimitService).
    static final String METRIC_MATCH = "businessday.shadow.match";
    static final String METRIC_DIFFER = "businessday.shadow.differ";
    static final String METRIC_NO_ACTIVE = "businessday.shadow.no_active_business_day";
    static final String METRIC_OVERNIGHT = "businessday.shadow.overnight_resolution";

    // Stage 3B.2A — BusinessDayValidationService outcome diagnostics.
    static final String METRIC_VALIDATION_ALLOW = "businessday.validation.allow";
    static final String METRIC_VALIDATION_BLOCK = "businessday.validation.block";
    static final String METRIC_VALIDATION_UNEXPECTED_STATE = "businessday.validation.unexpected_state";
    static final String METRIC_VALIDATION_ERROR = "businessday.validation.error";
    static final String METRIC_VALIDATION_MATCH_ALLOW = "businessday.validation.match_allow";
    static final String METRIC_VALIDATION_MATCH_BLOCK = "businessday.validation.match_block";
    static final String METRIC_VALIDATION_DIFF_NEW_BLOCKS = "businessday.validation.diff_new_blocks";
    static final String METRIC_VALIDATION_DIFF_NEW_ALLOWS = "businessday.validation.diff_new_allows";

    // Stage 3B.2A.6 — Infrastructure Failure Policy diagnostics. Distinct from
    // METRIC_VALIDATION_ERROR (kept, unchanged, for backward compatibility):
    // these fire only for BusinessDayInfrastructureException — a dependency
    // failure, never a Business Rule outcome (UNEXPECTED_STATE is not one of
    // these; it increments METRIC_VALIDATION_UNEXPECTED_STATE instead).
    static final String METRIC_INFRASTRUCTURE_ERROR = "businessday.validation.infrastructure_error";
    static final String METRIC_REPOSITORY_ERROR = "businessday.validation.repository_error";
    static final String METRIC_SETTINGS_ERROR = "businessday.validation.settings_error";

    // Stage 3B.2B — Enforcement (feature-flag controlled) diagnostics. Additive
    // only — nothing above is removed or renamed.
    static final String METRIC_FLAG_ENABLED_REQUESTS = "businessday.enforcement.flag_enabled_requests";
    static final String METRIC_FLAG_DISABLED_REQUESTS = "businessday.enforcement.flag_disabled_requests";
    static final String METRIC_ENFORCEMENT_ALLOW = "businessday.enforcement.allow";
    static final String METRIC_ENFORCEMENT_BLOCK = "businessday.enforcement.block";
    static final String METRIC_ENFORCEMENT_UNEXPECTED_STATE = "businessday.enforcement.unexpected_state";
    static final String METRIC_ENFORCEMENT_FALLBACK = "businessday.enforcement.fallback_to_legacy";

    private final PosSessionRepository sessionRepository;
    private final PosDayCloseRepository dayCloseRepository;
    private final MeterRegistry meterRegistry;

    public BusinessDayStateService(PosSessionRepository sessionRepository, PosDayCloseRepository dayCloseRepository,
                                    MeterRegistry meterRegistry) {
        this.sessionRepository = sessionRepository;
        this.dayCloseRepository = dayCloseRepository;
        this.meterRegistry = meterRegistry;
    }

    /**
     * The branch's oldest unclosed Business Day (a session-bearing date with no
     * matching {@code PosDayClose} row), or {@code Optional.empty()} if there is
     * none — i.e. the branch currently has <b>No Active Business Day</b>.
     */
    @Transactional(readOnly = true)
    public Optional<LocalDate> findUnclosedBusinessDay(Long branchId) {
        return sessionRepository.findOldestUnclosedTradingDate(branchId);
    }

    /** Convenience predicate over {@link #findUnclosedBusinessDay} — true when the
     *  branch has No Active Business Day. */
    @Transactional(readOnly = true)
    public boolean hasNoActiveBusinessDay(Long branchId) {
        return findUnclosedBusinessDay(branchId).isEmpty();
    }

    /** Whether {@code date} already has a matching {@code PosDayClose} row for
     *  this branch — used by {@link BusinessDayValidationService} to distinguish
     *  "nothing pending, and the Candidate itself was already closed" from the
     *  ordinary "nothing pending, free to trade" case. */
    @Transactional(readOnly = true)
    public boolean isBusinessDayClosed(Long branchId, LocalDate date) {
        return dayCloseRepository.existsByBranchIdAndCloseDate(branchId, date);
    }

    /**
     * Shadow-mode diagnostic only — logs, at DEBUG level, how the legacy Business
     * Date pointer's value compares against a freshly-computed Candidate Business
     * Day, without influencing any decision. Not called from any production code
     * path in Phase 1; later phases may invoke this alongside the existing
     * {@code PosBusinessDateService} call sites to validate the new engine against
     * live traffic before anything depends on it.
     */
    public void logShadowComparison(Long branchId, LocalDate currentBusinessDatePointer, LocalDate candidateBusinessDay) {
        if (!log.isDebugEnabled()) return;
        boolean agree = Objects.equals(currentBusinessDatePointer, candidateBusinessDay);
        log.debug("[BusinessDayEngine][shadow] branchId={} pointer={} candidate={} agree={}",
                branchId, currentBusinessDatePointer, candidateBusinessDay, agree);
    }

    /**
     * Phase 2 shadow validation — call once per Day Status read. Always records a
     * match/differ metric (cheap, always safe to leave on); only emits a log line
     * (DEBUG, and only when DEBUG is enabled) when the legacy pointer and the new
     * engine's Candidate Business Day actually disagree — per the Phase 2 spec,
     * this must never log on every request, only on divergence. Never influences
     * any decision; purely observational.
     */
    public void recordShadowValidation(Long branchId, LocalDate legacyBusinessDate, LocalDate candidateBusinessDay,
                                        boolean overnightWindowConfigured) {
        boolean matches = Objects.equals(legacyBusinessDate, candidateBusinessDay);
        Tags tags = Tags.of("branchId", String.valueOf(branchId));
        meterRegistry.counter(matches ? METRIC_MATCH : METRIC_DIFFER, tags).increment();
        if (overnightWindowConfigured) {
            meterRegistry.counter(METRIC_OVERNIGHT, tags).increment();
        }
        if (!matches && log.isDebugEnabled()) {
            log.debug("[BusinessDayEngine][shadow] MISMATCH branchId={} legacyBusinessDate={} candidateBusinessDay={}",
                    branchId, legacyBusinessDate, candidateBusinessDay);
        }
    }

    /** Phase 2 shadow metric — records that this branch currently has No Active
     *  Business Day per the new engine, independent of what the legacy pointer says
     *  (the pointer has no equivalent concept — it always holds some date). */
    public void recordNoActiveBusinessDay(Long branchId) {
        meterRegistry.counter(METRIC_NO_ACTIVE, Tags.of("branchId", String.valueOf(branchId))).increment();
    }

    /**
     * Phase 3B.1 shadow diagnostic — logs, DEBUG only and only when the two
     * detection methods actually disagree, comparing the legacy "previous day
     * session still open" scan (a boolean: did it find anything) against
     * {@link #findUnclosedBusinessDay}'s answer. No metrics — deliberately
     * deferred to Stage 3B.2, which introduces the full validation-result
     * metric set. Never influences the caller's decision.
     */
    public void logPreviousUnclosedDayDisagreement(Long branchId, boolean legacyDetectedUnclosedDay,
                                                    Optional<LocalDate> newUnclosedBusinessDay) {
        boolean newDetected = newUnclosedBusinessDay.isPresent();
        if (legacyDetectedUnclosedDay == newDetected) return;
        if (!log.isDebugEnabled()) return;
        log.debug("[BusinessDayEngine][shadow] previous-unclosed-day DISAGREEMENT branchId={} legacyDetected={} newDetected={} newUnclosedBusinessDay={}",
                branchId, legacyDetectedUnclosedDay, newDetected, newUnclosedBusinessDay.orElse(null));
    }

    /**
     * Stage 3B.2A — records {@link BusinessDayValidationService}'s outcome for a
     * single {@code openSession()} attempt: always increments the verdict-specific
     * counter ({@code allow}/{@code block}/{@code unexpected_state}), and always
     * increments exactly one agreement counter (match/diff) by comparing against
     * what the legacy gate actually decided. Logs at DEBUG only for the two
     * disagreement cases and {@code UNEXPECTED_STATE} — never on a match. Never
     * throws, never influences the caller.
     */
    public void recordValidationOutcome(Long branchId, boolean legacyAllowed, BusinessDayValidationResult result) {
        Tags tags = Tags.of("branchId", String.valueOf(branchId));
        switch (result.verdict()) {
            case ALLOW -> meterRegistry.counter(METRIC_VALIDATION_ALLOW, tags).increment();
            case BLOCK -> meterRegistry.counter(METRIC_VALIDATION_BLOCK, tags).increment();
            case UNEXPECTED_STATE -> meterRegistry.counter(METRIC_VALIDATION_UNEXPECTED_STATE, tags).increment();
        }

        boolean newAllows = result.verdict() == BusinessDayValidationVerdict.ALLOW;
        if (legacyAllowed && newAllows) {
            meterRegistry.counter(METRIC_VALIDATION_MATCH_ALLOW, tags).increment();
        } else if (!legacyAllowed && !newAllows) {
            meterRegistry.counter(METRIC_VALIDATION_MATCH_BLOCK, tags).increment();
        } else if (legacyAllowed) {
            // legacy allowed, new would block — highest rollout risk.
            meterRegistry.counter(METRIC_VALIDATION_DIFF_NEW_BLOCKS, tags).increment();
            if (log.isDebugEnabled()) {
                log.debug("[BusinessDayEngine][validation] DIFF_NEW_BLOCKS branchId={} result={}", branchId, result);
            }
        } else {
            // legacy blocked, new would allow — potential policy divergence.
            meterRegistry.counter(METRIC_VALIDATION_DIFF_NEW_ALLOWS, tags).increment();
            if (log.isDebugEnabled()) {
                log.debug("[BusinessDayEngine][validation] DIFF_NEW_ALLOWS branchId={} result={}", branchId, result);
            }
        }

        if (result.verdict() == BusinessDayValidationVerdict.UNEXPECTED_STATE && log.isDebugEnabled()) {
            log.debug("[BusinessDayEngine][validation] UNEXPECTED_STATE branchId={} result={}", branchId, result);
        }
    }

    /** Stage 3B.2A exception safety — {@link BusinessDayValidationService} (or its
     *  caller) threw during shadow execution. Recorded and logged; the caller must
     *  swallow the exception and proceed with the legacy decision regardless. */
    public void recordValidationError(Long branchId, Throwable error) {
        meterRegistry.counter(METRIC_VALIDATION_ERROR, Tags.of("branchId", String.valueOf(branchId))).increment();
        log.error("[BusinessDayEngine][validation] shadow validation threw for branchId={} — swallowed, legacy decision unaffected", branchId, error);
    }

    /**
     * Stage 3B.2A.6 — Infrastructure Failure Policy. Records a
     * {@link BusinessDayInfrastructureException} category-specific metric, in
     * addition to (never instead of) the generic {@link #recordValidationError}
     * bookkeeping, so existing dashboards/alerts built on {@code businessday.
     * validation.error} keep working unchanged while new, more specific signals
     * become available. Always logs at ERROR — an infrastructure failure is
     * never expected, unlike a Business Rule {@code UNEXPECTED_STATE}.
     */
    public void recordInfrastructureFailure(Long branchId, BusinessDayInfrastructureException.FailureCategory category,
                                             Throwable error) {
        Tags tags = Tags.of("branchId", String.valueOf(branchId));
        meterRegistry.counter(METRIC_INFRASTRUCTURE_ERROR, tags).increment();
        switch (category) {
            case REPOSITORY -> meterRegistry.counter(METRIC_REPOSITORY_ERROR, tags).increment();
            case SETTINGS -> meterRegistry.counter(METRIC_SETTINGS_ERROR, tags).increment();
            case UNEXPECTED -> { /* umbrella counter above already covers it — no dedicated bucket */ }
        }
        recordValidationError(branchId, error);
        log.error("[BusinessDayEngine][validation] infrastructure failure category={} branchId={} — swallowed, legacy decision unaffected",
                category, branchId, error);
    }

    /** Stage 3B.2B — records which gate a request was routed through (per-branch
     *  feature flag). Metrics only, no logging — per-request logging here would be
     *  noisy and this event is never itself exceptional. */
    public void recordFeatureFlagRequest(Long branchId, boolean enforcementEnabled) {
        Tags tags = Tags.of("branchId", String.valueOf(branchId));
        meterRegistry.counter(enforcementEnabled ? METRIC_FLAG_ENABLED_REQUESTS : METRIC_FLAG_DISABLED_REQUESTS, tags).increment();
    }

    /** Stage 3B.2B — records an authoritative enforcement decision (flag ON,
     *  {@link BusinessDayValidationService} ran successfully). Logs at WARN only
     *  for {@code UNEXPECTED_STATE} — the one verdict that fails closed and is
     *  never expected; {@code ALLOW}/{@code BLOCK} are normal, expected outcomes
     *  and are not logged per-request. */
    public void recordEnforcementDecision(Long branchId, BusinessDayValidationResult result) {
        Tags tags = Tags.of("branchId", String.valueOf(branchId));
        switch (result.verdict()) {
            case ALLOW -> meterRegistry.counter(METRIC_ENFORCEMENT_ALLOW, tags).increment();
            case BLOCK -> meterRegistry.counter(METRIC_ENFORCEMENT_BLOCK, tags).increment();
            case UNEXPECTED_STATE -> {
                meterRegistry.counter(METRIC_ENFORCEMENT_UNEXPECTED_STATE, tags).increment();
                log.warn("[BusinessDayEngine][enforcement] UNEXPECTED_STATE (fail-closed) branchId={} result={}", branchId, result);
            }
        }
    }

    /** Stage 3B.2B — records that enforcement (flag ON) fell back to the legacy
     *  gate for this request because {@link BusinessDayValidationService} could
     *  not produce a result (an {@link BusinessDayInfrastructureException}, of
     *  any category). Also records the same infrastructure-failure metrics
     *  {@link #recordInfrastructureFailure} would, so those dashboards see
     *  enforcement-mode failures too, not just shadow-mode ones. Always logs at
     *  ERROR — an enforcement-mode fallback means a real request had to be
     *  rescued by the legacy gate. */
    public void recordEnforcementFallback(Long branchId, BusinessDayInfrastructureException.FailureCategory category,
                                           Throwable error) {
        meterRegistry.counter(METRIC_ENFORCEMENT_FALLBACK, Tags.of("branchId", String.valueOf(branchId))).increment();
        recordInfrastructureFailure(branchId, category, error);
        log.error("[BusinessDayEngine][enforcement] fell back to legacy gate branchId={} category={}", branchId, category, error);
    }
}
