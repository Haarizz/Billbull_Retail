package com.billbull.backend.pos.printer;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The drawer-pulse detector walks ESC/POS commands rather than searching bytes. */
class EscPosDrawerKickTest {

    @Test
    void findsBothDrawerCommands() {
        assertTrue(EscPosDrawerKick.present(bytes(0x1B, 0x70, 0x00, 0x19, 0xFA)));       // ESC p
        assertTrue(EscPosDrawerKick.present(bytes(0x1B, 0x70, 0x01, 0x32, 0x32)));       // pin 5
        assertTrue(EscPosDrawerKick.present(bytes(0x10, 0x14, 0x01, 0x00, 0x05)));       // DLE DC4 1
        assertTrue(EscPosDrawerKick.present(concat("Thank you\n".getBytes(), bytes(0x1B, 0x70, 0x00, 0x19, 0xFA))));
    }

    @Test
    void ignoresEscPInsideImageQrAndBarcodeData() {
        byte[] stream = concat(
                bytes(0x1B, 0x40, 0x1B, 0x61, 0x01),
                bytes(0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x02, 0x00, 0x1B, 0x70),   // GS v 0, 1x2 raster
                bytes(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x50, 0x1B, 0x70),        // GS ( k
                bytes(0x1D, 0x6B, 73, 0x02, 0x1B, 0x70),                            // GS k CODE128, n=2
                bytes(0x1D, 0x6B, 0x04, 0x1B, 0x70, 0x00),                          // GS k CODE39, NUL-ended
                bytes(0x1B, 0x2A, 0x00, 0x02, 0x00, 0x1B, 0x70),                    // ESC * bit image
                bytes(0x1B, 0x37, 9, 255, 2, 0x1D, 0x21, 0x11, 0x1D, 0x56, 66, 0x00));
        assertFalse(EscPosDrawerKick.present(stream));
    }

    @Test
    void stillFindsARealTimePulseHiddenInImageData() {
        // Printers act on real-time commands even inside image data.
        byte[] raster = bytes(0x1D, 0x76, 0x30, 0x00, 0x05, 0x00, 0x01, 0x00, 0x10, 0x14, 0x01, 0x00, 0x03);
        assertTrue(EscPosDrawerKick.present(raster));
    }

    @Test
    void anUnknownCommandFallsBackToSearchingTheRest() {
        // ESC & (user-defined characters) has a length this walker does not model.
        assertTrue(EscPosDrawerKick.present(bytes(0x1B, 0x26, 0x03, 0x20, 0x20, 0x1B, 0x70, 0x00, 0x19, 0xFA)));
        assertFalse(EscPosDrawerKick.present(bytes(0x1B, 0x26, 0x03, 0x20, 0x20, 0x41)));
    }

    @Test
    void zplLabelsTextAndTruncatedStreamsAreNotPulses() {
        assertFalse(EscPosDrawerKick.present("^XA^CI28^FO50,50^A0N,30,30^FDItem 1^FS^XZ".getBytes(StandardCharsets.UTF_8)));
        assertFalse(EscPosDrawerKick.present(new byte[0]));
        assertFalse(EscPosDrawerKick.present(null));
        assertFalse(EscPosDrawerKick.present(bytes(0x1B)));
        assertFalse(EscPosDrawerKick.present(bytes(0x1D, 0x76, 0x30, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x1B, 0x70)));
        assertFalse(EscPosDrawerKick.present(bytes(0x10, 0x04, 0x01))); // DLE EOT: status request
    }

    private static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
        return out;
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }
}
