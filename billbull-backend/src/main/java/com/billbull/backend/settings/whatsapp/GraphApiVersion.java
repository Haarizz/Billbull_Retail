package com.billbull.backend.settings.whatsapp;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Graph API version segment of every Meta call ({@code https://graph.facebook.com/v25.0/...}).
 *
 * <p>Expiry dates are Meta's "available until" dates from
 * https://developers.facebook.com/docs/graph-api/changelog/versions (checked 14 Oct 2026). Meta
 * publishes a version's date when the next one ships, so the newest version has none yet. A
 * version not in the table but newer than all of it is accepted as "date not published".
 *
 * <p>{@link #DEFAULT} is v25.0, not the newest v26.0: v25.0 has been out since Feb 2026 and is
 * supported until July 2028, and none of its changes touch the phone-number, media, messages or
 * message_templates endpoints this integration calls.
 */
public final class GraphApiVersion {

    public static final String DEFAULT = "v25.0";

    /** Days before expiry when the settings page starts warning. */
    static final int WARNING_DAYS = 90;

    private static final Pattern FORMAT = Pattern.compile("v(\\d{2})\\.0");

    /** Major version → last day it is available. */
    private static final Map<Integer, LocalDate> EXPIRES = Map.of(
            20, LocalDate.of(2026, 9, 24),
            21, LocalDate.of(2027, 1, 21),
            22, LocalDate.of(2027, 5, 20),
            23, LocalDate.of(2027, 10, 8),
            24, LocalDate.of(2028, 2, 18),
            25, LocalDate.of(2028, 7, 29));

    /** v26.0 (29 Jul 2026) is the newest Meta has released; it has no expiry date yet. */
    private static final int NEWEST_KNOWN = 26;

    private GraphApiVersion() {}

    /** Expiry state of a stored version, for the settings page. {@code expiresOn} is null when unknown. */
    public record Status(String version, LocalDate expiresOn, boolean expired, String warning) {}

    /**
     * The version to store: blank becomes {@link #DEFAULT}.
     *
     * @throws IllegalArgumentException (message safe to show) when it is not {@code vNN.0}, is older
     *         than the oldest supported version, or has expired on {@code today}
     */
    public static String requireUsable(String raw, LocalDate today) {
        if (raw == null || raw.isBlank()) return DEFAULT;
        String v = raw.trim();
        Matcher m = FORMAT.matcher(v);
        if (!m.matches()) {
            throw new IllegalArgumentException("Graph API Version must look like " + DEFAULT + " (a \"v\", two digits, \".0\").");
        }
        int major = Integer.parseInt(m.group(1));
        LocalDate expires = EXPIRES.get(major);
        if (major < 20 || (expires != null && today.isAfter(expires))) {
            throw new IllegalArgumentException("Graph API " + v + " is no longer supported by Meta"
                    + (expires != null ? " (it expired on " + expires + ")" : "") + ". Use " + DEFAULT + ".");
        }
        if (expires == null && major < NEWEST_KNOWN) {
            throw new IllegalArgumentException("Graph API " + v + " is not a version Meta has published. Use " + DEFAULT + ".");
        }
        return v;
    }

    /** True for a well-formed {@code vNN.0}. Used before a stored value goes into a URL. */
    public static boolean isWellFormed(String v) {
        return v != null && FORMAT.matcher(v).matches();
    }

    public static Status status(String version, LocalDate today) {
        if (!isWellFormed(version)) {
            return new Status(version, null, false, "The saved Graph API Version is not valid. Set it to " + DEFAULT + " and save.");
        }
        int major = Integer.parseInt(version.substring(1, 3));
        LocalDate expires = EXPIRES.get(major);
        if (expires == null) {
            return new Status(version, null, major < 20, major < 20
                    ? "Graph API " + version + " is no longer supported by Meta. Set it to " + DEFAULT + " and save." : null);
        }
        if (today.isAfter(expires)) {
            return new Status(version, expires, true, "Graph API " + version + " expired on " + expires
                    + ". WhatsApp sending fails until you set " + DEFAULT + " and save.");
        }
        long days = ChronoUnit.DAYS.between(today, expires);
        String warning = days <= WARNING_DAYS
                ? "Graph API " + version + " stops working on " + expires + " (" + days + " days). Set it to " + DEFAULT + " and save."
                : null;
        return new Status(version, expires, false, warning);
    }
}
