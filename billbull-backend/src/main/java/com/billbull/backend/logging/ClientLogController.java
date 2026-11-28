package com.billbull.backend.logging;

import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.security.AuditLogService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/client-logs")
public class ClientLogController {

    private static final Logger clientLog = LoggerFactory.getLogger("client-logs");
    private static final int MAX_TEXT_LENGTH = 2_000;

    private final ObjectMapper objectMapper;
    private final AuditLogService auditLogService;

    private com.billbull.backend.errorlog.ErrorLogService errorLogService;

    public ClientLogController(ObjectMapper objectMapper, AuditLogService auditLogService) {
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
    }

    /** Browser errors also go to the error log the control plane reads (optional, so tests needn't wire it). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setErrorLogService(com.billbull.backend.errorlog.ErrorLogService errorLogService) {
        this.errorLogService = errorLogService;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> receive(
            @RequestBody ClientLogRequest request,
            @RequestHeader(value = RequestLoggingFilter.REQUEST_ID_HEADER, required = false) String headerRequestId,
            HttpServletRequest httpRequest) {

        ClientLogRequest safeRequest = request == null
                ? new ClientLogRequest(null, null, null, null, null, null, null, null, null, null, null)
                : request;

        String requestId = firstNonBlank(headerRequestId, safeRequest.requestId(), MDC.get(RequestLoggingFilter.REQUEST_ID_MDC_KEY));
        if (requestId != null && !requestId.isBlank()) {
            MDC.put(RequestLoggingFilter.REQUEST_ID_MDC_KEY, requestId);
        }

        String level = safe(safeRequest.level(), "info").toLowerCase(Locale.ROOT);
        String message = trim(safe(safeRequest.message(), "Client log event"));
        String metadata = toJson(safeRequest.metadata());
        String username = resolveUsername();

        String logLine = "CLIENT level={} user={} session={} source={} url={} occurredAt={} message={} metadata={} stack={} componentStack={}";

        if ("error".equals(level)) {
            clientLog.error(logLine,
                    level, username, trim(safeRequest.clientSessionId()), trim(safeRequest.source()), trim(safeRequest.url()),
                    safeRequest.occurredAt(), message, metadata, trim(safeRequest.stack()), trim(safeRequest.componentStack()));
        } else if ("warn".equals(level) || "warning".equals(level)) {
            clientLog.warn(logLine,
                    level, username, trim(safeRequest.clientSessionId()), trim(safeRequest.source()), trim(safeRequest.url()),
                    safeRequest.occurredAt(), message, metadata, trim(safeRequest.stack()), trim(safeRequest.componentStack()));
        } else {
            clientLog.info(logLine,
                    level, username, trim(safeRequest.clientSessionId()), trim(safeRequest.source()), trim(safeRequest.url()),
                    safeRequest.occurredAt(), message, metadata, trim(safeRequest.stack()), trim(safeRequest.componentStack()));
        }

        try {
            auditLogService.logClientIssueEvent(
                    level,
                    message,
                    safeRequest.url(),
                    "source=" + trim(safeRequest.source())
                            + ", session=" + trim(safeRequest.clientSessionId())
                            + ", metadata=" + metadata
                            + ", stack=" + trim(safeRequest.stack())
                            + ", componentStack=" + trim(safeRequest.componentStack()),
                    httpRequest);
        } catch (Exception ex) {
            clientLog.debug("Client issue DB audit insert failed", ex);
        }

        if ("error".equals(level) && errorLogService != null) {
            try {
                errorLogService.recordClient(username, safeRequest.message(), safeRequest.source(), safeRequest.url(),
                        safeRequest.stack(), safeRequest.componentStack(), requestId, safeRequest.occurredAt());
            } catch (RuntimeException ex) {
                clientLog.debug("Client error log capture failed", ex);
            }
        }

        String responseRequestId = requestId == null || requestId.isBlank() ? "" : requestId;
        return ResponseEntity.ok(Map.of("requestId", responseRequestId));
    }

    private String resolveUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return "anonymous";
        }
        return authentication.getName();
    }

    private String toJson(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return "{}";
        }
        try {
            return trim(objectMapper.writeValueAsString(metadata));
        } catch (JsonProcessingException ex) {
            return "{}";
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return trim(value);
            }
        }
        return "";
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String trim(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= MAX_TEXT_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, MAX_TEXT_LENGTH) + "...";
    }
}
