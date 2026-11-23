package com.billbull.backend.platform;

import java.util.Map;

/** Body of {@code PUT /api/platform/state}, sent by the control plane. */
public record PlatformStateUpdate(
        String status,
        String statusMessage,
        String planCode,
        Map<String, Boolean> modules,
        Map<String, Integer> limits,
        Long configVersion) {
}
