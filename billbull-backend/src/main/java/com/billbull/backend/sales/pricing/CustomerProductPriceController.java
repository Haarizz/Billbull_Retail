package com.billbull.backend.sales.pricing;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.sales.pricing.CustomerProductPriceService.CustomerStatus;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.EffectivePrices;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceRequest;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceResponse;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.PageResponse;

/**
 * Customer-specific (negotiated) prices — Pricing Phase 2.
 *
 * <p>Permissions reuse existing modules: negotiated prices are customer commercial terms, so
 * managing them needs {@code sales.customer} edit (delete to remove one); reading them needs
 * {@code sales.customer} or {@code sales.settings} view. Pricing a cart with them goes through
 * {@code POST /api/pricing/resolve}, open to every selling screen.
 */
@RestController
@RequestMapping("/api/customer-prices")
public class CustomerProductPriceController {

    static final String MODULE = "sales.customer";
    static final String[] VIEW_MODULES = { "sales.customer", "sales.settings" };

    private final CustomerProductPriceService service;
    private final ModulePermissionService permissions;
    private final BranchAccessService branchAccessService;
    private final SalesSettingsService salesSettingsService;

    public CustomerProductPriceController(CustomerProductPriceService service, ModulePermissionService permissions,
                                          BranchAccessService branchAccessService,
                                          SalesSettingsService salesSettingsService) {
        this.service = service;
        this.permissions = permissions;
        this.branchAccessService = branchAccessService;
        this.salesSettingsService = salesSettingsService;
    }

    /** Negotiated prices (optionally one customer's), newest validity first per product. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public PageResponse<PriceResponse> list(@RequestParam(required = false) Long customerId,
                                            @RequestParam(required = false) String search,
                                            @RequestParam(defaultValue = "false") boolean currentOnly,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(VIEW_MODULES);
        return service.search(customerId, search, currentOnly, page, size);
    }

    /** One customer's negotiated prices. */
    @GetMapping("/customers/{customerId}")
    @PreAuthorize("isAuthenticated()")
    public PageResponse<PriceResponse> forCustomer(@PathVariable Long customerId,
                                                   @RequestParam(required = false) String search,
                                                   @RequestParam(defaultValue = "false") boolean currentOnly,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "25") int size) {
        permissions.requireCanViewAny(VIEW_MODULES);
        return service.search(customerId, search, currentOnly, page, size);
    }

    /** Whether a customer has any enabled negotiated prices. Open to the selling screens. */
    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public CustomerStatus status(@RequestParam(required = false) Long customerId,
                                 @RequestParam(required = false) String customerCode) {
        String[] modules = new String[PricingController.SELLING_MODULES.length + VIEW_MODULES.length];
        System.arraycopy(PricingController.SELLING_MODULES, 0, modules, 0, PricingController.SELLING_MODULES.length);
        System.arraycopy(VIEW_MODULES, 0, modules, PricingController.SELLING_MODULES.length, VIEW_MODULES.length);
        permissions.requireCanViewAny(modules);
        return service.status(customerId, customerCode);
    }

    /**
     * Each product's effective price for the customer (negotiated price, else level / default) on a
     * branch the caller can access — the caller's current branch unless one is named.
     */
    @GetMapping("/effective")
    @PreAuthorize("isAuthenticated()")
    public EffectivePrices effective(@RequestParam Long customerId,
                                     @RequestParam String productIds,
                                     @RequestParam(required = false) Long branchId,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        permissions.requireCanViewAny(VIEW_MODULES);
        List<Long> ids = Arrays.stream(productIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(CustomerProductPriceController::parseId)
                .distinct().limit(200).toList();
        Long branch = branchId;
        if (branch != null) {
            BranchScope.assertCanAccess(branch);
        } else {
            branch = BranchScope.currentBranchId();
            if (branch == null) {
                Branch own = branchAccessService.getCurrentUserBranchOrNull();
                branch = own != null ? own.getId() : null;
            }
        }
        return service.effective(customerId, ids, branch, date, backOfficePolicy());
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PriceResponse get(@PathVariable Long id) {
        permissions.requireCanViewAny(VIEW_MODULES);
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public PriceResponse create(@RequestBody PriceRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PriceResponse update(@PathVariable Long id, @RequestBody PriceRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.update(id, request);
    }

    @PatchMapping("/{id}/enabled")
    @PreAuthorize("isAuthenticated()")
    public PriceResponse setEnabled(@PathVariable Long id, @RequestParam boolean enabled) {
        permissions.requireCanEdit(MODULE);
        return service.setEnabled(id, enabled);
    }

    /** Stops the price applying from today, keeping it on record. */
    @PostMapping("/{id}/discontinue")
    @PreAuthorize("isAuthenticated()")
    public PriceResponse discontinue(@PathVariable Long id) {
        permissions.requireCanEdit(MODULE);
        return service.discontinue(id);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        permissions.requireCanDelete(MODULE);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private SalesItemPricePolicy backOfficePolicy() {
        SalesSettings settings = salesSettingsService.getSettings();
        return settings != null && settings.getSalesItemPricePolicy() != null
                ? settings.getSalesItemPricePolicy() : SalesItemPricePolicy.RETAIL;
    }

    private static Long parseId(String s) {
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException ex) {
            throw new PricingException("Invalid product id: " + s);
        }
    }
}
