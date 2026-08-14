package com.billbull.backend.sales.returns;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/returns")
@PreAuthorize("isAuthenticated()")
public class SalesReturnController {

    private static final String MODULE = "sales.return";
    private static final Logger logger = LoggerFactory.getLogger(SalesReturnController.class);

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @Autowired
    private SalesReturnEligibilityService eligibilityService;

    @GetMapping
    public List<SalesReturn> getAllReturns() {
        modulePermissionService.requireCanView(MODULE);
        logger.info("GET /api/sales/returns requested");
        return salesReturnService.getAllReturns();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<SalesReturn> getReturnsPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        modulePermissionService.requireCanView(MODULE);
        java.util.List<SalesReturn> all = (fromDate != null || toDate != null)
                ? salesReturnService.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : salesReturnService.getAllReturns();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/{id}")
    public SalesReturn getReturnById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnById(id);
    }

    @PostMapping
    public SalesReturn saveReturn(@RequestBody SalesReturn salesReturn) {
        modulePermissionService.requireCanCreate(MODULE);
        logger.info("POST /api/sales/returns received: {}", salesReturn.getReturnNumber());
        return salesReturnService.saveReturn(salesReturn);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteReturn(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        salesReturnService.deleteReturn(id);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextReturnNumber() {
        modulePermissionService.requireCanView(MODULE);
        return Map.of("returnNumber", salesReturnService.generateReturnNumber());
    }

    @GetMapping("/stats")
    public Map<String, Object> getReturnStats() {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnStats();
    }

    /**
     * Transitions a return's status. Approving is what actually moves stock, posts to the GL,
     * and pays cash out of the drawer.
     *
     * <p>When policy flags the return for supervisor sign-off (§15), credentials are supplied
     * in the optional request body. They are verified server-side inside the same transaction,
     * before any side effect runs — omitting them on a return that needs approval is rejected,
     * including when the API is called directly (§10).
     *
     * <p>Credentials travel in the body rather than as query parameters so they are never
     * written to access logs, browser history, or a proxy's URL trace.
     */
    @PutMapping("/{id}/status")
    public SalesReturn updateStatus(@PathVariable Long id,
                                    @RequestParam SalesReturnStatus status,
                                    @RequestBody(required = false) StatusChangeRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return salesReturnService.updateStatus(id, status,
                request != null ? request.supervisorUsername : null,
                request != null ? request.supervisorPassword : null);
    }

    /** Optional body for {@link #updateStatus}: supervisor credentials for a gated approval. */
    public static class StatusChangeRequest {
        public String supervisorUsername;
        public String supervisorPassword;
    }

    @GetMapping("/returnable-batches")
    public List<ReturnableBatchResponse> getReturnableBatches(@RequestParam String invoiceNumber) {
        modulePermissionService.requireCanView(MODULE);
        return salesReturnService.getReturnableBatchesForInvoice(invoiceNumber);
    }

    // ---------------------------------------------------------------
    // Shared Sales Return workflow (§8, §9, §12, §14)
    //
    // These endpoints back BOTH entry points — POS → Actions → Return and
    // Customer & Sales → Sales Return. There is deliberately no POS-specific variant
    // (§27); the caller's context travels in the request body at confirmation time.
    // ---------------------------------------------------------------

    /** §8 — Find the original invoice by number, receipt, customer name, code, or mobile. */
    @GetMapping("/invoice-search")
    public List<ReturnInvoiceSearchResult> searchInvoices(@RequestParam String query) {
        modulePermissionService.requireCanView(MODULE);
        return eligibilityService.searchInvoices(query);
    }

    /**
     * §9 — Authoritative eligibility for one invoice, plus every sold line with its
     * returnable ceiling and batch lots. Advisory only: the same checks run again under
     * row locks when the return is confirmed (§29).
     */
    @GetMapping("/eligibility")
    public ReturnEligibilityResponse getEligibility(@RequestParam String invoiceNumber) {
        modulePermissionService.requireCanView(MODULE);
        return eligibilityService.getEligibility(invoiceNumber);
    }

    /**
     * §12/§14 — The condition, reason, and refund-method vocabularies the shared UI renders.
     * Served from the backend so the two entry points cannot drift apart, and so adding a
     * reason never means editing two frontend files.
     */
    @GetMapping("/options")
    public Map<String, Object> getReturnOptions() {
        modulePermissionService.requireCanView(MODULE);
        return Map.of(
                "conditions", Arrays.stream(SalesReturnCondition.values())
                        .map(c -> Map.of(
                                "value", c.name(),
                                "label", toTitleCase(c.name()),
                                "restockable", c.isRestockable()))
                        .toList(),
                "reasons", Arrays.stream(SalesReturnReasonCode.values())
                        .map(r -> Map.of("value", r.name(), "label", r.getLabel()))
                        .toList(),
                "refundMethods", Arrays.stream(SalesReturnRefundMethod.values())
                        .map(m -> Map.of(
                                "value", m.name(),
                                "label", m.getLabel(),
                                "affectsCashDrawer", m.isCashDrawerAffecting()))
                        .toList());
    }

    private static String toTitleCase(String enumName) {
        String lower = enumName.toLowerCase().replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
