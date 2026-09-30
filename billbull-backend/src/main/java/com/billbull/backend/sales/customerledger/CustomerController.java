package com.billbull.backend.sales.customerledger;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.security.BranchContextHolder;

import java.util.List;

@RestController
@RequestMapping("/api/sales/customer-ledger")
public class CustomerController {

    private static final String MODULE = "sales.customer";
    private static final String CUSTOMER_MODULE = "sales.customer";

    @Autowired
    private CustomerService service;

    @Autowired
    private CustomerImportService importService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private SalesDocumentNumberingService numberingService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    // =========================
    // GET ALL CUSTOMERS
    // BBQA52-024: optional branchName filters by branch allocation
    // =========================
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Customer>> getAllCustomers(
            @RequestParam(required = false) String branchName) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAllCustomers(branchName));
    }

    @GetMapping("/search")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Customer>> search(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "5") int size,
            @RequestParam(defaultValue = "false") boolean preview) {
        modulePermissionService.requireCanView(MODULE);
        // `preview` backs the global search modal's empty-query suggestions and applies
        // only when there is no term; a blank q without it still returns nothing.
        if (preview && (q == null || q.isBlank())) {
            return ResponseEntity.ok(service.preview(size));
        }
        return ResponseEntity.ok(service.search(q).stream().limit(size).toList());
    }

    @GetMapping("/validate-duplicate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Customer>> validateDuplicate(
            @RequestParam(defaultValue = "") String name,
            @RequestParam(defaultValue = "") String mobile,
            @RequestParam(defaultValue = "") String email,
            @RequestParam(defaultValue = "") String trn) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.validateDuplicate(name, mobile, email, trn));
    }


    @GetMapping("/next-code")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, String>> getNextCustomerCode() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(java.util.Map.of("customerCode", numberingService.preview(SalesDocumentType.CUSTOMER)));
    }

    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> importCustomers(@RequestParam("file") MultipartFile file,
            @RequestParam(value = "branchId", required = false) Long branchId) {
        requireCanImportCustomers();
        try {
            return ResponseEntity.ok(importService.importCustomers(file, resolveImportBranchId(branchId)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Import Failed: " + e.getMessage());
        }
    }

    // =========================
    // GET CUSTOMER BY ID
    // =========================
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerDTO> getCustomerById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        CustomerDTO customerDTO = service.getCustomerDtoById(id);
        return ResponseEntity.ok(customerDTO);
    }

    // =========================
    // CREATE / UPDATE CUSTOMER
    // =========================
    @PostMapping(consumes = "application/json", produces = "application/json")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Customer> createOrUpdateCustomer(
            @RequestBody CustomerDTO customerDTO) {
        modulePermissionService.requireCanCreate(MODULE);
        Customer savedCustomer = service.saveCustomer(customerDTO);
        return ResponseEntity.ok(savedCustomer);
    }

    // =========================
    // GET OPENING INVOICES BY CUSTOMER CODE
    // QA-002: used by Receive Money to show outstanding opening invoices
    // =========================
    /**
     * Financial snapshot of one customer, backing the global search details panel.
     *
     * <p>Guarded by {@code sales.customer} — the same permission that gates the customer
     * page these figures already appear on. The arithmetic lives in
     * {@link CustomerService#getCustomerSummary(Long)}; this method only resolves and
     * returns it.
     */
    @GetMapping("/{id}/summary")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CustomerSummaryResponse> getCustomerSummary(@PathVariable Long id) {
        modulePermissionService.requireCanView(CUSTOMER_MODULE);
        CustomerSummaryResponse summary = service.getCustomerSummary(id);
        return summary == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(summary);
    }

    @GetMapping("/by-code/{customerCode}/opening-invoices")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<OpeningInvoice>> getOpeningInvoicesByCode(
            @PathVariable String customerCode) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getOpeningInvoicesByCustomerCode(customerCode));
    }

    // =========================
    // QA-028: ADD A SHIPPING ADDRESS TO AN EXISTING CUSTOMER
    // Used by the inline "+ Add New Address" picker on every sales transaction
    // screen so users don't have to bounce out to the Customer Registry.
    // =========================
    @PostMapping("/{customerId}/saved-addresses")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<SavedAddress>> addSavedAddress(
            @PathVariable Long customerId,
            @RequestBody SavedAddress address) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.addSavedAddress(customerId, address));
    }

    // =========================
    // DELETE CUSTOMER
    // =========================
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteCustomer(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.deleteCustomer(id);
        return ResponseEntity.noContent().build();
    }

    private void requireCanImportCustomers() {
        boolean canImport = modulePermissionService.canCreate(CUSTOMER_MODULE)
                || modulePermissionService.canEdit(CUSTOMER_MODULE)
                || modulePermissionService.canCreate(MODULE)
                || modulePermissionService.canEdit(MODULE);
        if (!canImport) {
            throw new AccessDeniedException("You do not have permission to import customers");
        }
    }

    /**
     * Imported records are assigned to the branch the caller is currently scoped to, so a
     * branch-restricted user can only ever load data into their own branch. An explicit
     * {@code branchId} form field wins (admins importing on behalf of a branch), but only
     * after {@code JwtFilter} has validated it against the caller's allowed branches.
     * Null means the caller is on "All Branches" and the records stay unattributed.
     */
    private Long resolveImportBranchId(Long requestedBranchId) {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (requestedBranchId != null) {
            if (ctx == null || ctx.isAllBranches() || ctx.allowedBranchIds().contains(requestedBranchId)) {
                return requestedBranchId;
            }
            throw new org.springframework.security.access.AccessDeniedException(
                    "Not allowed to import into branch " + requestedBranchId);
        }
        return ctx == null ? null : ctx.activeBranchId();
    }
}
