package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

/**
 * CRUD + role-assignment for {@link PosHardwareProfile}. Owns profile validity (name/branch
 * rules, role uniqueness within a profile); does NOT own terminal assignment — that's
 * {@link HardwareProfileAssignmentEngine}, which depends on this service rather than
 * duplicating its validation.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §5.
 */
@Service
public class HardwareProfileService {

    private final PosHardwareProfileRepository profileRepo;
    private final PosHardwareProfileDeviceRepository profileDeviceRepo;
    private final PosDeviceRepository deviceRepo;
    private final PosTerminalRepository terminalRepo;

    public HardwareProfileService(PosHardwareProfileRepository profileRepo,
                                   PosHardwareProfileDeviceRepository profileDeviceRepo,
                                   PosDeviceRepository deviceRepo,
                                   PosTerminalRepository terminalRepo) {
        this.profileRepo = profileRepo;
        this.profileDeviceRepo = profileDeviceRepo;
        this.deviceRepo = deviceRepo;
        this.terminalRepo = terminalRepo;
    }

    public PosHardwareProfile create(CreateRequest req) {
        if (req == null || req.profileName() == null || req.profileName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile name is required.");
        }
        validateUniqueName(req.profileName().trim(), req.branchId(), null);

        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setProfileName(req.profileName().trim());
        profile.setBranchId(req.branchId());
        profile.setDescription(trimToNull(req.description()));
        profile.setStatus(PosHardwareProfileStatus.ACTIVE);
        return profileRepo.save(profile);
    }

    public PosHardwareProfile update(Long id, CreateRequest req) {
        PosHardwareProfile profile = get(id);
        if (req == null || req.profileName() == null || req.profileName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile name is required.");
        }
        validateUniqueName(req.profileName().trim(), req.branchId(), id);

        profile.setProfileName(req.profileName().trim());
        profile.setBranchId(req.branchId());
        profile.setDescription(trimToNull(req.description()));
        profile.setVersion(profile.getVersion() + 1);
        return profileRepo.save(profile);
    }

    public PosHardwareProfile get(Long id) {
        return profileRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hardware profile not found: " + id));
    }

    /** Global templates plus a branch's own profiles, the candidate set for assigning to one of its terminals. */
    public List<PosHardwareProfile> listForBranch(Long branchId) {
        if (branchId == null) {
            return List.of();
        }
        return profileRepo.findByBranchIdIsNullOrBranchIdOrderByProfileNameAsc(branchId);
    }

    public PosHardwareProfile decommission(Long id) {
        PosHardwareProfile profile = get(id);
        profile.setStatus(PosHardwareProfileStatus.DECOMMISSIONED);
        profile.setActive(false);
        return profileRepo.save(profile);
    }

    /** Assigns (or replaces) the device occupying a role within a profile. */
    public PosHardwareProfileDevice assignDeviceToRole(Long profileId, AssignRoleRequest req) {
        PosHardwareProfile profile = get(profileId);
        if (req == null || req.role() == null || req.role().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role is required.");
        }
        if (req.deviceId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Device is required.");
        }
        PosDevice device = deviceRepo.findById(req.deviceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device not found: " + req.deviceId()));

        String role = req.role().trim();
        Optional<PosHardwareProfileDevice> existing =
                profileDeviceRepo.findByHardwareProfileIdAndRole(profileId, role);
        PosHardwareProfileDevice slot = existing.orElseGet(PosHardwareProfileDevice::new);
        slot.setHardwareProfileId(profile.getId());
        slot.setDeviceId(device.getId());
        slot.setRole(role);
        slot = profileDeviceRepo.save(slot);

        // A role-slot change is a configuration change — bump the profile version so terminals
        // already assigned to it can detect they're now out of sync (see isTerminalSynced).
        profile.setVersion(profile.getVersion() + 1);
        profileRepo.save(profile);

        return slot;
    }

    public List<PosHardwareProfileDevice> getDevices(Long profileId) {
        get(profileId); // 404 if the profile itself doesn't exist
        return profileDeviceRepo.findByHardwareProfileId(profileId);
    }

    /**
     * Whether a terminal's currently-assigned profile binding reflects the profile's latest
     * configuration. False for a terminal with no profile (nothing to be in/out of sync with —
     * the legacy direct-assignment path doesn't have a notion of "synced"), or whose recorded
     * {@code assignedProfileVersion} no longer matches the profile's current {@code version}.
     */
    public boolean isTerminalSynced(PosTerminal terminal) {
        if (terminal == null || terminal.getHardwareProfileId() == null || terminal.getAssignedProfileVersion() == null) {
            return false;
        }
        return profileRepo.findById(terminal.getHardwareProfileId())
                .map(p -> p.getVersion() == terminal.getAssignedProfileVersion())
                .orElse(false);
    }

    public SyncStatus getSyncStatus(String terminalId) {
        PosTerminal terminal = terminalRepo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
        Integer currentVersion = terminal.getHardwareProfileId() == null ? null
                : profileRepo.findById(terminal.getHardwareProfileId()).map(PosHardwareProfile::getVersion).orElse(null);
        return new SyncStatus(terminalId, terminal.getHardwareProfileId(), terminal.getAssignedProfileVersion(),
                currentVersion, isTerminalSynced(terminal));
    }

    private void validateUniqueName(String profileName, Long branchId, Long excludingId) {
        List<PosHardwareProfile> candidates = branchId != null
                ? profileRepo.findByBranchIdOrderByProfileNameAsc(branchId)
                : profileRepo.findAll().stream().filter(p -> p.getBranchId() == null).toList();
        boolean duplicate = candidates.stream()
                .anyMatch(p -> !p.getId().equals(excludingId)
                        && p.getStatus() != PosHardwareProfileStatus.DECOMMISSIONED
                        && p.getProfileName().equalsIgnoreCase(profileName));
        if (duplicate) {
            String scope = branchId != null ? "this branch" : "the global template set";
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A hardware profile named '" + profileName + "' already exists in " + scope + ".");
        }
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record CreateRequest(String profileName, Long branchId, String description) {}

    public record AssignRoleRequest(String role, Long deviceId) {}

    public record SyncStatus(String terminalId, Long hardwareProfileId, Integer assignedVersion,
                              Integer currentVersion, boolean inSync) {}
}
