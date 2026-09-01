package com.billbull.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;
import com.billbull.backend.logging.RequestLoggingFilter;
import com.billbull.backend.ratelimit.RateLimitExceededException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import jakarta.persistence.OptimisticLockException;

import org.springframework.http.HttpHeaders;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Posting gateway rejections → 422 with the stable error {@code code} so the
     * frontend can branch on it (e.g. PERIOD_LOCKED, UNBALANCED_ENTRY).
     */
    @ExceptionHandler(PostingException.class)
    public ResponseEntity<Map<String, String>> handlePosting(PostingException ex) {
        log.warn("PostingException [{}] requestId={}: {}", ex.getCode(), requestId(), ex.getMessage());
        return ResponseEntity
                .unprocessableEntity()
                .body(Map.of(
                        "code", ex.getCode().name(),
                        "message", ex.getMessage() != null ? ex.getMessage() : ex.getCode().name(),
                        "requestId", requestId()));
    }

    /**
     * POS close-day reconciliation failures → 422 with the per-bucket breakdown
     * (cash/card/credit/online/returns/rounding) so the frontend can show the exact
     * cause instead of a bare variance number.
     */
    /**
     * A close refused for want of supervisor authorization.
     *
     * <p>422 with a machine-readable {@code code} so the approval UI can react to the condition
     * rather than string-matching a message, and with the figures attached so it can display the
     * exact state being refused without recomputing any of it.
     */
    @ExceptionHandler(VarianceApprovalRequiredException.class)
    public ResponseEntity<Map<String, Object>> handleVarianceApprovalRequired(
            VarianceApprovalRequiredException ex) {
        log.warn("VarianceApprovalRequired session={} variance={} threshold={} requestId={}",
                ex.getSessionId(), ex.getCashDifference(), ex.getThreshold(), requestId());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", "VARIANCE_APPROVAL_REQUIRED");
        body.put("message", ex.getMessage());
        body.put("sessionId", ex.getSessionId());
        body.put("expectedCash", ex.getExpectedCash());
        body.put("countedCash", ex.getCountedCash());
        body.put("cashDifference", ex.getCashDifference());
        body.put("varianceAmount", ex.getCashDifference() != null ? ex.getCashDifference().abs() : null);
        body.put("varianceDirection", ex.getVarianceDirection());
        body.put("threshold", ex.getThreshold());
        body.put("requestId", requestId());
        return ResponseEntity.unprocessableEntity().body(body);
    }

    @ExceptionHandler(ReconciliationException.class)
    public ResponseEntity<Map<String, Object>> handleReconciliation(ReconciliationException ex) {
        log.warn("ReconciliationException [{}] requestId={}: {}", ex.getStage(), requestId(), ex.getMessage());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", "RECONCILIATION_FAILED");
        body.put("stage", ex.getStage());
        body.put("message", ex.getMessage());
        body.put("breakdown", ex.getBreakdown());
        body.put("requestId", requestId());
        return ResponseEntity.unprocessableEntity().body(body);
    }

    /**
     * Day Close session range excludes otherwise-eligible sessions and the caller
     * hasn't confirmed — 409 with the excluded-session breakdown so the frontend can
     * show the warning and resubmit with acknowledgeExclusions=true.
     */
    @ExceptionHandler(SessionRangeExclusionException.class)
    public ResponseEntity<Map<String, Object>> handleSessionRangeExclusion(SessionRangeExclusionException ex) {
        log.warn("SessionRangeExclusionException requestId={}: {}", requestId(), ex.getMessage());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", "SESSION_RANGE_EXCLUSION_UNCONFIRMED");
        body.put("message", ex.getMessage());
        body.put("details", ex.getDetails());
        body.put("requestId", requestId());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    /**
     * Explicit HTTP status rejections (e.g. 401 from AuthController) — return the
     * declared status and log at WARN without a stack trace.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException ex) {
        log.warn("ResponseStatusException requestId={} status={}: {}", requestId(), ex.getStatusCode(), ex.getReason());
        return ResponseEntity
                .status(ex.getStatusCode())
                .body(errorBody(ex.getReason() != null ? ex.getReason() : ex.getMessage()));
    }

    /**
     * Rate-limit / brute-force rejections → uniform 429 with {@code Retry-After} + {@code X-RateLimit-*}
     * headers (design §8). More specific than the RuntimeException handler below, so it wins. Body is
     * generic (never leaks the raw key or whether a username exists).
     */
    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<Map<String, String>> handleRateLimit(RateLimitExceededException ex) {
        log.warn("RateLimitExceeded policy={} retryAfter={}s requestId={}",
                ex.getPolicy(), ex.getRetryAfterSeconds(), requestId());
        Map<String, String> body = new java.util.LinkedHashMap<>();
        body.put("code", "RATE_LIMITED");
        body.put("policy", ex.getPolicy());
        body.put("message", ex.getMessage() != null ? ex.getMessage() : "Too many requests");
        body.put("retryAfterSeconds", String.valueOf(ex.getRetryAfterSeconds()));
        body.put("requestId", requestId());
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .header("X-RateLimit-Policy", ex.getPolicy())
                .body(body);
    }

    /**
     * Constraint violations that reach the DB → 409 Conflict with a readable message instead of the
     * raw Hibernate/Postgres text. Duplicate keys are the common case: master data is soft-deleted
     * (`active = false`) while the unique indexes still cover the deleted rows, so reusing a deleted
     * name/code surfaces here. Services should catch their own duplicates first — this is the net.
     */
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrity(
            org.springframework.dao.DataIntegrityViolationException ex) {
        log.warn("DataIntegrityViolationException requestId={}: {}", requestId(), ex.getMostSpecificCause().getMessage());
        String cause = ex.getMostSpecificCause().getMessage();
        boolean duplicate = cause != null && cause.toLowerCase().contains("duplicate key");
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(errorBody(duplicate
                        ? "This record conflicts with an existing one — the name or code is already in use, "
                                + "possibly by a previously deleted record."
                        : "The request could not be saved because it violates a data constraint."));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException ex) {
        log.error("RuntimeException caught requestId={}: {}", requestId(), ex.getMessage(), ex);
        return ResponseEntity
                .badRequest()
                .body(errorBody(ex.getMessage() != null ? ex.getMessage() : "Bad request"));
    }

    /**
     * Admin safeguard violations (last admin, employee deactivation block) → 409 Conflict
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException ex) {
        log.warn("IllegalStateException requestId={}: {}", requestId(), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(errorBody(ex.getMessage() != null ? ex.getMessage() : "Conflict"));
    }

    /**
     * Spring Security access denied → 403 Forbidden
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException ex) {
        log.warn("AccessDeniedException requestId={}: {}", requestId(), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(errorBody("Access denied"));
    }

    @ExceptionHandler({ObjectOptimisticLockingFailureException.class, OptimisticLockException.class})
    public ResponseEntity<Map<String, Object>> handleOptimisticLocking(Exception ex) {
        log.warn("OptimisticLockingFailureException requestId={}: {}", requestId(), ex.getMessage());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", "OPTIMISTIC_LOCK_FAILED");
        body.put("message", "This request was modified by another user. Please refresh the page.");
        body.put("requestId", requestId());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    @ExceptionHandler(PermissionDeniedException.class)
    public ResponseEntity<Map<String, Object>> handlePermissionDenied(PermissionDeniedException ex) {
        log.warn("PermissionDeniedException requestId={}: {}", requestId(), ex.getMessage());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", ex.getCode());
        body.put("message", ex.getMessage());
        body.put("requestId", requestId());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    private Map<String, String> errorBody(String message) {
        return Map.of(
                "message", message,
                "requestId", requestId());
    }

    private String requestId() {
        String requestId = MDC.get(RequestLoggingFilter.REQUEST_ID_MDC_KEY);
        return requestId == null || requestId.isBlank() ? "" : requestId;
    }
}
