package com.billbull.backend.pos.offline;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * M3 Standalone POS offline MVP endpoints. Every call needs a signed-in user with the till
 * permission; the branch is the request's resolved branch (X-Branch-Id), and every record or lease
 * is checked against it. See docs/standalone-pos/OFFLINE_MVP.md.
 */
@RestController
@RequestMapping("/api/pos/offline")
public class PosOfflineController {

    private final PosOfflineLeaseService leaseService;
    private final PosOfflineCatalogService catalogService;
    private final PosOfflineIngestService ingestService;
    private final PosOfflineRepository repo;
    private final PosOfflineSettings settings;
    private final ModulePermissionService modulePermissionService;

    public PosOfflineController(PosOfflineLeaseService leaseService, PosOfflineCatalogService catalogService,
                                PosOfflineIngestService ingestService, PosOfflineRepository repo,
                                PosOfflineSettings settings, ModulePermissionService modulePermissionService) {
        this.leaseService = leaseService;
        this.catalogService = catalogService;
        this.ingestService = ingestService;
        this.repo = repo;
        this.settings = settings;
        this.modulePermissionService = modulePermissionService;
    }

    private void requireTill() {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
    }

    private Long enabledBranch() {
        Long branchId = leaseService.currentBranchId();
        if (!settings.enabledFor(branchId)) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_DISABLED", "Offline selling is not enabled for this branch.");
        }
        return branchId;
    }

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> status(@RequestParam String terminalId) {
        requireTill();
        return leaseService.status(terminalId);
    }

    /** Body: {terminalId, publicKeySpki}. Administrator only. */
    @PostMapping("/keys")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> enroll(@RequestBody Map<String, String> body) {
        requireTill();
        return leaseService.enroll(body.get("terminalId"), body.get("publicKeySpki"));
    }

    @GetMapping("/catalog")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> catalog() {
        requireTill();
        return catalogService.build(enabledBranch());
    }

    /** Body: {terminalId, sessionId, catalogVersion}. */
    @PostMapping("/leases")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> issueLease(@RequestBody Map<String, Object> body) {
        requireTill();
        Object session = body.get("sessionId");
        return leaseService.issue((String) body.get("terminalId"),
                session == null ? null : Long.valueOf(String.valueOf(session)),
                body.get("catalogVersion") == null ? null : String.valueOf(body.get("catalogVersion")));
    }

    /** Body: {summary: {...signed...}, sig}. */
    @PostMapping("/leases/{leaseId}/close")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> closeLease(@PathVariable UUID leaseId, @RequestBody JsonNode body) {
        requireTill();
        return leaseService.close(leaseId, body.path("summary"), body.path("sig").asText(null));
    }

    /** Body: {reason}. Administrator only. */
    @PostMapping("/leases/{leaseId}/abandon")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> abandonLease(@PathVariable UUID leaseId, @RequestBody Map<String, String> body) {
        requireTill();
        return leaseService.abandon(leaseId, body.get("reason"));
    }

    /** Body: {records: [{record, sig}, ...]} in sequence order. Answers one result per record. */
    @PostMapping("/sales")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> ingest(@RequestBody JsonNode body) {
        requireTill();
        JsonNode records = body.path("records");
        if (!records.isArray() || records.size() > 100) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "BATCH_INVALID", "Send 1 to 100 records per request.");
        }
        List<JsonNode> list = new java.util.ArrayList<>();
        records.forEach(list::add);
        return Map.of("results", ingestService.ingest(list));
    }

    /** The branch's offline records that need a supervisor (held, blocked or not yet posted). */
    @GetMapping("/sales/review")
    @PreAuthorize("isAuthenticated()")
    public List<Map<String, Object>> review() {
        requireTill();
        Long branchId = leaseService.currentBranchId();
        return repo.findReviewQueue(branchId).stream().map(s -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("recordId", s.id());
            m.put("leaseId", s.leaseId());
            m.put("terminalId", s.terminalId());
            m.put("sessionId", s.sessionId());
            m.put("seq", s.localSeq());
            m.put("totalMinor", s.totalMinor());
            m.put("state", s.state());
            m.put("code", s.reasonCode());
            m.put("detail", s.reasonDetail());
            m.put("receivedAt", s.receivedAt().toString());
            return m;
        }).toList();
    }

    @ExceptionHandler(PosOfflineRefusal.class)
    public ResponseEntity<Map<String, Object>> refused(PosOfflineRefusal ex) {
        return ResponseEntity.status(ex.status()).body(ex.body());
    }
}
