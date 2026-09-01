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

import com.billbull.backend.pos.auth.PosCredentialVerificationService;
import com.billbull.backend.pos.auth.PosSessionAuthorizationService;
import com.billbull.backend.pos.auth.CredentialVerificationResult;
import com.billbull.backend.pos.auth.AuthorizationResult;
import com.billbull.backend.pos.auth.ClosureAuthorizationRequest;
import com.billbull.backend.pos.auth.PosClosureAuthorizationRegistry;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/pos/sessions")
@CrossOrigin
public class PosSessionController {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(PosSessionController.class);

    private final PosSessionService service;
    private final PosSessionSyncService syncService;
    private final ObjectMapper objectMapper;
    private final PosDayStatusService dayStatusService;
    private final PosPendingDayCloseResolver pendingDayCloseResolver;
    private final BranchAccessService branchAccessService;
    private final PosAuthorizationService authorizationService;
    private final PosCredentialVerificationService credentialVerificationService;
    private final PosSessionAuthorizationService sessionAuthorizationService;
    private final PosClosureAuthorizationRegistry closureAuthorizationRegistry;

    public PosSessionController(PosSessionService service, PosSessionSyncService syncService, ObjectMapper objectMapper,
                                 PosDayStatusService dayStatusService,
                                 PosPendingDayCloseResolver pendingDayCloseResolver,
                                 BranchAccessService branchAccessService,
                                 PosAuthorizationService authorizationService,
                                 PosCredentialVerificationService credentialVerificationService,
                                 PosSessionAuthorizationService sessionAuthorizationService,
                                 PosClosureAuthorizationRegistry closureAuthorizationRegistry) {
        this.service = service;
        this.syncService = syncService;
        this.objectMapper = objectMapper;
        this.dayStatusService = dayStatusService;
        this.pendingDayCloseResolver = pendingDayCloseResolver;
        this.branchAccessService = branchAccessService;
        this.authorizationService = authorizationService;
        this.credentialVerificationService = credentialVerificationService;
        this.sessionAuthorizationService = sessionAuthorizationService;
        this.closureAuthorizationRegistry = closureAuthorizationRegistry;
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
        } catch (com.billbull.backend.pos.businessdate.BusinessDayClosedException ex) {
            // The Business Day's extension period has expired. 423 LOCKED rather than
            // 409 CONFLICT: nothing about the request conflicts with server state and
            // retrying differently cannot help — the resource is temporarily locked
            // until the next Business Day starts. Keeping it off 409 also means the
            // POS's existing session-conflict handling does not mistake a scheduled
            // closure for a terminal/session collision.
            return ResponseEntity.status(HttpStatus.LOCKED).body(ex.getResponse());
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
        // Counted Cash is derived server-side from the denomination quantities. A legacy client
        // may still send closingCash; it is logged and dropped here and never reaches the
        // service, so it cannot influence any persisted financial value. Accepting-and-ignoring
        // is safe precisely because the server recomputes -- unlike the retired terminalId,
        // where ignoring would have created unattributed cash, here the stale field has no
        // path to the total at all. Rejecting would instead take every un-reloaded till out of
        // service mid-shift for no financial benefit.
        if (body != null && body.get("closingCash") != null) {
            log.warn("[PosSession] Session {} close supplied a client closingCash ({}); ignoring it. "
                            + "Counted Cash is computed from the submitted denominations.",
                    id, body.get("closingCash"));
        }
        String notes = body != null ? (String) body.get("notes") : null;
        // `supervisorApproved` is no longer read at all. It was once the sole input to the
        // variance gate -- a client boolean with no credentials and no approver identity behind
        // it. Authorization now comes from a server-issued grant; a stale client may still send
        // the flag and it has no effect whatsoever.
        Map<String, Object> closingDenominations = asDenominationMap(
                body != null ? body.get("closingDenominations") : null);
        String currencyCode = body != null && body.get("currencyCode") != null
                ? body.get("currencyCode").toString() : null;
        String cardBatchNo = body != null ? (String) body.get("cardBatchNo") : null;
        Boolean cardSettlementVerified = body != null ? (Boolean) body.get("cardSettlementVerified") : null;
        BigDecimal cardClosingCash = body != null && body.get("cardClosingCash") != null
                ? new BigDecimal(body.get("cardClosingCash").toString()) : null;
        String closingCashierName = body != null ? (String) body.get("closingCashierName") : null;
        String closingSupervisorName = body != null ? (String) body.get("closingSupervisorName") : null;
        String closingRemarks = body != null ? (String) body.get("closingRemarks") : null;
        String closureAuthToken = body != null ? (String) body.get("closureAuthToken") : null;
        String varianceApprovalToken = body != null ? (String) body.get("varianceApprovalToken") : null;
        return ResponseEntity.ok(service.closeSession(id, closingDenominations, currencyCode, notes,
                cardBatchNo, cardSettlementVerified, cardClosingCash,
                closingCashierName, closingSupervisorName, closingRemarks, closureAuthToken,
                varianceApprovalToken));
    }

    /**
     * Starts the closure workflow — the backend half of the dashboard's "Close Session"
     * action. The session stays OPEN; what changes is that normal POS work on it is now
     * refused until it is closed (or a supervisor cancels the closure).
     *
     * <p>Called only from that explicit action. The X-Report tile/view must never call it:
     * an X-Report is informational and must leave the till fully operational.
     *
     * <p>Idempotent — a repeated call returns the existing closure state unchanged.
     */
    @PostMapping("/{id}/begin-closure")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> beginClosure(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        String closureAuthToken = body != null ? (String) body.get("closureAuthToken") : null;
        return ResponseEntity.ok(service.beginClosure(id, closureAuthToken));
    }

    /**
     * Cancels a started closure workflow, returning the session to normal operation.
     * Supervisor-only — see {@code PosSessionAuthorizationService#authorizeClosureCancellation};
     * owning the session is deliberately not sufficient, or a cashier told to close out could
     * simply put the till back into service.
     *
     * <p>Optional {@code usernameOrEmail}/{@code password} let a supervisor authorize at a
     * till the cashier is logged into, verified through the same credential service the
     * Session Owner Verification modal uses. Omit them when the supervisor is themselves the
     * logged-in user.
     */
    @PostMapping("/{id}/cancel-closure")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> cancelClosure(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        String reason = body != null ? (String) body.get("reason") : null;
        String usernameOrEmail = body != null ? (String) body.get("usernameOrEmail") : null;
        String password = body != null ? (String) body.get("password") : null;
        return ResponseEntity.ok(service.cancelClosure(id, reason, usernameOrEmail, password));
    }

    @PostMapping("/{id}/authorize-closure")
    public ResponseEntity<AuthorizationResult> authorizeClosure(
            @PathVariable Long id,
            @RequestBody ClosureAuthorizationRequest request) {
        
        PosSession session = service.getById(id);
        
        CredentialVerificationResult cred = credentialVerificationService.verifyCredentials(
                request.getUsernameOrEmail(), request.getPassword());
                
        if (!cred.valid()) {
            return ResponseEntity.ok(AuthorizationResult.unauthorized("INVALID_CREDENTIALS", cred.message()));
        }
        
        AuthorizationResult auth = sessionAuthorizationService.authorizeSessionClose(session, cred.user());
        if (!auth.authorized()) {
            return ResponseEntity.ok(auth);
        }
        // Hand back a single-use grant so the close call that follows can prove this
        // verification happened, without the client re-sending the owner's password.
        return ResponseEntity.ok(auth.withToken(closureAuthorizationRegistry.issue(id, cred.user().getId())));
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
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> closeDay(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) Long startSessionId,
            @RequestParam(required = false) Long endSessionId,
            @RequestParam(required = false, defaultValue = "false") boolean acknowledgeExclusions) {
        authorizationService.authorizeDayClose(branchId);
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

    /**
     * The submitted denomination quantities, or {@code null} when none were sent.
     *
     * <p>{@code null} means "no count was taken" and must stay distinguishable from an empty
     * object, which means "counted, and the drawer held nothing".
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> asDenominationMap(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Map<?, ?> map) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
            return out;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "closingDenominations must be an object of denomination-to-quantity entries, "
                        + "for example {\"500\": 2, \"100\": 3}.");
    }

    /**
     * Authorizes a cash variance so the session can be closed.
     *
     * <p>Mirrors {@code authorize-closure}: a supervisor's credentials are verified here, and the
     * caller receives an opaque single-use token to spend on the close that follows. The
     * supervisor's password therefore crosses the wire once, and the close request carries proof
     * of authorization rather than a self-asserted flag.
     *
     * <p>The grant is bound to the exact figures supplied. If the drawer is recounted afterwards,
     * the token no longer matches what is being closed and is refused — an approval for a small
     * discrepancy cannot be spent on a large one.
     *
     * <p>{@code expectedCash} and {@code countedCash} are NOT taken from the request: they are
     * recomputed here from the authoritative reconciliation and the submitted denominations, so a
     * client cannot obtain a grant for figures it invented.
     */
    @PostMapping("/{id}/authorize-variance")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> authorizeVariance(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {

        String usernameOrEmail = body != null ? (String) body.get("usernameOrEmail") : null;
        String password = body != null ? (String) body.get("password") : null;
        String reason = body != null ? (String) body.get("reason") : null;
        Map<String, Object> denominations = asDenominationMap(
                body != null ? body.get("closingDenominations") : null);
        String currencyCode = body != null && body.get("currencyCode") != null
                ? body.get("currencyCode").toString() : null;

        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason is required to authorize a cash variance.");
        }

        CredentialVerificationResult cred =
                credentialVerificationService.verifyCredentials(usernameOrEmail, password);
        if (!cred.valid()) {
            return ResponseEntity.ok(Map.of(
                    "authorized", false, "code", "INVALID_CREDENTIALS", "message", cred.message()));
        }

        return ResponseEntity.ok(service.authorizeVariance(id, denominations, currencyCode,
                cred.user(), reason));
    }
}
