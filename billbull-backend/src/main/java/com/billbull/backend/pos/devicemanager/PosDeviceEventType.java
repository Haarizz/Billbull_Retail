package com.billbull.backend.pos.devicemanager;

/**
 * Full device lifecycle event taxonomy. See
 * docs/pos-device-architecture-specification-v2-2026-06-30.md §12.1.
 */
public enum PosDeviceEventType {
    DEVICE_REGISTERED,
    DEVICE_DISCOVERED,
    DEVICE_CONNECTED,
    DEVICE_DISCONNECTED,
    HEALTH_CHANGED,
    CONFIGURATION_UPDATED,
    FIRMWARE_UPDATED,
    PRINT_REQUESTED,
    PRINT_QUEUED,
    PRINT_STARTED,
    PRINT_COMPLETED,
    PRINT_FAILED,
    RETRY,
    QUEUE_TIMEOUT,
    DRAWER_KICK,
    SCANNER_CONNECTED,
    SCANNER_DISCONNECTED,
    CARD_APPROVED,
    CARD_DECLINED,
    CARD_CANCELLED,
    AGENT_STARTED,
    AGENT_STOPPED,
    AGENT_RESTARTED
}
