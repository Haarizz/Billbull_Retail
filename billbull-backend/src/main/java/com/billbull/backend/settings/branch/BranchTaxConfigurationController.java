package com.billbull.backend.settings.branch;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * CRUD surface for {@link BranchTaxConfiguration}. This is the ONLY place tax configuration is
 * edited — POS Settings no longer owns these fields. Every read-side consumer (POS, Sales
 * Invoice, Quotation, Sales Order, Delivery Note, Proforma, Product Pricing, Financials, Reports)
 * should go through {@code BranchTaxResolutionService}, not this controller, except for the
 * Branch Settings UI itself.
 *
 * Branch-scoped like every other cross-branch write path in this codebase — see
 * {@link BranchAccessService#assertTransactionBranchAccessible}, used the same way by
 * {@code SalesInvoiceService}, {@code LpoService}, {@code ProformaService}, etc.
 */
@RestController
@RequestMapping("/api/branches")
@CrossOrigin
public class BranchTaxConfigurationController {

    private final BranchTaxConfigurationService service;
    private final BranchAccessService branchAccessService;
    private final BranchRepository branchRepository;

    public BranchTaxConfigurationController(BranchTaxConfigurationService service,
                                             BranchAccessService branchAccessService,
                                             BranchRepository branchRepository) {
        this.service = service;
        this.branchAccessService = branchAccessService;
        this.branchRepository = branchRepository;
    }

    /** Tax configuration for the current user's branch (used by sales/POS screens as a read-only fallback source). */
    @GetMapping("/tax-configuration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BranchTaxConfigurationResponse> getForCurrentBranch() {
        return ResponseEntity.ok(BranchTaxConfigurationResponse.from(service.getForCurrentBranch()));
    }

    /**
     * Tax configuration for a specific branch (used by the Branch Settings "Tax Configuration"
     * tab). 404s for a branchId that doesn't exist at all — distinct from the service-layer
     * {@code getForBranch}, which stays existence-agnostic since it also backs
     * {@code BranchTaxResolutionService}'s internal resolution path and must always return a
     * usable default there regardless of caller-side data quality.
     */
    @GetMapping("/{branchId}/tax-configuration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BranchTaxConfigurationResponse> getForBranch(@PathVariable Long branchId) {
        branchAccessService.assertTransactionBranchAccessible(branchId, "Branch Tax Configuration");
        if (!branchRepository.existsById(branchId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found: " + branchId);
        }
        return ResponseEntity.ok(BranchTaxConfigurationResponse.from(service.getForBranch(branchId)));
    }

    @PutMapping("/{branchId}/tax-configuration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BranchTaxConfigurationResponse> save(@PathVariable Long branchId,
                                                                 @Valid @RequestBody BranchTaxConfigurationRequest request) {
        branchAccessService.assertTransactionBranchAccessible(branchId, "Branch Tax Configuration");
        return ResponseEntity.ok(BranchTaxConfigurationResponse.from(service.save(branchId, request)));
    }
}
