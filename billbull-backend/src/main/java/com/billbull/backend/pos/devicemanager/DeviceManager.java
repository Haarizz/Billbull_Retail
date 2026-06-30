package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceRuntimeHealth;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

/**
 * Single entry point for hardware-related operations that don't already have a dedicated,
 * type-specific service (PrinterService, ScannerService, ...). Phase A scope: owns the shared
 * {@link PosDevice} parent row and the device event log; type-specific services call into this
 * facade to keep their device's parent row in sync rather than writing to pos_devices directly.
 * Later phases (Hardware Profiles, Discovery, Health sweep, Print Job routing) extend this
 * facade without changing how callers use it.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §6.
 */
@Service
public class DeviceManager {

    private final PosDeviceRepository deviceRepo;
    private final PosDeviceEventLogService eventLogService;

    public DeviceManager(PosDeviceRepository deviceRepo, PosDeviceEventLogService eventLogService) {
        this.deviceRepo = deviceRepo;
        this.eventLogService = eventLogService;
    }

    /**
     * Creates or updates the shared parent row for a device owned by a type-specific service
     * (e.g. a printer). Matched by {@code deviceCode}, which is unique across all device types.
     */
    public PosDevice syncDeviceRecord(PosDeviceType type, String deviceCode, String deviceName, Long branchId,
                                       String branchName, String terminalId, String counterName,
                                       PosDeviceStatus status) {
        Optional<PosDevice> existing = deviceRepo.findByDeviceCode(deviceCode);
        boolean isNew = existing.isEmpty();
        PosDevice device = existing.orElseGet(PosDevice::new);
        device.setDeviceCode(deviceCode);
        device.setDeviceType(type);
        device.setDeviceName(deviceName);
        device.setBranchId(branchId);
        device.setBranchName(branchName);
        device.setTerminalId(terminalId);
        device.setCounterName(counterName);
        device.setStatus(status == null ? PosDeviceStatus.ACTIVE : status);
        device = deviceRepo.save(device);

        eventLogService.record(device.getId(),
                isNew ? PosDeviceEventType.DEVICE_REGISTERED : PosDeviceEventType.CONFIGURATION_UPDATED,
                PosDeviceEventResult.SUCCESS, "syncDeviceRecord", null, branchId, terminalId);
        return device;
    }

    public PosDevice updateRuntimeHealth(Long deviceId, PosDeviceRuntimeHealth health) {
        PosDevice device = get(deviceId);
        PosDeviceRuntimeHealth previous = device.getRuntimeHealth();
        device.setRuntimeHealth(health == null ? PosDeviceRuntimeHealth.UNKNOWN : health);
        device = deviceRepo.save(device);
        if (previous != device.getRuntimeHealth()) {
            eventLogService.record(deviceId, PosDeviceEventType.HEALTH_CHANGED, PosDeviceEventResult.INFO,
                    previous + " -> " + device.getRuntimeHealth(), null, device.getBranchId(), device.getTerminalId());
        }
        return device;
    }

    public List<PosDevice> getDashboard(Long branchId) {
        if (branchId == null) {
            return List.of();
        }
        return deviceRepo.findAll().stream()
                .filter(d -> branchId.equals(d.getBranchId()))
                .toList();
    }

    public List<PosDeviceEventLog> getEvents(Long deviceId) {
        return eventLogService.tailFor(deviceId);
    }

    private PosDevice get(Long id) {
        return deviceRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + id));
    }
}
