package com.billbull.backend.errorlog;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.billbull.backend.exception.ReconciliationException;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;

/**
 * Pure helpers behind the error log: what is worth recording, how a throwable is described,
 * how occurrences are grouped (fingerprint) and what is scrubbed before anything is stored.
 * No Spring, no I/O — so every rule here is unit-tested.
 */
public final class ErrorCaptureSupport {

    private ErrorCaptureSupport() {}

    static final int MAX_TEXT = 2000;
    static final int MAX_STACK = 16_000;
    static final int MAX_FRAMES_PER_CAUSE = 40;
    static final int MAX_CAUSES = 5;
    static final String APP_PACKAGE = "com.billbull.";

    /**
     * Exceptions that are a normal, handled answer rather than a fault: refusals the user is meant
     * to see (permissions, approvals, rate limits), the internet probing for URLs that don't exist,
     * and a browser that went away mid-response. Matched against every class in the hierarchy by
     * simple name, so this module needs no compile-time dependency on each of them.
     */
    private static final Set<String> EXPECTED = Set.of(
            "AccessDeniedException",
            "AuthenticationException",
            "PermissionDeniedException",
            "RateLimitExceededException",
            "AdminApprovalRequiredException",
            "VarianceApprovalRequiredException",
            "SessionRangeExclusionException",
            "NoResourceFoundException",
            "NoHandlerFoundException",
            "HttpRequestMethodNotSupportedException",
            "HttpMediaTypeNotSupportedException",
            "HttpMediaTypeNotAcceptableException",
            "ClientAbortException",
            "AsyncRequestNotUsableException",
            "AsyncRequestTimeoutException");

    /** Whether an exception that reached the web layer belongs in the error log. */
    public static boolean shouldRecord(Throwable t, int httpStatus) {
        if (t == null) return httpStatus >= 500;
        if (isExpected(t)) return false;
        if (isResponseStatusBelow500(t)) return false;
        if (isBrokenPipe(t)) return false;
        return true;
    }

    static boolean isExpected(Throwable t) {
        for (Class<?> c = t.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
            if (EXPECTED.contains(c.getSimpleName())) return true;
        }
        return false;
    }

    private static boolean isResponseStatusBelow500(Throwable t) {
        if (t instanceof org.springframework.web.server.ResponseStatusException rse) {
            return rse.getStatusCode().value() < 500;
        }
        return false;
    }

    /** A client disconnect surfaces as an IOException "Broken pipe" / "Connection reset by peer". */
    static boolean isBrokenPipe(Throwable t) {
        for (Throwable c : chain(t)) {
            String m = c.getMessage();
            if (c instanceof java.io.IOException && m != null) {
                String l = m.toLowerCase(Locale.ROOT);
                if (l.contains("broken pipe") || l.contains("connection reset by peer")
                        || l.contains("an established connection was aborted")) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Fills the exception-related fields of {@code e} from {@code t}. */
    public static void describe(CapturedError e, Throwable t) {
        if (t == null) return;
        List<Throwable> chain = chain(t);
        Throwable root = chain.get(chain.size() - 1);
        e.exceptionClass = clip(t.getClass().getName(), 200);
        e.rootCauseClass = root != t ? clip(root.getClass().getName(), 200) : null;
        StringBuilder cc = new StringBuilder();
        for (Throwable c : chain) {
            if (cc.length() > 0) cc.append(" > ");
            cc.append(c.getClass().getSimpleName());
        }
        e.causeChain = clip(cc.toString(), 600);
        e.message = clipRedacted(t.getMessage(), MAX_TEXT);
        e.rootCauseMessage = root != t ? clipRedacted(root.getMessage(), MAX_TEXT) : null;
        e.sqlState = sqlState(chain);
        e.errorCode = errorCode(chain);
        e.topFrame = clip(topFrame(chain), 400);
        e.stackTrace = stackTrace(chain);
    }

    static List<Throwable> chain(Throwable t) {
        List<Throwable> out = new ArrayList<>();
        Map<Throwable, Boolean> seen = new IdentityHashMap<>();
        Throwable c = t;
        while (c != null && !seen.containsKey(c) && out.size() < 20) {
            seen.put(c, true);
            out.add(c);
            c = c.getCause();
        }
        return out;
    }

    private static String sqlState(List<Throwable> chain) {
        for (int i = chain.size() - 1; i >= 0; i--) {
            if (chain.get(i) instanceof SQLException sql && sql.getSQLState() != null) {
                return clip(sql.getSQLState(), 10);
            }
        }
        return null;
    }

    private static String errorCode(List<Throwable> chain) {
        for (Throwable c : chain) {
            if (c instanceof PostingException p && p.getCode() != null) return p.getCode().name();
            if (c instanceof ReconciliationException r) {
                return "RECONCILIATION_FAILED" + (r.getStage() != null ? ":" + r.getStage() : "");
            }
        }
        return null;
    }

    /**
     * The first stack frame in BillBull's own code, deepest cause first — where the fault surfaced.
     * Servlet filters wrap every request, so a filter frame says nothing about the fault: when the
     * only BillBull frames are filters (a request rejected by Spring before any controller ran),
     * the root cause's own first frame is used instead.
     */
    static String topFrame(List<Throwable> chain) {
        for (int i = chain.size() - 1; i >= 0; i--) {
            for (StackTraceElement f : chain.get(i).getStackTrace()) {
                if (f.getClassName().startsWith(APP_PACKAGE) && !f.getClassName().contains("$$") && !isFilterFrame(f)) {
                    return f.getClassName() + "." + f.getMethodName() + ":" + f.getLineNumber();
                }
            }
        }
        Throwable root = chain.get(chain.size() - 1);
        StackTraceElement[] st = root.getStackTrace();
        return st.length > 0 ? st[0].getClassName() + "." + st[0].getMethodName() + ":" + st[0].getLineNumber() : null;
    }

    static boolean isFilterFrame(StackTraceElement f) {
        String m = f.getMethodName();
        return f.getClassName().endsWith("Filter") || "doFilter".equals(m) || "doFilterInternal".equals(m);
    }

    static String stackTrace(List<Throwable> chain) {
        StringBuilder sb = new StringBuilder();
        int causes = 0;
        for (Throwable c : chain) {
            if (causes++ >= MAX_CAUSES) break;
            if (sb.length() > 0) sb.append("Caused by: ");
            sb.append(c.getClass().getName());
            if (c.getMessage() != null) sb.append(": ").append(redact(oneLine(c.getMessage(), 500)));
            sb.append('\n');
            StackTraceElement[] frames = c.getStackTrace();
            int n = Math.min(frames.length, MAX_FRAMES_PER_CAUSE);
            for (int i = 0; i < n; i++) sb.append("\tat ").append(frames[i]).append('\n');
            if (frames.length > n) sb.append("\t... ").append(frames.length - n).append(" more\n");
            if (sb.length() > MAX_STACK) break;
        }
        return clip(sb.toString(), MAX_STACK);
    }

    // ---------------------------------------------------------------- grouping

    private static final Pattern UUID = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern SINGLE_QUOTED = Pattern.compile("'[^']*'");
    private static final Pattern KEY_VALUES = Pattern.compile("\\)=\\([^)]*\\)");
    private static final Pattern DIGITS = Pattern.compile("\\d+");

    /**
     * /api/sales/invoices/1234/print → /api/sales/invoices/{id}/print. A segment is an identifier
     * when it is a number, a UUID, or longer than three characters and contains a digit
     * (INV-00012, a batch number) — "v2" stays.
     */
    public static String pathTemplate(String path) {
        if (path == null || path.isBlank()) return null;
        String p = path;
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        String[] parts = p.split("/", -1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            String s = parts[i];
            boolean id = !s.isEmpty() && (s.chars().allMatch(Character::isDigit) || UUID.matcher(s).matches()
                    || (s.length() > 3 && s.chars().anyMatch(Character::isDigit)));
            sb.append(id ? "{id}" : s);
        }
        return clip(sb.toString(), 300);
    }

    /** Message with values removed, so "stock short for 'A1' by 3" groups with "… 'B7' by 12". */
    static String normalizeMessage(String message) {
        if (message == null) return "";
        String m = oneLine(message, 400);
        m = UUID.matcher(m).replaceAll("#");
        m = KEY_VALUES.matcher(m).replaceAll(")=(?)");
        m = SINGLE_QUOTED.matcher(m).replaceAll("'?'");
        m = DIGITS.matcher(m).replaceAll("#");
        return m.toLowerCase(Locale.ROOT).trim();
    }

    /** Stable id of "the same fault": source, exception chain, where it surfaced, endpoint, message shape. */
    public static String fingerprint(CapturedError e) {
        String basis = String.join("|",
                String.valueOf(e.source),
                nz(e.exceptionClass), nz(e.rootCauseClass), nz(e.errorCode), nz(e.sqlState),
                nz(e.topFrame == null ? null : e.topFrame.replaceAll(":\\d+$", "")),
                nz(e.httpMethod), nz(pathTemplate(e.path)),
                e.source != CapturedError.Source.SERVER ? nz(e.logger) : "",
                normalizeMessage(e.rootCauseMessage != null ? e.rootCauseMessage : e.message));
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(basis.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            return Integer.toHexString(basis.hashCode());
        }
    }

    // ---------------------------------------------------------------- redaction

    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern JWT = Pattern.compile("eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]*");
    private static final Pattern BEARER = Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._~+/=-]{8,}");
    private static final Pattern SECRET_KV = Pattern.compile("(?i)(password|passwd|secret|token|api[_-]?key)(\\s*[=:]\\s*)[^\\s,;&\"')]+");
    /** Card, phone and account numbers: nine or more digits, optionally split by spaces or dashes. */
    private static final Pattern LONG_DIGITS = Pattern.compile("(?<![\\w.])\\+?\\d(?:[ -]?\\d){8,}(?![\\w.])");

    /** Removes personal and secret values that exception messages can carry. */
    public static String redact(String s) {
        if (s == null) return null;
        String r = JWT.matcher(s).replaceAll("[token]");
        r = BEARER.matcher(r).replaceAll("Bearer [token]");
        r = SECRET_KV.matcher(r).replaceAll("$1$2[redacted]");
        r = EMAIL.matcher(r).replaceAll("[email]");
        r = LONG_DIGITS.matcher(r).replaceAll("[number]");
        return r;
    }

    static String clipRedacted(String s, int max) {
        return s == null ? null : clip(redact(s), max);
    }

    static String oneLine(String s, int max) {
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= max ? one : one.substring(0, max);
    }

    static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
