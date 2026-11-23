package com.billbull.platform.auth;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class TotpTest {

    /** RFC 6238 appendix B seed for SHA-1: ASCII "12345678901234567890". */
    private static final byte[] RFC_SEED = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @Test
    void matchesRfc6238Vectors() {
        // RFC values are 8 digits (94287082, 07081804, 14050471); the 6-digit code is the last six.
        assertEquals("287082", Totp.generate(RFC_SEED, 59 / 30));
        assertEquals("081804", Totp.generate(RFC_SEED, 1111111109L / 30));
        assertEquals("050471", Totp.generate(RFC_SEED, 1111111111L / 30));
    }

    @Test
    void base32RoundTrips() {
        String b32 = Totp.base32Encode(RFC_SEED);
        assertEquals("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", b32);
        assertArrayEquals(RFC_SEED, Totp.base32Decode(b32));
    }

    @Test
    void verifyAcceptsAdjacentStepsOnly() {
        String secret = Totp.base32Encode(RFC_SEED);
        long t = 1111111109L;
        String code = Totp.generate(RFC_SEED, t / 30);
        assertEquals(t / 30, Totp.verify(secret, code, t));
        assertEquals(t / 30, Totp.verify(secret, code, t + 30), "one step of drift is accepted");
        assertEquals(-1, Totp.verify(secret, code, t + 120), "older codes are not");
        assertEquals(-1, Totp.verify(secret, "12345", t));
        assertEquals(-1, Totp.verify(secret, null, t));
    }

    @Test
    void otpauthUriIsWellFormed() {
        String uri = Totp.otpauthUri("BillBull Platform", "ops@billbull.app", "ABC");
        assertTrue(uri.startsWith("otpauth://totp/BillBull%20Platform%3Aops%40billbull.app?secret=ABC"), uri);
    }
}
