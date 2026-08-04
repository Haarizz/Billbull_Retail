package com.billbull.backend.pos.businessdate;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Dedicated domain service answering exactly one question: "may a new session
 * open right now, and why or why not." Composes {@link BusinessDayResolver}
 * (Candidate Business Day) and {@link BusinessDayStateService} (Previous
 * Unclosed Business Day) into a single typed {@link BusinessDayValidationResult}.
 *
 * <p>Deterministic for identical inputs (modulo whatever {@link BusinessDayStateService}
 * reads at call time — session/PosDayClose data, not wall-clock jitter). Performs
 * no persistence, creates no sessions, modifies no Business Days — {@code validate}
 * only computes and returns a result; it has no other observable effect.
 *
 * <p><b>Stage 3B.2A (Shadow Validation):</b> this service's result is never
 * consulted by any {@code if}/{@code throw}/{@code return} in the real login/
 * session-opening flow. It runs on every attempt purely for observation — see
 * {@code docs/business-day-architecture.md}. Stage 3B.2B is what makes its
 * result authoritative; that has not happened yet.
 *
 * <p><b>Stage 3B.2A.6 (Infrastructure Failure Policy):</b> {@link #validate}
 * either returns a normal {@link BusinessDayValidationResult} — a Business Rule
 * outcome, including {@link BusinessDayValidationVerdict#UNEXPECTED_STATE}, which
 * is a valid, data-derived answer, not a failure — or throws
 * {@link BusinessDayInfrastructureException} when a dependency ({@link BusinessDayStateService},
 * transitively its repositories) failed and no result could be computed at all.
 * These two outcomes must never be confused: a caller that fails to distinguish
 * them risks treating a database hiccup as if it were a fact about the business
 * day's data, or vice versa.
 */
@Service
public class BusinessDayValidationService {

    private final BusinessDayStateService businessDayStateService;

    public BusinessDayValidationService(BusinessDayStateService businessDayStateService) {
        this.businessDayStateService = businessDayStateService;
    }

    /**
     * Resolves the Candidate Business Day for {@code now} and compares it
     * against the branch's Previous Unclosed Business Day (if any):
     * <ul>
     *   <li>no unclosed day, and the Candidate isn't itself already closed → {@code ALLOW}/{@code NONE}
     *   <li>no unclosed day, but the Candidate is already closed → {@code BLOCK}/{@code BUSINESS_DAY_ALREADY_CLOSED}
     *   <li>unclosed day strictly before the Candidate → {@code BLOCK}/{@code PREVIOUS_BUSINESS_DAY_OPEN}
     *   <li>unclosed day equal to the Candidate (today's own in-progress day) → {@code ALLOW}/{@code NONE}
     *   <li>unclosed day strictly after the Candidate (anomalous) → {@code UNEXPECTED_STATE}/{@code UNEXPECTED_STATE}
     * </ul>
     */
    public BusinessDayValidationResult validate(Long branchId, LocalDateTime now, BusinessDaySettings settings) {
        LocalDate candidate = BusinessDayResolver.resolve(now, settings);
        Optional<LocalDate> previousUnclosed = findUnclosedBusinessDayOrFail(branchId);

        if (previousUnclosed.isPresent()) {
            LocalDate unclosed = previousUnclosed.get();
            if (unclosed.isBefore(candidate)) {
                return new BusinessDayValidationResult(candidate, previousUnclosed,
                        BusinessDayValidationVerdict.BLOCK, BusinessDayBlockingReason.PREVIOUS_BUSINESS_DAY_OPEN);
            }
            if (unclosed.isEqual(candidate)) {
                return new BusinessDayValidationResult(candidate, previousUnclosed,
                        BusinessDayValidationVerdict.ALLOW, BusinessDayBlockingReason.NONE);
            }
            // unclosed.isAfter(candidate) — an unclosed day exists "in the future"
            // relative to the Candidate; should not occur under correct clock
            // behavior. Never silently allow or silently block.
            return new BusinessDayValidationResult(candidate, previousUnclosed,
                    BusinessDayValidationVerdict.UNEXPECTED_STATE, BusinessDayBlockingReason.UNEXPECTED_STATE);
        }

        if (isBusinessDayClosedOrFail(branchId, candidate)) {
            return new BusinessDayValidationResult(candidate, Optional.empty(),
                    BusinessDayValidationVerdict.BLOCK, BusinessDayBlockingReason.BUSINESS_DAY_ALREADY_CLOSED);
        }
        return new BusinessDayValidationResult(candidate, Optional.empty(),
                BusinessDayValidationVerdict.ALLOW, BusinessDayBlockingReason.NONE);
    }

    /** Wraps {@link BusinessDayStateService#findUnclosedBusinessDay} so a
     *  dependency failure surfaces as a typed {@link BusinessDayInfrastructureException}
     *  (category {@code REPOSITORY}) rather than an unclassified exception — see
     *  the Infrastructure Failure Policy in the class javadoc. */
    private Optional<LocalDate> findUnclosedBusinessDayOrFail(Long branchId) {
        try {
            return businessDayStateService.findUnclosedBusinessDay(branchId);
        } catch (BusinessDayInfrastructureException alreadyClassified) {
            throw alreadyClassified;
        } catch (RuntimeException repositoryFailure) {
            throw new BusinessDayInfrastructureException(BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                    "Failed to determine the branch's unclosed Business Day", repositoryFailure);
        }
    }

    /** Wraps {@link BusinessDayStateService#isBusinessDayClosed} — same rationale
     *  as {@link #findUnclosedBusinessDayOrFail}. */
    private boolean isBusinessDayClosedOrFail(Long branchId, LocalDate candidate) {
        try {
            return businessDayStateService.isBusinessDayClosed(branchId, candidate);
        } catch (BusinessDayInfrastructureException alreadyClassified) {
            throw alreadyClassified;
        } catch (RuntimeException repositoryFailure) {
            throw new BusinessDayInfrastructureException(BusinessDayInfrastructureException.FailureCategory.REPOSITORY,
                    "Failed to determine whether the Candidate Business Day is already closed", repositoryFailure);
        }
    }
}
