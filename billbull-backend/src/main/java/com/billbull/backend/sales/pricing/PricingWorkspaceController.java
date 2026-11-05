package com.billbull.backend.sales.pricing;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.sales.pricing.PricingRulesService.Rules;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.AssignRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.AssignResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.BulkLevelRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.BulkResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CopyRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CustomerBulkRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CustomerBulkResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.CustomerPriceRow;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.HistoryEntry;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.ImportRequest;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.ImportResult;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.LevelCustomer;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.MatrixPage;
import com.billbull.backend.sales.pricing.PricingWorkspaceService.Summary;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.util.PageResponse;

/**
 * Price Levels workspace. Permissions reuse the existing pricing modules: level prices are product
 * data ({@code inventory.product}), levels and pricing rules are a Sales setting
 * ({@code sales.settings}), customers' levels and negotiated prices are customer terms
 * ({@code sales.customer}).
 */
@RestController
@RequestMapping("/api/pricing-workspace")
public class PricingWorkspaceController {

    static final String PRODUCT = PriceLevelController.PRODUCT_MODULE;
    static final String SETTINGS = PriceLevelController.SETTINGS_MODULE;
    static final String CUSTOMER = CustomerProductPriceController.MODULE;

    private final PricingWorkspaceService service;
    private final PricingRulesService rules;
    private final ModulePermissionService permissions;

    public PricingWorkspaceController(PricingWorkspaceService service, PricingRulesService rules,
                                      ModulePermissionService permissions) {
        this.service = service;
        this.rules = rules;
        this.permissions = permissions;
    }

    @GetMapping("/summary")
    @PreAuthorize("isAuthenticated()")
    public Summary summary() {
        permissions.requireCanViewAny(PRODUCT, SETTINGS, CUSTOMER);
        return service.summary();
    }

    @GetMapping("/rules")
    @PreAuthorize("isAuthenticated()")
    public Rules getRules() {
        permissions.requireCanViewAny(PriceLevelController.LIST_MODULES);
        return rules.get();
    }

    @PutMapping("/rules")
    @PreAuthorize("isAuthenticated()")
    public Rules saveRules(@RequestBody Rules body) {
        permissions.requireCanEdit(SETTINGS);
        return rules.save(body);
    }

    /** The product × level price matrix. {@code filter}: ALL, PRICED, UNPRICED, LOW_MARGIN. */
    @GetMapping("/products")
    @PreAuthorize("isAuthenticated()")
    public MatrixPage products(@RequestParam(required = false) String search,
                               @RequestParam(required = false) Long departmentId,
                               @RequestParam(required = false) Long brandId,
                               @RequestParam(required = false) Long branchId,
                               @RequestParam(defaultValue = "ALL") String filter,
                               @RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(PRODUCT, SETTINGS);
        return service.matrix(search, departmentId, brandId, branchId, filter, page, size);
    }

    @GetMapping("/products/{productId}/history")
    @PreAuthorize("isAuthenticated()")
    public List<HistoryEntry> history(@PathVariable Long productId, @RequestParam(defaultValue = "100") int limit) {
        permissions.requireCanViewAny(PRODUCT, SETTINGS, CUSTOMER);
        return service.history(productId, limit);
    }

    @PostMapping("/bulk-update")
    @PreAuthorize("isAuthenticated()")
    public BulkResult bulkUpdate(@RequestBody BulkLevelRequest body) {
        permissions.requireCanEdit(PRODUCT);
        return service.bulkUpdate(body);
    }

    @PostMapping("/import")
    @PreAuthorize("isAuthenticated()")
    public ImportResult importPrices(@RequestBody ImportRequest body) {
        permissions.requireCanEdit(PRODUCT);
        return service.importPrices(body);
    }

    /** Customers on a level; without {@code levelId}, every customer (for picking whom to assign). */
    @GetMapping("/customers")
    @PreAuthorize("isAuthenticated()")
    public PageResponse<LevelCustomer> customers(@RequestParam(required = false) Long levelId,
                                                 @RequestParam(required = false) String search,
                                                 @RequestParam(required = false) String customerGroup,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(CUSTOMER, SETTINGS);
        return service.customers(levelId, search, customerGroup, page, size);
    }

    @GetMapping("/customer-groups")
    @PreAuthorize("isAuthenticated()")
    public List<String> customerGroups() {
        permissions.requireCanViewAny(CUSTOMER, SETTINGS);
        return service.customerGroups();
    }

    @PutMapping("/levels/{levelId}/customers")
    @PreAuthorize("isAuthenticated()")
    public AssignResult assign(@PathVariable Long levelId, @RequestBody AssignRequest body) {
        permissions.requireCanEdit(CUSTOMER);
        return service.assign(levelId, body);
    }

    /** Negotiated prices with cost, base price, margin and discount. {@code status}: ALL, CURRENT, FUTURE, EXPIRED, DISABLED, LIVE. */
    @GetMapping("/customer-prices")
    @PreAuthorize("isAuthenticated()")
    public PageResponse<CustomerPriceRow> customerPrices(@RequestParam(required = false) Long customerId,
                                                         @RequestParam(required = false) String search,
                                                         @RequestParam(defaultValue = "ALL") String status,
                                                         @RequestParam(defaultValue = "false") boolean belowCost,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(CustomerProductPriceController.VIEW_MODULES);
        return service.customerPrices(customerId, search, status, belowCost, page, size);
    }

    @PostMapping("/customer-prices/bulk")
    @PreAuthorize("isAuthenticated()")
    public CustomerBulkResult customerBulk(@RequestBody CustomerBulkRequest body) {
        permissions.requireCanEdit(CUSTOMER);
        return service.customerBulk(body);
    }

    @PostMapping("/customer-prices/copy")
    @PreAuthorize("isAuthenticated()")
    public CustomerBulkResult copy(@RequestBody CopyRequest body) {
        permissions.requireCanEdit(CUSTOMER);
        return service.copy(body);
    }
}
