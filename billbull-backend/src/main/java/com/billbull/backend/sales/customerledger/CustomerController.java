package com.billbull.backend.sales.customerledger;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sales/customer-ledger")
@CrossOrigin(origins = "http://localhost:3000")
public class CustomerController {

    @Autowired
    private CustomerService service;

    @Autowired
    private AuditLogService auditLogService;

    // =========================
    // GET ALL CUSTOMERS
    // =========================
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public ResponseEntity<List<Customer>> getAllCustomers() {
        List<Customer> customers = service.getAllCustomers();
        return ResponseEntity.ok(customers);
    }

    // =========================
    // GET CUSTOMER BY ID
    // =========================
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','ACCOUNTANT')")
    public ResponseEntity<CustomerDTO> getCustomerById(@PathVariable Long id) {
        CustomerDTO customerDTO = service.getCustomerDtoById(id);
        return ResponseEntity.ok(customerDTO);
    }

    // =========================
    // CREATE / UPDATE CUSTOMER
    // =========================
    @PostMapping(consumes = "application/json", produces = "application/json")
    @PreAuthorize("hasAnyRole('ADMIN','SALES')")
    public ResponseEntity<Customer> createOrUpdateCustomer(
            @RequestBody CustomerDTO customerDTO) {

        Customer savedCustomer = service.saveCustomer(customerDTO);
        return ResponseEntity.ok(savedCustomer);
    }

    // =========================
    // DELETE CUSTOMER
    // =========================
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteCustomer(@PathVariable Long id) {
        service.deleteCustomer(id);
        return ResponseEntity.noContent().build();
    }
}