package com.billbull.backend.sales.advance;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One-off admin maintenance endpoint: reconciles advances recorded before the
 * advance-application flow existed (see AdvanceBackfillService). Not part of
 * any regular user-facing flow — run manually, once, per environment.
 */
@RestController
@RequestMapping("/api/sales/advance-applications/backfill")
@PreAuthorize("hasRole('ADMIN')")
public class AdvanceBackfillController {

    private final AdvanceBackfillService backfillService;

    public AdvanceBackfillController(AdvanceBackfillService backfillService) {
        this.backfillService = backfillService;
    }

    @PostMapping
    public ResponseEntity<AdvanceBackfillService.BackfillSummary> runForAllCustomers() {
        return ResponseEntity.ok(backfillService.runForAllCustomers());
    }

    @PostMapping("/customer/{customerCode}")
    public ResponseEntity<AdvanceBackfillService.CustomerBackfillResult> runForCustomer(
            @PathVariable String customerCode) {
        return ResponseEntity.ok(backfillService.runForCustomerSafely(customerCode));
    }
}
