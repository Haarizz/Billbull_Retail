package com.billbull.backend.pos.salesorder;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.security.ModulePermissionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * POS → Orders: the Sales Orders a cashier can take up at the till. See {@link PosSalesOrderService}.
 */
@RestController
@RequestMapping("/api/pos/sales-orders")
public class PosSalesOrderController {

    private final PosSalesOrderService service;
    private final ModulePermissionService modulePermissionService;

    public PosSalesOrderController(PosSalesOrderService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * GET /api/pos/sales-orders?source=SALES|SAVED — SALES (default) lists orders confirmed in
     * Customers &amp; Sales; SAVED lists draft orders such as the till's own "Save as Order".
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosSalesOrderResponse> list(@RequestParam(defaultValue = "SALES") String source) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        return service.listOpen(source);
    }
}
