package com.billbull.backend.financials.generalledger;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
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
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN','ACCOUNTANT')")
public class JournalEntryController {

    private final JournalEntryService journalEntryService;

    public JournalEntryController(JournalEntryService journalEntryService) {
        this.journalEntryService = journalEntryService;
    }

    @GetMapping
    public ResponseEntity<List<JournalEntry>> getManualEntries() {
        return ResponseEntity.ok(journalEntryService.getAllEntries().stream()
                .filter(e -> e.getEntryType() == EntryType.MANUAL)
                .collect(java.util.stream.Collectors.toList()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<JournalEntry> getEntryById(@PathVariable Long id) {
        return ResponseEntity.ok(journalEntryService.getEntryById(id));
    }

    @PostMapping("/manual")
    public ResponseEntity<JournalVoucher> createManualEntry(@RequestBody JournalVoucher journalVoucher) {
        return ResponseEntity.ok(journalEntryService.createJournalVoucher(journalVoucher));
    }

    @PutMapping("/manual/{id}")
    public ResponseEntity<JournalVoucher> updateManualEntry(
            @PathVariable Long id,
            @RequestBody JournalVoucher journalVoucher) {
        return ResponseEntity.ok(journalEntryService.updateJournalVoucher(id, journalVoucher));
    }

    @PostMapping("/{id}/post")
    public ResponseEntity<JournalEntry> postEntry(
            @PathVariable Long id,
            @RequestBody Map<String, String> payload) {
        String postedBy = payload.get("postedBy");
        return ResponseEntity.ok(journalEntryService.postEntry(id, postedBy));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<JournalVoucher> submitForApproval(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        String submittedBy = payload != null ? payload.getOrDefault("submittedBy", "System") : "System";
        return ResponseEntity.ok(journalEntryService.submitForApproval(id, submittedBy));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<JournalVoucher> approveEntry(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        String approvedBy = payload != null ? payload.getOrDefault("approvedBy", "System") : "System";
        return ResponseEntity.ok(journalEntryService.approveJournalVoucher(id, approvedBy));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<JournalVoucher> rejectEntry(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> payload) {
        String rejectedBy = payload != null ? payload.getOrDefault("rejectedBy", "System") : "System";
        String reason = payload != null ? payload.getOrDefault("reason", "") : "";
        return ResponseEntity.ok(journalEntryService.rejectJournalVoucher(id, rejectedBy, reason));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEntry(@PathVariable Long id) {
        journalEntryService.deleteJournalVoucher(id);
        return ResponseEntity.noContent().build();
    }
}
