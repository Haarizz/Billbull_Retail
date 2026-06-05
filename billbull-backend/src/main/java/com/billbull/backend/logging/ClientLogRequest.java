package com.billbull.backend.logging;

import java.time.Instant;
import java.util.Map;

public record ClientLogRequest(
        String level,
        String message,
        String source,
        String url,
        String userAgent,
        String requestId,
        String clientSessionId,
        String stack,
        String componentStack,
        Instant occurredAt,
        Map<String, Object> metadata) {
}
