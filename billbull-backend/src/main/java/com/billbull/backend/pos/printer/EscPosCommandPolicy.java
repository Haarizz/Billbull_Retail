package com.billbull.backend.pos.printer;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;

/**
 * Decides whether a raw ESC/POS byte stream may be sent to a receipt printer.
 *
 * <p>The stream is walked command by command the way the printer parses it, so arguments and
 * raster/QR/barcode data blocks are skipped by their declared lengths and never mistaken for
 * commands: a logo that happens to contain {@code 1B 70} is image data, not a drawer pulse. It is
 * an ALLOWLIST — only the commands the BillBull receipt builder ({@code escPosReceipt.js}) and the
 * agent's probe slips emit are accepted — and it is the server-side twin of the print agent's
 * {@code tools/pos-print-agent/lib/escposPolicy.js}. The two are kept in step by
 * {@code PrinterPayloadFixturesTest}, which runs the same real payloads through both.
 *
 * <p>Refused: a buzzer, power-off, writes to the printer's non-volatile memory, hardware
 * configuration, Star line-mode peripheral drives, any command this walker does not know (it could
 * not tell where its arguments end), and a job that ends part-way through a command (the printer
 * would finish it with the next job's first bytes).
 *
 * <p>It does not look for ZPL. {@code ^} and {@code ~} are ordinary text to a receipt printer (a
 * product called "Gift Box~Deluxe" prints as written). Which language a printer speaks is decided by
 * the stored printer ({@link PrinterCommandProtocol#of}), so a job only reaches this policy when its
 * printer is a receipt or kitchen printer; a label printer's jobs go to {@link ZplCommandPolicy}.
 *
 * <p>One difference from the agent: the agent refuses every drawer pulse, but the server lets an
 * authorised cashier open the drawer through a network printer. A well-formed pulse ({@code ESC p}
 * or the strict real-time {@code DLE DC4 1 m t}) is therefore reported as
 * {@link PrintCommandVerdict#drawerPulse()} and left to {@code PosDrawerKickAuthorizer}.
 */
final class EscPosCommandPolicy {

    private static final int NUL = 0x00, BEL = 0x07, DLE = 0x10, DC4 = 0x14, EOT = 0x04, ENQ = 0x05;
    private static final int SUB = 0x1A, ESC = 0x1B, FS = 0x1C, GS = 0x1D;

    /** Fixed argument counts for accepted {@code ESC c} commands; -1 = not accepted. */
    private static final int[] ESC_ARGS = table(new int[][]{
            {0x20, 1}, {0x21, 1}, {0x24, 2}, {0x2D, 1}, {0x32, 0}, {0x33, 1}, {0x37, 3}, {0x40, 0},
            {0x45, 1}, {0x47, 1}, {0x4A, 1}, {0x4D, 1}, {0x52, 1}, {0x56, 1}, {0x5C, 2}, {0x61, 1},
            {0x64, 1}, {0x69, 0}, {0x6D, 0}, {0x74, 1}, {0x7B, 1}});

    /** Fixed argument counts for accepted {@code GS c} commands; -1 = not accepted or special. */
    private static final int[] GS_ARGS = table(new int[][]{
            {0x21, 1}, {0x42, 1}, {0x48, 1}, {0x49, 1}, {0x4C, 2}, {0x50, 2}, {0x57, 2}, {0x62, 1},
            {0x66, 1}, {0x68, 1}, {0x72, 1}, {0x77, 1}});

    /** GS ( L / GS 8 L functions: print-buffer and RAM graphics. 65-68 define/delete NV graphics. */
    private static final Set<Integer> GRAPHICS_FN_ALLOWED = Set.of(48, 49, 50, 51, 52, 64, 69, 80, 81, 82, 83, 84, 85, 112, 113);
    private static final Set<Integer> GRAPHICS_FN_NV_WRITE = Set.of(65, 66, 67, 68);

    private static final Map<Integer, String[]> DENIED_ESC = Map.of(
            0x42, new String[]{"ESC B", "BUZZER"},
            0x07, new String[]{"ESC BEL", "DRAWER"},
            0x63, new String[]{"ESC c", "HARDWARE_CONFIG"},
            0x3D, new String[]{"ESC =", "HARDWARE_CONFIG"});

    private static final Map<Integer, String[]> DENIED_GS_PAREN = Map.of(
            0x41, new String[]{"GS ( A", "HARDWARE_CONTROL"},
            0x43, new String[]{"GS ( C", "NV_WRITE"},
            0x44, new String[]{"GS ( D", "HARDWARE_CONFIG"},
            0x45, new String[]{"GS ( E", "NV_WRITE"},
            0x4D, new String[]{"GS ( M", "NV_WRITE"});

    private static final Map<Integer, String> DLE_DC4_FN = Map.of(1, "DRAWER", 2, "POWER", 3, "BUZZER");

    private EscPosCommandPolicy() {
    }

    /** Result of measuring one command: header and data-block lengths, or a refusal. */
    private record Measure(int header, long block, boolean drawer, PrintCommandVerdict refusal) {
        static Measure of(int header, long block) {
            return new Measure(header, block, false, null);
        }

        static Measure drawerPulse(int header) {
            return new Measure(header, 0, true, null);
        }

        static Measure refuse(int offset, String command, String category) {
            return new Measure(0, 0, false, PrintCommandVerdict.refused(offset, command, category));
        }
    }

    static PrintCommandVerdict inspect(byte[] data) {
        if (data == null || data.length == 0) return PrintCommandVerdict.refused(0, "(empty)", "INCOMPLETE");
        int n = data.length;
        boolean drawer = false;
        int i = 0;
        while (i < n) {
            int b = u(data, i);
            // BEL and SUB drive peripheral 1/2 on Star line-mode printers; ESC/POS printers ignore them.
            if (b == BEL || b == SUB) return PrintCommandVerdict.refused(i, hex(b), "DRAWER");
            if (b != DLE && b != ESC && b != GS && b != FS) {
                i++; // text and single-byte controls (LF, CR, HT, FF, CAN, NUL)
                continue;
            }
            Measure m = measure(data, i);
            if (m.refusal() != null) return m.refusal();
            int start = i + m.header();
            long end = start + m.block();
            if (m.header() < 1 || end > n || start > n) {
                return PrintCommandVerdict.refused(i, describeAt(data, i), "INCOMPLETE");
            }
            PrintCommandVerdict hidden = realtimeInBlock(data, start, (int) end);
            if (hidden != null) {
                if (!hidden.allowed()) return hidden;
                drawer = true;
            }
            drawer |= m.drawer();
            i = (int) end;
        }
        return drawer ? PrintCommandVerdict.ALLOWED_WITH_DRAWER_PULSE : PrintCommandVerdict.ALLOWED;
    }

    private static Measure measure(byte[] data, int i) {
        int b = u(data, i);
        int c = u(data, i + 1);

        if (b == DLE) {
            if (c == EOT) {
                int fn = u(data, i + 2);
                return Measure.of(fn == 7 || fn == 8 ? 4 : 3, 0); // status request
            }
            if (c == ENQ) return Measure.of(3, 0);
            if (c == DC4) {
                int fn = u(data, i + 2);
                if (fn == 1) {
                    int m = u(data, i + 3), t = u(data, i + 4);
                    if (m < 0 || t < 0) return Measure.refuse(i, "DLE DC4 1", "INCOMPLETE");
                    if (m > 1 || t < 1 || t > 8) return Measure.refuse(i, "DLE DC4 1", "MALFORMED");
                    return Measure.drawerPulse(5);
                }
                if (fn < 0) return Measure.refuse(i, "DLE DC4", "INCOMPLETE");
                return Measure.refuse(i, "DLE DC4 " + fn, DLE_DC4_FN.getOrDefault(fn, "HARDWARE_CONTROL"));
            }
            return Measure.of(1, 0); // a lone DLE is ordinary data
        }

        if (b == ESC) {
            if (c < 0) return Measure.refuse(i, "ESC", "INCOMPLETE");
            if (ESC_ARGS[c] >= 0) return Measure.of(2 + ESC_ARGS[c], 0);
            if (c == 0x70) { // ESC p m t1 t2 — drawer pulse
                int m = u(data, i + 2);
                if (u(data, i + 4) < 0) return Measure.refuse(i, "ESC p", "INCOMPLETE");
                if (m != 0 && m != 1 && m != 48 && m != 49) return Measure.refuse(i, "ESC p " + m, "MALFORMED");
                return Measure.drawerPulse(5);
            }
            if (c == 0x2A) { // ESC * m nL nH d1..dk
                int m = u(data, i + 2);
                if (m != 0 && m != 1 && m != 32 && m != 33) return Measure.refuse(i, "ESC * " + m, m < 0 ? "INCOMPLETE" : "UNKNOWN");
                return Measure.of(5, word(data, i + 3) * (m >= 32 ? 3L : 1L));
            }
            if (c == 0x28 && u(data, i + 2) == 0x41) return Measure.refuse(i, "ESC ( A", "BUZZER");
            String[] denied = DENIED_ESC.get(c);
            if (denied != null) return Measure.refuse(i, denied[0], denied[1]);
            return Measure.refuse(i, "ESC " + hex(c), "UNKNOWN");
        }

        if (b == GS) {
            if (c < 0) return Measure.refuse(i, "GS", "INCOMPLETE");
            if (GS_ARGS[c] >= 0) return Measure.of(2 + GS_ARGS[c], 0);
            switch (c) {
                case 0x76 -> { // GS v 0 m xL xH yL yH d1..dk
                    if (u(data, i + 2) != 0x30) return Measure.refuse(i, "GS v", "UNKNOWN");
                    return Measure.of(8, word(data, i + 4) * word(data, i + 6));
                }
                case 0x56 -> { // GS V m [n]
                    int m = u(data, i + 2);
                    if (m == 0 || m == 1 || m == 48 || m == 49) return Measure.of(3, 0);
                    if (m == 65 || m == 66 || m == 97 || m == 98 || m == 103 || m == 104) return Measure.of(4, 0);
                    return Measure.refuse(i, "GS V " + m, m < 0 ? "INCOMPLETE" : "UNKNOWN");
                }
                case 0x6B -> { // GS k m d1..dk NUL (m 0-6) | GS k m n d1..dn (m 65-79)
                    int m = u(data, i + 2);
                    if (m >= 0 && m <= 6) {
                        int end = i + 3;
                        while (end < data.length && data[end] != NUL) end++;
                        if (end >= data.length) return Measure.refuse(i, "GS k " + m, "INCOMPLETE");
                        return Measure.of(3, end + 1L - (i + 3));
                    }
                    if (m >= 65 && m <= 79) {
                        int len = u(data, i + 3);
                        if (len < 0) return Measure.refuse(i, "GS k " + m, "INCOMPLETE");
                        return Measure.of(4, len);
                    }
                    return Measure.refuse(i, "GS k " + m, m < 0 ? "INCOMPLETE" : "UNKNOWN");
                }
                case 0x28 -> { // GS ( fn pL pH ...
                    int fn = u(data, i + 2);
                    if (fn == 0x6B) return Measure.of(5, word(data, i + 3)); // GS ( k — QR / 2D symbols
                    if (fn == 0x4C) { // GS ( L pL pH m fn ...
                        int gfn = u(data, i + 6);
                        if (GRAPHICS_FN_NV_WRITE.contains(gfn)) return Measure.refuse(i, "GS ( L fn " + gfn, "NV_WRITE");
                        if (!GRAPHICS_FN_ALLOWED.contains(gfn)) return Measure.refuse(i, "GS ( L fn " + gfn, gfn < 0 ? "INCOMPLETE" : "UNKNOWN");
                        return Measure.of(5, word(data, i + 3));
                    }
                    String[] denied = DENIED_GS_PAREN.get(fn);
                    if (denied != null) return Measure.refuse(i, denied[0], denied[1]);
                    return Measure.refuse(i, fn < 0 ? "GS (" : "GS ( " + hex(fn), fn < 0 ? "INCOMPLETE" : "UNKNOWN");
                }
                case 0x38 -> { // GS 8 L p1 p2 p3 p4 m fn ...
                    if (u(data, i + 2) != 0x4C) return Measure.refuse(i, "GS 8", "UNKNOWN");
                    int gfn = u(data, i + 8);
                    if (GRAPHICS_FN_NV_WRITE.contains(gfn)) return Measure.refuse(i, "GS 8 L fn " + gfn, "NV_WRITE");
                    if (!GRAPHICS_FN_ALLOWED.contains(gfn)) return Measure.refuse(i, "GS 8 L fn " + gfn, gfn < 0 ? "INCOMPLETE" : "UNKNOWN");
                    return Measure.of(7, word(data, i + 3) + (word(data, i + 5) << 16));
                }
                default -> {
                    return Measure.refuse(i, "GS " + hex(c), "UNKNOWN");
                }
            }
        }

        // FS: kanji commands in ESC/POS, but in Star line mode a bare FS drives the drawer.
        return Measure.refuse(i, "FS", "DRAWER");
    }

    /**
     * Real-time commands are acted on even inside image data. The strict forms are looked for
     * (drawer {@code DLE DC4 1 m t}, m 0/1, t 1-8; power-off exactly {@code DLE DC4 2 1 8}), which a
     * random raster matches about once in 10^9 positions. A drawer pulse here is reported for
     * authorisation; a power-off refuses the job.
     */
    private static PrintCommandVerdict realtimeInBlock(byte[] data, int from, int to) {
        boolean drawer = false;
        for (int j = Math.max(from, 0); j + 4 < to; j++) {
            if (u(data, j) != DLE || u(data, j + 1) != DC4) continue;
            int fn = u(data, j + 2), a = u(data, j + 3), b = u(data, j + 4);
            if (fn == 1 && a <= 1 && b >= 1 && b <= 8) drawer = true;
            if (fn == 2 && a == 1 && b == 8) return PrintCommandVerdict.refused(j, "DLE DC4 2 (in data)", "POWER");
        }
        return drawer ? PrintCommandVerdict.ALLOWED_WITH_DRAWER_PULSE : null;
    }

    private static String describeAt(byte[] data, int i) {
        StringBuilder sb = new StringBuilder();
        for (int k = i; k < Math.min(data.length, i + 2); k++) {
            if (sb.length() > 0) sb.append(' ');
            int v = u(data, k);
            sb.append(switch (v) {
                case ESC -> "ESC";
                case GS -> "GS";
                case DLE -> "DLE";
                case FS -> "FS";
                default -> hex(v);
            });
        }
        return sb.toString();
    }

    /** Little-endian 16-bit length. Past the end it reads 0: the missing header bytes already refuse the job. */
    private static long word(byte[] data, int at) {
        return Math.max(u(data, at), 0) + 256L * Math.max(u(data, at + 1), 0);
    }

    /** Unsigned byte, or -1 past the end. */
    private static int u(byte[] data, int at) {
        return at >= 0 && at < data.length ? data[at] & 0xFF : -1;
    }

    private static String hex(int b) {
        return String.format("0x%02x", b);
    }

    private static int[] table(int[][] entries) {
        int[] t = new int[256];
        Arrays.fill(t, -1);
        for (int[] e : entries) t[e[0]] = e[1];
        return t;
    }
}
