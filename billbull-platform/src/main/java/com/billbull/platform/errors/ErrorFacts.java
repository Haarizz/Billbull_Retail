package com.billbull.platform.errors;

import java.util.Locale;

/** The technical facts of one error group, as the tenant reported them — the explainer's input. */
public record ErrorFacts(Source source, String exceptionClass, String rootCauseClass, String causeChain,
                         String message, String rootCauseMessage, String errorCode, String sqlState,
                         String httpMethod, String pathTemplate, Integer httpStatus, String logger, String topFrame,
                         String stackTrace) {

    public enum Source { SERVER, CLIENT, JOB, LOG }

    public static Source source(String s) {
        try {
            return s == null ? Source.SERVER : Source.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return Source.SERVER;
        }
    }

    /** True when any class in the chain has this simple or fully-qualified name. */
    boolean has(String... names) {
        String chain = " " + nz(causeChain).replace(" > ", " ") + " ";
        for (String n : names) {
            if (n.equals(exceptionClass) || n.equals(rootCauseClass)) return true;
            if (simple(exceptionClass).equals(n) || simple(rootCauseClass).equals(n)) return true;
            if (chain.contains(" " + n + " ")) return true;
        }
        return false;
    }

    /** Lower-cased message text: top message, root cause message and (for log lines) the logger. */
    String text() {
        return (nz(message) + " \u0001 " + nz(rootCauseMessage)).toLowerCase(Locale.ROOT);
    }

    boolean textHas(String... needles) {
        String t = text();
        for (String n : needles) if (t.contains(n)) return true;
        return false;
    }

    boolean stackHas(String needle) {
        String n = needle.toLowerCase(Locale.ROOT);
        return nz(stackTrace).toLowerCase(Locale.ROOT).contains(n) || nz(topFrame).toLowerCase(Locale.ROOT).contains(n)
                || nz(logger).toLowerCase(Locale.ROOT).contains(n) || nz(exceptionClass).toLowerCase(Locale.ROOT).contains(n);
    }

    boolean sql(String... states) {
        if (sqlState == null) return false;
        for (String s : states) if (sqlState.startsWith(s)) return true;
        return false;
    }

    boolean isWrite() {
        String m = nz(httpMethod).toUpperCase(Locale.ROOT);
        return m.equals("POST") || m.equals("PUT") || m.equals("PATCH") || m.equals("DELETE");
    }

    boolean pathHas(String needle) {
        return nz(pathTemplate).toLowerCase(Locale.ROOT).contains(needle);
    }

    static String simple(String className) {
        if (className == null) return "";
        int dot = className.lastIndexOf('.');
        return dot >= 0 ? className.substring(dot + 1) : className;
    }

    static String nz(String s) {
        return s == null ? "" : s;
    }
}
