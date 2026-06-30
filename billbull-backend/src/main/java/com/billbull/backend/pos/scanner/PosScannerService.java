package com.billbull.backend.pos.scanner;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.devicemanager.DeviceManager;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class PosScannerService {

    private final PosScannerRepository repo;
    private final DeviceManager deviceManager;

    public PosScannerService(PosScannerRepository repo, DeviceManager deviceManager) {
        this.repo = repo;
        this.deviceManager = deviceManager;
    }

    public List<PosScanner> list(Long branchId) {
        if (branchId == null) {
            return List.of();
        }
        return repo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(branchId);
    }

    public PosScanner get(Long id) {
        return repo.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scanner not found: " + id));
    }

    public PosScanner create(UpsertRequest req) {
        validateRequest(req, null);
        PosScanner scanner = new PosScanner();
        apply(scanner, req);
        PosDevice device = syncDeviceRecord(scanner);
        scanner.setDeviceId(device.getId());
        return repo.save(scanner);
    }

    public PosScanner update(Long id, UpsertRequest req) {
        PosScanner scanner = get(id);
        validateRequest(req, id);
        apply(scanner, req);
        PosDevice device = syncDeviceRecord(scanner);
        scanner.setDeviceId(device.getId());
        return repo.save(scanner);
    }

    public PosScanner decommission(Long id) {
        PosScanner scanner = get(id);
        scanner.setStatus(PosScannerStatus.DECOMMISSIONED);
        scanner.setActive(false);
        syncDeviceRecord(scanner);
        return repo.save(scanner);
    }

    private PosDevice syncDeviceRecord(PosScanner scanner) {
        return deviceManager.syncDeviceRecord(PosDeviceType.SCANNER, scanner.getDeviceCode(), scanner.getDeviceName(),
                scanner.getBranchId(), scanner.getBranchName(), scanner.getTerminalId(), scanner.getCounterName(),
                PosDeviceStatus.valueOf(scanner.getStatus().name()));
    }

    private void apply(PosScanner scanner, UpsertRequest req) {
        scanner.setDeviceCode(req.deviceCode().trim());
        scanner.setDeviceName(req.deviceName().trim());
        scanner.setBranchId(req.branchId());
        scanner.setBranchName(trimToNull(req.branchName()));
        scanner.setTerminalId(blankToNull(req.terminalId()));
        scanner.setCounterName(trimToNull(req.counterName()));
        scanner.setConnectionType(req.connectionType() == null ? PosScannerConnectionType.USB : req.connectionType());
        scanner.setInputMode(PosScannerInputMode.KEYBOARD_WEDGE);
        scanner.setStatus(req.status() == null ? PosScannerStatus.ACTIVE : req.status());
        scanner.setNotes(trimToNull(req.notes()));
    }

    private void validateRequest(UpsertRequest req, Long existingId) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scanner payload is required.");
        }
        if (isBlank(req.deviceCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device code is required.");
        }
        if (isBlank(req.deviceName())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device name is required.");
        }
        if (req.branchId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Branch is required.");
        }
        String normalizedCode = req.deviceCode().trim();
        if ((existingId == null && repo.existsByDeviceCode(normalizedCode))
                || (existingId != null && repo.existsByDeviceCodeAndIdNot(normalizedCode, existingId))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Device code already exists: " + normalizedCode);
        }
    }

    private String trimToNull(String value) { return isBlank(value) ? null : value.trim(); }
    private String blankToNull(String value) { return isBlank(value) ? null : value.trim(); }
    private boolean isBlank(String value) { return value == null || value.trim().isEmpty(); }

    public record UpsertRequest(
            String deviceCode,
            String deviceName,
            Long branchId,
            String branchName,
            String terminalId,
            String counterName,
            PosScannerConnectionType connectionType,
            PosScannerStatus status,
            String notes
    ) {}
}
