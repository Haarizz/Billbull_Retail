package com.billbull.backend.pos.printer;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The server-side ESC/POS and ZPL command policies: what passes, what is refused and why.
 * Real builder output is covered by {@link PrinterPayloadFixturesTest}.
 */
class PrinterCommandPolicyTest {

    private static final int ESC = 0x1B, GS = 0x1D, DLE = 0x10, DC4 = 0x14;

    // ── ESC/POS ─────────────────────────────────────────────────────────────────────────

    @Test
    void aReceiptWithLogoQrBarcodeFeedAndCutIsAllowed() {
        PrintCommandVerdict v = EscPosCommandPolicy.inspect(receipt(bytes(0x55, 0xAA)));
        assertTrue(v.allowed(), v::toString);
        assertFalse(v.drawerPulse());
    }

    @Test
    void imageQrAndBarcodeDataThatLookLikeCommandsAreData() {
        byte[] lookalikes = bytes(ESC, 0x70, 0, 25, 250, ESC, 0x42, 3, 2, GS, 0x28, 0x45, 0x07, 0x1C, DLE, DC4, 2, 0, 0);
        byte[] stream = concat(
                bytes(ESC, 0x40),
                bytes(GS, 0x76, 0x30, 0, lookalikes.length, 0, 1, 0), lookalikes,                  // GS v 0
                bytes(ESC, 0x2A, 0, lookalikes.length, 0), lookalikes,                             // ESC * 8-dot
                bytes(GS, 0x28, 0x6B, 3 + 5, 0, 0x31, 0x50, 0x30, ESC, 0x70, 0, 25, 250),       // GS ( k QR store
                bytes(GS, 0x6B, 73, 5, ESC, 0x70, 0, 25, 250),                                     // GS k CODE128
                bytes(GS, 0x56, 66, 120));
        PrintCommandVerdict v = EscPosCommandPolicy.inspect(stream);
        assertTrue(v.allowed(), v::toString);
        assertFalse(v.drawerPulse(), "an ESC p in image data is not a pulse");
    }

    @Test
    void feedAndCutAreOrdinaryOperations() {
        assertTrue(EscPosCommandPolicy.inspect(bytes(ESC, 0x40, ESC, 0x64, 5, ESC, 0x4A, 40, GS, 0x56, 1,
                GS, 0x56, 66, 120, GS, 0x56, 0x41, 3, ESC, 0x69, ESC, 0x6D)).allowed());
    }

    @Test
    void drawerPulsesAreReportedForAuthorisationNotRefused() {
        assertDrawer(bytes(ESC, 0x40, ESC, 0x70, 0, 25, 250));
        assertDrawer(bytes(ESC, 0x70, 49, 50, 50));
        assertDrawer(bytes(DLE, DC4, 1, 0, 1));
        assertDrawer(concat(bytes(GS, 0x76, 0x30, 0, 5, 0, 1, 0), bytes(DLE, DC4, 1, 1, 8))); // strict pulse in data
        // A pulse with parameters no drawer takes is malformed, not a pulse.
        assertRefused(bytes(ESC, 0x70, 7, 25, 250), "MALFORMED");
        assertRefused(bytes(DLE, DC4, 1, 0, 9), "MALFORMED");
    }

    @Test
    void buzzerPowerOffNvWritesAndHardwareConfigAreRefused() {
        assertRefused(bytes(ESC, 0x40, ESC, 0x42, 3, 2), "BUZZER");
        assertRefused(bytes(ESC, 0x28, 0x41, 4, 0, 48, 48, 1, 1), "BUZZER");
        assertRefused(bytes(DLE, DC4, 3, 1, 1), "BUZZER");
        assertRefused(bytes(DLE, DC4, 2, 1, 8), "POWER");
        assertRefused(concat(bytes(GS, 0x76, 0x30, 0, 5, 0, 1, 0), bytes(DLE, DC4, 2, 1, 8)), "POWER"); // hidden in data
        assertRefused(bytes(GS, 0x28, 0x45, 3, 0, 1, 73, 78), "NV_WRITE");         // user setup
        assertRefused(bytes(GS, 0x28, 0x43, 5, 0, 0, 0x30, 0, 0, 0), "NV_WRITE"); // NV user memory
        assertRefused(bytes(GS, 0x28, 0x4C, 6, 0, 48, 67, 48, 32, 32, 1), "NV_WRITE"); // NV graphics define
        assertRefused(bytes(GS, 0x38, 0x4C, 6, 0, 0, 0, 48, 65, 0, 0), "NV_WRITE");
        assertRefused(bytes(ESC, 0x63, 0x34, 1), "HARDWARE_CONFIG");
        assertRefused(bytes(GS, 0x28, 0x44, 5, 0, 20, 1, 0, 2, 0), "HARDWARE_CONFIG");
        assertRefused(bytes(GS, 0x28, 0x41, 2, 0, 0, 2), "HARDWARE_CONTROL");     // self-test
        assertRefused(bytes(0x07), "DRAWER");                                      // Star BEL
        assertRefused(bytes(0x1A), "DRAWER");
        assertRefused(bytes(0x1C, 0x70, 1, 0), "DRAWER");                          // FS
    }

    @Test
    void unknownTruncatedAndOverlongCommandsAreRefused() {
        assertRefused(bytes(GS, 0x3A), "UNKNOWN");
        assertRefused(bytes(ESC, 0x26, 3, 32, 32), "UNKNOWN");      // user-defined chars: length not modelled
        assertRefused(bytes(ESC, 0x2A, 7, 1, 0, 0), "UNKNOWN");
        assertRefused(bytes(GS, 0x56, 7), "UNKNOWN");
        assertRefused(bytes(ESC, 0x40, ESC), "INCOMPLETE");          // would combine with the next job
        assertRefused(bytes(ESC, 0x61), "INCOMPLETE");
        assertRefused(bytes(GS, 0x76, 0x30, 0, 44, 0, 200, 0, 1, 2, 3), "INCOMPLETE"); // raster past the end
        assertRefused(bytes(GS, 0x76, 0x30, 0, 1), "INCOMPLETE");    // header cut short
        assertRefused(bytes(GS, 0x28, 0x6B, 10, 0, 0x31), "INCOMPLETE");
        assertRefused(bytes(GS, 0x6B, 4, 'A', 'B'), "INCOMPLETE");    // NUL-terminated barcode never ends
        assertRefused(bytes(GS, 0x6B, 73), "INCOMPLETE");
        assertRefused(new byte[0], "INCOMPLETE");
    }

    @Test
    void caretsAndTildesAreReceiptTextEvenWhereTheySpellZpl() {
        // The stored printer's type picks the protocol (PrinterCommandProtocol.of); the ESC/POS
        // walker reads '^' and '~' as a receipt printer does — as characters.
        for (String text : new String[]{"Gift Box~Deluxe\n", "thank you ~jr", "^XA^JUF^XZ", "~DY~DG~JR",
                "Cable 2m ~ approx x^2 ~xl ^XYZ 50%~60%\n"}) {
            assertTrue(EscPosCommandPolicy.inspect(ascii(text)).allowed(), text);
        }
        assertTrue(EscPosCommandPolicy.inspect(concat(bytes(GS, 0x28, 0x6B, 6, 0, 0x31, 0x50, 0x30), ascii("~JR"))).allowed()); // QR data
        byte[] img = ascii("^XA~JR~DY");
        assertTrue(EscPosCommandPolicy.inspect(concat(bytes(GS, 0x76, 0x30, 0, img.length, 0, 1, 0), img)).allowed()); // raster
        // The command restrictions still apply next to that text.
        assertRefused(concat(ascii("Gift Box~Deluxe"), bytes(DLE, DC4, 2, 1, 8)), "POWER");
        assertRefused(concat(ascii("^XA"), bytes(ESC)), "INCOMPLETE");
    }

    @Test
    void theRefusalSaysWhatAndWhere() {
        PrintCommandVerdict v = EscPosCommandPolicy.inspect(concat(ascii("TOTAL\n"), bytes(DLE, DC4, 2, 1, 8)));
        assertEquals(6, v.offset());
        assertEquals("DLE DC4 2", v.command());
        String message = new PrintCommandRejectedException(PrinterCommandProtocol.ESCPOS, v).getMessage();
        assertEquals("Print job refused: DLE DC4 2 at byte 6 powers the printer off. Nothing was sent to the printer.", message);
    }

    // ── ZPL ─────────────────────────────────────────────────────────────────────────────

    private static final String LABEL = String.join("\n",
            "^XA", "^CI28", "^PW400", "^LL200", "^LH0,0", "^LS0", "^PON", "^MMT",
            "^FO0,48^FB400,1,0,C,0^A0N,21,21^FH^FDACME_5ETrading^FS",
            "^BY2,2,50", "^FO40,86^BCN,50,Y,N,N^FH^FDBB-TEST-01^FS",
            "^XZ");

    private static String inLabel(String cmd) {
        return LABEL.replace("^XZ", cmd + "\n^XZ");
    }

    @Test
    void aBillBullLabelAndSeveralLabelsAreAllowed() {
        assertZplAllowed(LABEL);
        assertZplAllowed(LABEL + "\r\n" + LABEL + "\n");
        assertZplAllowed(LABEL.replace("ACME_5ETrading", "عطر فاخر"));
        // To a receipt printer a label is inert text; the stored printer's type, not this walker,
        // decides which policy a job meets (see PosHardwareControlAuthorizationTest).
        assertTrue(EscPosCommandPolicy.inspect(utf8(LABEL)).allowed());
    }

    @Test
    void tildeConfigurationNetworkAndStorageCommandsAreRefused() {
        assertZplRefused("~JR", "POWER");
        assertZplRefused(LABEL.replace("ACME_5ETrading", "ACME~JR"), "POWER");
        assertZplRefused("~DYE:FW.ZPL,B,T,10,,0123", "STORAGE");
        assertZplRefused(inLabel("^JUF"), "CONFIG_WRITE");
        assertZplRefused(inLabel("^JUS"), "CONFIG_WRITE");
        assertZplRefused(inLabel("^MD30"), "CONFIG_WRITE");
        assertZplRefused(inLabel("^NS,192.168.1.9"), "NETWORK");
        assertZplRefused(inLabel("^IDE:*.*"), "STORAGE");
        assertZplRefused(inLabel("^HH"), "DEVICE_QUERY");
        assertZplRefused(inLabel("^PQ1000"), "UNSUPPORTED");
        assertZplRefused(inLabel("^QQ"), "UNKNOWN");
        assertZplRefused("^JUF", "CONFIG_WRITE");
    }

    @Test
    void settingsAreLimitedToTheValuesBillBullUses() {
        assertZplRefused(inLabel("^CI0"), "MALFORMED");
        assertZplRefused(inLabel("^MMC"), "MALFORMED");
        assertZplRefused(inLabel("^PW400,1"), "MALFORMED");
        assertZplRefused(inLabel("^FO1,1^A@N,20,20,E:FONT.TTF^FDx^FS"), "UNKNOWN");
    }

    @Test
    void malformedOrIncompleteLabelsAreRefused() {
        assertZplRefused("", "INCOMPLETE");
        assertZplRefused("^XA^FO1,1^FDx^FS", "INCOMPLETE");
        assertZplRefused("^XA^FO1,1^FDx", "INCOMPLETE");
        assertZplRefused(LABEL.substring(0, LABEL.length() - 1), "INCOMPLETE");
        assertZplRefused("^XA^XA^XZ", "MALFORMED");
        assertZplRefused("^XA^FDx^FS^XZ", "MALFORMED");
        assertZplRefused("^XA^FO1,1^XZ", "MALFORMED");
        assertZplRefused("^XA^FO1,1^FS^XZ", "MALFORMED");
        assertZplRefused("^XA^PW400^XZjunk", "MALFORMED");
        assertZplRefused("\u001b@^XA^XZ", "CONTROL_CHARACTER");
        assertZplRefused("^XA^FO1,1^FDa\u0007b^FS^XZ", "CONTROL_CHARACTER");
        assertZplRefused("^XA^FO1,1^FH^FDa_4^FS^XZ", "MALFORMED");
        assertZplRefused("^XA^FO1,1^FD" + "x".repeat(4000) + "^FS^XZ", "MALFORMED");
    }

    @Test
    void fieldDataCannotBreakOutOfItsField() {
        // The old builder wrote "\^" for '^'; ZPL reads that as '\' followed by the next command.
        assertZplRefused("^XA^FO1,1^FDShirt\\^JUF^FS^XZ", "CONFIG_WRITE");
        assertZplRefused("^XA^FO1,1^FDShirt\\~JR^FS^XZ", "POWER");
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────

    private static void assertDrawer(byte[] stream) {
        PrintCommandVerdict v = EscPosCommandPolicy.inspect(stream);
        assertTrue(v.allowed() && v.drawerPulse(), v::toString);
    }

    private static void assertRefused(byte[] stream, String category) {
        PrintCommandVerdict v = EscPosCommandPolicy.inspect(stream);
        assertFalse(v.allowed(), v::toString);
        assertEquals(category, v.category(), v::toString);
    }

    private static void assertZplAllowed(String zpl) {
        PrintCommandVerdict v = ZplCommandPolicy.inspect(utf8(zpl));
        assertTrue(v.allowed(), v::toString);
    }

    private static void assertZplRefused(String zpl, String category) {
        PrintCommandVerdict v = ZplCommandPolicy.inspect(utf8(zpl));
        assertFalse(v.allowed(), v::toString);
        assertEquals(category, v.category(), v::toString);
    }

    /** ESC @, heating, code page, a raster logo, text, a QR code, a Code 39 barcode, feed and feed-cut. */
    static byte[] receipt(byte[] rasterRow) {
        byte[] qr = ascii("TAX INVOICE INV-1 AED 10.00");
        return concat(
                bytes(ESC, 0x40, ESC, 0x37, 9, 255, 2, ESC, 0x74, 16, ESC, 0x4D, 0, ESC, 0x33, 30, ESC, 0x61, 1),
                bytes(GS, 0x76, 0x30, 0, rasterRow.length, 0, 1, 0), rasterRow,
                ascii("ACME TRADING\nTotal  AED 10.00\n"),
                bytes(GS, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0, GS, 0x28, 0x6B, 3, 0, 0x31, 0x43, 6),
                bytes(GS, 0x28, 0x6B, qr.length + 3, 0, 0x31, 0x50, 0x30), qr,
                bytes(GS, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30),
                bytes(GS, 0x68, 90, GS, 0x77, 3, GS, 0x48, 2, GS, 0x66, 1, GS, 0x6B, 4), ascii("INV-1"), bytes(0, 0x0A),
                bytes(ESC, 0x4A, 12, ESC, 0x64, 2, GS, 0x56, 66, 120));
    }

    static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
        return out;
    }

    static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.ISO_8859_1);
    }

    static byte[] utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }
}
