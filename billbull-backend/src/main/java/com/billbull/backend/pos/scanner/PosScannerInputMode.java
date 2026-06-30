package com.billbull.backend.pos.scanner;

/**
 * KEYBOARD_WEDGE is the only mode the POS scan input actually understands today (the scanner
 * emulates a HID keyboard; the POS listens for a fast keystroke burst ending in Enter — see
 * docs/pos-device-architecture-specification-v2-2026-06-30.md §8.8). This field is registration
 * metadata for the Device Dashboard, not a runtime switch — changing it has no effect on how
 * scanning actually works, by design (a real driver-based input mode isn't needed for HID
 * wedge scanners, which is the entire point of that architecture).
 */
public enum PosScannerInputMode {
    KEYBOARD_WEDGE
}
