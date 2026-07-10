package com.billbull.backend.pos.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/pos/sessions")
@CrossOrigin
public class PosSessionController {

    private final PosSessionService service;
    private final ObjectMapper objectMapper;

    public PosSessionController(PosSessionService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/open")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSession> openSession(@RequestBody Map<String, Object> body) {
        String terminalId = body.getOrDefault("terminalId", "").toString();
        String counterName = body.getOrDefault("counterName", "Main Counter").toString();
        BigDecimal openingCash = body.get("openingCash") != null
                ? new BigDecimal(body.get("openingCash").toString()) : BigDecimal.ZERO;
        return ResponseEntity.ok(service.openSession(terminalId, counterName, openingCash));
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
        return ResponseEntity.ok(service.addCashMovement(id, type, amount, description));
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
            @RequestParam(required = false) String date) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : LocalDate.now();
        return ResponseEntity.ok(service.getZReport(branchId, reportDate));
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
        LocalDate reportDate = date != null ? LocalDate.parse(date) : LocalDate.now();
        service.assertZReportPrintable(branchId, reportDate);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/close-day")
    @PreAuthorize("hasAnyAuthority('SUPERVISOR', 'MANAGER', 'ADMIN', 'ROLE_SUPERVISOR', 'ROLE_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> closeDay(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : LocalDate.now();
        return ResponseEntity.ok(service.closeDay(branchId, reportDate));
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
