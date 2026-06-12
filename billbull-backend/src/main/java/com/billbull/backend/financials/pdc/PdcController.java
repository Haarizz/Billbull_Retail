package com.billbull.backend.financials.pdc;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pdcs")
public class PdcController {

    private static final String MODULE = "finance";

    private final PdcService pdcService;
    private final ModulePermissionService modulePermissionService;

    public PdcController(PdcService pdcService, ModulePermissionService modulePermissionService) {
        this.pdcService = pdcService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    public ResponseEntity<List<PdcEntry>> getAllPdcs() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(pdcService.getAllPdcs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PdcEntry> getPdc(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(pdcService.getPdc(id));
    }

    @PostMapping("/receive")
    public ResponseEntity<PdcEntry> receivePdc(@RequestBody PdcEntry pdc) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(pdcService.receivePdc(pdc));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<PdcEntry> updateStatus(@PathVariable Long id, @RequestParam PdcStatus status) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(pdcService.updateStatus(id, status));
    }
}
