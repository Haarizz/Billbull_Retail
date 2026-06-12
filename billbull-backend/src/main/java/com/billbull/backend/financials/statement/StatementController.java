package com.billbull.backend.financials.statement;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/financials/statement")
@PreAuthorize("hasAnyRole('ADMIN', 'ACCOUNTANT', 'SALES', 'PURCHASE')")
public class StatementController {

    private static final String MODULE = "finance";

    @Autowired
    private StatementService statementService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @GetMapping
    public ResponseEntity<StatementResponse> getStatement(
            @RequestParam String accountType,
            @RequestParam String accountCode, // For vendor, this receives vendorName
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        modulePermissionService.requireCanView(MODULE);

        StatementResponse response;

        if ("CUSTOMER".equalsIgnoreCase(accountType)) {
            response = statementService.getCustomerStatement(accountCode, startDate, endDate);
        } else if ("VENDOR".equalsIgnoreCase(accountType)) {
            response = statementService.getVendorStatement(accountCode, startDate, endDate);
        } else {
            return ResponseEntity.badRequest().build();
        }

        return ResponseEntity.ok(response);
    }
}
