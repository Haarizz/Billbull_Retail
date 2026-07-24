package com.billbull.backend.pos.terminal;

import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Terminal lifecycle actions (approve/reject/archive/restore/block/unblock/decommission/rename/
 * assign-counter/set-main) are authorized through the RBAC Role &amp; Permission system, not a
 * hardcoded {@code @PreAuthorize} role list — see {@code permissions.pos.terminal.&lt;action&gt;} in
 * {@link com.billbull.backend.security.ModuleCatalog} and the seeded defaults in
 * {@code RolePermissionInitializer}. Every mutating endpoint below stays
 * {@code @PreAuthorize("isAuthenticated()")} at the Spring layer (matching the rest of the POS
 * module) and instead calls {@link ModulePermissionService#requireCanView} against the action's
 * dedicated permission key — the same "single-switch grant" mechanism already used for financial
 * maker-checker controls (e.g. {@code permissions.journal.approve-high-value}). This makes future
 * POS administrative permissions fully manageable from the User &amp; Role Configuration screen,
 * with no code change required to add a new role or adjust who can perform which action.
 */
@RestController
@RequestMapping("/api/pos/terminals")
@CrossOrigin
public class PosTerminalController {

    private static final String PERM_REGISTER       = "permissions.pos.terminal.register";
    private static final String PERM_RENAME         = "permissions.pos.terminal.rename";
    private static final String PERM_ASSIGN_COUNTER = "permissions.pos.terminal.assigncounter";
    private static final String PERM_SET_MAIN       = "permissions.pos.terminal.setmain";
    private static final String PERM_APPROVE        = "permissions.pos.terminal.approve";
    private static final String PERM_REJECT         = "permissions.pos.terminal.reject";
    private static final String PERM_ARCHIVE        = "permissions.pos.terminal.archive";
    private static final String PERM_RESTORE        = "permissions.pos.terminal.restore";
    private static final String PERM_DECOMMISSION   = "permissions.pos.terminal.decommission";
    private static final String PERM_BLOCK          = "permissions.pos.terminal.block";
    private static final String PERM_UNBLOCK        = "permissions.pos.terminal.unblock";
    private static final String PERM_KEEP_ACTIVE    = "permissions.pos.terminal.keepactive";
    private static final String PERM_ARCHIVE_NOW    = "permissions.pos.terminal.archive";
    private static final String PERM_SET_EXEMPT     = "permissions.pos.terminal.setautoarchiveexempt";
    private static final String MODULE_TERMINALS    = "pos.terminals";

    private final PosTerminalService service;
    private final PosTerminalLifecycleService lifecycleService;
    private final PosTerminalActivityService activityService;
    private final ModulePermissionService modulePermissionService;

    public PosTerminalController(PosTerminalService service,
                                  PosTerminalLifecycleService lifecycleService,
                                  PosTerminalActivityService activityService,
                                  ModulePermissionService modulePermissionService) {
        this.service = service;
        this.lifecycleService = lifecycleService;
        this.activityService = activityService;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * permissions.pos.terminal.&lt;action&gt; rows are single-switch grants (all 6 CRUD flags set
     * uniformly on toggle, per the existing SPECIAL_PERMISSIONS UI convention) — canView is the
     * one flag that expresses "granted" for this row shape, matching every other maker-checker
     * override permission in the system.
     */
    private void requireTerminalAction(String permissionKey) {
        modulePermissionService.requireCanView(permissionKey);
    }

    /**
     * Device self-service: every POS device calls this on mount to obtain/refresh its own
     * terminal identity — there is no admin-initiated "register a terminal on someone else's
     * behalf" flow, so this is intentionally NOT gated by permissions.pos.terminal.register (that
     * key exists in the catalog for a future admin-initiated registration action, not this one).
     * Cannot be used to bypass administrative gates: {@link PosTerminalService#registerOrRefresh}
     * explicitly 403s on ARCHIVED/BLOCKED/MAINTENANCE/DECOMMISSIONED terminals rather than silently
     * reactivating them, and creating a brand-new terminal here still goes through the ordinary
     * slot-limit check — it grants no lifecycle capability beyond "this device gets a terminal
     * row," which every authenticated POS user already needs to use the till at all.
     */
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

    /**
     * Device self-service: fired every heartbeat interval by every already-registered terminal.
     * Intentionally NOT permission-gated for the same reason as {@link #register} — it must work
     * for every authenticated POS user, not just administrators. Cannot bypass administrative
     * gates: {@link PosTerminalService#heartbeat} explicitly 403s on ARCHIVED/DECOMMISSIONED/
     * BLOCKED terminals and never changes status to anything other than the ACTIVE/IDLE transition
     * a normal working terminal is already allowed — it cannot un-archive, unblock, or restore.
     */
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
        requireTerminalAction(PERM_APPROVE);
        return ResponseEntity.ok(service.approve(id));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> reject(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        requireTerminalAction(PERM_REJECT);
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
        requireTerminalAction(PERM_ARCHIVE);
        String reason = body != null && body.get("reason") != null ? body.get("reason").toString() : null;
        return ResponseEntity.ok(service.archive(id, reason));
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> restore(@PathVariable Long id) {
        requireTerminalAction(PERM_RESTORE);
        return ResponseEntity.ok(lifecycleService.restore(id));
    }

    // Permanent retirement — no restore endpoint exists for this status, by design.
    @PostMapping("/{id}/decommission")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> decommission(@PathVariable Long id,
                                                     @RequestBody(required = false) Map<String, Object> body) {
        requireTerminalAction(PERM_DECOMMISSION);
        String reason = body != null && body.get("reason") != null ? body.get("reason").toString() : null;
        return ResponseEntity.ok(lifecycleService.decommission(id, reason));
    }

    // -------------------------------------------------------------------------
    // Terminal Auto-Archive lifecycle
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/keep-active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> keepActive(@PathVariable Long id) {
        requireTerminalAction(PERM_KEEP_ACTIVE);
        return ResponseEntity.ok(lifecycleService.keepActive(id));
    }

    // Same underlying capability as /archive (an immediate, manually-triggered archive rather
    // than the auto-archive sweep) — reuses PERM_ARCHIVE rather than a separate permission key.
    @PostMapping("/{id}/archive-now")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> archiveNow(@PathVariable Long id) {
        requireTerminalAction(PERM_ARCHIVE_NOW);
        return ResponseEntity.ok(lifecycleService.manualArchiveNow(id));
    }

    @PutMapping("/{id}/auto-archive-exempt")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setAutoArchiveExempt(@PathVariable Long id,
                                                             @RequestBody Map<String, Object> body) {
        requireTerminalAction(PERM_SET_EXEMPT);
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
        requireTerminalAction(PERM_ASSIGN_COUNTER);
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
        modulePermissionService.requireCanView(MODULE_TERMINALS);
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @GetMapping("/branch/{branchId}/all")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getAllForBranch(@PathVariable Long branchId) {
        modulePermissionService.requireCanView(MODULE_TERMINALS);
        return ResponseEntity.ok(service.getAllForBranch(branchId));
    }

    @GetMapping("/branch/{branchId}/pending")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getPending(@PathVariable Long branchId) {
        modulePermissionService.requireCanView(MODULE_TERMINALS);
        return ResponseEntity.ok(service.getPendingApproval(branchId));
    }

    // -------------------------------------------------------------------------
    // Existing rename / status / main-pos
    // -------------------------------------------------------------------------

    @PutMapping("/{terminalId}/rename")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> rename(@PathVariable String terminalId,
                                               @RequestBody Map<String, Object> body) {
        requireTerminalAction(PERM_RENAME);
        String terminalName = body.get("terminalName") != null ? body.get("terminalName").toString() : null;
        String counterName  = body.get("counterName")  != null ? body.get("counterName").toString()  : null;
        return ResponseEntity.ok(service.rename(terminalId, terminalName, counterName));
    }

    /**
     * Generic status transition, also used by the console's Block/Unblock/Deactivate buttons.
     * BLOCKED and its reverse are gated by their own dedicated permissions (matching the task's
     * distinct Block/Unblock actions); any other target status falls back to the base
     * pos.terminals edit permission rather than a dedicated action key.
     */
    @PutMapping("/{terminalId}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setStatus(@PathVariable String terminalId,
                                                  @RequestBody Map<String, Object> body) {
        PosTerminalStatus status = PosTerminalStatus.valueOf(
                body.getOrDefault("status", "ACTIVE").toString().toUpperCase());
        if (status == PosTerminalStatus.BLOCKED) {
            requireTerminalAction(PERM_BLOCK);
        } else {
            PosTerminal current = service.findByTerminalIdOrThrow(terminalId);
            if (current.getStatus() == PosTerminalStatus.BLOCKED) {
                requireTerminalAction(PERM_UNBLOCK);
            } else {
                modulePermissionService.requireCanEdit(MODULE_TERMINALS);
            }
        }
        return ResponseEntity.ok(service.setStatus(terminalId, status));
    }

    @PutMapping("/{terminalId}/set-main")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setMainPos(@PathVariable String terminalId) {
        requireTerminalAction(PERM_SET_MAIN);
        return ResponseEntity.ok(service.setMainPos(terminalId));
    }

    // -------------------------------------------------------------------------
    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
