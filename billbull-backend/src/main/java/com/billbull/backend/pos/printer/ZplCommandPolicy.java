package com.billbull.backend.pos.printer;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Decides whether a ZPL II byte stream may be sent to a Zebra label printer.
 *
 * <p>ZPL is text, so an ESC/POS check would wave it through — including {@code ~JR} (power-cycle),
 * {@code ^JUF} (factory reset), {@code ^ID} (delete files), {@code ^NC}/{@code ^NS} (network
 * settings) and {@code ~DY} (file or firmware download). This is an ALLOWLIST built from what the
 * only BillBull ZPL builder ({@code billbull-frontend/src/utils/zebraZpl.js}, plus the device test
 * label in {@code zplText.js}) emits:
 * <pre>
 *   ^XA ^CI28 ^PW ^LL ^LH ^LS ^PO ^MMT ^BY            per label
 *   ^FO [^FB] [^A&lt;font&gt;] [^BC] [^FH] ^FD … ^FS      per field
 *   ^XZ
 * </pre>
 * The stream must be one or more complete {@code ^XA … ^XZ} formats separated only by whitespace,
 * every command's parameters must match an exact grammar, and tilde commands are refused anywhere
 * (the printer runs them on receipt, even inside field data). Field data may not carry a literal
 * {@code ~} or control character; the builder writes {@code ^ ~ _} as {@code ^FH} hex escapes.
 *
 * <p>Server-side twin of {@code tools/pos-print-agent/lib/zplPolicy.js}; both run over the same
 * real payloads in {@code PrinterPayloadFixturesTest} and the agent's {@code fixtures.test.js}.
 */
final class ZplCommandPolicy {

    private static final int MAX_FIELD_DATA = 3072;

    private static final Map<String, Pattern> FORMAT_COMMANDS = Map.of(
            "CI", Pattern.compile("28"),
            "PW", Pattern.compile("\\d{1,5}"),
            "LL", Pattern.compile("\\d{1,5}"),
            "LH", Pattern.compile("\\d{1,5},\\d{1,5}"),
            "LS", Pattern.compile("-?\\d{1,4}"),
            "PO", Pattern.compile("[NI]"),
            "MM", Pattern.compile("T"),
            "BY", Pattern.compile("\\d{1,2}(,\\d(\\.\\d)?(,\\d{1,5})?)?"));

    private static final Map<String, Pattern> FIELD_COMMANDS = Map.of(
            "FB", Pattern.compile("\\d{1,5},\\d{1,3},-?\\d{1,4},[LCRJ],\\d{1,4}"),
            "BC", Pattern.compile("[NRIB](,\\d{0,5}(,[YN](,[YN](,[YN](,[NUAD])?)?)?)?)?"),
            "FH", Pattern.compile("_?"));

    private static final Pattern FONT_PARAMS = Pattern.compile("[NRIB](,\\d{1,5}(,\\d{1,5})?)?");
    private static final Pattern FIELD_ORIGIN = Pattern.compile("\\d{1,5},\\d{1,5}(,[012])?");
    private static final Pattern HEX_PAIR = Pattern.compile("[0-9A-Fa-f]{2}");

    /** Named refusals for caret commands, so the error says what was blocked. */
    private static final Map<String, String> DENIED = Map.ofEntries(
            e("JU", "CONFIG_WRITE"), e("JZ", "CONFIG_WRITE"), e("JM", "CONFIG_WRITE"), e("JS", "CONFIG_WRITE"),
            e("JJ", "CONFIG_WRITE"), e("JW", "CONFIG_WRITE"), e("JT", "CONFIG_WRITE"), e("MU", "CONFIG_WRITE"),
            e("MT", "CONFIG_WRITE"), e("MN", "CONFIG_WRITE"), e("MD", "CONFIG_WRITE"), e("MF", "CONFIG_WRITE"),
            e("ML", "CONFIG_WRITE"), e("MP", "CONFIG_WRITE"), e("SC", "CONFIG_WRITE"), e("SS", "CONFIG_WRITE"),
            e("ST", "CONFIG_WRITE"), e("SZ", "CONFIG_WRITE"), e("KD", "CONFIG_WRITE"), e("KL", "CONFIG_WRITE"),
            e("KN", "CONFIG_WRITE"), e("KP", "CONFIG_WRITE"), e("PR", "CONFIG_WRITE"), e("PF", "CONFIG_WRITE"),
            e("CC", "CONFIG_WRITE"), e("CD", "CONFIG_WRITE"), e("CT", "CONFIG_WRITE"), e("CO", "CONFIG_WRITE"),
            e("CM", "CONFIG_WRITE"), e("CW", "CONFIG_WRITE"),
            e("NC", "NETWORK"), e("ND", "NETWORK"), e("NI", "NETWORK"), e("NN", "NETWORK"), e("NP", "NETWORK"),
            e("NS", "NETWORK"), e("NT", "NETWORK"), e("NW", "NETWORK"), e("NB", "NETWORK"), e("WA", "NETWORK"),
            e("WE", "NETWORK"), e("WI", "NETWORK"), e("WL", "NETWORK"), e("WP", "NETWORK"), e("WR", "NETWORK"),
            e("WS", "NETWORK"), e("WX", "NETWORK"),
            e("DF", "STORAGE"), e("ID", "STORAGE"), e("IL", "STORAGE"), e("IM", "STORAGE"), e("IS", "STORAGE"),
            e("XG", "STORAGE"), e("DG", "STORAGE"), e("DY", "STORAGE"), e("TO", "STORAGE"), e("HF", "STORAGE"),
            e("HG", "STORAGE"), e("HY", "STORAGE"),
            e("HH", "DEVICE_QUERY"), e("HW", "DEVICE_QUERY"), e("HZ", "DEVICE_QUERY"), e("HV", "DEVICE_QUERY"),
            e("HT", "DEVICE_QUERY"),
            e("SN", "UNSUPPORTED"), e("SF", "UNSUPPORTED"), e("SO", "UNSUPPORTED"), e("SQ", "UNSUPPORTED"),
            e("SE", "UNSUPPORTED"), e("PQ", "UNSUPPORTED"), e("FX", "UNSUPPORTED"), e("FN", "UNSUPPORTED"),
            e("FV", "UNSUPPORTED"), e("XF", "UNSUPPORTED"),
            e("RF", "RFID"), e("RS", "RFID"), e("RW", "RFID"), e("RB", "RFID"), e("WT", "RFID"), e("WV", "RFID"),
            e("RZ", "RFID"));

    /** ZPL tilde commands and what each does; every one is refused. Shared with the ESC/POS ZPL sniffer. */
    static final Map<String, String> TILDE_CODES = Map.ofEntries(
            e("JR", "POWER"), e("JP", "DEVICE_CONTROL"), e("JA", "DEVICE_CONTROL"), e("JC", "DEVICE_CONTROL"),
            e("JE", "DEVICE_CONTROL"), e("JF", "DEVICE_CONTROL"), e("JL", "DEVICE_CONTROL"), e("JN", "DEVICE_CONTROL"),
            e("JO", "DEVICE_CONTROL"), e("JS", "DEVICE_CONTROL"), e("JX", "DEVICE_CONTROL"), e("JD", "DEVICE_CONTROL"),
            e("JB", "DEVICE_CONTROL"), e("JG", "DEVICE_CONTROL"), e("JI", "DEVICE_CONTROL"), e("JQ", "DEVICE_CONTROL"),
            e("DY", "STORAGE"), e("DG", "STORAGE"), e("DB", "STORAGE"), e("DE", "STORAGE"), e("DN", "STORAGE"),
            e("DS", "STORAGE"), e("DT", "STORAGE"), e("DU", "STORAGE"), e("EG", "STORAGE"),
            e("NC", "NETWORK"), e("NR", "NETWORK"), e("NT", "NETWORK"), e("WC", "DEVICE_CONTROL"),
            e("WQ", "DEVICE_QUERY"), e("WR", "NETWORK"),
            e("HS", "DEVICE_QUERY"), e("HQ", "DEVICE_QUERY"), e("HI", "DEVICE_QUERY"), e("HM", "DEVICE_QUERY"),
            e("HB", "DEVICE_QUERY"), e("HD", "DEVICE_QUERY"), e("HU", "DEVICE_QUERY"),
            e("CC", "CONFIG_WRITE"), e("CD", "CONFIG_WRITE"), e("CT", "CONFIG_WRITE"), e("SD", "CONFIG_WRITE"),
            e("TA", "CONFIG_WRITE"), e("KB", "CONFIG_WRITE"), e("PR", "CONFIG_WRITE"), e("RO", "CONFIG_WRITE"),
            e("PH", "DEVICE_CONTROL"), e("PL", "DEVICE_CONTROL"), e("PM", "DEVICE_CONTROL"), e("PP", "DEVICE_CONTROL"),
            e("PS", "DEVICE_CONTROL"));

    private ZplCommandPolicy() {
    }

    static PrintCommandVerdict inspect(byte[] data) {
        if (data == null) return PrintCommandVerdict.refused(0, "(empty)", "INCOMPLETE");
        int len = data.length;
        // Tilde commands run on receipt, wherever they appear.
        for (int i = 0; i < len; i++) {
            if (data[i] != '~') continue;
            String code = ascii(data, i + 1, Math.min(len, i + 3)).toUpperCase();
            return PrintCommandVerdict.refused(i, "~" + code, TILDE_CODES.getOrDefault(code, "DEVICE_CONTROL"));
        }

        boolean inFormat = false;
        int formats = 0;
        int formatStart = -1;
        boolean fieldOpen = false, fieldHex = false, fieldData = false;
        int i = 0;
        while (i < len) {
            int b = data[i] & 0xFF;
            if (b != '^') {
                if (isSpace(b)) {
                    i++;
                    continue;
                }
                return PrintCommandVerdict.refused(i, String.format("byte 0x%02x", b), isControl(b) ? "CONTROL_CHARACTER" : "MALFORMED");
            }
            if (i + 3 > len) return PrintCommandVerdict.refused(i, "^", "INCOMPLETE");
            String code = ascii(data, i + 1, i + 3);
            int start = i;
            int end = i + 3;
            while (end < len && data[end] != '^') end++;

            if (code.equals("FD")) {
                if (!fieldOpen || fieldData) return PrintCommandVerdict.refused(start, "^FD", "MALFORMED");
                if (end >= len) return PrintCommandVerdict.refused(start, "^FD", "INCOMPLETE");
                if (end - (i + 3) > MAX_FIELD_DATA) return PrintCommandVerdict.refused(start, "^FD", "MALFORMED");
                for (int j = i + 3; j < end; j++) {
                    if (isControl(data[j] & 0xFF)) return PrintCommandVerdict.refused(j, "^FD", "CONTROL_CHARACTER");
                    if (fieldHex && data[j] == '_') {
                        if (j + 2 >= end || !HEX_PAIR.matcher(ascii(data, j + 1, j + 3)).matches()) {
                            return PrintCommandVerdict.refused(j, "^FH escape", "MALFORMED");
                        }
                        j += 2;
                    }
                }
                fieldData = true;
                i = end;
                continue;
            }

            int paramEnd = end;
            while (paramEnd > i + 3 && isSpace(data[paramEnd - 1] & 0xFF)) paramEnd--;
            for (int j = i + 1; j < paramEnd; j++) {
                int v = data[j] & 0xFF;
                if (v < 0x20 || v > 0x7E) {
                    return PrintCommandVerdict.refused(j, "^" + code, v < 0x20 ? "CONTROL_CHARACTER" : "MALFORMED");
                }
            }
            String params = ascii(data, i + 3, paramEnd);
            String name = "^" + code;

            if (code.equals("XA")) {
                if (inFormat || !params.isEmpty()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
                inFormat = true;
                formatStart = start;
            } else if (!inFormat) {
                return PrintCommandVerdict.refused(start, name, DENIED.getOrDefault(code.toUpperCase(), "OUTSIDE_FORMAT"));
            } else if (code.equals("XZ")) {
                if (fieldOpen || !params.isEmpty()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
                inFormat = false;
                formats++;
            } else if (code.equals("FO")) {
                if (fieldOpen || !FIELD_ORIGIN.matcher(params).matches()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
                fieldOpen = true;
                fieldHex = false;
                fieldData = false;
            } else if (code.equals("FS")) {
                if (!fieldOpen || !fieldData || !params.isEmpty()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
                fieldOpen = false;
            } else if (FORMAT_COMMANDS.containsKey(code)) {
                if (fieldOpen || !FORMAT_COMMANDS.get(code).matcher(params).matches()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
            } else if (FIELD_COMMANDS.containsKey(code)) {
                if (!fieldOpen || fieldData || !FIELD_COMMANDS.get(code).matcher(params).matches()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
                if (code.equals("FH")) fieldHex = true;
            } else if (code.charAt(0) == 'A' && isFontName(code.charAt(1))) {
                if (!fieldOpen || fieldData || !FONT_PARAMS.matcher(params).matches()) return PrintCommandVerdict.refused(start, name, "MALFORMED");
            } else {
                return PrintCommandVerdict.refused(start, name, DENIED.getOrDefault(code.toUpperCase(), "UNKNOWN"));
            }
            i = end;
        }

        if (inFormat) return PrintCommandVerdict.refused(formatStart, "^XA", "INCOMPLETE");
        if (formats == 0) return PrintCommandVerdict.refused(0, "(empty)", "INCOMPLETE");
        return PrintCommandVerdict.ALLOWED;
    }

    private static boolean isFontName(char c) {
        return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z');
    }

    private static boolean isSpace(int b) {
        return b == 0x20 || b == 0x09 || b == 0x0A || b == 0x0D;
    }

    private static boolean isControl(int b) {
        return b < 0x20 || b == 0x7F;
    }

    private static String ascii(byte[] data, int from, int to) {
        return new String(data, from, Math.max(0, to - from), StandardCharsets.ISO_8859_1);
    }

    private static Map.Entry<String, String> e(String k, String v) {
        return Map.entry(k, v);
    }
}
