package com.billbull.backend.pos.settings;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pos/settings")
@CrossOrigin
public class PosSettingsController {

    private final PosSettingsService service;

    public PosSettingsController(PosSettingsService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> get() {
        return ResponseEntity.ok(service.getForCurrentBranch());
    }

    @GetMapping("/branch/{branchId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> getForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosSettings> save(@RequestBody PosSettings settings) {
        return ResponseEntity.ok(service.save(settings));
    }
}
