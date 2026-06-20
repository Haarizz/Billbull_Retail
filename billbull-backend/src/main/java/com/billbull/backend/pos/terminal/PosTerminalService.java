package com.billbull.backend.pos.terminal;

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
    private final BranchAccessService branchAccessService;

    public PosTerminalService(PosTerminalRepository repo,
                              PosSettingsRepository settingsRepo,
                              BranchAccessService branchAccessService) {
        this.repo = repo;
        this.settingsRepo = settingsRepo;
        this.branchAccessService = branchAccessService;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    /**
     * Register or refresh a terminal. If the device fingerprint already exists and is active,
     * returns the existing terminal (idempotent). Otherwise creates a new one.
     */
    @Transactional
    public Map<String, Object> registerOrRefresh(String deviceFingerprint, String deviceInfo,
                                                  String requestedTerminalName, String counterName) {
        // Check existing by fingerprint FIRST — branch context is not needed for a returning terminal.
        // Avoids a 400 when the user's branch switcher is set to "All Branches" on page reload.
        Optional<PosTerminal> existing = repo.findByDeviceFingerprint(deviceFingerprint);
        if (existing.isPresent()) {
            PosTerminal t = existing.get();
            t.setLastSeenAt(LocalDateTime.now());
            if (deviceInfo != null) t.setDeviceInfo(deviceInfo);
            repo.save(t);
            return Map.of("terminal", t, "isNew", false);
        }

        // New terminal — branch is required to scope the registration.
        Branch branch = branchAccessService.getRequiredCurrentUserBranch();
        Long branchId = branch.getId();

        // Check max terminals
        PosSettings settings = settingsRepo.findByBranchId(branchId).orElse(new PosSettings());
        int max = settings.getMaxTerminalsPerBranch() != null ? settings.getMaxTerminalsPerBranch() : 5;
        int active = repo.countByBranchIdAndStatus(branchId, PosTerminalStatus.ACTIVE);
        if (active >= max) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Maximum number of terminals (" + max + ") reached for this branch.");
        }

        String terminalId = "T" + String.format("%03d", active + 1) + "-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();

        PosTerminal terminal = new PosTerminal();
        terminal.setBranchId(branchId);
        terminal.setBranchName(branch.getName());
        terminal.setTerminalId(terminalId);
        terminal.setTerminalName(requestedTerminalName != null ? requestedTerminalName : "Terminal " + (active + 1));
        terminal.setCounterName(counterName != null ? counterName : "Counter " + (active + 1));
        terminal.setDeviceFingerprint(deviceFingerprint);
        terminal.setDeviceInfo(deviceInfo);
        terminal.setIsMainPos(active == 0); // First terminal is the main POS
        terminal.setRegisteredBy(currentUser());
        terminal.setLastSeenAt(LocalDateTime.now());
        terminal.setStatus(PosTerminalStatus.ACTIVE);

        PosTerminal saved = repo.save(terminal);
        return Map.of("terminal", saved, "isNew", true);
    }

    @Transactional(readOnly = true)
    public List<PosTerminal> getForBranch(Long branchId) {
        return repo.findByBranchIdAndStatus(branchId, PosTerminalStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public List<PosTerminal> getAllForBranch(Long branchId) {
        return repo.findByBranchIdOrderByTerminalIdAsc(branchId);
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
}
