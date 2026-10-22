package com.billbull.backend.settings.email;

import java.util.Locale;

/**
 * How the SMTP connection is protected. Both modes verify the server certificate against the JDK
 * trust store and check that it names the configured host; there is no plaintext mode.
 */
public enum SmtpSecurity {

    /** Plain TCP connection upgraded with STARTTLS before AUTH (submission port 587). Refuses servers that do not offer it. */
    STARTTLS(587),

    /** TLS from the first byte, "implicit TLS" (SMTPS port 465). */
    SSL(465);

    private final int standardPort;

    SmtpSecurity(int standardPort) {
        this.standardPort = standardPort;
    }

    public int standardPort() {
        return standardPort;
    }

    /**
     * The stored value, or the mode an existing row implies. Rows saved before this setting
     * existed have no value: 465 can only have been SMTPS, anything else ran as STARTTLS.
     */
    public static SmtpSecurity resolve(String stored, Integer port) {
        if (stored != null && !stored.isBlank()) {
            return parse(stored);
        }
        return port != null && port == SSL.standardPort ? SSL : STARTTLS;
    }

    /** @throws IllegalArgumentException for anything other than STARTTLS or SSL (case-insensitive). */
    public static SmtpSecurity parse(String value) {
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Security must be STARTTLS or SSL.");
        }
    }
}
