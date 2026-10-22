package com.billbull.backend.pos.printer;

/**
 * Finds a cash-drawer pulse in a raw printer byte stream.
 *
 * <p>Two commands open a drawer: {@code ESC p m t1 t2} and the real-time {@code DLE DC4 1 m t}.
 * A plain byte search would misfire on raster logos and QR data, which routinely contain
 * {@code 1B 70}, so this walks the stream command by command and skips each command's
 * arguments and data block, the way the printer itself parses it.
 *
 * <p>Inside a data block only the real-time pulse is looked for, and only in its strict form
 * ({@code m} 0 or 1, {@code t} 1 to 8): printers act on real-time commands even inside image
 * data, but a 5-byte exact match occurs in ordinary image bytes about once in 10^9 positions.
 *
 * <p>On a command this walker does not know it cannot tell where the arguments end, so it falls
 * back to a byte search of the rest of the stream. That can over-report, never under-report.
 * Every command the BillBull receipt builder ({@code escPosReceipt.js}) emits is known, and ZPL
 * label streams contain no ESC at all, so legitimate prints do not take that path.
 */
final class EscPosDrawerKick {

    private static final int DLE = 0x10, DC4 = 0x14, ESC = 0x1B, FS = 0x1C, GS = 0x1D;

    /** Fixed argument counts after {@code ESC c}; -1 means unknown. */
    private static final int[] ESC_ARGS = table(new int[][]{
            {0x0C, 0}, {' ', 1}, {'!', 1}, {'$', 2}, {'%', 1}, {'-', 1}, {'2', 0}, {'3', 1},
            {'7', 3}, {'<', 0}, {'=', 1}, {'?', 1}, {'@', 0}, {'B', 2}, {'E', 1}, {'G', 1},
            {'J', 1}, {'K', 1}, {'L', 0}, {'M', 1}, {'R', 1}, {'S', 0}, {'T', 1}, {'U', 1},
            {'V', 1}, {'W', 8}, {'\\', 2}, {'a', 1}, {'c', 2}, {'d', 1}, {'e', 1}, {'i', 0},
            {'m', 0}, {'r', 1}, {'t', 1}, {'u', 1}, {'v', 0}, {'{', 1}});

    /** Fixed argument counts after {@code GS c}; -1 means unknown or handled separately. */
    private static final int[] GS_ARGS = table(new int[][]{
            {'!', 1}, {'$', 2}, {'/', 1}, {':', 0}, {'B', 1}, {'E', 1}, {'H', 1}, {'I', 1},
            {'L', 2}, {'P', 2}, {'T', 1}, {'W', 2}, {'\\', 2}, {'^', 3}, {'a', 1}, {'b', 1},
            {'c', 0}, {'f', 1}, {'g', 4}, {'h', 1}, {'r', 1}, {'w', 1}});

    /** Fixed argument counts after {@code FS c}; -1 means unknown or handled separately. */
    private static final int[] FS_ARGS = table(new int[][]{
            {'!', 1}, {'&', 0}, {'-', 1}, {'.', 0}, {'C', 1}, {'S', 2}, {'W', 1}, {'p', 2}});

    private EscPosDrawerKick() {
    }

    static boolean present(byte[] data) {
        if (data == null) return false;
        int n = data.length;
        int i = 0;
        while (i < n) {
            int b = u(data, i);
            if (b == DLE) {
                // Real-time commands. DLE DC4 fn=1 is the drawer pulse; DLE EOT / DLE ENQ are
                // status requests and the following bytes are parsed as normal.
                if (u(data, i + 1) == DC4 && u(data, i + 2) == 1) return true;
                i++;
                continue;
            }
            if (b != ESC && b != GS && b != FS) {
                i++; // text and single-byte controls (LF, CR, HT, FF, CAN)
                continue;
            }
            if (i + 1 >= n) break;
            int c = u(data, i + 1);
            int header;
            long block;
            if (b == ESC) {
                if (c == 'p') return true;
                if (c == '*') { // ESC * m nL nH d1..dk
                    int m = u(data, i + 2);
                    header = 5;
                    block = word(data, i + 3) * (m == 32 || m == 33 ? 3L : 1L);
                } else if (c == '(') { // ESC ( fn pL pH d1..dk
                    header = 5;
                    block = word(data, i + 3);
                } else if (ESC_ARGS[c] >= 0) {
                    header = 2 + ESC_ARGS[c];
                    block = 0;
                } else {
                    return naive(data, i + 2);
                }
            } else if (b == GS) {
                switch (c) {
                    case 'v' -> { // GS v 0 m xL xH yL yH d1..dk
                        if (u(data, i + 2) != '0') return naive(data, i + 2);
                        header = 8;
                        block = word(data, i + 4) * word(data, i + 6);
                    }
                    case '(' -> { // GS ( fn pL pH d1..dk
                        header = 5;
                        block = word(data, i + 3);
                    }
                    case '8' -> { // GS 8 L p1 p2 p3 p4 d1..dk
                        if (u(data, i + 2) != 'L') return naive(data, i + 2);
                        header = 7;
                        block = word(data, i + 3) + (word(data, i + 5) << 16);
                    }
                    case '*' -> { // GS * x y d1..d(x*y*8)
                        header = 4;
                        block = (long) u(data, i + 2) * u(data, i + 3) * 8;
                    }
                    case 'k' -> { // GS k m d1..dk NUL (m 0-6) or GS k m n d1..dn (m 65+)
                        int m = u(data, i + 2);
                        if (m <= 6) {
                            int end = i + 3;
                            while (end < n && data[end] != 0) end++;
                            header = 3;
                            block = end + 1L - (i + 3);
                        } else {
                            header = 4;
                            block = u(data, i + 3);
                        }
                    }
                    case 'V' -> { // GS V m, or GS V m n for the feed-and-cut forms
                        int m = u(data, i + 2);
                        header = (m == 0 || m == 1 || m == '0' || m == '1') ? 3 : 4;
                        block = 0;
                    }
                    default -> {
                        if (GS_ARGS[c] < 0) return naive(data, i + 2);
                        header = 2 + GS_ARGS[c];
                        block = 0;
                    }
                }
            } else { // FS
                if (c == '(') {
                    header = 5;
                    block = word(data, i + 3);
                } else if (FS_ARGS[c] >= 0) {
                    header = 2 + FS_ARGS[c];
                    block = 0;
                } else {
                    return naive(data, i + 2);
                }
            }
            int start = i + header;
            int end = (int) Math.min(n, start + block);
            if (realtimePulseIn(data, start, end)) return true;
            i = Math.max(end, i + 2);
        }
        return false;
    }

    /** The strict real-time pulse {@code DLE DC4 1 m t}, m 0 or 1, t 1 to 8, inside a data block. */
    private static boolean realtimePulseIn(byte[] data, int from, int to) {
        for (int j = Math.max(from, 0); j + 4 < to; j++) {
            if (u(data, j) == DLE && u(data, j + 1) == DC4 && u(data, j + 2) == 1
                    && u(data, j + 3) <= 1 && u(data, j + 4) >= 1 && u(data, j + 4) <= 8) {
                return true;
            }
        }
        return false;
    }

    /** Conservative fallback after an unknown command: any ESC p or DLE DC4 1 in the rest. */
    private static boolean naive(byte[] data, int from) {
        for (int j = Math.max(from, 0); j + 1 < data.length; j++) {
            if (u(data, j) == ESC && u(data, j + 1) == 'p') return true;
            if (u(data, j) == DLE && u(data, j + 1) == DC4 && u(data, j + 2) == 1) return true;
        }
        return false;
    }

    private static long word(byte[] data, int at) {
        return u(data, at) + 256L * u(data, at + 1);
    }

    /** Unsigned byte, or -1 past the end. */
    private static int u(byte[] data, int at) {
        return at >= 0 && at < data.length ? data[at] & 0xff : -1;
    }

    private static int[] table(int[][] entries) {
        int[] t = new int[256];
        java.util.Arrays.fill(t, -1);
        for (int[] e : entries) t[e[0]] = e[1];
        return t;
    }
}
