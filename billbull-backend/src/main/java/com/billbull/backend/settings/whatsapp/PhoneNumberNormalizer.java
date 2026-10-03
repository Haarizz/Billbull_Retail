package com.billbull.backend.settings.whatsapp;

/**
 * Turns a phone number as typed into a customer record into the digits-only international form
 * the WhatsApp Cloud API expects in {@code "to"} (E.164 without the leading "+").
 *
 * Rules, in order:
 * <ol>
 *   <li>A number written with "+" or "00" is already international — keep its digits.</li>
 *   <li>More than 10 digits is treated as already carrying a country code (971501234567).</li>
 *   <li>Otherwise it is a national number: drop trunk zeros (0501234567 → 501234567) and prepend
 *       the tenant's default country code.</li>
 * </ol>
 * The result is not guaranteed to be a real number — the send dialog shows it so the user can
 * correct it — but it must be 8–15 digits or this throws.
 */
public final class PhoneNumberNormalizer {

    private PhoneNumberNormalizer() {}

    public static String normalize(String raw, String defaultCountryCode) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Customer phone number is required.");
        }
        String trimmed = raw.trim();
        String digits = trimmed.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            throw new IllegalArgumentException("Phone number has no digits: " + raw);
        }

        String result;
        if (trimmed.startsWith("+")) {
            result = digits;
        } else if (digits.startsWith("00")) {
            result = digits.substring(2);
        } else if (digits.length() > 10) {
            result = digits;
        } else {
            String cc = defaultCountryCode == null ? "" : defaultCountryCode.replaceAll("\\D", "");
            String national = digits.replaceFirst("^0+", "");
            result = cc + national;
        }

        if (result.length() < 8 || result.length() > 15) {
            throw new IllegalArgumentException(
                    "Phone number '" + raw + "' is not a valid international number (got " + result
                            + "). Include the country code, e.g. +971 50 123 4567.");
        }
        return result;
    }
}
