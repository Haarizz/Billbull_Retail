package com.billbull.backend.inventory.product;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.inventory.brand.Brand;
import com.billbull.backend.inventory.brand.BrandRepository;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.department.DepartmentRepository;
import com.billbull.backend.inventory.subdepartment.SubDepartment;
import com.billbull.backend.inventory.subdepartment.SubDepartmentRepository;
import com.billbull.backend.inventory.units.UnitRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@Service
@Transactional
public class ProductService {

    // --- CORE REPOSITORIES ---
    private final ProductRepository productRepo;
    private final ProductPricingRepository pricingRepo;
    private final ProductTaxRepository taxRepo;
    private final ProductInventoryPolicyRepository inventoryRepo;
    private final ProductMediaRepository mediaRepo;

    // --- BARCODE & PACKING REPOSITORIES ---
    private final ProductPackingRepository packingRepo;
    private final ProductBarcodeRepository barcodeRepo;

    // --- MASTER DATA REPOSITORIES (Required for Relationships) ---
    private final BrandRepository brandRepo;
    private final DepartmentRepository departmentRepo;
    private final SubDepartmentRepository subDepartmentRepo;
    private final UnitRepository unitRepo;
    private final WarehouseRepository warehouseRepo;
    private final ZoneRepository zoneRepo;
    private final LocatorRepository locatorRepo;
    private final BinRepository binRepo;

    private final ProductImageStorageService imageStorage;
    private final StockMovementRepository stockMovementRepo;

    public ProductService(
            ProductRepository productRepo,
            ProductPricingRepository pricingRepo,
            ProductTaxRepository taxRepo,
            ProductInventoryPolicyRepository inventoryRepo,
            ProductMediaRepository mediaRepo,
            ProductPackingRepository packingRepo,
            ProductBarcodeRepository barcodeRepo,
            BrandRepository brandRepo,
            DepartmentRepository departmentRepo,
            SubDepartmentRepository subDepartmentRepo,
            UnitRepository unitRepo,
            WarehouseRepository warehouseRepo,
            ZoneRepository zoneRepo,
            LocatorRepository locatorRepo,
            BinRepository binRepo,
            ProductImageStorageService imageStorage,
            StockMovementRepository stockMovementRepo) {
        this.productRepo = productRepo;
        this.pricingRepo = pricingRepo;
        this.taxRepo = taxRepo;
        this.inventoryRepo = inventoryRepo;
        this.mediaRepo = mediaRepo;
        this.packingRepo = packingRepo;
        this.barcodeRepo = barcodeRepo;
        this.brandRepo = brandRepo;
        this.departmentRepo = departmentRepo;
        this.subDepartmentRepo = subDepartmentRepo;
        this.unitRepo = unitRepo;
        this.warehouseRepo = warehouseRepo;
        this.zoneRepo = zoneRepo;
        this.locatorRepo = locatorRepo;
        this.binRepo = binRepo;
        this.imageStorage = imageStorage;
        this.stockMovementRepo = stockMovementRepo;
    }

    // ==================================================
    // 2. HELPER: RESOLVE RELATIONSHIPS (Fixes Null ID Error)
    // ==================================================
    private void resolveRelationships(Product product) {
        // Resolve Brand
        if (product.getBrand() != null && product.getBrand().getId() != null) {
            Brand brand = brandRepo.findById(product.getBrand().getId())
                    .orElseThrow(() -> new RuntimeException("Brand not found with ID: " + product.getBrand().getId()));
            product.setBrand(brand);
        } else {
            throw new IllegalArgumentException("Brand is required.");
        }

        // Resolve Department (optional — imported products may have null department)
        if (product.getDepartment() != null && product.getDepartment().getId() != null) {
            Department department = departmentRepo.findById(product.getDepartment().getId())
                    .orElseThrow(() -> new RuntimeException(
                            "Department not found with ID: " + product.getDepartment().getId()));
            product.setDepartment(department);
        } else {
            product.setDepartment(null);
        }

        // Resolve SubDepartment (Nullable)
        if (product.getSubDepartment() != null && product.getSubDepartment().getId() != null) {
            SubDepartment subDept = subDepartmentRepo.findById(product.getSubDepartment().getId())
                    .orElse(null);
            product.setSubDepartment(subDept);
        } else {
            product.setSubDepartment(null);
        }
    }

    // ==================================================
    // 3. CREATE PRODUCT
    // ==================================================
    @CacheEvict(value = "productList", allEntries = true)
    public ProductAggregateResponse create(ProductAggregateRequest req, MultipartFile file) {
        Product product = req.getProduct();

        if (productRepo.existsByCodeAndIsActiveTrue(product.getCode())) {
            throw new IllegalArgumentException("Product code already exists");
        }

        // 1. Fetch real entities to prevent foreign key errors
        resolveRelationships(product);

        // 2. Save Product
        Product savedProduct = productRepo.save(product);

        // 3. Save Child Entities
        saveDetails(savedProduct, req);

        // 4. Save Image
        if (file != null && !file.isEmpty()) {
            String imageUrl = imageStorage.store(file);
            ProductMedia media = new ProductMedia();
            media.setProduct(savedProduct);
            media.setImageUrl(imageUrl);
            media.setPrimary(true);
            mediaRepo.save(media);
        }

        return buildResponse(savedProduct);
    }

    // ==================================================
    // 4. UPDATE PRODUCT
    // ==================================================
    @CacheEvict(value = "productList", allEntries = true)
    public ProductAggregateResponse update(Long productId, ProductAggregateRequest req, MultipartFile file) {
        Product existing = productRepo.findByIdAndIsActiveTrue(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));

        Product updated = req.getProduct();

        // Preserve BaseEntity fields
        updated.setId(existing.getId());
        updated.setActive(existing.isActive());
        updated.setCreatedAt(existing.getCreatedAt());
        updated.setCreatedBy(existing.getCreatedBy());

        // 1. Resolve relationships again
        resolveRelationships(updated);

        // 2. Save Product
        Product savedProduct = productRepo.save(updated);

        // 3. Clean up old details (Only delete lists that are being replaced)
        // Pricing, Tax, Inventory, Barcodes, and Packings will be updated in place in
        // saveDetails()

        // 4. Save new details
        saveDetails(savedProduct, req);

        // 5. Update Image
        if (file != null && !file.isEmpty()) {
            List<ProductMedia> oldMedia = mediaRepo.findByProductId(productId);
            mediaRepo.deleteAll(oldMedia);
            String imageUrl = imageStorage.store(file);
            ProductMedia media = new ProductMedia();
            media.setProduct(savedProduct);
            media.setImageUrl(imageUrl);
            media.setPrimary(true);
            mediaRepo.save(media);
        }

        return buildResponse(savedProduct);
    }

    // ==================================================
    // 5. COMMON SAVE LOGIC (Details & Barcodes)
    // ==================================================
    private void saveDetails(Product product, ProductAggregateRequest req) {

        // ================= PRICING =================
        if (req.getPricing() != null) {
            ProductPricing reqPricing = req.getPricing();
            ProductPricing pricing = pricingRepo.findByProductId(product.getId())
                    .orElse(new ProductPricing());

            pricing.setProduct(product);
            pricing.setCost(reqPricing.getCost());
            pricing.setLandingCost(reqPricing.getLandingCost());
            pricing.setNlc(reqPricing.getNlc());
            pricing.setCostMethod(reqPricing.getCostMethod());
            pricing.setCostInclusive(reqPricing.isCostInclusive());
            pricing.setRetailPrice(reqPricing.getRetailPrice());
            pricing.setWholesalePrice(reqPricing.getWholesalePrice());
            pricing.setMinPrice(reqPricing.getMinPrice());
            pricing.setMaxPrice(reqPricing.getMaxPrice());
            pricing.setOnlinePrice(reqPricing.getOnlinePrice());
            pricing.setMarkup(reqPricing.getMarkup());
            pricing.setGp(reqPricing.getGp());

            pricingRepo.save(pricing);
        }

        // ================= TAX =================
        if (req.getTax() != null) {
            ProductTax reqTax = req.getTax();
            ProductTax tax = taxRepo.findByProductId(product.getId())
                    .orElse(new ProductTax());

            tax.setProduct(product);
            tax.setPurchaseTax(reqTax.getPurchaseTax());
            tax.setSalesTax(reqTax.getSalesTax());
            tax.setTaxCategory(reqTax.getTaxCategory());
            tax.setHsnCode(reqTax.getHsnCode());

            taxRepo.save(tax);
        }

        // ================= INVENTORY POLICY (MANDATORY) =================
        ProductInventoryPolicy reqInventory = req.getInventory();
        if (reqInventory == null) {
            throw new IllegalArgumentException("Inventory policy is required");
        }

        ProductInventoryPolicy inventory = inventoryRepo.findByProductId(product.getId())
                .orElse(new ProductInventoryPolicy());

        inventory.setProduct(product);
        inventory.setReorderLevel(reqInventory.getReorderLevel());
        inventory.setReorderQty(reqInventory.getReorderQty());
        inventory.setSafetyStock(reqInventory.getSafetyStock());
        inventory.setMinStock(reqInventory.getMinStock());
        inventory.setMaxStock(reqInventory.getMaxStock());
        inventory.setAllowNegative(reqInventory.isAllowNegative());
        inventory.setProcurementType(reqInventory.getProcurementType());
        inventory.setDefaultVendor(reqInventory.getDefaultVendor());

        // -------- Default Unit (MANDATORY) --------
        if (reqInventory.getDefaultUnit() == null || reqInventory.getDefaultUnit().getId() == null) {
            throw new IllegalArgumentException("Default unit is required");
        }

        inventory.setDefaultUnit(
                unitRepo.findById(reqInventory.getDefaultUnit().getId())
                        .orElseThrow(() -> new IllegalArgumentException("Invalid default unit")));

        // -------- Reorder Unit (OPTIONAL) --------
        if (reqInventory.getReorderUnit() != null && reqInventory.getReorderUnit().getId() != null) {
            inventory.setReorderUnit(
                    unitRepo.findById(reqInventory.getReorderUnit().getId())
                            .orElseThrow(() -> new IllegalArgumentException("Invalid reorder unit")));
        } else {
            inventory.setReorderUnit(null);
        }

        // -------- Warehouse (OPTIONAL) --------
        if (reqInventory.getWarehouse() != null && reqInventory.getWarehouse().getId() != null) {
            inventory.setWarehouse(
                    warehouseRepo.findById(reqInventory.getWarehouse().getId())
                            .orElse(null));
        } else {
            inventory.setWarehouse(null);
        }

        // -------- Warehouse / Zone (OPTIONAL) --------
        if (reqInventory.getZone() != null && reqInventory.getZone().getId() != null) {
            inventory.setZone(
                    zoneRepo.findById(reqInventory.getZone().getId())
                            .orElse(null));
        } else {
            inventory.setZone(null);
        }

        // -------- Locator (OPTIONAL) --------
        if (reqInventory.getLocator() != null && reqInventory.getLocator().getId() != null) {
            inventory.setLocator(
                    locatorRepo.findById(reqInventory.getLocator().getId())
                            .orElse(null));
        } else {
            inventory.setLocator(null);
        }

        // -------- Bin (OPTIONAL) --------
        if (reqInventory.getBin() != null && reqInventory.getBin().getId() != null) {
            inventory.setBin(
                    binRepo.findById(reqInventory.getBin().getId())
                            .orElse(null));
        } else {
            inventory.setBin(null);
        }

        inventoryRepo.save(inventory);

        // Pass packings to the inventory object for the loop below (since we use
        // 'inventory' variable name)
        inventory.setPackings(reqInventory.getPackings());

        // ================= PACKINGS (MANDATORY) =================
        // Use the transient list from the policy
        List<ProductPackingRequest> requestPackings = inventory.getPackings();
        if (requestPackings == null || requestPackings.isEmpty()) {
            // Fallback: check if 'req' (ProductAggregateRequest, which we don't have direct
            // access to list but maybe through getter if I add it? No, use
            // inventory.getPackings())
            // Wait, in Step 1033 I tried to get it from 'req', but it's in 'inventory'.
            throw new IllegalArgumentException("At least one packing is required");
        }

        List<ProductPacking> existingPackings = packingRepo.findByProductId(product.getId());
        List<ProductBarcode> existingBarcodes = barcodeRepo.findByProductId(product.getId());

        List<ProductPacking> packingsToSave = new ArrayList<>();
        List<ProductPacking> packingsToDelete = new ArrayList<>(existingPackings);

        List<ProductBarcode> barcodesToSave = new ArrayList<>();
        List<ProductBarcode> barcodesToDelete = new ArrayList<>(existingBarcodes);

        // We need to map requests to the packing entities they create/update to handle
        // barcodes later
        // Map<ProductPackingRequest, ProductPacking> requestToEntityMap = new
        // HashMap<>(); // Not easy if hashcode unstable
        // Use parallel lists or index

        // 1. Prepare Packings
        for (ProductPackingRequest reqP : requestPackings) {
            ProductPacking packing = null;

            // Try to find existing by Unit ID
            Long reqUnitId = (reqP.getUnit() != null) ? reqP.getUnit() : inventory.getDefaultUnit().getId();

            for (ProductPacking existP : existingPackings) {
                if (existP.getUnit().getId().equals(reqUnitId)) {
                    packing = existP;
                    packingsToDelete.remove(existP);
                    break;
                }
            }

            if (packing == null) {
                packing = new ProductPacking();
                packing.setProduct(product);
                packing.setUnit(unitRepo.findById(reqUnitId)
                        .orElseThrow(() -> new IllegalArgumentException("Invalid unit in packing")));
            }

            // Update fields
            packing.setLevel(reqP.getLevel());
            packing.setConversion(reqP.getConversion());
            packing.setBaseQty(reqP.getBaseQty());
            packing.setSale(reqP.isSale());
            packing.setPurchase(reqP.isPurchase());
            packing.setLPO(reqP.isLPO());
            packing.setCost(reqP.getCost());
            packing.setPrice(reqP.getPrice());

            packingsToSave.add(packing);
        }

        // 2. Delete Orphan Barcodes (those belonging to packings that will be deleted)
        // Actually, we should just process barcodes based on the VALID requests.
        // Any existing barcode not claimed by a valid request should be deleted.
        // But we need to handle the "claimed" part carefully.

        // 3. Delete Orphan Packings
        // First delete barcodes of these packings to avoid FK constraint?
        // Cascade might handle it, but explicit is safer.
        for (ProductPacking p : packingsToDelete) {
            // Find barcodes for this packing and add to delete list if not already there
            for (ProductBarcode b : existingBarcodes) {
                if (b.getPacking().getId().equals(p.getId())) {
                    if (!barcodesToDelete.contains(b)) {
                        barcodesToDelete.add(b);
                    }
                }
            }
        }

        // Execute Deletes (Barcodes first)
        barcodeRepo.deleteAll(barcodesToDelete);
        barcodeRepo.flush();

        packingRepo.deleteAll(packingsToDelete);
        packingRepo.flush();

        // 4. Save Packings (to get IDs for new ones)
        List<ProductPacking> savedPackings = packingRepo.saveAll(packingsToSave);

        // 5. Handle Barcodes
        // We iterate through Requests again.
        // corresponding saved packing is at same index in savedPackings?
        // Yes, preserving order.

        Brand brand = product.getBrand();

        for (int i = 0; i < requestPackings.size(); i++) {
            ProductPackingRequest reqP = requestPackings.get(i);
            ProductPacking savedP = savedPackings.get(i);

            String reqCode = reqP.getBarcode();
            if (reqCode != null && !reqCode.isBlank()) {
                ProductBarcode barcode = null;

                // Find existing barcode for this PACKING (using the saved ID)
                // We have existingBarcodes list.
                // But remember we might have deleted some.
                // Check if we have an existing barcode record that matches this packing?
                // Or matches the barcode string?
                // Ideally, match by Packing ID.

                for (ProductBarcode existB : existingBarcodes) {
                    // Check if this barcode belonged to the SAME packing (even if ID changed? No ID
                    // shouldn't change for updated)
                    // If matched by Packing ID:
                    if (existB.getPacking().getId().equals(savedP.getId())) {
                        // Wait, if it was in barcodesToDelete, ignore?
                        // We need to verify if it was deleted.
                        // Actually, better: Filter existingBarcodes that are NOT in barcodesToDelete.
                        if (!barcodesToDelete.contains(existB)) {
                            barcode = existB;
                            break;
                        }
                    }
                }

                if (barcode == null) {
                    barcode = new ProductBarcode();
                    barcode.setProduct(product);
                    barcode.setPacking(savedP);
                }

                barcode.setBarcode(reqCode);
                barcode.setPerBranch(false); // defaults or from request if available
                barcode.setIncludePrice(false);

                barcodesToSave.add(barcode);
            } else {
                // BB-003: No barcode provided. If brand-wise auto-generate is disabled,
                // fall back to a system-generated barcode: productCode-packingIndex
                boolean brandAutoGenerate = brand != null && Boolean.TRUE.equals(brand.getAutoGenerate());
                if (!brandAutoGenerate) {
                    String fallbackCode = String.format("%s-%03d", product.getCode(), i + 1);
                    // Ensure global uniqueness; add entropy if collision
                    if (barcodeRepo.existsByBarcode(fallbackCode)) {
                        fallbackCode = fallbackCode + "-" + (System.currentTimeMillis() % 10000);
                    }
                    ProductBarcode barcode = new ProductBarcode();
                    barcode.setProduct(product);
                    barcode.setPacking(savedP);
                    barcode.setBarcode(fallbackCode);
                    barcode.setPerBranch(false);
                    barcode.setIncludePrice(false);
                    barcodesToSave.add(barcode);
                }
            }
        }

        // Validate barcodes against brand rules
        java.util.Set<String> seenBarcodes = new java.util.HashSet<>();
        
        for (ProductBarcode bc : barcodesToSave) {
            String bCode = bc.getBarcode();
            if (bCode == null || bCode.isBlank()) continue;
            
            // Check for duplicates within the same request
            if (!seenBarcodes.add(bCode)) {
                throw new IllegalArgumentException("Duplicate barcode " + bCode + " provided in the same product.");
            }
            
            // Global Uniqueness Check
            if (Boolean.TRUE.equals(brand.getRuleGlobalUnique())) {
                boolean exists = (product.getId() == null) 
                    ? barcodeRepo.existsByBarcode(bCode) 
                    : barcodeRepo.existsByBarcodeAndProductIdNot(bCode, product.getId());
                if (exists) {
                    throw new IllegalArgumentException("Barcode " + bCode + " already exists globally.");
                }
            } 
            // Brand Uniqueness Check
            else if (Boolean.TRUE.equals(brand.getRuleBrandUnique())) {
                boolean exists = (product.getId() == null) 
                    ? barcodeRepo.existsByBarcodeAndProductBrandId(bCode, brand.getId())
                    : barcodeRepo.existsByBarcodeAndProductIdNotAndProductBrandId(bCode, product.getId(), brand.getId());
                if (exists) {
                    throw new IllegalArgumentException("Barcode " + bCode + " already exists within the brand " + brand.getName() + ".");
                }
            }
        }

        barcodeRepo.saveAll(barcodesToSave);
    }

    // ==================================================
    // 6. READ & DELETE METHODS
    // ==================================================
    @Transactional(readOnly = true)
    public List<ProductAggregateResponse> getAll() {
        return productRepo.findAllByIsActiveTrue().stream().map(this::buildResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ProductAggregateResponse> searchProductsByBarcode(String barcode) {
        if (barcode == null || barcode.isBlank()) return new ArrayList<>();
        return barcodeRepo.findFirstByBarcode(barcode.trim())
                .filter(pb -> pb.getProduct() != null && pb.getProduct().isActive())
                .map(pb -> java.util.List.of(buildResponse(pb.getProduct())))
                .orElse(new ArrayList<>());
    }

    @Transactional(readOnly = true)
    public List<ProductAggregateResponse> searchProducts(String search) {
        String trimmedSearch = (search != null) ? search.trim() : "";
        if (trimmedSearch.isBlank()) {
            return new ArrayList<>();
        }
        
        org.springframework.data.domain.Pageable limit = org.springframework.data.domain.PageRequest.of(0, 20);
        org.springframework.data.domain.Page<Product> productPage = productRepo.findAllActiveBySearch(trimmedSearch, limit);
        
        return productPage.getContent().stream().map(this::buildResponse).collect(Collectors.toList());
    }

    /**
     * Optimised list for the product table view.
     * Uses 4 queries total (vs N×6 for getAll):
     * 1. Products (paginated) with JOIN FETCH for brand + department
     * 2. Pricing IN batch
     * 3. Primary media IN batch
     * 4. Barcodes IN batch
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "productList", key = "#page + '_' + #size + '_' + #search + '_' + #warehouseId")
    public java.util.Map<String, Object> getList(int page, int size, String search, Long warehouseId) {
        return getList(page, size, search, warehouseId, null, null);
    }

    public java.util.Map<String, Object> getList(int page, int size, String search, Long warehouseId, Long departmentId, Long brandId) {
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(page, size);

        String trimmedSearch = (search != null) ? search.trim() : "";
        boolean hasDeptOrBrand = (departmentId != null || brandId != null);
        org.springframework.data.domain.Page<Product> productPage;

        if (hasDeptOrBrand) {
            // Use the unified filtered query (handles all combinations via null-safe params)
            productPage = productRepo.findAllActiveFiltered(trimmedSearch, departmentId, brandId, pageable);
        } else if (warehouseId != null) {
            productPage = trimmedSearch.isBlank()
                    ? productRepo.findAllActiveForListByWarehouse(warehouseId, pageable)
                    : productRepo.findAllActiveBySearchAndWarehouse(trimmedSearch, warehouseId, pageable);
        } else {
            productPage = trimmedSearch.isBlank()
                    ? productRepo.findAllActiveForList(pageable)
                    : productRepo.findAllActiveBySearch(trimmedSearch, pageable);
        }

        List<Product> products = productPage.getContent();
        List<Long> ids = products.stream().map(Product::getId).collect(Collectors.toList());

        if (ids.isEmpty()) {
            return java.util.Map.of(
                    "content", java.util.Collections.emptyList(),
                    "totalElements", productPage.getTotalElements(),
                    "totalPages", productPage.getTotalPages(),
                    "page", page,
                    "size", size);
        }

        // Query 2: pricing bulk
        java.util.Map<Long, ProductPricing> pricingMap = pricingRepo.findByProductIdIn(ids)
                .stream().collect(Collectors.toMap(pr -> pr.getProduct().getId(), pr -> pr));

        // Query 3: primary images bulk
        java.util.Map<Long, String> imageMap = mediaRepo.findByProductIdInAndIsPrimaryTrue(ids)
                .stream().collect(Collectors.toMap(
                        m -> m.getProduct().getId(),
                        m -> m.getImageUrl(),
                        (a, b) -> a)); // keep first

        // Query 4: tax bulk
        java.util.Map<Long, ProductTax> taxMap = taxRepo.findByProductIdIn(ids)
                .stream().collect(Collectors.toMap(t -> t.getProduct().getId(), t -> t));

        // Query 5: inventory policy bulk (default unit and procurement metadata)
        java.util.Map<Long, ProductInventoryPolicy> inventoryMap = inventoryRepo.findByProductIdIn(ids)
                .stream().collect(Collectors.toMap(inv -> inv.getProduct().getId(), inv -> inv));

        // Query 6: barcodes bulk (keep first barcode per product)
        java.util.Map<Long, List<ProductBarcode>> barcodeMap = barcodeRepo.findByProductIdIn(ids)
                .stream().collect(Collectors.groupingBy(b -> b.getProduct().getId()));

        // Query 7: packings bulk for unit ratios and prices
        java.util.Map<Long, List<ProductPacking>> packingMap = packingRepo.findByProductIdIn(ids)
                .stream().collect(Collectors.groupingBy(p -> p.getProduct().getId()));

        // Query 8: available stock totals (QA-007 fix — stock was missing, showing 0 everywhere)
        java.util.Map<Long, Integer> stockMap = new java.util.HashMap<>();
        List<Object[]> stockRows = stockMovementRepo.getTotalAvailableStockForProducts(ids);
        for (Object[] row : stockRows) {
            stockMap.put((Long) row[0], ((Number) row[1]).intValue());
        }

        List<java.util.Map<String, Object>> content = products.stream().map(p -> {
            java.util.Map<String, Object> item = new java.util.HashMap<>();
            item.put("id", p.getId());
            item.put("code", p.getCode());
            item.put("name", p.getName());
            item.put("sku", p.getSku());
            item.put("description", p.getShortDesc());
            item.put("status", p.getStatus());
            item.put("localName", p.getLocalName());
            item.put("brandId", p.getBrand() != null ? p.getBrand().getId() : null);
            item.put("brandName", p.getBrand() != null ? p.getBrand().getName() : null);
            item.put("departmentId", p.getDepartment() != null ? p.getDepartment().getId() : null);
            item.put("departmentName", p.getDepartment() != null ? p.getDepartment().getName() : null);

            ProductPricing pr = pricingMap.get(p.getId());
            item.put("cost", pr != null ? pr.getCost() : null);
            item.put("retailPrice", pr != null ? pr.getRetailPrice() : null);

            ProductTax tx = taxMap.get(p.getId());
            item.put("salesTax", tx != null ? tx.getSalesTax() : null);
            item.put("purchaseTax", tx != null ? tx.getPurchaseTax() : null);

            ProductInventoryPolicy inv = inventoryMap.get(p.getId());
            item.put("unitName", inv != null && inv.getDefaultUnit() != null ? inv.getDefaultUnit().getName() : null);
            item.put("defaultUnitId", inv != null && inv.getDefaultUnit() != null ? inv.getDefaultUnit().getId() : null);

            item.put("maxDiscount", p.getMaxDiscount());
            item.put("isBatch", p.isBatch());
            item.put("expiryEnabled", p.isExpiryEnabled());
            item.put("fefoEnabled", p.isFefoEnabled());
            item.put("minExpiryDaysForSale", p.getMinExpiryDaysForSale());
            // QA-001: ship productType so sales screens can short-circuit stock
            // validation for SERVICE items.
            item.put("productType", p.getProductType() != null ? p.getProductType().name() : null);

            String imgUrl = imageMap.get(p.getId());
            item.put("image", imgUrl);

            List<ProductBarcode> bcs = barcodeMap.getOrDefault(p.getId(), java.util.Collections.emptyList());
            item.put("barcode", bcs.isEmpty() ? null : bcs.get(0).getBarcode());
            
            item.put("packings", bcs.stream().map(b -> {
                java.util.Map<String, Object> bc = new java.util.HashMap<>();
                bc.put("barcode", b.getBarcode());
                ProductPacking bPacking = b.getPacking();
                if (bPacking != null) {
                    bc.put("level", bPacking.getLevel());
                    if (bPacking.getUnit() != null) {
                        java.util.Map<String, Object> unitMap = new java.util.HashMap<>();
                        unitMap.put("id", bPacking.getUnit().getId());
                        unitMap.put("name", bPacking.getUnit().getName());
                        bc.put("unit", unitMap);
                    }
                }
                return bc;
            }).collect(Collectors.toList()));

            List<ProductPacking> pkgs = packingMap.getOrDefault(p.getId(), java.util.Collections.emptyList());
            List<String> availableUnits = new java.util.ArrayList<>();
            java.util.Map<String, java.math.BigDecimal> unitConversions = new java.util.HashMap<>();
            java.util.Map<String, java.math.BigDecimal> unitPrices = new java.util.HashMap<>();
            java.util.Map<String, java.math.BigDecimal> unitCosts = new java.util.HashMap<>();

            for (ProductPacking pkg : pkgs) {
                if (pkg.getUnit() != null) {
                    String uName = pkg.getUnit().getName();
                    availableUnits.add(uName);
                    unitConversions.put(uName, pkg.getConversion());
                    if (pkg.getPrice() != null) {
                        unitPrices.put(uName, pkg.getPrice());
                    }
                    if (pkg.getCost() != null) {
                        unitCosts.put(uName, pkg.getCost());
                    }
                }
            }

            item.put("availableUnits", availableUnits.isEmpty() ? java.util.List.of("PCS") : availableUnits);
            item.put("unitConversions", unitConversions);
            item.put("unitPrices", unitPrices);
            item.put("unitCosts", unitCosts);

            // QA-007 fix: include total available stock so the product selector displays correct quantity
            item.put("stock", stockMap.getOrDefault(p.getId(), 0));

            return item;
        }).collect(Collectors.toList());

        return java.util.Map.of(
                "content", content,
                "totalElements", productPage.getTotalElements(),
                "totalPages", productPage.getTotalPages(),
                "page", page,
                "size", size);
    }

    @Transactional(readOnly = true)
    public ProductAggregateResponse getById(Long productId) {
        Product product = productRepo.findByIdAndIsActiveTrue(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));
        return buildResponse(product);
    }

    @CacheEvict(value = "productList", allEntries = true)
    public void delete(Long productId) {
        Product product = productRepo.findByIdAndIsActiveTrue(productId)
                .orElseThrow(() -> new RuntimeException("Product not found"));
        product.setActive(false);
        productRepo.save(product);
    }

    // ==================================================
    // 7. RESPONSE BUILDER (UPDATED to fetch Barcodes)
    // ==================================================
    private ProductAggregateResponse buildResponse(Product product) {
        ProductAggregateResponse res = new ProductAggregateResponse();
        res.setProduct(product);
        pricingRepo.findByProductId(product.getId()).ifPresent(res::setPricing);
        taxRepo.findByProductId(product.getId()).ifPresent(res::setTax);

        // -------------------------------------------------------------
        // FIX: Explicitly initialize Lazy-Loaded Relationships
        // -------------------------------------------------------------

        // 1. SubDepartment -> Department
        if (product.getSubDepartment() != null) {
            product.getSubDepartment().getDepartment().getName(); // Trigger load
        }

        inventoryRepo.findByProductId(product.getId()).ifPresent(inv -> {

            // 1. Warehouse (Direct)
            if (inv.getWarehouse() != null) {
                inv.getWarehouse().getName();
            }

            // 2. Zone -> Warehouse
            if (inv.getZone() != null) {
                inv.getZone().getWarehouse().getName(); // Trigger load
            }

            // 3. Locator -> Zone -> Warehouse
            if (inv.getLocator() != null) {
                if (inv.getLocator().getZone() != null) {
                    inv.getLocator().getZone().getWarehouse().getName(); // Trigger load
                }
            }

            // 4. Bin -> Locator -> Zone -> Warehouse
            if (inv.getBin() != null) {
                if (inv.getBin().getLocator() != null) {
                    if (inv.getBin().getLocator().getZone() != null) {
                        inv.getBin().getLocator().getZone().getWarehouse().getName(); // Trigger load
                    }
                }
            }

            // 1. Fetch real Packings from DB
            List<ProductPacking> dbPackings = packingRepo.findByProductId(product.getId());

            // 2. Fetch real Barcodes from DB
            List<ProductBarcode> dbBarcodes = barcodeRepo.findByProductId(product.getId());

            // 3. Map to DTO (ProductPackingRequest) so it appears in the JSON response
            List<ProductPackingRequest> packingDTOs = new ArrayList<>();

            for (ProductPacking p : dbPackings) {
                ProductPackingRequest dto = new ProductPackingRequest();
                // Map basic fields
                dto.setId(p.getId());
                dto.setLevel(p.getLevel());
                if (p.getUnit() != null) {
                    dto.setUnit(p.getUnit().getId());
                    dto.setUnitName(p.getUnit().getName());
                }
                dto.setConversion(p.getConversion());
                dto.setBaseQty(p.getBaseQty());
                dto.setSale(p.isSale());
                dto.setPurchase(p.isPurchase());
                dto.setLPO(p.isLPO());
                dto.setCost(p.getCost());
                dto.setPrice(p.getPrice());

                // 4. FIND BARCODE for this packing
                dbBarcodes.stream()
                        .filter(b -> b.getPacking().getId().equals(p.getId()))
                        .findFirst()
                        .ifPresent(b -> dto.setBarcode(b.getBarcode()));

                packingDTOs.add(dto);
            }

            // 5. Set the populated DTO list into the transient field
            inv.setPackings(packingDTOs);
            res.setInventory(inv);
        });

        // Image
        List<ProductMedia> mediaList = mediaRepo.findByProductId(product.getId());
        if (!mediaList.isEmpty()) {
            res.setPrimaryImage(mediaList.get(0).getImageUrl());
        }
        return res;
    }
}
