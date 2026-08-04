package com.billbull.backend.pos.session;

import com.billbull.backend.pos.businessdate.DayStatusResponse;
import com.billbull.backend.pos.businessdate.PosDayStatusService;
import com.billbull.backend.pos.businessdate.PosPendingDayCloseResolver;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/pos/sessions")
@CrossOrigin
public class PosSessionController {

    private final PosSessionService service;
    private final PosSessionSyncService syncService;
    private final ObjectMapper objectMapper;
    private final PosDayStatusService dayStatusService;
    private final PosPendingDayCloseResolver pendingDayCloseResolver;
    private final BranchAccessService branchAccessService;

    public PosSessionController(PosSessionService service, PosSessionSyncService syncService, ObjectMapper objectMapper,
                                 PosDayStatusService dayStatusService,
                                 PosPendingDayCloseResolver pendingDayCloseResolver,
                                 BranchAccessService branchAccessService) {
        this.service = service;
        this.syncService = syncService;
        this.objectMapper = objectMapper;
        this.dayStatusService = dayStatusService;
        this.pendingDayCloseResolver = pendingDayCloseResolver;
        this.branchAccessService = branchAccessService;
    }

    /** Default {@code date} for endpoints that don't receive an explicit one: the next
     *  business date that actually needs a Day Close (session-driven — see
     *  {@link PosPendingDayCloseResolver}), or today when there's nothing pending. */
    private LocalDate resolveDefaultDate(Long branchId) {
        return pendingDayCloseResolver.resolvePendingBusinessDate(branchId).orElseGet(LocalDate::now);
    }

    @PostMapping("/open")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> openSession(@RequestBody Map<String, Object> body) {
        String terminalId = body.getOrDefault("terminalId", "").toString();
        String counterName = body.getOrDefault("counterName", "Main Counter").toString();
        BigDecimal openingCash = body.get("openingCash") != null
                ? new BigDecimal(body.get("openingCash").toString()) : BigDecimal.ZERO;
        try {
            return ResponseEntity.ok(service.openSession(terminalId, counterName, openingCash));
        } catch (PosSessionDiscoveryBlockedException ex) {
            // Session Roaming Phase 7 — discovery found an existing/ambiguous session elsewhere;
            // the JSON body shape for the success path above is unchanged, this only adds a new
            // structured 409 body for a case the pre-Phase-7 API never detected at all.
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ex.getResponse());
        }
    }

    /**
     * Session Roaming Phase 8 — explicit, operator-confirmed session transfer to another
     * terminal. Deliberately separate from {@code openSession}: transfer moves an existing
     * OPEN/SUSPENDED session's hosting, it never opens a new one. Requires {@code confirm: true}
     * in the body so a transfer can never be triggered by an incidental/automated call; all
     * eligibility, concurrency, and locking checks happen inside
     * {@code PosSessionService#transferSession} / {@code PosSessionTransferService#transfer}.
     */
    @PostMapping("/{id}/transfer")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionTransferResponse> transferSession(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        String destinationTerminalId = body != null && body.get("destinationTerminalId") != null
                ? body.get("destinationTerminalId").toString() : null;
        boolean confirm = body != null && Boolean.TRUE.equals(body.get("confirm"));
        String reason = body != null && body.get("reason") != null ? body.get("reason").toString() : null;
        String supervisorPin = body != null && body.get("supervisorPin") != null
                ? body.get("supervisorPin").toString() : null;

        if (destinationTerminalId == null || destinationTerminalId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "destinationTerminalId is required.");
        }
        if (!confirm) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Session transfer requires explicit confirmation (confirm: true).");
        }

        return ResponseEntity.ok(service.transferSession(id, destinationTerminalId, reason, supervisorPin));
    }

    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> getActiveSession(@RequestParam(required = false, defaultValue = "") String terminalId) {
        Optional<PosSession> session = service.getActiveSession(terminalId);
        return session.map(ResponseEntity::ok).orElse(ResponseEntity.noContent().build());
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @GetMapping("/{id}/sync")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSessionSyncResponse> syncSession(@PathVariable Long id, @RequestParam(required = false) String terminalId) {
        return ResponseEntity.ok(syncService.syncSession(id, terminalId));
    }

    @PostMapping("/{id}/close")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> closeSession(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        BigDecimal closingCash = body != null && body.get("closingCash") != null
                ? new BigDecimal(body.get("closingCash").toString()) : null;
        String notes = body != null ? (String) body.get("notes") : null;
        boolean supervisorApproved = body != null && Boolean.TRUE.equals(body.get("supervisorApproved"));
        String closingDenominationsJson = toJson(body != null ? body.get("closingDenominations") : null);
        String cardBatchNo = body != null ? (String) body.get("cardBatchNo") : null;
        Boolean cardSettlementVerified = body != null ? (Boolean) body.get("cardSettlementVerified") : null;
        BigDecimal cardClosingCash = body != null && body.get("cardClosingCash") != null
                ? new BigDecimal(body.get("cardClosingCash").toString()) : null;
        String closingCashierName = body != null ? (String) body.get("closingCashierName") : null;
        String closingSupervisorName = body != null ? (String) body.get("closingSupervisorName") : null;
        String closingRemarks = body != null ? (String) body.get("closingRemarks") : null;
        return ResponseEntity.ok(service.closeSession(id, closingCash, notes, supervisorApproved, closingDenominationsJson,
                cardBatchNo, cardSettlementVerified, cardClosingCash, closingCashierName, closingSupervisorName, closingRemarks));
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    @PostMapping("/{id}/cash-movement")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashMovement> addCashMovement(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        String type = body.getOrDefault("movementType", "DROP_IN").toString();
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        String description = body.get("description") != null ? body.get("description").toString() : "";
        String reference = body.get("reference") != null ? body.get("reference").toString() : null;
        Long categoryId = body.get("categoryId") != null ? Long.valueOf(body.get("categoryId").toString()) : null;
        return ResponseEntity.ok(service.addCashMovement(id, type, amount, description, reference, categoryId));
    }

    @GetMapping("/{id}/x-report")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getXReport(@PathVariable Long id) {
        return ResponseEntity.ok(service.getXReport(id));
    }

    /** Explicit X-Report run for an open shift. Marks this terminal as having completed
     *  its X-Report (used by the Z-Report end-of-day gate) and returns the report data. */
    @PostMapping("/{id}/x-report/generate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> generateXReport(@PathVariable Long id) {
        return ResponseEntity.ok(service.generateXReport(id));
    }

    @GetMapping("/z-report")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getZReport(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) Long startSessionId,
            @RequestParam(required = false) Long endSessionId) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : resolveDefaultDate(branchId);
        return ResponseEntity.ok(service.getZReport(branchId, reportDate, startSessionId, endSessionId));
    }

    /** Day Close review-screen summary: auto-resolved (or supervisor-adjusted) first/
     *  last session, total sessions, cashiers/counters/terminals, trading time span,
     *  session statuses, and any sessions excluded by a narrowed range. Read-only —
     *  does not create or modify anything. */
    @GetMapping("/day-close/summary")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getDayCloseSummary(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) Long startSessionId,
            @RequestParam(required = false) Long endSessionId) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : resolveDefaultDate(branchId);
        return ResponseEntity.ok(service.getDayCloseSummary(branchId, reportDate, startSessionId, endSessionId));
    }

    /** Hard gate checked before the frontend commits the X-Report to print/PDF/Excel.
     *  The report may still be viewed on screen while the session is open (see
     *  {@code getXReport}); this returns 409 unless the session is CLOSED. */
    @PostMapping("/{id}/x-report/print-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> checkXReportPrintable(@PathVariable Long id) {
        service.assertXReportPrintable(id);
        return ResponseEntity.noContent().build();
    }

    /** Hard gate checked before the frontend commits the Z-Report to print/PDF/Excel.
     *  Returns 409 unless the business day has already been closed. */
    @GetMapping("/z-report/print-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> checkZReportPrintable(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : resolveDefaultDate(branchId);
        service.assertZReportPrintable(branchId, reportDate);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/close-day")
    @PreAuthorize("hasAnyAuthority('SUPERVISOR', 'MANAGER', 'ADMIN', 'ROLE_SUPERVISOR', 'ROLE_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> closeDay(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) Long startSessionId,
            @RequestParam(required = false) Long endSessionId,
            @RequestParam(required = false, defaultValue = "false") boolean acknowledgeExclusions) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : resolveDefaultDate(branchId);
        return ResponseEntity.ok(service.closeDay(branchId, reportDate, startSessionId, endSessionId, acknowledgeExclusions));
    }

    /** @deprecated OBSOLETE — the Skip Non-Trading Day workflow has been retired in
     *  favor of session-driven Day Close resolution (see {@link PosPendingDayCloseResolver}):
     *  a calendar date with no POS sessions is now simply never surfaced as pending, so
     *  nothing needs to be explicitly skipped. Kept (not removed) purely for API
     *  compatibility with older/cached clients — always responds 410 Gone rather than
     *  writing a new marker row. The frontend must never call this endpoint. */
    @Deprecated
    @PostMapping("/skip-day")
    @PreAuthorize("hasAnyAuthority('SUPERVISOR', 'MANAGER', 'ADMIN', 'ROLE_SUPERVISOR', 'ROLE_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> skipDay(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date,
            @RequestParam String reason) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : resolveDefaultDate(branchId);
        return ResponseEntity.ok(service.skipBusinessDate(branchId, reportDate, reason));
    }

    /** Composed business-date / operating-hours / open-session view for POS mount —
     *  backs the blocking "previous day session still open" popup on late/new logins. */
    @GetMapping("/day-status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<DayStatusResponse> getDayStatus(
            @RequestParam(required = false, defaultValue = "") String terminalId) {
        return ResponseEntity.ok(dayStatusService.getDayStatus(terminalId));
    }

    /** Date-range session history for the X-Report history picker (browse/reprint a past
     *  closed session). branchId defaults to the caller's current branch if omitted. */
    @GetMapping("/history")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PageResponse<PosSessionHistoryItem>> getSessionHistory(
            @RequestParam(required = false) Long branchId,
            @RequestParam String dateFrom,
            @RequestParam String dateTo,
            @RequestParam(required = false) String terminalId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long resolvedBranchId = branchId != null ? branchId : branchAccessService.getRequiredCurrentUserBranch().getId();
        return ResponseEntity.ok(service.getSessionHistory(
                resolvedBranchId, LocalDate.parse(dateFrom), LocalDate.parse(dateTo), terminalId, status, page, size));
    }

    // -------------------------------------------------------------------------
    // Session lifecycle: suspend / resume / supervisor takeover / touch activity
    // -------------------------------------------------------------------------

    @PostMapping("/{id}/suspend")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> suspend(@PathVariable Long id) {
        return ResponseEntity.ok(service.suspendSession(id));
    }

    @PostMapping("/{id}/resume")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> resume(@PathVariable Long id) {
        return ResponseEntity.ok(service.resumeSession(id));
    }

    @PostMapping("/{id}/supervisor-takeover")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> supervisorTakeover(@PathVariable Long id,
                                                          @RequestBody Map<String, Object> body) {
        String pin = body.get("supervisorPin") != null ? body.get("supervisorPin").toString() : null;
        return ResponseEntity.ok(service.supervisorTakeover(id, pin));
    }

    @PostMapping("/{id}/touch-activity")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> touchActivity(@PathVariable Long id) {
        service.touchActivity(id);
        return ResponseEntity.noContent().build();
    }
}
