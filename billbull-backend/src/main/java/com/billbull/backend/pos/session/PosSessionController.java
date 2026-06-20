package com.billbull.backend.pos.session;

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

    public PosSessionController(PosSessionService service) {
        this.service = service;
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
        return ResponseEntity.ok(service.closeSession(id, closingCash, notes));
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

    @GetMapping("/z-report")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getZReport(
            @RequestParam Long branchId,
            @RequestParam(required = false) String date) {
        LocalDate reportDate = date != null ? LocalDate.parse(date) : LocalDate.now();
        return ResponseEntity.ok(service.getZReport(branchId, reportDate));
    }
}
