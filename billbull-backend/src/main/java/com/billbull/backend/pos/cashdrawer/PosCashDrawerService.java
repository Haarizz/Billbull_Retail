package com.billbull.backend.pos.cashdrawer;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.devicemanager.DeviceManager;
import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.devicemanager.PosDeviceEventResult;
import com.billbull.backend.pos.devicemanager.PosDeviceEventType;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PosCashDrawerService {

    private final PosCashDrawerRepository repo;
    private final PosPrinterRepository printerRepo;
    private final DeviceManager deviceManager;
    private final PosDeviceEventLogService eventLogService;

    public PosCashDrawerService(PosCashDrawerRepository repo, PosPrinterRepository printerRepo,
                                 DeviceManager deviceManager, PosDeviceEventLogService eventLogService) {
        this.repo = repo;
        this.printerRepo = printerRepo;
        this.deviceManager = deviceManager;
        this.eventLogService = eventLogService;
    }

    public List<PosCashDrawer> list(Long branchId) {
        if (branchId == null) {
            return List.of();
        }
        return repo.findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(branchId);
    }

    public PosCashDrawer get(Long id) {
        return repo.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cash drawer not found: " + id));
    }

    public PosCashDrawer create(UpsertRequest req) {
        validateRequest(req, null);
        PosCashDrawer drawer = new PosCashDrawer();
        apply(drawer, req);
        PosDevice device = syncDeviceRecord(drawer);
        drawer.setDeviceId(device.getId());
        return repo.save(drawer);
    }

    public PosCashDrawer update(Long id, UpsertRequest req) {
        PosCashDrawer drawer = get(id);
        validateRequest(req, id);
        apply(drawer, req);
        PosDevice device = syncDeviceRecord(drawer);
        drawer.setDeviceId(device.getId());
        return repo.save(drawer);
    }

    public PosCashDrawer decommission(Long id) {
        PosCashDrawer drawer = get(id);
        drawer.setStatus(PosCashDrawerStatus.DECOMMISSIONED);
        drawer.setActive(false);
        syncDeviceRecord(drawer);
        return repo.save(drawer);
    }

    /** Closes the "implicit reliance, no confirmation" gap: the agent reports back whether the
     *  ESC/POS kick sequence it sent alongside a print actually reached the drawer. */
    public PosCashDrawer recordKickResult(Long id, boolean success) {
        PosCashDrawer drawer = get(id);
        drawer.setLastKickAt(LocalDateTime.now());
        drawer.setLastKickResult(success ? PosCashDrawerKickResult.SUCCESS : PosCashDrawerKickResult.FAILED);
        drawer = repo.save(drawer);
        if (drawer.getDeviceId() != null) {
            eventLogService.record(drawer.getDeviceId(), PosDeviceEventType.DRAWER_KICK,
                    success ? PosDeviceEventResult.SUCCESS : PosDeviceEventResult.FAILED,
                    "drawerKick", null, drawer.getBranchId(), drawer.getTerminalId());
        }
        return drawer;
    }

    private PosDevice syncDeviceRecord(PosCashDrawer drawer) {
        return deviceManager.syncDeviceRecord(PosDeviceType.CASH_DRAWER, drawer.getDeviceCode(), drawer.getDeviceName(),
                drawer.getBranchId(), drawer.getBranchName(), drawer.getTerminalId(), drawer.getCounterName(),
                PosDeviceStatus.valueOf(drawer.getStatus().name()));
    }

    private void apply(PosCashDrawer drawer, UpsertRequest req) {
        drawer.setDeviceCode(req.deviceCode().trim());
        drawer.setDeviceName(req.deviceName().trim());
        drawer.setBranchId(req.branchId());
        drawer.setBranchName(trimToNull(req.branchName()));
        drawer.setTerminalId(blankToNull(req.terminalId()));
        drawer.setCounterName(trimToNull(req.counterName()));
        drawer.setAttachedPrinterId(req.attachedPrinterId());
        drawer.setStatus(req.status() == null ? PosCashDrawerStatus.ACTIVE : req.status());
        drawer.setNotes(trimToNull(req.notes()));
    }

    private void validateRequest(UpsertRequest req, Long existingId) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cash drawer payload is required.");
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
        if (req.attachedPrinterId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A cash drawer must be attached to a printer (the kick rides the printer's cable).");
        }
        if (printerRepo.findByIdAndIsActiveTrue(req.attachedPrinterId()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Attached printer not found or inactive: " + req.attachedPrinterId());
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
            Long attachedPrinterId,
            PosCashDrawerStatus status,
            String notes
    ) {}
}
