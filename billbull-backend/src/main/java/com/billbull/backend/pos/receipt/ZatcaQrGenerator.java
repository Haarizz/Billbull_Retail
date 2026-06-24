package com.billbull.backend.pos.receipt;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;

/**
 * Generates UAE FTA ZATCA Phase-1 QR codes.
 *
 * Format: TLV (Tag-Length-Value) encoding, base64.
 * Tags:
 *   01 — Seller name (UTF-8)
 *   02 — VAT registration number / TRN (UTF-8)
 *   03 — Invoice timestamp (ISO 8601, UTC)
 *   04 — Invoice total including VAT (2 dp, UTF-8)
 *   05 — VAT total (2 dp, UTF-8)
 *
 * Reference: ZATCA Phase 1 e-invoicing specifications.
 */
public final class ZatcaQrGenerator {

    private ZatcaQrGenerator() {}

    /**
     * Build the base64-encoded ZATCA QR payload.
     *
     * @param sellerName  trading name (branchName or company name)
     * @param trn         Tax Registration Number; if blank, "N/A" is used
     * @param invoiceAt   timestamp to embed (invoice date + time, UTC)
     * @param totalWithVat invoice grand total including VAT
     * @param vatTotal    VAT portion of the total
     * @return base64 string ready for QR encoding
     */
    public static String generate(String sellerName, String trn,
                                  LocalDateTime invoiceAt,
                                  BigDecimal totalWithVat, BigDecimal vatTotal) {
        byte[] tlv = tlvConcat(
                tlvEntry((byte) 0x01, safe(sellerName)),
                tlvEntry((byte) 0x02, trn != null && !trn.isBlank() ? trn.trim() : "N/A"),
                tlvEntry((byte) 0x03, formatTimestamp(invoiceAt)),
                tlvEntry((byte) 0x04, money(totalWithVat)),
                tlvEntry((byte) 0x05, money(vatTotal))
        );
        return Base64.getEncoder().encodeToString(tlv);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static byte[] tlvEntry(byte tag, String value) {
        byte[] valueBytes = value.getBytes(StandardCharsets.UTF_8);
        int len = valueBytes.length;
        // Length must fit in one byte (≤255 characters per field — sufficient for all ZATCA fields)
        byte[] entry = new byte[2 + len];
        entry[0] = tag;
        entry[1] = (byte) (len & 0xFF);
        System.arraycopy(valueBytes, 0, entry, 2, len);
        return entry;
    }

    private static byte[] tlvConcat(byte[]... arrays) {
        int total = 0;
        for (byte[] a : arrays) total += a.length;
        byte[] result = new byte[total];
        int pos = 0;
        for (byte[] a : arrays) {
            System.arraycopy(a, 0, result, pos, a.length);
            pos += a.length;
        }
        return result;
    }

    private static String formatTimestamp(LocalDateTime dt) {
        if (dt == null) dt = LocalDateTime.now(ZoneOffset.UTC);
        return dt.atOffset(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String money(BigDecimal v) {
        if (v == null) v = BigDecimal.ZERO;
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String safe(String v) { return v != null ? v.trim() : ""; }
}
