package com.billbull.backend.sales.customerledger;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/sales/customer-ledger")
public class CustomerController {

    private static final String MODULE = "sales";

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
            @RequestParam(defaultValue = "5") int size) {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.search(q).stream().limit(size).toList());
    }

    @GetMapping("/next-code")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, String>> getNextCustomerCode() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(java.util.Map.of("customerCode", numberingService.preview(SalesDocumentType.CUSTOMER)));
    }

    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> importCustomers(@RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            return ResponseEntity.ok(importService.importCustomers(file));
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
}
