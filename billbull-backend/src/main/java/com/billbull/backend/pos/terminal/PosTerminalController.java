package com.billbull.backend.pos.terminal;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pos/terminals")
@CrossOrigin
public class PosTerminalController {

    private final PosTerminalService service;
    private final PosTerminalLifecycleService lifecycleService;
    private final PosTerminalActivityService activityService;

    public PosTerminalController(PosTerminalService service,
                                  PosTerminalLifecycleService lifecycleService,
                                  PosTerminalActivityService activityService) {
        this.service = service;
        this.lifecycleService = lifecycleService;
        this.activityService = activityService;
    }

    @PostMapping("/register")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> body,
                                                         HttpServletRequest request) {
        String terminalId    = body.get("terminalId")        != null ? body.get("terminalId").toString()        : null;
        String fingerprint   = body.getOrDefault("deviceFingerprint", "").toString();
        String deviceInfo    = body.get("deviceInfo")        != null ? body.get("deviceInfo").toString()        : null;
        String terminalName  = body.get("terminalName")      != null ? body.get("terminalName").toString()      : null;
        String counterName   = body.get("counterName")       != null ? body.get("counterName").toString()       : null;
        String os            = body.get("operatingSystem")   != null ? body.get("operatingSystem").toString()   : null;
        String browser       = body.get("browser")           != null ? body.get("browser").toString()           : null;
        String ip            = resolveClientIp(request);
        try {
            return ResponseEntity.ok(service.registerOrRefresh(terminalId, fingerprint, deviceInfo,
                    terminalName, counterName, os, browser, ip));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Handle concurrent registration race condition (e.g. React StrictMode double mount)
            // by retrying once. The second attempt will find the successfully inserted record.
            return ResponseEntity.ok(service.registerOrRefresh(terminalId, fingerprint, deviceInfo,
                    terminalName, counterName, os, browser, ip));
        }
    }

    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------

    @PostMapping("/{terminalId}/heartbeat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> heartbeat(@PathVariable String terminalId,
                                                          HttpServletRequest request) {
        PosTerminal t = service.heartbeat(terminalId, resolveClientIp(request));
        activityService.recordActivity(terminalId, "HEARTBEAT");
        return ResponseEntity.ok(Map.of(
                "terminalId", t.getTerminalId(),
                "status", t.getStatus(),
                "lastHeartbeatAt", t.getLastHeartbeatAt()
        ));
    }

    // -------------------------------------------------------------------------
    // Registration approval
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> approve(@PathVariable Long id) {
        return ResponseEntity.ok(service.approve(id));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> reject(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body != null && body.get("reason") != null ? body.get("reason").toString() : null;
        return ResponseEntity.ok(service.reject(id, reason));
    }

    // -------------------------------------------------------------------------
    // Archive / restore
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/archive")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> archive(@PathVariable Long id,
                                                @RequestBody(required = false) Map<String, Object> body) {
        String reason = body != null && body.get("reason") != null ? body.get("reason").toString() : null;
        return ResponseEntity.ok(service.archive(id, reason));
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> restore(@PathVariable Long id) {
        return ResponseEntity.ok(lifecycleService.restore(id));
    }

    // -------------------------------------------------------------------------
    // Terminal Auto-Archive lifecycle
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/keep-active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> keepActive(@PathVariable Long id) {
        return ResponseEntity.ok(lifecycleService.keepActive(id));
    }

    @PostMapping("/{id}/archive-now")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> archiveNow(@PathVariable Long id) {
        return ResponseEntity.ok(lifecycleService.manualArchiveNow(id));
    }

    @PutMapping("/{id}/auto-archive-exempt")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setAutoArchiveExempt(@PathVariable Long id,
                                                             @RequestBody Map<String, Object> body) {
        boolean exempt = Boolean.parseBoolean(String.valueOf(body.getOrDefault("exempt", false)));
        return ResponseEntity.ok(lifecycleService.setAutoArchiveExempt(id, exempt));
    }

    // -------------------------------------------------------------------------
    // Counter assignment
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/assign-counter")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> assignCounter(@PathVariable Long id,
                                                      @RequestBody Map<String, Object> body) {
        Long counterId = body.get("counterId") != null
                ? Long.parseLong(body.get("counterId").toString()) : null;
        return ResponseEntity.ok(service.assignCounter(id, counterId));
    }

    // -------------------------------------------------------------------------
    // Listing
    // -------------------------------------------------------------------------

    @GetMapping("/branch/{branchId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @GetMapping("/branch/{branchId}/all")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getAllForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getAllForBranch(branchId));
    }

    @GetMapping("/branch/{branchId}/pending")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getPending(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getPendingApproval(branchId));
    }

    // -------------------------------------------------------------------------
    // Existing rename / status / main-pos
    // -------------------------------------------------------------------------

    @PutMapping("/{terminalId}/rename")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> rename(@PathVariable String terminalId,
                                               @RequestBody Map<String, Object> body) {
        String terminalName = body.get("terminalName") != null ? body.get("terminalName").toString() : null;
        String counterName  = body.get("counterName")  != null ? body.get("counterName").toString()  : null;
        return ResponseEntity.ok(service.rename(terminalId, terminalName, counterName));
    }

    @PutMapping("/{terminalId}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setStatus(@PathVariable String terminalId,
                                                  @RequestBody Map<String, Object> body) {
        PosTerminalStatus status = PosTerminalStatus.valueOf(
                body.getOrDefault("status", "ACTIVE").toString().toUpperCase());
        return ResponseEntity.ok(service.setStatus(terminalId, status));
    }

    @PutMapping("/{terminalId}/set-main")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setMainPos(@PathVariable String terminalId) {
        return ResponseEntity.ok(service.setMainPos(terminalId));
    }

    // -------------------------------------------------------------------------
    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
