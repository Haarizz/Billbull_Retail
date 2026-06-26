package com.billbull.backend.inventory.product;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import com.billbull.backend.security.ModulePermissionService;

import com.billbull.backend.security.AuditLogService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService service;
    private final ObjectMapper objectMapper;
    private final AuditLogService auditLogService;
    private final ProductExportService exportService;
    private final ProductImportService importService;
    private final ModulePermissionService modulePermissionService;

    public ProductController(ProductService service, ObjectMapper objectMapper, AuditLogService auditLogService,
            ProductExportService exportService, ProductImportService importService,
            ModulePermissionService modulePermissionService) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
        this.exportService = exportService;
        this.importService = importService;
        this.modulePermissionService = modulePermissionService;
    }

    // -------------------------------------------------
    // IMPORT FROM EXCEL
    // -------------------------------------------------
    @PostMapping(value = "/import/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> importFromExcel(@RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanCreate("inventory");
        try {
            String result = importService.importProducts(file);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Import Failed: " + e.getMessage());
        }
    }

    @PostMapping(value = "/import/excel/start", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductImportService.ImportJobStatus> startImportFromExcel(
            @RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanCreate("inventory");
        return ResponseEntity.ok(importService.startImport(file));
    }

    @GetMapping("/import/excel/progress/{jobId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductImportService.ImportJobStatus> getImportProgress(@PathVariable String jobId) {
        modulePermissionService.requireCanView("inventory");
        return ResponseEntity.ok(importService.getImportJobStatus(jobId));
    }

    // -------------------------------------------------
    // CREATE (Multipart)
    // -------------------------------------------------
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductAggregateResponse> create(
            @RequestPart("data") String data,
            @RequestPart(value = "file", required = false) MultipartFile file) throws JsonProcessingException {
        // Manually parse the JSON string into the Request object
        modulePermissionService.requireCanCreate("inventory");
        ProductAggregateRequest request = objectMapper.readValue(data, ProductAggregateRequest.class);
        return ResponseEntity.ok(service.create(request, file));
    }

    // -------------------------------------------------
    // EXPORT TO EXCEL
    // -------------------------------------------------
    @GetMapping("/export/excel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<org.springframework.core.io.Resource> exportToExcel() {
        modulePermissionService.requireCanExport("inventory");
        List<ProductAggregateResponse> products = service.getAll();
        java.io.ByteArrayInputStream in = exportService.export(products);

        org.springframework.core.io.InputStreamResource file = new org.springframework.core.io.InputStreamResource(in);

        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=products.xlsx")
                .contentType(
                        MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(file);
    }

    // -------------------------------------------------
    // GET LIST (optimised — 4 queries total, supports pagination)
    // -------------------------------------------------
    @GetMapping("/list")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Object>> listPaged(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long brandId) {
        modulePermissionService.requireCanView("inventory");
        return ResponseEntity.ok(service.getList(page, size, search, warehouseId, departmentId, brandId));
    }

    // -------------------------------------------------
    // GET ALL (kept for backward-compat — edit/detail screens)
    // -------------------------------------------------
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ProductAggregateResponse>> list() {
        return ResponseEntity.ok(service.getAll());
    }

    // -------------------------------------------------
    // SEARCH EXACT (Returns full Aggregation Response for Barcode Printer / complex
    // pickers)
    // -------------------------------------------------
    @GetMapping("/search")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ProductAggregateResponse>> searchExact(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok(service.searchProducts(q));
    }

    @GetMapping("/validate-duplicate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ProductAggregateResponse>> validateDuplicate(
            @RequestParam(defaultValue = "") String name,
            @RequestParam(defaultValue = "") String code,
            @RequestParam(defaultValue = "") String sku,
            @RequestParam(defaultValue = "") String barcode) {
        modulePermissionService.requireCanView("inventory");
        return ResponseEntity.ok(service.validateDuplicate(name, code, sku, barcode));
    }


    @GetMapping("/by-barcode")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ProductAggregateResponse>> getByBarcode(@RequestParam String barcode) {
        return ResponseEntity.ok(service.searchProductsByBarcode(barcode));
    }

    // -------------------------------------------------
    // FAVOURITES
    // -------------------------------------------------
    @PostMapping("/{productId}/favourite")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> addFavourite(@PathVariable Long productId) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        service.addFavourite(productId, username);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{productId}/favourite")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> removeFavourite(@PathVariable Long productId) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        service.removeFavourite(productId, username);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/favourites")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Object>> getFavourites(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok(service.getFavouriteProducts(username, page, size));
    }

    // -------------------------------------------------
    // RECENTLY SOLD
    // -------------------------------------------------
    @GetMapping("/recently-sold")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Object>> getRecentlySold(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(service.getRecentlySold(page, size));
    }

    // -------------------------------------------------
    // TOP SOLD
    // -------------------------------------------------
    @GetMapping("/top-sold")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Object>> getTopSold(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(service.getTopSold(page, size));
    }

    // -------------------------------------------------
    // GET BY ID
    // -------------------------------------------------
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductAggregateResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    // -------------------------------------------------
    // UPDATE (Multipart)
    // -------------------------------------------------
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ProductAggregateResponse> update(
            @PathVariable Long id,
            @RequestPart("data") String data,
            @RequestPart(value = "file", required = false) MultipartFile file) throws JsonProcessingException {
        modulePermissionService.requireCanEdit("inventory");
        ProductAggregateRequest request = objectMapper.readValue(data, ProductAggregateRequest.class);
        return ResponseEntity.ok(service.update(id, request, file));
    }

    // -------------------------------------------------
    // DELETE (SOFT)
    // -------------------------------------------------
    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit("inventory");
        service.delete(id);
        return ResponseEntity.ok().build();
    }
}
