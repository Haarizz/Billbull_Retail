package com.billbull.backend.inventory.barcode;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/barcode-templates")
public class BarcodeTemplateController {

    private static final String MODULE = "inventory.barcode";

    /** Customer-specific label prices expose negotiated prices: same view rights as the price list. */
    static final String[] CUSTOMER_PRICE_MODULES = { "sales.customer", "sales.settings" };

    private final BarcodeTemplateService service;
    private final ModulePermissionService modulePermissionService;
    private final BarcodeLabelPriceService labelPriceService;

    public BarcodeTemplateController(BarcodeTemplateService service, ModulePermissionService modulePermissionService,
                                     BarcodeLabelPriceService labelPriceService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.labelPriceService = labelPriceService;
    }

    /** The price sources a label can show — the configured price levels included. */
    @GetMapping("/price-sources")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<LabelPriceModels.SourceOption>> priceSources() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(labelPriceService.sources());
    }

    /**
     * The price each label shows, resolved on the server for the chosen source, branch, optional
     * customer and optional pricing quantity. Preview, browser print and Zebra print all use this.
     */
    @PostMapping("/label-prices")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<LabelPriceModels.Response> labelPrices(@RequestBody LabelPriceModels.Request request) {
        modulePermissionService.requireCanView(MODULE);
        if (isCustomerSource(request.getSource())) {
            modulePermissionService.requireCanViewAny(CUSTOMER_PRICE_MODULES);
        }
        return ResponseEntity.ok(labelPriceService.resolve(request));
    }

    private static boolean isCustomerSource(String raw) {
        try {
            return LabelPriceSource.parse(raw).kind() == LabelPriceSource.Kind.CUSTOMER;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BarcodeTemplate>> list() {
        modulePermissionService.requireCanView(MODULE);
        return ResponseEntity.ok(service.getAll());
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BarcodeTemplate> create(@RequestBody BarcodeTemplate template) {
        modulePermissionService.requireCanCreate(MODULE);
        return ResponseEntity.ok(service.create(template));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BarcodeTemplate> update(@PathVariable Long id, @RequestBody BarcodeTemplate template) {
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.update(id, template));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
