package com.billbull.platform.agent;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Outcome of one agent call. {@code status} is the HTTP status, or 0 when the tenant could not be
 * reached at all (connection refused, DNS, timeout) — then {@code error} says why.
 */
public record AgentResponse(int status, JsonNode body, long latencyMs, String error) {

    public boolean ok() {
        return status >= 200 && status < 300;
    }

    public boolean unreachable() {
        return status == 0;
    }

    /** A short human message for the UI and the audit trail. */
    public String describe() {
        if (unreachable()) return "Unreachable: " + error;
        if (ok()) return "OK (" + status + ")";
        String msg = body != null && body.hasNonNull("message") ? body.get("message").asText() : null;
        String code = body != null && body.hasNonNull("code") ? body.get("code").asText() : null;
        return "HTTP " + status + (code != null ? " " + code : "") + (msg != null ? ": " + msg : "");
    }
}
