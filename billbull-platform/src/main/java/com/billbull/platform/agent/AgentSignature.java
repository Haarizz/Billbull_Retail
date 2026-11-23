package com.billbull.platform.agent;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Signs calls to a tenant's platform agent. Must match the tenant side's
 * {@code com.billbull.backend.platform.PlatformSignature} byte for byte; both test suites pin the
 * same vectors.
 *
 * <pre>
 *   canonical = METHOD "\n" PATH "\n" TIMESTAMP "\n" NONCE "\n" hex(sha256(body))
 *   signature = hex(hmac_sha256(secret, canonical))
 * </pre>
 */
public final class AgentSignature {

    public static final String HEADER_TIMESTAMP = "X-Platform-Timestamp";
    public static final String HEADER_NONCE = "X-Platform-Nonce";
    public static final String HEADER_SIGNATURE = "X-Platform-Signature";
    public static final String HEADER_ACTOR = "X-Platform-Actor";

    private AgentSignature() {}

    public static String sign(String secret, String method, String path, String timestamp, String nonce, byte[] body) {
        try {
            byte[] b = body == null ? new byte[0] : body;
            String canonical = method.toUpperCase(Locale.ROOT) + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n"
                    + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
