package com.billbull.backend.pos.devicemanager;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The Device Dashboard's real consumer of {@link PosConfigurationChangedEvent} (Phase F) —
 * distinct from {@link PosConfigurationChangedEventListener}'s log-only stub. Rather than the
 * dashboard polling the full {@link DeviceDashboardService.Overview} on a blind timer, or this
 * class inventing a real cache (there is no cache to invalidate — every read already goes
 * straight to the database), it exposes a cheap, monotonically increasing version counter the
 * frontend can poll instead: if the version hasn't moved, nothing changed, skip the re-fetch.
 *
 * <p>This is deliberately the simplest correct implementation, not a stand-in for a more complex
 * one — it demonstrates the same publish/subscribe seam a future Local Device Agent push or
 * notification consumer would use, without building either of those, exactly as scoped.
 */
@Component
public class DashboardRefreshSignal {

    private final AtomicLong version = new AtomicLong(0);
    private volatile LocalDateTime lastChangedAt;

    @EventListener
    public void onConfigurationChanged(PosConfigurationChangedEvent event) {
        version.incrementAndGet();
        lastChangedAt = LocalDateTime.now();
    }

    public Snapshot snapshot() {
        return new Snapshot(version.get(), lastChangedAt);
    }

    public record Snapshot(long version, LocalDateTime lastChangedAt) {}
}
