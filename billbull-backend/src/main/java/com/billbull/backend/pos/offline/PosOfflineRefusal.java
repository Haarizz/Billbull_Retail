package com.billbull.backend.pos.offline;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;

/** A refused offline request with a machine-readable reason code (see PosOfflineController). */
public class PosOfflineRefusal extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> details;

    public PosOfflineRefusal(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public PosOfflineRefusal(HttpStatus status, String code, String message, Map<String, Object> details) {
        super(code + ": " + message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }

    public Map<String, Object> body() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", getMessage().substring(code.length() + 2));
        body.putAll(details);
        return body;
    }
}
