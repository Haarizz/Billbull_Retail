package com.billbull.backend.pos.printer;

/**
 * The command language a stored printer speaks, and the policy its raw jobs must pass.
 *
 * <p>Chosen from the printer's own {@link PosPrinterType}, never from the request: a label printer
 * is a Zebra speaking ZPL; receipt and kitchen printers (and legacy rows with no type) speak
 * ESC/POS. A caller therefore cannot pick the laxer policy for a printer by relabelling its job.
 */
public enum PrinterCommandProtocol {
    ESCPOS,
    ZPL;

    static PrinterCommandProtocol of(PosPrinter printer) {
        return printer.getDeviceType() == PosPrinterType.LABEL_PRINTER ? ZPL : ESCPOS;
    }

    PrintCommandVerdict inspect(byte[] payload) {
        return this == ZPL ? ZplCommandPolicy.inspect(payload) : EscPosCommandPolicy.inspect(payload);
    }

    /** Parses the optional {@code format} a client declares; null when absent, IllegalArgumentException when unknown. */
    static PrinterCommandProtocol parse(String format) {
        if (format == null || format.isBlank()) return null;
        String f = format.trim().toUpperCase().replace("/", "").replace("_", "").replace("-", "");
        return switch (f) {
            case "ESCPOS" -> ESCPOS;
            case "ZPL" -> ZPL;
            default -> throw new IllegalArgumentException(format);
        };
    }
}
