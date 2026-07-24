package com.billbull.backend.pos.terminal;

import com.billbull.backend.pos.counter.PosCounter;
import com.billbull.backend.pos.counter.PosCounterRepository;
import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class PosTerminalService {

    private final PosTerminalRepository repo;
    private final PosSettingsRepository settingsRepo;
    private final PosCounterRepository counterRepo;
    private final BranchAccessService branchAccessService;

    public PosTerminalService(PosTerminalRepository repo,
                              PosSettingsRepository settingsRepo,
                              PosCounterRepository counterRepo,
                              BranchAccessService branchAccessService) {
        this.repo = repo;
        this.settingsRepo = settingsRepo;
        this.counterRepo = counterRepo;
        this.branchAccessService = branchAccessService;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    /**
     * A 403 whose reason string is always exactly "Terminal is {STATUS}" — the frontend parses this
     * trailing status word to branch the "Terminal Not Available" dialog per-status (see
     * BillBull-POS-Terminal-Archive-Lifecycle-Review.html Part 08/10). Keeping the message format
     * stable here is the entire contract; no separate error-code field is introduced.
     */
    private ResponseStatusException terminalUnavailable(PosTerminalStatus status) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Terminal is " + status);
    }

    /**
     * Register or refresh a terminal. If the device fingerprint already exists and is active,
     * returns the existing terminal (idempotent). Otherwise creates a new one.
     * When PosSettings.requireTerminalApproval is true, new terminals start as PENDING_REGISTRATION.
     */
    @Transactional
    public Map<String, Object> registerOrRefresh(String terminalId, String deviceFingerprint, String deviceInfo,
                                                  String requestedTerminalName, String counterName,
                                                  String operatingSystem, String browser, String ipAddress) {
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();

        // 1. Lookup by terminalId claim from localStorage
        if (terminalId != null && !terminalId.isBlank()) {
            Optional<PosTerminal> byId = repo.findByTerminalId(terminalId);
            if (byId.isPresent()) {
                PosTerminal t = byId.get();
                if (t.getBranchId().equals(branchId)) {
                    boolean fingerprintMismatch = deviceFingerprint != null && !deviceFingerprint.isBlank()
                            && t.getDeviceFingerprint() != null
                            && !deviceFingerprint.equals(t.getDeviceFingerprint());
                    if (!fingerprintMismatch) {
                        if (t.getStatus() == PosTerminalStatus.BLOCKED
                                || t.getStatus() == PosTerminalStatus.MAINTENANCE
                                || t.getStatus() == PosTerminalStatus.DECOMMISSIONED
                                || t.getStatus() == PosTerminalStatus.ARCHIVED) {
                            throw terminalUnavailable(t.getStatus());
                        }
                        t.setLastSeenAt(LocalDateTime.now());
                        t.setLastHeartbeatAt(LocalDateTime.now());
                        if (deviceInfo != null) t.setDeviceInfo(deviceInfo);
                        if (operatingSystem != null) t.setOperatingSystem(operatingSystem);
                        if (browser != null) t.setBrowser(browser);
                        if (ipAddress != null) t.setIpAddress(ipAddress);
                        repo.save(t);
                        boolean pending = "PENDING".equals(t.getRegistrationStatus());
                        return Map.of("terminal", t, "isNew", false, "pending", pending);
                    }
                }
            }
        }

        // 2. Fallback to lookup by (deviceFingerprint, branchId) — a device's terminal identity is
        // per-branch, so this only ever matches a terminal already registered in the CURRENT
        // branch. A fingerprint match belonging to a different branch is a distinct, independently
        // valid terminal there and must be left untouched (see V47 migration + class javadoc).
        Optional<PosTerminal> existing = repo.findByDeviceFingerprintAndBranchId(deviceFingerprint, branchId);
        if (existing.isPresent()) {
            PosTerminal t = existing.get();
            if (t.getStatus() == PosTerminalStatus.BLOCKED
                    || t.getStatus() == PosTerminalStatus.MAINTENANCE
                    || t.getStatus() == PosTerminalStatus.DECOMMISSIONED
                    || t.getStatus() == PosTerminalStatus.ARCHIVED) {
                throw terminalUnavailable(t.getStatus());
            }
            t.setLastSeenAt(LocalDateTime.now());
            t.setLastHeartbeatAt(LocalDateTime.now());
            if (deviceInfo != null) t.setDeviceInfo(deviceInfo);
            if (operatingSystem != null) t.setOperatingSystem(operatingSystem);
            if (browser != null) t.setBrowser(browser);
            if (ipAddress != null) t.setIpAddress(ipAddress);
            repo.save(t);
            boolean pending = "PENDING".equals(t.getRegistrationStatus());
            return Map.of("terminal", t, "isNew", false, "pending", pending);
        }

        // 3. New terminal — check limit (excludes archived + decommissioned terminals, which have
        // both freed their slot permanently or temporarily — see countActiveLimitByBranchId)
        PosSettings settings = settingsRepo.findByBranchId(branchId).orElse(new PosSettings());
        int max = settings.getMaxTerminalsPerBranch() != null ? settings.getMaxTerminalsPerBranch() : 5;
        long current = repo.countActiveLimitByBranchId(branchId);
        if (current >= max) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Maximum number of terminals (" + max + ") reached for this branch.");
        }

        boolean requireApproval = Boolean.TRUE.equals(settings.getRequireTerminalApproval());
        int seq = (int) current + 1;
        String newTerminalId = "T" + String.format("%03d", seq) + "-"
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase();

        PosTerminal terminal = new PosTerminal();
        terminal.setBranchId(branchId);
        terminal.setBranchName(branch.getName());
        terminal.setTerminalId(newTerminalId);
        terminal.setTerminalName(requestedTerminalName != null ? requestedTerminalName : "Terminal " + seq);
        terminal.setCounterName(counterName != null ? counterName : "Counter " + seq);
        terminal.setDeviceFingerprint(deviceFingerprint);
        terminal.setDeviceInfo(deviceInfo);
        terminal.setOperatingSystem(operatingSystem);
        terminal.setBrowser(browser);
        terminal.setIpAddress(ipAddress);
        terminal.setIsMainPos(current == 0);
        terminal.setRegisteredBy(currentUser());
        terminal.setLastSeenAt(LocalDateTime.now());
        terminal.setLastHeartbeatAt(LocalDateTime.now());

        if (requireApproval) {
            terminal.setStatus(PosTerminalStatus.PENDING_REGISTRATION);
            terminal.setRegistrationStatus("PENDING");
        } else {
            terminal.setStatus(PosTerminalStatus.ACTIVE);
            terminal.setRegistrationStatus("APPROVED");
        }

        PosTerminal saved = repo.save(terminal);
        return Map.of("terminal", saved, "isNew", true, "pending", requireApproval);
    }

    /** Convenience overload for callers that don't pass device metadata. */
    @Transactional
    public Map<String, Object> registerOrRefresh(String terminalId, String deviceFingerprint,
                                                  String deviceInfo, String terminalName, String counterName) {
        return registerOrRefresh(terminalId, deviceFingerprint, deviceInfo, terminalName, counterName, null, null, null);
    }

    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------

    @Transactional
    public PosTerminal heartbeat(String terminalId, String ipAddress) {
        PosTerminal terminal = repo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));

        if (terminal.getStatus() == PosTerminalStatus.ARCHIVED
                || terminal.getStatus() == PosTerminalStatus.DECOMMISSIONED
                || terminal.getStatus() == PosTerminalStatus.BLOCKED) {
            // MAINTENANCE is deliberately NOT included here: a terminal put into maintenance mid-shift
            // keeps heartbeating and its open session runs to completion rather than being cut off
            // immediately. See BillBull-POS-Terminal-Archive-Lifecycle-Review.html Part 09/10.
            throw terminalUnavailable(terminal.getStatus());
        }

        LocalDateTime now = LocalDateTime.now();
        terminal.setLastHeartbeatAt(now);
        terminal.setLastSeenAt(now);
        if (ipAddress != null && !ipAddress.isBlank()) terminal.setIpAddress(ipAddress);

        // Transition OFFLINE → ACTIVE on heartbeat
        if (terminal.getStatus() == PosTerminalStatus.OFFLINE) {
            terminal.setStatus(
                    terminal.getCurrentOpenSessionId() != null ? PosTerminalStatus.ACTIVE : PosTerminalStatus.IDLE);
        }

        return repo.save(terminal);
    }

    // -------------------------------------------------------------------------
    // Registration approval
    // -------------------------------------------------------------------------

    @Transactional
    public PosTerminal approve(Long terminalPk) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (terminal.getStatus() != PosTerminalStatus.PENDING_REGISTRATION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Terminal is not pending registration.");
        }
        terminal.setStatus(PosTerminalStatus.ACTIVE);
        terminal.setRegistrationStatus("APPROVED");
        return repo.save(terminal);
    }

    @Transactional
    public PosTerminal reject(Long terminalPk, String reason) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (terminal.getStatus() != PosTerminalStatus.PENDING_REGISTRATION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Terminal is not pending registration.");
        }
        terminal.setStatus(PosTerminalStatus.INACTIVE);
        terminal.setRegistrationStatus("REJECTED");
        if (reason != null) terminal.setArchiveReason(reason);
        return repo.save(terminal);
    }

    // -------------------------------------------------------------------------
    // Orphan / archive management
    // -------------------------------------------------------------------------

    @Transactional
    public PosTerminal archive(Long terminalPk, String reason) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (terminal.getCurrentOpenSessionId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Terminal has an open session. Close the session before archiving.");
        }
        terminal.setStatus(PosTerminalStatus.ARCHIVED);
        terminal.setArchivedAt(LocalDateTime.now());
        terminal.setArchiveReason(reason);
        terminal.setActive(false);
        return repo.save(terminal);
    }

    @Transactional
    public PosTerminal restore(Long terminalPk) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (terminal.getStatus() != PosTerminalStatus.ARCHIVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Terminal is not archived.");
        }
        // Re-check limit before restore
        PosSettings settings = settingsRepo.findByBranchId(terminal.getBranchId()).orElse(new PosSettings());
        int max = settings.getMaxTerminalsPerBranch() != null ? settings.getMaxTerminalsPerBranch() : 5;
        long current = repo.countActiveLimitByBranchId(terminal.getBranchId());
        if (current >= max) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Cannot restore: terminal limit (" + max + ") would be exceeded.");
        }
        terminal.setArchivedAt(null);
        terminal.setArchiveReason(null);
        terminal.setActive(true);
        // Land directly in ACTIVE/IDLE using the same recent-heartbeat check keepActive() already
        // uses, rather than INACTIVE — the device's next heartbeat would have promoted it there
        // anyway, so this just skips the one throwaway cycle (BillBull-POS-Terminal-Archive-Lifecycle-Review.html Part 09/10).
        boolean recentHeartbeat = terminal.getLastHeartbeatAt() != null
                && terminal.getLastHeartbeatAt().isAfter(LocalDateTime.now().minusMinutes(15));
        terminal.setStatus(recentHeartbeat
                ? (terminal.getCurrentOpenSessionId() != null ? PosTerminalStatus.ACTIVE : PosTerminalStatus.IDLE)
                : PosTerminalStatus.OFFLINE);
        return repo.save(terminal);
    }

    /**
     * Permanently retires a terminal. Unlike {@link #archive}, this has no restore path anywhere in
     * the service layer — the device must register as a brand-new terminal (consuming a new slot)
     * to use this branch again. Admin-only; never triggered automatically by any scheduled job.
     */
    @Transactional
    public PosTerminal decommission(Long terminalPk, String reason) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (terminal.getStatus() == PosTerminalStatus.DECOMMISSIONED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Terminal is already decommissioned.");
        }
        if (terminal.getCurrentOpenSessionId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Terminal has an open session. Close the session before decommissioning.");
        }
        terminal.setStatus(PosTerminalStatus.DECOMMISSIONED);
        terminal.setDecommissionedAt(LocalDateTime.now());
        terminal.setDecommissionReason(reason);
        // Decommissioning also clears any lingering archive bookkeeping — the terminal is retired
        // outright, not "archived and also decommissioned".
        terminal.setArchivedAt(null);
        terminal.setArchiveReason(null);
        terminal.setActive(false);
        return repo.save(terminal);
    }

    // -------------------------------------------------------------------------
    // Counter assignment
    // -------------------------------------------------------------------------

    @Transactional
    public PosTerminal assignCounter(Long terminalPk, Long counterId) {
        PosTerminal terminal = repo.findById(terminalPk)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalPk));
        if (counterId != null) {
            PosCounter counter = counterRepo.findById(counterId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Counter not found: " + counterId));
            terminal.setCounterId(counter.getId());
            terminal.setCounterName(counter.getCounterName());
        } else {
            terminal.setCounterId(null);
        }
        return repo.save(terminal);
    }

    // -------------------------------------------------------------------------
    // Existing read/mutation methods
    // -------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PosTerminal> getForBranch(Long branchId) {
        return repo.findByBranchIdAndStatus(branchId, PosTerminalStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public List<PosTerminal> getAllForBranch(Long branchId) {
        return repo.findByBranchIdOrderByTerminalIdAsc(branchId);
    }

    @Transactional(readOnly = true)
    public List<PosTerminal> getPendingApproval(Long branchId) {
        return repo.findByBranchIdAndRegistrationStatus(branchId, "PENDING");
    }

    @Transactional
    public PosTerminal rename(String terminalId, String terminalName, String counterName) {
        PosTerminal terminal = repo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
        if (terminalName != null && !terminalName.isBlank()) terminal.setTerminalName(terminalName.trim());
        if (counterName != null && !counterName.isBlank()) terminal.setCounterName(counterName.trim());
        return repo.save(terminal);
    }

    @Transactional
    public PosTerminal setStatus(String terminalId, PosTerminalStatus status) {
        PosTerminal terminal = repo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
        terminal.setStatus(status);
        return repo.save(terminal);
    }

    /** Read-only lookup used by the controller to decide which permission a status change needs. */
    @Transactional(readOnly = true)
    public PosTerminal findByTerminalIdOrThrow(String terminalId) {
        return repo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
    }

    @Transactional
    public PosTerminal setMainPos(String terminalId) {
        PosTerminal target = repo.findByTerminalId(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Terminal not found: " + terminalId));
        repo.findByBranchIdOrderByTerminalIdAsc(target.getBranchId())
                .forEach(t -> {
                    if (Boolean.TRUE.equals(t.getIsMainPos())) {
                        t.setIsMainPos(false);
                        repo.save(t);
                    }
                });
        target.setIsMainPos(true);
        return repo.save(target);
    }
}
