package com.billbull.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.billbull.backend.financials.generalledger.postingengine.PostingException;

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
        log.warn("PostingException [{}]: {}", ex.getCode(), ex.getMessage());
        return ResponseEntity
                .unprocessableEntity()
                .body(Map.of(
                        "code", ex.getCode().name(),
                        "message", ex.getMessage() != null ? ex.getMessage() : ex.getCode().name()));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException ex) {
        log.error("RuntimeException caught: {}", ex.getMessage(), ex);
        return ResponseEntity
                .badRequest()
                .body(Map.of("message", ex.getMessage() != null ? ex.getMessage() : "Bad request"));
    }

    /**
     * Admin safeguard violations (last admin, employee deactivation block) → 409 Conflict
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(Map.of("message", ex.getMessage() != null ? ex.getMessage() : "Conflict"));
    }

    /**
     * Spring Security access denied → 403 Forbidden
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Access denied"));
    }
}
