package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.device.PosDeviceStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Marks a device OFFLINE once it stops sending heartbeats — the gap explicitly deferred in
 * Phase A ("no heartbeat sweep") and now closed. Runs every minute; cheap no-op when every
 * active device is current. Uses {@link DeviceManager#updateRuntimeHealth}, so the
 * already-built change-detection/event-logging fires exactly as it would for an
 * agent-reported health change — this sweep is just another caller of that same path.
 */
@Component
public class PosDeviceHealthSweepJob {

    private static final Logger log = LoggerFactory.getLogger(PosDeviceHealthSweepJob.class);

    private final PosDeviceRepository deviceRepo;
    private final DeviceManager deviceManager;

    /** A device with no heartbeat for longer than this is considered OFFLINE. */
    @Value("${pos.device.health-offline-threshold-minutes:5}")
    private int offlineThresholdMinutes;

    public PosDeviceHealthSweepJob(PosDeviceRepository deviceRepo, DeviceManager deviceManager) {
        this.deviceRepo = deviceRepo;
        this.deviceManager = deviceManager;
    }

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void sweepOffline() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(offlineThresholdMinutes);
        List<PosDevice> activeDevices = deviceRepo.findAllByStatus(PosDeviceStatus.ACTIVE);

        int markedOffline = 0;
        for (PosDevice device : activeDevices) {
            if (device.getRuntimeHealth() == PosDeviceRuntimeHealth.OFFLINE) {
                continue; // already offline — avoid a redundant write/event every sweep
            }
            boolean stale = device.getLastHeartbeat() == null || device.getLastHeartbeat().isBefore(cutoff);
            if (!stale) {
                continue;
            }
            deviceManager.updateRuntimeHealth(device.getId(), PosDeviceRuntimeHealth.OFFLINE);
            markedOffline++;
        }

        if (markedOffline > 0) {
            log.warn("[PosDeviceHealthSweep] Marked {} device(s) OFFLINE (no heartbeat for {}+ minute(s)).",
                    markedOffline, offlineThresholdMinutes);
        }
    }
}
