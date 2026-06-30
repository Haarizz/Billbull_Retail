package com.billbull.backend.pos.device;

/**
 * System-observed runtime health, distinct from the admin-controlled {@link PosDeviceStatus}
 * lifecycle. Shared across every device type.
 */
public enum PosDeviceRuntimeHealth {
    UNKNOWN,
    ONLINE,
    OFFLINE,
    BUSY,
    DISCONNECTED,
    ERROR,
    PAPER_OUT,
    COVER_OPEN
}
