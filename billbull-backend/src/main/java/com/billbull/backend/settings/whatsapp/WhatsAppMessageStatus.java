package com.billbull.backend.settings.whatsapp;

/**
 * Lifecycle of an outgoing WhatsApp message. {@code SENT/DELIVERED/READ/FAILED} mirror the
 * "status" values Meta posts to the webhook. The ordinal of the first four is the progression
 * order: webhooks can arrive out of order, so a status only ever moves forward (see
 * {@link #canAdvanceTo}). FAILED can replace any non-READ status.
 */
public enum WhatsAppMessageStatus {
    ACCEPTED,
    SENT,
    DELIVERED,
    READ,
    FAILED;

    public boolean canAdvanceTo(WhatsAppMessageStatus next) {
        if (next == null || next == this) return false;
        if (this == FAILED || this == READ) return false;
        if (next == FAILED) return true;
        return next.ordinal() > this.ordinal();
    }

    /** Maps Meta's webhook status string; null for values we don't track (e.g. "deleted"). */
    public static WhatsAppMessageStatus fromMeta(String value) {
        if (value == null) return null;
        return switch (value.toLowerCase()) {
            case "sent" -> SENT;
            case "delivered" -> DELIVERED;
            case "read" -> READ;
            case "failed" -> FAILED;
            default -> null;
        };
    }
}
