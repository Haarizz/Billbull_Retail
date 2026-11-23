package com.billbull.backend.platform;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Request signing shared with the control plane ({@code billbull-platform}'s
 * {@code AgentSignature}, which must produce identical output — both have a test pinned to the
 * same vector).
 *
 * <pre>
 *   canonical = METHOD "\n" PATH "\n" TIMESTAMP "\n" NONCE "\n" hex(sha256(body))
 *   signature = hex(hmac_sha256(secret, canonical))
 * </pre>
 * PATH is the request URI without the query string. TIMESTAMP is epoch seconds. An empty body
 * hashes the empty byte array.
 */
public final class PlatformSignature {

    public static final String HEADER_TIMESTAMP = "X-Platform-Timestamp";
    public static final String HEADER_NONCE = "X-Platform-Nonce";
    public static final String HEADER_SIGNATURE = "X-Platform-Signature";
    public static final String HEADER_ACTOR = "X-Platform-Actor";

    private PlatformSignature() {}

    public static String canonical(String method, String path, String timestamp, String nonce, byte[] body) {
        return method.toUpperCase(Locale.ROOT) + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n"
                + sha256Hex(body == null ? new byte[0] : body);
    }

    public static String sign(String secret, String method, String path, String timestamp, String nonce, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(canonical(method, path, timestamp, nonce, body).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(raw);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    /** Constant-time comparison of two hex signatures. */
    public static boolean matches(String expectedHex, String providedHex) {
        if (expectedHex == null || providedHex == null) return false;
        return MessageDigest.isEqual(
                expectedHex.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII),
                providedHex.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII));
    }

    public static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
