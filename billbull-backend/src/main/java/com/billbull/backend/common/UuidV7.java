package com.billbull.backend.common;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Time-sortable UUID v7 generator (RFC 9562).
 *
 * Layout (128 bits):
 *   [0..47]  unix_ts_ms  — 48-bit millisecond timestamp
 *   [48..51] ver         — 0b0111 (version 7)
 *   [52..63] rand_a      — 12 random bits
 *   [64..65] var         — 0b10 (RFC 4122 variant)
 *   [66..127] rand_b     — 62 random bits
 *
 * Strings sort lexicographically in insertion order, eliminating the B-tree
 * page-split pressure that random UUID v4 causes on high-insert tables.
 */
public final class UuidV7 {

    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {}

    public static String generate() {
        long ms = System.currentTimeMillis();
        long rand = RANDOM.nextLong();

        // Build most-significant 64 bits:
        //   48-bit ts | 4-bit ver (7) | 12-bit rand
        long msb = (ms << 16)
                 | 0x7000L                          // version nibble = 0111
                 | (rand >>> 52 & 0x0FFFL);         // 12 random bits (rand_a)

        // Build least-significant 64 bits:
        //   2-bit variant (10) | 62-bit rand
        long lsb = (rand & 0x3FFFFFFFFFFFFFFFL)     // keep lower 62 bits
                 | 0x8000000000000000L;              // set variant bits to 10xxxxxx

        return new UUID(msb, lsb).toString();
    }
}
