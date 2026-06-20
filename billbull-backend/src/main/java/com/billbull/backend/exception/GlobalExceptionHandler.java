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
