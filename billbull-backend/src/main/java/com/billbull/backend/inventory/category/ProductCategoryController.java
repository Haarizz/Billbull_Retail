package com.billbull.backend.inventory.category;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.security.ModulePermissionService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/product-categories")
public class ProductCategoryController {

    private static final String MODULE = "inventory.category";

    private final ProductCategoryService service;
    private final ModulePermissionService modulePermissionService;

    public ProductCategoryController(ProductCategoryService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * The pick-list feeds the product form and the quick-add modals (back office and POS), so
     * anyone who can see products or sell may read it, not only Category-module users.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<ProductCategoryResponse> getAll() {
        if (!modulePermissionService.canView(MODULE)
                && !modulePermissionService.canView("inventory.product")
                && !modulePermissionService.canView("sales")) {
            modulePermissionService.requireCanView(MODULE);
        }
        return service.getAll();
    }

    /**
     * Same gate as quick-creating the product itself (ProductController#create): a user who may
     * create the product may also create the category it goes into.
     */
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ProductCategoryResponse create(@Valid @RequestBody ProductCategoryRequest request) {
        if (!modulePermissionService.canCreate(MODULE)
                && !modulePermissionService.canCreate("inventory.product")
                && !modulePermissionService.canView("sales")) {
            modulePermissionService.requireCanCreate(MODULE);
        }
        return service.create(request);
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ProductCategoryResponse update(@PathVariable Long id, @Valid @RequestBody ProductCategoryRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(MODULE);
        service.delete(id);
    }
}
