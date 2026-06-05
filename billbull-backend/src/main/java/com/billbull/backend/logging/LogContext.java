package com.billbull.backend.logging;

import org.slf4j.MDC;

public final class LogContext {

    public static final String REQUEST_ID = "requestId";
    public static final String USER_ID = "userId";
    public static final String USERNAME = "username";
    public static final String ROLES = "roles";
    public static final String BRANCH_ID = "branchId";
    public static final String ALL_BRANCHES = "allBranches";
    public static final String CLIENT_HOST = "clientHost";
    public static final String HTTP_METHOD = "httpMethod";
    public static final String HTTP_PATH = "httpPath";

    private static final String[] KEYS = {
            REQUEST_ID,
            USER_ID,
            USERNAME,
            ROLES,
            BRANCH_ID,
            ALL_BRANCHES,
            CLIENT_HOST,
            HTTP_METHOD,
            HTTP_PATH
    };

    private LogContext() {
    }

    public static void put(String key, Object value) {
        if (key == null || value == null) {
            return;
        }
        String text = String.valueOf(value).trim();
        if (!text.isBlank()) {
            MDC.put(key, text);
        }
    }

    public static String get(String key) {
        String value = MDC.get(key);
        return value == null || value.isBlank() ? "" : value;
    }

    public static String getOrDefault(String key, String fallback) {
        String value = get(key);
        return value.isBlank() ? fallback : value;
    }

    public static Long getLong(String key) {
        String value = get(key);
        if (value.isBlank() || "ALL".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    public static void clearRequestContext() {
        for (String key : KEYS) {
            MDC.remove(key);
        }
    }
}
