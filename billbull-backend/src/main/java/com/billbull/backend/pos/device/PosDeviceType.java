package com.billbull.backend.pos.device;

/**
 * Device kind for a {@link PosDevice} parent row. Type-specific configuration lives in the
 * matching feature package (e.g. {@code pos.printer.PosPrinter}); this value only identifies
 * which extension table a given device row corresponds to.
 */
public enum PosDeviceType {
    PRINTER,
    SCANNER,
    CASH_DRAWER,
    CARD_TERMINAL,
    CUSTOMER_DISPLAY,
    SCALE,
    GENERIC
}
