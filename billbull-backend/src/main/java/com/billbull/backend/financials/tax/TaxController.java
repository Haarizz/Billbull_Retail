package com.billbull.backend.financials.tax;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/financials/tax")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class TaxController {

    private static final String MODULE = "finance";

    private final TaxService taxService;
    private final AuditLogService auditLogService;
    private final ModulePermissionService modulePermissionService;

    // --- Configurations ---

    @GetMapping("/configs")
    public List<TaxConfiguration> getAllConfigs() {
        modulePermissionService.requireCanView(MODULE);
        return taxService.getAllConfigs();
    }

    /**
     * Lightweight endpoint returning the active VAT rate registered in Tax
     * Compliance. Sales pages fall back to this when a product has no
     * per-item Sales Tax % set. Returns { rate: null } when no Active VAT
     * configuration exists.
     */
    @GetMapping("/active-vat-rate")
    public java.util.Map<String, Object> getActiveVatRate() {
        modulePermissionService.requireCanView(MODULE);
        return taxService.getActiveVatRate()
                .<java.util.Map<String, Object>>map(rate -> java.util.Map.of("rate", rate))
                .orElseGet(() -> {
                    java.util.HashMap<String, Object> m = new java.util.HashMap<>();
                    m.put("rate", null);
                    return m;
                });
    }

    @PostMapping("/configs")
    public TaxConfiguration createConfig(@RequestBody TaxConfiguration config) {
        modulePermissionService.requireCanCreate(MODULE);
        return taxService.saveConfig(config);
    }

    @PutMapping("/configs/{id}")
    public ResponseEntity<TaxConfiguration> updateConfig(@PathVariable Long id, @RequestBody TaxConfiguration config) {
        modulePermissionService.requireCanEdit(MODULE);
        config.setId(id);
        return ResponseEntity.ok(taxService.saveConfig(config));
    }

    @DeleteMapping("/configs/{id}")
    public ResponseEntity<Void> deleteConfig(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        taxService.deleteConfig(id);
        return ResponseEntity.ok().build();
    }

    // --- Filings ---

    @GetMapping("/filings")
    public List<TaxFilingDTO> getAllFilings() {
        modulePermissionService.requireCanView(MODULE);
        return taxService.getAllFilings();
    }

    @PutMapping("/filings/{id}")
    public ResponseEntity<TaxFiling> updateFiling(@PathVariable Long id, @RequestBody TaxFiling filing) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(taxService.updateFiling(id, filing));
    }

    @PostMapping(value = "/filings/{id}/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TaxFilingDTO> uploadDocument(
            @PathVariable Long id,
            @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(taxService.uploadDocument(id, file));
    }

    @DeleteMapping("/filings/{id}/document")
    public ResponseEntity<TaxFilingDTO> deleteDocument(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(taxService.removeDocument(id));
    }

    @GetMapping("/filings/{id}/document")
    public ResponseEntity<org.springframework.core.io.Resource> downloadDocument(@PathVariable Long id) {
        modulePermissionService.requireCanExport(MODULE);
        org.springframework.core.io.Resource resource = taxService.loadDocument(id);

        // Try to determine filename, fallback if needed
        String filename = resource.getFilename();
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(resource);
    }
}
