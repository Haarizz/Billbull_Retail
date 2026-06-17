package com.billbull.backend.financials.generalledger;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/generalledger/journal-entries")
@PreAuthorize("isAuthenticated()")
public class JournalEntryController {

    private static final String MODULE = "finance";

    private final JournalEntryService journalEntryService;
    private final ModulePermissionService modulePermissionService;

    public JournalEntryController(JournalEntryService journalEntryService, ModulePermissionService modulePermissionService) {
        this.journalEntryService = journalEntryService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<JournalEntry>> getManualEntries() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(journalEntryService.getAllEntries().stream()
                .filter(e -> e.getEntryType() == EntryType.MANUAL)
                .collect(java.util.stream.Collectors.toList()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<JournalEntry> getEntryById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(journalEntryService.getEntryById(id));
    }

    @PostMapping("/manual")
    public ResponseEntity<JournalVoucher> createManualEntry(@RequestBody JournalVoucher journalVoucher) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(journalEntryService.createJournalVoucher(journalVoucher));
    }

    @PutMapping("/manual/{id}")
    public ResponseEntity<JournalVoucher> updateManualEntry(
            @PathVariable Long id,
            @RequestBody JournalVoucher journalVoucher) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(journalEntryService.updateJournalVoucher(id, journalVoucher));
    }

    @PostMapping("/{id}/post")
    public ResponseEntity<JournalEntry> postEntry(
            @PathVariable Long id,
            @RequestBody Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String postedBy = payload.get("postedBy");
        return ResponseEntity.ok(journalEntryService.postEntry(id, postedBy));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<JournalVoucher> submitForApproval(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String submittedBy = payload != null ? payload.getOrDefault("submittedBy", "System") : "System";
        return ResponseEntity.ok(journalEntryService.submitForApproval(id, submittedBy));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<JournalVoucher> approveEntry(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String approvedBy = payload != null ? payload.getOrDefault("approvedBy", "System") : "System";
        return ResponseEntity.ok(journalEntryService.approveJournalVoucher(id, approvedBy));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<JournalVoucher> rejectEntry(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String rejectedBy = payload != null ? payload.getOrDefault("rejectedBy", "System") : "System";
        String reason = payload != null ? payload.getOrDefault("reason", "") : "";
        return ResponseEntity.ok(journalEntryService.rejectJournalVoucher(id, rejectedBy, reason));
    }

    @PostMapping("/{id}/void")
    public ResponseEntity<JournalVoucher> voidEntry(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        modulePermissionService.requireCanEdit(MODULE);
        String voidedBy = payload != null ? payload.getOrDefault("voidedBy", "System") : "System";
        return ResponseEntity.ok(journalEntryService.voidJournalVoucher(id, voidedBy));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEntry(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        journalEntryService.deleteJournalVoucher(id);
        return ResponseEntity.noContent().build();
    }
}
