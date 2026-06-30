package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Heartbeat/health ingestion for any device type. A device's owning agent pushes a snapshot on
 * every heartbeat (and whenever a fault is detected mid-job); this service persists the
 * snapshot, stamps the device's {@code lastHeartbeat}, and delegates the current-health update
 * to {@link DeviceManager#updateRuntimeHealth}, which already owns the change-detection/event
 * logging for that transition (built in Phase A — reused here rather than duplicated).
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §9 (Phase C).
 */
@Service
public class HealthService {

    private final PosDeviceRepository deviceRepo;
    private final PosDeviceHealthSnapshotRepository snapshotRepo;
    private final DeviceManager deviceManager;

    public HealthService(PosDeviceRepository deviceRepo, PosDeviceHealthSnapshotRepository snapshotRepo,
                          DeviceManager deviceManager) {
        this.deviceRepo = deviceRepo;
        this.snapshotRepo = snapshotRepo;
        this.deviceManager = deviceManager;
    }

    public PosDeviceHealthSnapshot recordSnapshot(Long deviceId, SnapshotRequest req) {
        PosDevice device = deviceRepo.findById(deviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + deviceId));
        if (req == null || req.healthState() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "healthState is required.");
        }

        PosDeviceHealthSnapshot snapshot = new PosDeviceHealthSnapshot();
        snapshot.setDeviceId(deviceId);
        snapshot.setHealthState(req.healthState());
        snapshot.setDriverStatus(req.driverStatus());
        snapshot.setFirmwareVersion(req.firmwareVersion());
        snapshot.setPaperStatus(req.paperStatus());
        snapshot.setCoverStatus(req.coverStatus());
        snapshot.setBusy(Boolean.TRUE.equals(req.busy()));
        snapshot.setQueueLength(req.queueLength());
        snapshot.setCapturedAt(LocalDateTime.now());
        snapshot = snapshotRepo.save(snapshot);

        device.setLastHeartbeat(LocalDateTime.now());
        deviceRepo.save(device);
        deviceManager.updateRuntimeHealth(deviceId, req.healthState());

        return snapshot;
    }

    public List<PosDeviceHealthSnapshot> getHistory(Long deviceId) {
        return snapshotRepo.findTop50ByDeviceIdOrderByCapturedAtDesc(deviceId);
    }

    public record SnapshotRequest(
            PosDeviceRuntimeHealth healthState,
            String driverStatus,
            String firmwareVersion,
            String paperStatus,
            String coverStatus,
            Boolean busy,
            Integer queueLength
    ) {}
}
