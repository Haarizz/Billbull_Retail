package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.cashdrawer.PosCashDrawerRepository;
import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import com.billbull.backend.pos.scanner.PosScannerRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.pos.terminal.PosTerminalStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Assigns a {@link PosHardwareProfile} to a terminal. This is the "assignment engine" the v2
 * spec calls for (§5/§6) — not just a foreign-key write, but the full workflow: validate the
 * profile, validate the terminal, validate every device in the profile is actually available,
 * detect conflicts with other terminals already using one of those devices via a different
 * profile, persist the assignment, log a device event per device, and refresh runtime state.
 *
 * <p><b>Backward compatibility (hard requirement):</b> a terminal with no profile assigned
 * (the default — {@code hardwareProfileId == null}) is completely unaffected by this class;
 * it keeps resolving its printers exactly as it always has, via
 * {@code PosPrinter.terminalId}/{@code resolvePrinterForContext} on the frontend. Hardware
 * Profiles are additive on top of that existing path, not a replacement that requires a
 * flag-day migration — see §"Migration strategy" in the Phase D review.
 *
 * <p><b>"Refresh runtime state" — what it actually does today:</b> rather than inventing a new
 * runtime-resolution path the frontend would need to learn, assigning a profile materializes
 * each profile device's role onto the SAME fields the existing direct-assignment model already
 * reads ({@code terminalId/branchId/branchName/counterName} on {@code PosPrinter}, and — as of
 * Phase E — the equivalent fields on {@code PosScanner}/{@code PosCashDrawer}). PRINTER, SCANNER,
 * and CASH_DRAWER device types are all refreshed this way; CARD_TERMINAL still has no
 * type-specific entity, so it remains a documented gap until that phase exists.
 */
@Service
public class HardwareProfileAssignmentEngine {

    private final PosHardwareProfileRepository profileRepo;
    private final PosHardwareProfileDeviceRepository profileDeviceRepo;
    private final PosTerminalRepository terminalRepo;
    private final PosDeviceRepository deviceRepo;
    private final PosPrinterRepository printerRepo;
    private final PosScannerRepository scannerRepo;
    private final PosCashDrawerRepository cashDrawerRepo;
    private final PosDeviceEventLogService eventLogService;
    private final ApplicationEventPublisher eventPublisher;

    public HardwareProfileAssignmentEngine(PosHardwareProfileRepository profileRepo,
                                            PosHardwareProfileDeviceRepository profileDeviceRepo,
                                            PosTerminalRepository terminalRepo,
                                            PosDeviceRepository deviceRepo,
                                            PosPrinterRepository printerRepo,
                                            PosScannerRepository scannerRepo,
                                            PosCashDrawerRepository cashDrawerRepo,
                                            PosDeviceEventLogService eventLogService,
                                            ApplicationEventPublisher eventPublisher) {
        this.profileRepo = profileRepo;
        this.profileDeviceRepo = profileDeviceRepo;
        this.terminalRepo = terminalRepo;
        this.deviceRepo = deviceRepo;
        this.printerRepo = printerRepo;
        this.scannerRepo = scannerRepo;
        this.cashDrawerRepo = cashDrawerRepo;
        this.eventLogService = eventLogService;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public PosTerminal assign(String terminalId, Long profileId) {
        PosTerminal terminal = validateTerminal(terminalId);
        PosHardwareProfile profile = validateProfile(profileId);
        List<PosHardwareProfileDevice> slots = profileDeviceRepo.findByHardwareProfileId(profileId);
        if (slots.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Hardware profile '" + profile.getProfileName() + "' has no devices assigned to it yet.");
        }

        for (PosHardwareProfileDevice slot : slots) {
            PosDevice device = validateDeviceAvailable(slot);
            detectConflict(device, profile, terminal);
        }

        // Persist — also records the profile version this terminal received, so staleness
        // (the profile is edited later without this terminal being re-synced) can be detected.
        terminal.setHardwareProfileId(profile.getId());
        terminal.setAssignedProfileVersion(profile.getVersion());
        PosTerminal saved = terminalRepo.save(terminal);

        // Generate device events + refresh runtime state
        for (PosHardwareProfileDevice slot : slots) {
            deviceRepo.findById(slot.getDeviceId()).ifPresent(device -> {
                eventLogService.record(device.getId(), PosDeviceEventType.CONFIGURATION_UPDATED,
                        PosDeviceEventResult.SUCCESS,
                        "hardwareProfileAssign:" + profile.getId() + ":role=" + slot.getRole(),
                        null, saved.getBranchId(), saved.getTerminalId());
                refreshRuntimeState(device, saved);
            });
        }

        // Configuration Changed — the integration point for the Local Device Agent, Dashboard
        // refresh, audit, and future notifications (see PosConfigurationChangedEvent javadoc).
        eventPublisher.publishEvent(new PosConfigurationChangedEvent(saved.getTerminalId(), saved.getBranchId(),
                profile.getId(), profile.getVersion(), "hardwareProfileAssign"));

        return saved;
    }

    private PosTerminal validateTerminal(String terminalId) {
        PosTerminal terminal = terminalRepo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
        if (terminal.getStatus() == PosTerminalStatus.BLOCKED || terminal.getStatus() == PosTerminalStatus.DECOMMISSIONED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Terminal " + terminalId + " is " + terminal.getStatus() + " and cannot receive a hardware profile assignment.");
        }
        return terminal;
    }

    private PosHardwareProfile validateProfile(Long profileId) {
        PosHardwareProfile profile = profileRepo.findByIdAndIsActiveTrue(profileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hardware profile not found: " + profileId));
        if (profile.getStatus() != PosHardwareProfileStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hardware profile '" + profile.getProfileName() + "' is " + profile.getStatus() + ".");
        }
        return profile;
    }

    private PosDevice validateDeviceAvailable(PosHardwareProfileDevice slot) {
        PosDevice device = deviceRepo.findById(slot.getDeviceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Profile role '" + slot.getRole() + "' points at a device that no longer exists."));
        if (device.getStatus() != PosDeviceStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Device '" + device.getDeviceName() + "' (role " + slot.getRole() + ") is " + device.getStatus()
                            + " and is not available for assignment.");
        }
        return device;
    }

    /**
     * A device conflicts if it's also claimed by a DIFFERENT profile that is currently assigned
     * to a DIFFERENT, non-decommissioned terminal. Two profiles may both list the same device
     * (e.g. a shared spare printer profile) without conflict as long as only one of the
     * terminals using those profiles is actually active at a time — re-running this assignment
     * for the SAME terminal/profile pair is always allowed (idempotent re-assignment).
     */
    private void detectConflict(PosDevice device, PosHardwareProfile profile, PosTerminal terminal) {
        List<PosHardwareProfileDevice> otherSlots = profileDeviceRepo.findByDeviceId(device.getId());
        for (PosHardwareProfileDevice otherSlot : otherSlots) {
            if (otherSlot.getHardwareProfileId().equals(profile.getId())) {
                continue; // same profile, not a conflict
            }
            List<PosTerminal> terminalsOnOtherProfile = terminalRepo.findByHardwareProfileId(otherSlot.getHardwareProfileId());
            for (PosTerminal otherTerminal : terminalsOnOtherProfile) {
                if (otherTerminal.getId().equals(terminal.getId())) {
                    continue; // same terminal switching profiles — not a conflict with itself
                }
                if (otherTerminal.getStatus() == PosTerminalStatus.DECOMMISSIONED) {
                    continue; // a decommissioned terminal's old profile binding doesn't block reuse
                }
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Device '" + device.getDeviceName() + "' is already assigned to terminal "
                                + otherTerminal.getTerminalId() + " via a different hardware profile.");
            }
        }
    }

    private void refreshRuntimeState(PosDevice device, PosTerminal terminal) {
        switch (device.getDeviceType()) {
            case PRINTER -> printerRepo.findByDeviceId(device.getId()).ifPresent(printer -> {
                printer.setTerminalId(terminal.getTerminalId());
                printer.setBranchId(terminal.getBranchId());
                printer.setBranchName(terminal.getBranchName());
                printer.setCounterName(terminal.getCounterName());
                printerRepo.save(printer);
            });
            case SCANNER -> scannerRepo.findByDeviceId(device.getId()).ifPresent(scanner -> {
                scanner.setTerminalId(terminal.getTerminalId());
                scanner.setBranchId(terminal.getBranchId());
                scanner.setBranchName(terminal.getBranchName());
                scanner.setCounterName(terminal.getCounterName());
                scannerRepo.save(scanner);
            });
            case CASH_DRAWER -> cashDrawerRepo.findByDeviceId(device.getId()).ifPresent(drawer -> {
                drawer.setTerminalId(terminal.getTerminalId());
                drawer.setBranchId(terminal.getBranchId());
                drawer.setBranchName(terminal.getBranchName());
                drawer.setCounterName(terminal.getCounterName());
                cashDrawerRepo.save(drawer);
            });
            default -> { /* CARD_TERMINAL/CUSTOMER_DISPLAY/SCALE/GENERIC: no type-specific entity yet */ }
        }
    }
}
