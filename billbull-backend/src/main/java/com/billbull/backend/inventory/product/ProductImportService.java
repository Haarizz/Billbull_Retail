package com.billbull.backend.inventory.product;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.PictureData;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFClientAnchor;
import org.apache.poi.xssf.usermodel.XSSFDrawing;
import org.apache.poi.xssf.usermodel.XSSFPicture;
import org.apache.poi.xssf.usermodel.XSSFShape;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.inventory.brand.Brand;
import com.billbull.backend.inventory.brand.BrandRepository;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.department.DepartmentRepository;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.inventory.units.UnitRepository;

@Service
public class ProductImportService {

    public static class ImportJobStatus {
        public String jobId;
        public String fileName;
        public volatile String status = "QUEUED";
        public volatile int totalRows = 0;
        public volatile int processedRows = 0;
        public volatile int createdCount = 0;
        public volatile int duplicateCreatedCount = 0;
        public volatile int updatedCount = 0;
        public volatile int skippedCount = 0;
        public volatile int identicalDuplicateSkippedCount = 0;
        public volatile int errorCount = 0;
        public volatile String message = "";
        public final List<String> errors = new CopyOnWriteArrayList<>();
        public long startedAt = System.currentTimeMillis();
        public volatile long finishedAt = 0;

        public int getPercent() {
            if ("SUCCESS".equals(status) || "FAILED".equals(status)) {
                return 100;
            }
            if (totalRows <= 0) {
                return "RUNNING".equals(status) ? 1 : 0;
            }
            int pct = (int) Math.floor((processedRows * 100.0) / totalRows);
            return Math.max(0, Math.min(99, pct));
        }

        public long getElapsedMs() {
            long end = finishedAt > 0 ? finishedAt : System.currentTimeMillis();
            return Math.max(0, end - startedAt);
        }

        public Long getEstimatedRemainingMs() {
            if (!"RUNNING".equals(status) || processedRows <= 0 || totalRows <= 0) {
                return null;
            }
            long elapsed = getElapsedMs();
            long estimateTotal = Math.round((elapsed * 1.0 / processedRows) * totalRows);
            return Math.max(0, estimateTotal - elapsed);
        }
    }

    private static class ImportCounters {
        int createdCount;
        int duplicateCreatedCount;
        int updatedCount;
        int skippedCount;
        int identicalDuplicateSkippedCount;
        int emptySheetCount;
        int errorCount;
        int processedRows;
        final List<String> errors = new ArrayList<>();
    }

    private final ProductRepository productRepo;
    private final BrandRepository brandRepo;
    private final DepartmentRepository departmentRepo;
    private final UnitRepository unitRepo;
    private final ProductPackingRepository packingRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository mediaRepo;
    private final ProductImageStorageService imageStorageService;
    private final ConcurrentMap<String, ImportJobStatus> importJobs = new ConcurrentHashMap<>();
    private final ExecutorService importExecutor = Executors.newSingleThreadExecutor();

    public ProductImportService(ProductRepository productRepo, BrandRepository brandRepo,
            DepartmentRepository departmentRepo,
            UnitRepository unitRepo, ProductPackingRepository packingRepo, ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository mediaRepo, ProductImageStorageService imageStorageService) {
        this.productRepo = productRepo;
        this.brandRepo = brandRepo;
        this.departmentRepo = departmentRepo;
        this.unitRepo = unitRepo;
        this.packingRepo = packingRepo;
        this.barcodeRepo = barcodeRepo;
        this.mediaRepo = mediaRepo;
        this.imageStorageService = imageStorageService;
    }

    @CacheEvict(value = "productList", allEntries = true)
    public ImportJobStatus startImport(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Import file is empty");
        }

        ImportJobStatus job = new ImportJobStatus();
        job.jobId = UUID.randomUUID().toString();
        job.fileName = file.getOriginalFilename();
        importJobs.put(job.jobId, job);

        try {
            Path tempFile = Files.createTempFile("product-import-", ".xlsx");
            file.transferTo(tempFile.toFile());
            importExecutor.submit(() -> runImportJob(tempFile, job));
        } catch (Exception e) {
            job.status = "FAILED";
            job.message = "Import Failed: " + e.getMessage();
            job.finishedAt = System.currentTimeMillis();
        }

        return job;
    }

    public ImportJobStatus getImportJobStatus(String jobId) {
        ImportJobStatus job = importJobs.get(jobId);
        if (job == null) {
            throw new IllegalArgumentException("Import job not found: " + jobId);
        }
        return job;
    }

    private void runImportJob(Path importFile, ImportJobStatus job) {
        job.status = "RUNNING";
        job.startedAt = System.currentTimeMillis();
        try (InputStream inputStream = Files.newInputStream(importFile)) {
            job.message = importProducts(inputStream, job);
            job.status = "SUCCESS";
        } catch (Exception e) {
            job.errorCount++;
            job.message = "Import Failed: " + e.getMessage();
            job.errors.add(job.message);
            job.status = "FAILED";
        } finally {
            try {
                Files.deleteIfExists(importFile);
            } catch (IOException ignored) {
            }
            job.finishedAt = System.currentTimeMillis();
            job.processedRows = Math.max(job.processedRows, job.totalRows);
        }
    }

    @CacheEvict(value = "productList", allEntries = true)
    public String importProducts(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Import file is empty");
        }
        try {
            return importProducts(file.getInputStream(), null);
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }
    }

    private String importProducts(InputStream inputStream, ImportJobStatus job) {
        ImportCounters counters = new ImportCounters();
        Set<String> seenBarcodes = new HashSet<>();
        Unit fallbackUnit = getOrCreateUnit("PCS", null);
        Set<String> exactRowSignatures = new HashSet<>();
        Set<String> reservedCodes = new HashSet<>();
        Map<String, Integer> currentFileCodeOccurrences = new HashMap<>();

        try (Workbook workbook = new XSSFWorkbook(inputStream)) {
            int totalRows = countImportRows(workbook);
            if (job != null) {
                job.totalRows = totalRows;
            }

            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                String sheetName = sheet.getSheetName();

                if (sheet.getLastRowNum() < 1) {
                    counters.emptySheetCount++;
                    continue;
                }

                int headerRowNum = findHeaderRow(sheet);
                if (headerRowNum < 0) {
                    counters.errors.add("Sheet '" + sheetName + "': Could not find a product header row.");
                    continue;
                }

                Row headerRow = sheet.getRow(headerRowNum);
                Map<String, Integer> headerMap = buildHeaderMap(headerRow);

                Integer modelIdx = findContentIndex(headerMap, "supplier model no", "supplier model", "model no",
                        "model no.", "model", "model number", "item model");
                Integer skuIdx = findContentIndex(headerMap, "sku");
                Integer itemIdx = findContentIndex(headerMap, "item");
                Integer codeIdx = findContentIndex(headerMap, "item code", "code", "product code", "sku",
                        "prdid", "product id", "prod id");
                Integer nameIdx = findContentIndex(headerMap, "item name", "product name", "name", "product",
                        "item", "description", "product description", "item description",
                        "prdname");
                Integer descIdx = findContentIndex(headerMap, "description", "product description",
                        "item description", "short description", "detailed description");
                if (itemIdx != null) {
                    nameIdx = itemIdx;
                }
                if (nameIdx == null) {
                    nameIdx = descIdx;
                }
                Integer localNameIdx = findContentIndex(headerMap, "local name", "arabic name", "alternate name");
                Integer productTypeIdx = findContentIndex(headerMap, "type", "product type");
                Integer statusIdx = findContentIndex(headerMap, "status");
                Integer picIdx = findContentIndex(headerMap, "picture", "image", "photo", "img", "item photo");
                Integer barcodeIdx = findContentIndex(headerMap, "barcode", "bar code", "ean", "upc");
                Integer unitIdx = findContentIndex(headerMap, "unit code", "unit", "uom");
                Integer manufactureIdx = findContentIndex(headerMap, "manufacture", "manufacturer",
                        "manufacturer name");
                Integer deptIdx = findContentIndex(headerMap, "department name", "department", "dept", "category",
                        "product group", "item group", "group",
                        "productcategory", "product category", "prd category");
                Integer costIdx = findContentIndex(headerMap, "cost", "purchase cost", "purchasecost",
                        "cost price");
                Integer lastSupCostIdx = findContentIndex(headerMap, "last sup cost", "last supplier cost",
                        "landing cost", "landingcost");
                Integer priceInclTaxIdx = findContentIndex(headerMap, "price incl tax", "price including tax",
                        "retail price", "selling price", "sales rate", "salesrate",
                        "prdrate", "rate", "price");
                Integer costInclTaxIdx = findContentIndex(headerMap, "cost incl tax", "cost including tax", "nlc");
                Integer costMethodIdx = findContentIndex(headerMap, "cost method");
                Integer costInclusiveIdx = findContentIndex(headerMap, "cost inclusive", "cost inclusive?",
                        "is cost inclusive");
                Integer wholesalePriceIdx = findContentIndex(headerMap, "wholesale price", "wholesale");
                Integer minPriceIdx = findContentIndex(headerMap, "min price", "minimum price");
                Integer maxPriceIdx = findContentIndex(headerMap, "max price", "maximum price");
                Integer onlinePriceIdx = findContentIndex(headerMap, "online price", "web price");
                Integer defaultDiscountIdx = findContentIndex(headerMap, "default discount", "default discount %",
                        "discount");
                Integer inactiveIdx = findContentIndex(headerMap, "inactive", "in active");
                Integer markupIdx = findContentIndex(headerMap, "markup");
                Integer gpIdx = findContentIndex(headerMap, "gross profit", "gp");
                Integer purchaseTaxIdx = findContentIndex(headerMap, "purchase tax", "purchase tax %");
                Integer salesTaxIdx = findContentIndex(headerMap, "sales tax", "sales tax %", "vat", "vat %");
                Integer taxCategoryIdx = findContentIndex(headerMap, "tax category");
                Integer hsnIdx = findContentIndex(headerMap, "hsn code", "hsn", "tax code");
                Integer reorderLevelIdx = findContentIndex(headerMap, "reorder level", "reorderlevel",
                        "reorder point");
                Integer reorderQtyIdx = findContentIndex(headerMap, "reorder qty", "reorder quantity");
                Integer safetyStockIdx = findContentIndex(headerMap, "safety stock");
                Integer minStockIdx = findContentIndex(headerMap, "min stock", "minimum stock");
                Integer maxStockIdx = findContentIndex(headerMap, "max stock", "maximum stock");
                Integer pointIdx = findContentIndex(headerMap, "point", "points", "loyalty point",
                        "loyalty points", "reward point", "reward points");
                Integer serialIdx = findContentIndex(headerMap, "serial tracking", "serial tracking?", "is serial");
                Integer batchIdx = findContentIndex(headerMap, "batch tracking", "batch tracking?", "is batch");
                Integer weighingIdx = findContentIndex(headerMap, "weighing scale item", "weighing scale item?",
                        "is weighing");
                Integer discountAllowedIdx = findContentIndex(headerMap, "discount allowed",
                        "discount allowed?", "is discount allowed");
                Integer maxDiscountIdx = findContentIndex(headerMap, "max discount", "maximum discount");
                Integer availableInPosIdx = findContentIndex(headerMap, "available in pos", "available in pos?");
                Integer catIdx = findContentIndex(headerMap, "catalogue no", "catalogue code", "cat no", "cat code",
                        "catalog no", "catalog code");
                Integer brandColIdx = findContentIndex(headerMap, "brand", "brand name", "make");

                if (codeIdx == null && modelIdx != null) {
                    codeIdx = modelIdx;
                }
                if (modelIdx == null && codeIdx != null) {
                    modelIdx = codeIdx;
                }
                // Albadar format: no code/model column — use barcode as product code
                if (codeIdx == null && modelIdx == null && barcodeIdx != null) {
                    codeIdx = barcodeIdx;
                    modelIdx = barcodeIdx;
                }
                final boolean isBarcodeOnlyCode = (codeIdx != null && codeIdx.equals(barcodeIdx));
                final boolean albadarFormat = isBarcodeOnlyCode && brandColIdx == null;
                final boolean royalToolsFormat = isBarcodeOnlyCode && manufactureIdx != null;
                final boolean hasCarriedForwardGroup = albadarFormat || royalToolsFormat;
                final boolean leRoyalFormat = albadarFormat
                        && nameIdx != null
                        && manufactureIdx != null
                        && priceInclTaxIdx != null
                        && costIdx != null;
                if (brandColIdx == null && manufactureIdx != null) {
                    brandColIdx = manufactureIdx;
                }
                if (leRoyalFormat) {
                    deptIdx = null;
                }

                // Some legacy Nest/Fitgenix files swapped SKU and Item. Decide from
                // row values so normal files with SKU=code and Item=name stay intact.
                final boolean skuItemFormat = !hasCarriedForwardGroup && skuIdx != null && itemIdx != null;
                final boolean swapSkuAndItem = skuItemFormat
                        && shouldUseItemColumnAsCode(sheet, headerRowNum, skuIdx, itemIdx);
                if (swapSkuAndItem) {
                    codeIdx = itemIdx;
                    nameIdx = skuIdx;
                    modelIdx = codeIdx;
                    if (brandColIdx == null && deptIdx != null) {
                        brandColIdx = deptIdx;
                        deptIdx = null;
                    }
                }

                String fallbackBrandName = sheetName != null && sheetName.toLowerCase().startsWith("sheet")
                        ? "General"
                        : sheetName;
                Brand fallbackBrand = getOrCreateBrand(fallbackBrandName);
                Map<Integer, PictureData> rowImageMap = buildRowImageMap(sheet);
                // Legacy report formats use column A as a carried-forward group/category.
                String lastGroupName = null;

                for (int r = headerRowNum + 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null || isBlankRow(row) || isReportFooterRow(row)) {
                        continue;
                    }

                    try {
                        String rowSignature = buildRowSignature(row);
                        if (!exactRowSignatures.add(rowSignature)) {
                            counters.skippedCount++;
                            counters.identicalDuplicateSkippedCount++;
                            continue;
                        }

                        // Legacy report format: column A holds a group/category, filled once per group.
                        if (hasCarriedForwardGroup) {
                            String groupCell = cell(row, 0);
                            if (!isBlank(groupCell)) {
                                lastGroupName = groupCell;
                            }
                        }

                        String valModel = cell(row, modelIdx);
                        String valCode = cell(row, codeIdx);
                        if (valCode != null && headerMap.containsKey("prdid") && codeIdx != null && codeIdx.equals(headerMap.get("prdid"))) {
                            if (!valCode.startsWith("GIFT-")) {
                                valCode = "GIFT-" + valCode;
                            }
                        }
                        String valName = cell(row, nameIdx);
                        String valLocalName = cell(row, localNameIdx);
                        String valDesc = cell(row, descIdx);
                        String valProductType = cell(row, productTypeIdx);
                        String valPic = cell(row, picIdx);
                        String valBarcode = cell(row, barcodeIdx);
                        if (!isBlank(valBarcode)) {
                            if (!seenBarcodes.add(valBarcode.trim())) {
                                counters.skippedCount++;
                                counters.identicalDuplicateSkippedCount++; // To indicate they were skipped due to duplication
                                continue;
                            }
                        }
                        String valUnit = cell(row, unitIdx);
                        String valDept = cell(row, deptIdx);
                        String valGroup = hasCarriedForwardGroup ? lastGroupName : cell(row, deptIdx);
                        String valInactive = cell(row, inactiveIdx);
                        String valStatus = cell(row, statusIdx);
                        String valCat = cell(row, catIdx);
                        String valBrandCol = cell(row, brandColIdx);
                        if (leRoyalFormat && isBlank(valDept)) {
                            valDept = valGroup;
                        }
                        // Older Albadar files used the carried-forward group as brand.
                        if (albadarFormat && !leRoyalFormat && isBlank(valBrandCol)) {
                            valBrandCol = lastGroupName;
                        }
                        if (!isBlank(valCode) && !isBlank(valName) && shouldSwapCodeAndNameForRow(valCode, valName)) {
                            String tmpSwap = valCode;
                            valCode = valName;
                            valName = tmpSwap;
                        }

                        String finalName = firstNonBlank(valName, valDesc, valCat, valModel, valCode);
                        String baseCode = firstNonBlank(valCode, valModel, valCat, finalName);
                        if (isBlank(finalName) || isBlank(baseCode)) {
                            counters.skippedCount++;
                            continue;
                        }
                        finalName = limit(finalName, 150);
                        baseCode = limit(baseCode, 50);

                        int occurrence = currentFileCodeOccurrences.merge(baseCode, 1, Integer::sum);
                        boolean repeatedCodeInCurrentFile = occurrence > 1;

                        BigDecimal cost = parseDecimal(cell(row, costIdx));
                        BigDecimal lastSupCost = parseDecimal(cell(row, lastSupCostIdx));
                        BigDecimal priceInclTax = parseDecimal(cell(row, priceInclTaxIdx));
                        BigDecimal costInclTax = parseDecimal(cell(row, costInclTaxIdx));
                        BigDecimal wholesalePrice = parseDecimal(cell(row, wholesalePriceIdx));
                        BigDecimal minPrice = parseDecimal(cell(row, minPriceIdx));
                        BigDecimal maxPrice = parseDecimal(cell(row, maxPriceIdx));
                        BigDecimal onlinePrice = parseDecimal(cell(row, onlinePriceIdx));
                        BigDecimal defaultDiscount = parseDecimal(cell(row, defaultDiscountIdx));
                        BigDecimal markup = parseDecimal(cell(row, markupIdx));
                        BigDecimal gp = parseDecimal(cell(row, gpIdx));
                        BigDecimal purchaseTax = parseDecimal(cell(row, purchaseTaxIdx));
                        BigDecimal salesTax = parseDecimal(cell(row, salesTaxIdx));
                        BigDecimal loyaltyPoints = parseDecimal(cell(row, pointIdx));
                        Integer reorderLevel = parseInteger(cell(row, reorderLevelIdx));
                        Integer reorderQty = parseInteger(cell(row, reorderQtyIdx));
                        Integer safetyStock = parseInteger(cell(row, safetyStockIdx));
                        Integer minStock = parseInteger(cell(row, minStockIdx));
                        Integer maxStock = parseInteger(cell(row, maxStockIdx));
                        Integer maxDiscount = parseInteger(cell(row, maxDiscountIdx));
                        String valTaxCategory = cell(row, taxCategoryIdx);
                        String valHsn = cell(row, hsnIdx);
                        String barcodeValue = firstNonBlank(valBarcode, baseCode);
                        String categoryName = firstNonBlank(valDept, valGroup);
                        BigDecimal landingCost = firstNonNullDecimal(lastSupCost, cost);
                        BigDecimal productCost = firstNonNullDecimal(cost, landingCost);
                        BigDecimal netLandedCost = firstNonNullDecimal(costInclTax, landingCost);

                        Product product = null;
                        boolean isUpdate = false;

                        Optional<Product> existingByBarcode = findProductByBarcode(barcodeValue);
                        if (existingByBarcode.isPresent()
                                && productMatchesRow(existingByBarcode.get(), finalName, barcodeValue, productCost,
                                        landingCost, priceInclTax, netLandedCost, markup, gp, wholesalePrice,
                                        minPrice, maxPrice, onlinePrice, defaultDiscount, loyaltyPoints,
                                        reorderLevel, valUnit, categoryName, valBrandCol)) {
                            attachImageIfAbsent(existingByBarcode.get(), rowImageMap.get(r), valPic);
                            counters.skippedCount++;
                            continue;
                        }

                        Optional<Product> existingByCode = productRepo.findByCode(baseCode);
                        if (!repeatedCodeInCurrentFile && existingByCode.isPresent()) {
                            product = existingByCode.get();
                            isUpdate = true;
                        } else if (repeatedCodeInCurrentFile) {
                            if (existingByCode.isPresent()
                                    && productMatchesRow(existingByCode.get(), finalName, barcodeValue, productCost,
                                            landingCost, priceInclTax, netLandedCost, markup, gp, wholesalePrice,
                                            minPrice, maxPrice, onlinePrice, defaultDiscount, loyaltyPoints,
                                            reorderLevel, valUnit, categoryName, valBrandCol)) {
                                attachImageIfAbsent(existingByCode.get(), rowImageMap.get(r), valPic);
                                counters.skippedCount++;
                                continue;
                            }
                            product = new Product();
                            product.setCode(generateUniqueProductCode(baseCode, reservedCodes));
                            counters.duplicateCreatedCount++;
                        } else {
                            product = existingByCode.orElseGet(Product::new);
                            product.setCode(baseCode);
                        }

                        reservedCodes.add(product.getCode());
                        product.setName(finalName);
                        if (!isBlank(valLocalName)) {
                            product.setLocalName(limit(valLocalName, 255));
                        }
                        product.setSku(limit(firstNonBlank(valCode, valModel, baseCode), 100));
                        if (!isBlank(valDesc)) {
                            product.setShortDesc(limit(valDesc, 300));
                            product.setDetailedDesc(limit(valDesc, 1000));
                        }
                        product.setBrand(!isBlank(valBrandCol) ? getOrCreateBrand(valBrandCol) : fallbackBrand);
                        product.setActive(true);
                        product.setStatus(parseStatus(valStatus, valInactive));
                        product.setProductType(parseProductType(valProductType));
                        if (serialIdx != null) {
                            product.setSerial(isChecked(cell(row, serialIdx)));
                        }
                        if (batchIdx != null) {
                            product.setBatch(isChecked(cell(row, batchIdx)));
                        }
                        if (weighingIdx != null) {
                            product.setWeighing(isChecked(cell(row, weighingIdx)));
                        }
                        if (discountAllowedIdx != null) {
                            product.setDiscountAllowed(isChecked(cell(row, discountAllowedIdx)));
                        } else if (product.getId() == null) {
                            product.setDiscountAllowed(true);
                        }
                        if (maxDiscount != null) {
                            product.setMaxDiscount(maxDiscount);
                        }
                        if (availableInPosIdx != null) {
                            product.setAvailableInPos(isChecked(cell(row, availableInPosIdx)));
                        }

                        if (!isBlank(categoryName)) {
                            Department department = getOrCreateDepartment(categoryName);
                            product.setDepartment(department);
                            product.setCategory(department.getName());
                        } else if (isBlank(product.getCategory())) {
                            product.setCategory("General");
                        }

                        ProductPricing pricing = product.getPricing() != null ? product.getPricing() : new ProductPricing();
                        pricing.setCost(defaultZero(productCost));
                        pricing.setLandingCost(defaultZero(landingCost));
                        pricing.setNlc(defaultZero(netLandedCost));
                        if (costMethodIdx != null || product.getId() == null) {
                            pricing.setCostMethod(parseCostMethod(cell(row, costMethodIdx)));
                        }
                        pricing.setRetailPrice(defaultZero(priceInclTax));
                        if (wholesalePriceIdx != null || product.getId() == null) {
                            pricing.setWholesalePrice(defaultZero(wholesalePrice));
                        }
                        if (minPriceIdx != null || product.getId() == null) {
                            pricing.setMinPrice(defaultZero(minPrice));
                        }
                        if (maxPriceIdx != null || product.getId() == null) {
                            pricing.setMaxPrice(defaultZero(maxPrice));
                        }
                        if (onlinePriceIdx != null || product.getId() == null) {
                            pricing.setOnlinePrice(defaultZero(onlinePrice));
                        }
                        pricing.setMarkup(defaultZero(markup));
                        pricing.setGp(defaultZero(gp));
                        if (defaultDiscountIdx != null || product.getId() == null) {
                            pricing.setDefaultDiscount(defaultZero(defaultDiscount));
                        }
                        if (pointIdx != null || product.getId() == null) {
                            pricing.setLoyaltyPoints(defaultZero(loyaltyPoints));
                        }
                        pricing.setCostInclusive(costInclusiveIdx != null
                                ? isChecked(cell(row, costInclusiveIdx))
                                : costInclTax != null && costInclTax.compareTo(BigDecimal.ZERO) > 0);
                        product.setPricing(pricing);

                        Unit rowUnit = getOrCreateUnit(valUnit, fallbackUnit);
                        ProductInventoryPolicy inventory = product.getInventory() != null
                                ? product.getInventory()
                                : new ProductInventoryPolicy();
                        inventory.setDefaultUnit(rowUnit);
                        inventory.setReorderUnit(rowUnit);
                        if (reorderLevelIdx != null || product.getId() == null) {
                            inventory.setReorderLevel(defaultZero(reorderLevel));
                        }
                        if (reorderQtyIdx != null || product.getId() == null) {
                            inventory.setReorderQty(defaultZero(reorderQty));
                        }
                        if (safetyStockIdx != null || product.getId() == null) {
                            inventory.setSafetyStock(defaultZero(safetyStock));
                        }
                        if (minStockIdx != null || product.getId() == null) {
                            inventory.setMinStock(defaultZero(minStock));
                        }
                        if (maxStockIdx != null || product.getId() == null) {
                            inventory.setMaxStock(defaultZero(maxStock));
                        }
                        product.setInventory(inventory);

                        ProductTax tax = product.getTax() != null ? product.getTax() : new ProductTax();
                        tax.setTaxCategory(firstNonBlank(valTaxCategory, "Standard"));
                        tax.setPurchaseTax(defaultZero(firstNonNullDecimal(purchaseTax, new BigDecimal("5"))));
                        tax.setSalesTax(defaultZero(firstNonNullDecimal(salesTax, new BigDecimal("5"))));
                        tax.setHsnCode(firstNonBlank(valHsn, tax.getHsnCode()));
                        product.setTax(tax);

                        Product savedProduct = productRepo.save(product);

                        ProductPacking packing = upsertDefaultPacking(savedProduct, rowUnit, productCost, priceInclTax);
                        upsertBarcode(savedProduct, packing, barcodeValue, repeatedCodeInCurrentFile);
                        attachImageIfPresent(savedProduct, rowImageMap.get(r), valPic);

                        if (isUpdate) {
                            counters.updatedCount++;
                        } else {
                            counters.createdCount++;
                        }
                    } catch (Exception e) {
                        counters.errorCount++;
                        counters.errors.add("Sheet '" + sheetName + "' Row " + (r + 1) + ": " + e.getMessage());
                    } finally {
                        counters.processedRows++;
                        updateJob(job, counters, totalRows);
                    }
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }

        return buildResultMessage(counters);
    }

    private String buildResultMessage(ImportCounters counters) {
        StringBuilder result = new StringBuilder();
        result.append("Import Completed. Created: ").append(counters.createdCount);
        result.append(", Duplicate-code products created: ").append(counters.duplicateCreatedCount);
        result.append(", Updated: ").append(counters.updatedCount);
        result.append(", Skipped: ").append(counters.skippedCount + counters.emptySheetCount);
        if (counters.identicalDuplicateSkippedCount > 0 || counters.emptySheetCount > 0) {
            result.append(" (").append(counters.identicalDuplicateSkippedCount).append(" identical duplicate rows");
            if (counters.emptySheetCount > 0) {
                result.append(", ").append(counters.emptySheetCount).append(" empty sheets");
            }
            result.append(")");
        }
        result.append(", Errors: ").append(counters.errorCount);
        if (!counters.errors.isEmpty()) {
            result.append(". details: ").append(counters.errors.subList(0, Math.min(counters.errors.size(), 5)));
        }
        return result.toString();
    }

    private void updateJob(ImportJobStatus job, ImportCounters counters, int totalRows) {
        if (job == null) {
            return;
        }
        job.totalRows = totalRows;
        job.processedRows = counters.processedRows;
        job.createdCount = counters.createdCount;
        job.duplicateCreatedCount = counters.duplicateCreatedCount;
        job.updatedCount = counters.updatedCount;
        job.skippedCount = counters.skippedCount + counters.emptySheetCount;
        job.identicalDuplicateSkippedCount = counters.identicalDuplicateSkippedCount;
        job.errorCount = counters.errorCount;
        job.errors.clear();
        job.errors.addAll(counters.errors.subList(0, Math.min(counters.errors.size(), 5)));
        job.message = "Processing products...";
    }

    private int countImportRows(Workbook workbook) {
        int totalRows = 0;
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            Sheet sheet = workbook.getSheetAt(i);
            int headerRowNum = findHeaderRow(sheet);
            if (headerRowNum < 0) {
                continue;
            }
            for (int r = headerRowNum + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row != null && !isBlankRow(row) && !isReportFooterRow(row)) {
                    totalRows++;
                }
            }
        }
        return totalRows;
    }

    private int findHeaderRow(Sheet sheet) {
        for (int r = 0; r <= Math.min(sheet.getLastRowNum(), 20); r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                continue;
            }
            Map<String, Integer> headerMap = buildHeaderMap(row);
            Integer foundCodeIdx = findContentIndex(headerMap, "item code", "code", "product code",
                    "prdid", "product id", "prod id");
            Integer foundModelIdx = findContentIndex(headerMap, "supplier model no", "supplier model", "model no",
                    "model no.", "model", "model number", "item model");
            if (foundCodeIdx != null || foundModelIdx != null) {
                return r;
            }
            // Albadar format: no code/model column, but has product name + barcode columns
            Integer foundBarcodeIdx = findContentIndex(headerMap, "barcode", "bar code", "ean", "upc");
            Integer foundNameIdx = findContentIndex(headerMap, "item name", "description", "product description",
                    "product name", "name", "item description", "product",
                    "prdname");
            if (foundBarcodeIdx != null && foundNameIdx != null) {
                return r;
            }
            // Nest/Fitgenix format: "SKU" (product name) + "Landing Cost" OR "Item" columns
            Integer foundSkuIdx = findContentIndex(headerMap, "sku");
            Integer foundLandingCostIdx = findContentIndex(headerMap, "landing cost", "landingcost");
            Integer foundItemIdx = findContentIndex(headerMap, "item");
            if (foundSkuIdx != null && (foundLandingCostIdx != null || foundItemIdx != null)) {
                return r;
            }
        }
        return -1;
    }

    private Map<String, Integer> buildHeaderMap(Row row) {
        Map<String, Integer> map = new HashMap<>();
        if (row == null) {
            return map;
        }
        for (Cell cell : row) {
            String rawValue = getCellValue(cell);
            if (rawValue == null) {
                continue;
            }
            String val = rawValue.trim().toLowerCase();
            if (val.isBlank()) {
                continue;
            }
            map.putIfAbsent(val, cell.getColumnIndex());
            String normalized = normalizeKey(val);
            if (!normalized.isEmpty()) {
                map.putIfAbsent(normalized, cell.getColumnIndex());
            }
        }
        return map;
    }

    private Map<Integer, PictureData> buildRowImageMap(Sheet sheet) {
        Map<Integer, PictureData> rowImageMap = new HashMap<>();
        if (sheet instanceof XSSFSheet xssfSheet) {
            XSSFDrawing drawing = xssfSheet.getDrawingPatriarch();
            if (drawing != null) {
                for (XSSFShape shape : drawing.getShapes()) {
                    if (shape instanceof XSSFPicture pic) {
                        XSSFClientAnchor anchor = (XSSFClientAnchor) pic.getAnchor();
                        rowImageMap.put(anchor.getRow1(), pic.getPictureData());
                    }
                }
            }
        }
        return rowImageMap;
    }

    private boolean shouldUseItemColumnAsCode(Sheet sheet, int headerRowNum, Integer skuIdx, Integer itemIdx) {
        int checked = 0;
        int skuLooksCode = 0;
        int itemLooksCode = 0;
        int skuLooksName = 0;
        int itemLooksName = 0;

        for (int r = headerRowNum + 1; r <= sheet.getLastRowNum() && checked < 40; r++) {
            Row row = sheet.getRow(r);
            if (row == null || isBlankRow(row) || isReportFooterRow(row)) {
                continue;
            }

            String sku = cell(row, skuIdx);
            String item = cell(row, itemIdx);
            if (isBlank(sku) || isBlank(item)) {
                continue;
            }

            checked++;
            if (looksLikeProductCode(sku)) {
                skuLooksCode++;
            }
            if (looksLikeProductCode(item)) {
                itemLooksCode++;
            }
            if (looksLikeProductName(sku)) {
                skuLooksName++;
            }
            if (looksLikeProductName(item)) {
                itemLooksName++;
            }
        }

        return checked > 0 && itemLooksCode > skuLooksCode && skuLooksName > itemLooksName;
    }

    private boolean shouldSwapCodeAndNameForRow(String codeValue, String nameValue) {
        return looksLikeProductName(codeValue) && looksLikeProductCode(nameValue);
    }

    private boolean looksLikeProductCode(String value) {
        if (isBlank(value)) {
            return false;
        }
        String trimmed = value.trim();
        if (trimmed.length() > 40 || trimmed.matches(".*\\s+.*")) {
            return false;
        }
        return trimmed.matches("[A-Za-z0-9._/#-]+") && trimmed.matches(".*[0-9].*");
    }

    private boolean looksLikeProductName(String value) {
        if (isBlank(value)) {
            return false;
        }
        String trimmed = value.trim();
        return trimmed.length() > 20 || trimmed.matches(".*\\s+.*");
    }

    private Optional<Product> findProductByBarcode(String barcodeValue) {
        if (isBlank(barcodeValue)) {
            return Optional.empty();
        }
        return barcodeRepo.findFirstByBarcode(barcodeValue.trim()).map(ProductBarcode::getProduct);
    }

    private boolean productMatchesRow(Product product, String name, String barcodeValue, BigDecimal cost,
            BigDecimal landingCost, BigDecimal retailPrice, BigDecimal nlc, BigDecimal markup, BigDecimal gp,
            BigDecimal wholesalePrice, BigDecimal minPrice, BigDecimal maxPrice, BigDecimal onlinePrice,
            BigDecimal defaultDiscount, BigDecimal loyaltyPoints, Integer reorderLevel, String unitName,
            String categoryName, String brandName) {
        if (product == null) {
            return false;
        }
        if (!equalsText(product.getName(), name)) {
            return false;
        }
        if (!isBlank(brandName) && (product.getBrand() == null || !equalsText(product.getBrand().getName(), brandName))) {
            return false;
        }
        if (!isBlank(categoryName)) {
            String productCategory = product.getDepartment() != null ? product.getDepartment().getName() : product.getCategory();
            if (!equalsText(productCategory, categoryName)) {
                return false;
            }
        }
        ProductInventoryPolicy inventory = product.getInventory();
        if (inventory != null) {
            if (reorderLevel != null && !equalsInteger(inventory.getReorderLevel(), reorderLevel)) {
                return false;
            }
            if (!isBlank(unitName) && inventory.getDefaultUnit() != null
                    && !equalsText(inventory.getDefaultUnit().getName(), unitName)
                    && !equalsText(inventory.getDefaultUnit().getSymbol(), unitName)) {
                return false;
            }
        }
        ProductPricing pricing = product.getPricing();
        if (pricing != null) {
            if (!equalsDecimal(pricing.getCost(), defaultZero(cost))
                    || !equalsDecimal(pricing.getLandingCost(), defaultZero(landingCost))
                    || !equalsDecimal(pricing.getRetailPrice(), defaultZero(retailPrice))
                    || !equalsDecimal(pricing.getNlc(), defaultZero(nlc))
                    || !equalsDecimal(pricing.getMarkup(), defaultZero(markup))
                    || !equalsDecimal(pricing.getGp(), defaultZero(gp))) {
                return false;
            }
            if (!equalsDecimalIfProvided(pricing.getWholesalePrice(), wholesalePrice)
                    || !equalsDecimalIfProvided(pricing.getMinPrice(), minPrice)
                    || !equalsDecimalIfProvided(pricing.getMaxPrice(), maxPrice)
                    || !equalsDecimalIfProvided(pricing.getOnlinePrice(), onlinePrice)
                    || !equalsDecimalIfProvided(pricing.getDefaultDiscount(), defaultDiscount)
                    || !equalsDecimalIfProvided(pricing.getLoyaltyPoints(), loyaltyPoints)) {
                return false;
            }
        }
        if (!isBlank(barcodeValue)) {
            return barcodeRepo.findByProductId(product.getId()).stream()
                    .anyMatch(barcode -> equalsText(barcode.getBarcode(), barcodeValue));
        }
        return true;
    }

    private ProductPacking upsertDefaultPacking(Product product, Unit unit, BigDecimal cost, BigDecimal price) {
        ProductPacking packing = packingRepo.findByProductId(product.getId()).stream()
                .findFirst()
                .orElseGet(ProductPacking::new);
        packing.setProduct(product);
        packing.setUnit(unit);
        packing.setLevel("1");
        packing.setConversion(BigDecimal.ONE);
        packing.setBaseQty(BigDecimal.ONE);
        packing.setSale(true);
        packing.setPurchase(true);
        packing.setCost(defaultZero(cost));
        packing.setPrice(defaultZero(price));
        return packingRepo.save(packing);
    }

    private void upsertBarcode(Product product, ProductPacking packing, String barcodeValue, boolean reassignExisting) {
        if (isBlank(barcodeValue)) {
            return;
        }
        String barcodeText = barcodeValue.trim();
        Optional<ProductBarcode> existingBarcode = barcodeRepo.findFirstByBarcode(barcodeText);
        if (existingBarcode.isPresent()
                && existingBarcode.get().getProduct() != null
                && !existingBarcode.get().getProduct().getId().equals(product.getId())) {
            if (!reassignExisting) {
                return;
            }
            ProductBarcode barcode = existingBarcode.get();
            barcode.setProduct(product);
            barcode.setPacking(packing);
            barcode.setBarcode(barcodeText);
            barcodeRepo.save(barcode);
            return;
        }

        ProductBarcode barcode = existingBarcode.orElseGet(ProductBarcode::new);
        barcode.setProduct(product);
        barcode.setPacking(packing);
        barcode.setBarcode(barcodeText);
        barcodeRepo.save(barcode);
    }

    private void attachImageIfPresent(Product product, PictureData embeddedPic, String imageCellValue) {
        String imageUrl = null;
        if (embeddedPic != null) {
            String ext = embeddedPic.suggestFileExtension();
            imageUrl = imageStorageService.storeRawBytes(embeddedPic.getData(), ext);
        } else if (!isBlank(imageCellValue)) {
            imageUrl = imageCellValue.trim();
        }
        if (imageUrl != null) {
            ProductMedia media = new ProductMedia();
            media.setProduct(product);
            media.setImageUrl(imageUrl);
            media.setPrimary(true);
            mediaRepo.save(media);
        }
    }

    private void attachImageIfAbsent(Product product, PictureData embeddedPic, String imageCellValue) {
        boolean hasImage = embeddedPic != null || !isBlank(imageCellValue);
        if (!hasImage) {
            return;
        }
        if (mediaRepo.findByProductIdAndIsPrimaryTrue(product.getId()).isPresent()) {
            return;
        }
        attachImageIfPresent(product, embeddedPic, imageCellValue);
    }

    private Brand getOrCreateBrand(String brandName) {
        String trimmedName = firstNonBlank(brandName, "General");
        Optional<Brand> byName = brandRepo.findByNameIgnoreCase(trimmedName);
        if (byName.isPresent()) {
            Brand found = byName.get();
            if (!found.isActive()) {
                found.setActive(true);
                brandRepo.save(found);
            }
            return found;
        }

        Brand newBrand = new Brand();
        newBrand.setName(trimmedName);
        newBrand.setCode(generateUniqueBrandCode(trimmedName));
        newBrand.setActive(true);
        return brandRepo.save(newBrand);
    }

    private Department getOrCreateDepartment(String deptName) {
        String trimmedName = firstNonBlank(deptName, "General");
        Optional<Department> found = departmentRepo.findByNameIgnoreCase(trimmedName);
        if (found.isPresent()) {
            return found.get();
        }

        Department newDept = new Department();
        newDept.setName(trimmedName);
        newDept.setCode(generateUniqueDepartmentCode(trimmedName));
        return departmentRepo.save(newDept);
    }

    private Unit getOrCreateUnit(String unitCode, Unit fallbackUnit) {
        String trimmed = firstNonBlank(unitCode, null);
        if (isBlank(trimmed)) {
            return fallbackUnit != null ? fallbackUnit : unitRepo.findByIsActiveTrueOrderByNameAsc().stream()
                    .findFirst()
                    .orElseGet(() -> unitRepo.save(new Unit("PCS", "PCS", "Auto-created during product import")));
        }

        return unitRepo.findBySymbolIgnoreCaseAndIsActiveTrue(trimmed)
                .or(() -> unitRepo.findByNameIgnoreCaseAndIsActiveTrue(trimmed))
                .orElseGet(() -> {
                    String symbol = trimmed.length() > 10 ? trimmed.substring(0, 10) : trimmed;
                    return unitRepo.save(new Unit(trimmed, symbol, "Auto-created during product import"));
                });
    }

    private String generateUniqueProductCode(String baseCode, Set<String> reservedCodes) {
        String base = limit(firstNonBlank(baseCode, "PRODUCT"), 50);
        int seq = 2;
        String candidate;
        do {
            String suffix = "-" + seq++;
            candidate = limit(base, Math.max(1, 50 - suffix.length())) + suffix;
        } while (reservedCodes.contains(candidate) || productRepo.findByCode(candidate).isPresent());
        return candidate;
    }

    private String generateUniqueBrandCode(String name) {
        String base = sanitizeCode(name, 6, "GEN");
        String candidate = base;
        int seq = 1;
        while (brandRepo.findByCodeIgnoreCase(candidate).isPresent()) {
            String suffix = String.valueOf(seq++);
            candidate = limit(base, Math.max(1, 10 - suffix.length())) + suffix;
        }
        return candidate;
    }

    private String generateUniqueDepartmentCode(String name) {
        String base = sanitizeCode(name, 6, "GEN");
        String candidate = base;
        int seq = 1;
        while (departmentRepo.existsByCode(candidate)) {
            String suffix = String.valueOf(seq++);
            candidate = limit(base, Math.max(1, 10 - suffix.length())) + suffix;
        }
        return candidate;
    }

    private String sanitizeCode(String name, int maxLen, String fallback) {
        String slug = firstNonBlank(name, fallback).replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        if (slug.isBlank()) {
            slug = fallback;
        }
        return limit(slug, maxLen);
    }

    private Integer findContentIndex(Map<String, Integer> map, String... keys) {
        for (String key : keys) {
            String lower = key.toLowerCase();
            if (map.containsKey(lower)) {
                return map.get(lower);
            }
            String normalizedKey = normalizeKey(lower);
            if (map.containsKey(normalizedKey)) {
                return map.get(normalizedKey);
            }
        }
        return null;
    }

    private String normalizeKey(String value) {
        return value == null ? "" : value.replaceAll("[^a-z0-9]", "");
    }

    private String buildRowSignature(Row row) {
        short lastCell = row.getLastCellNum();
        List<String> values = new ArrayList<>();
        for (int i = 0; i < lastCell; i++) {
            String value = cell(row, i);
            values.add(value == null ? "" : value);
        }
        return String.join("\u001F", values);
    }

    private boolean isBlankRow(Row row) {
        if (row == null || row.getLastCellNum() <= 0) {
            return true;
        }
        for (int i = 0; i < row.getLastCellNum(); i++) {
            if (!isBlank(cell(row, i))) {
                return false;
            }
        }
        return true;
    }

    private String cell(Row row, Integer index) {
        if (row == null || index == null || index < 0) {
            return null;
        }
        return getCellValue(row.getCell(index));
    }

    private String getCellValue(Cell cell) {
        if (cell == null) {
            return null;
        }
        String value = new DataFormatter().formatCellValue(cell);
        return value == null ? null : value.replace('\u00A0', ' ').trim();
    }

    private boolean isReportFooterRow(Row row) {
        String first = cell(row, 0);
        String last = row.getLastCellNum() > 0 ? cell(row, (int) row.getLastCellNum() - 1) : null;
        return first != null
                && first.matches("\\d{1,2}/\\d{1,2}/\\d{4}")
                && last != null
                && last.matches("\\d+\\s+of\\s+\\d+");
    }

    private boolean isChecked(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim().toLowerCase();
        return normalized.equals("checked")
                || normalized.equals("true")
                || normalized.equals("yes")
                || normalized.equals("1");
    }

    private BigDecimal parseDecimal(String value) {
        if (isBlank(value)) {
            return null;
        }
        String cleaned = value.replace(",", "").replaceAll("[^0-9.\\-]", "");
        if (cleaned.isBlank() || cleaned.equals("-") || cleaned.equals(".")) {
            return null;
        }
        return new BigDecimal(cleaned);
    }

    private Integer parseInteger(String value) {
        BigDecimal decimal = parseDecimal(value);
        return decimal == null ? null : decimal.intValue();
    }

    private ProductStatus parseStatus(String statusValue, String inactiveValue) {
        String normalized = firstNonBlank(statusValue, inactiveValue);
        if (isBlank(normalized)) {
            return ProductStatus.ACTIVE;
        }
        String text = normalized.trim().toLowerCase();
        if (isChecked(text) || text.equals("inactive") || text.equals("draft") || text.equals("disabled")) {
            return ProductStatus.DRAFT;
        }
        return ProductStatus.ACTIVE;
    }

    private ProductType parseProductType(String value) {
        if (isBlank(value)) {
            return ProductType.STOCK;
        }
        String normalized = normalizeEnumName(value);
        if (normalized.equals("SERVICE") || normalized.equals("SERVICES")) {
            return ProductType.SERVICE;
        }
        return ProductType.STOCK;
    }

    private CostMethod parseCostMethod(String value) {
        if (isBlank(value)) {
            return null;
        }
        String normalized = normalizeEnumName(value);
        if (normalized.equals("WEIGHTEDAVERAGE") || normalized.equals("AVERAGE")) {
            return CostMethod.WEIGHTED_AVERAGE;
        }
        if (normalized.equals("LASTPURCHASE") || normalized.equals("LASTPURCHASECOST")) {
            return CostMethod.LAST_PURCHASE_COST;
        }
        try {
            return CostMethod.valueOf(normalized);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private String normalizeEnumName(String value) {
        return value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9]+", "_").replaceAll("^_|_$", "").toUpperCase();
    }

    private boolean equalsText(String left, String right) {
        String leftValue = left == null ? "" : left.trim();
        String rightValue = right == null ? "" : right.trim();
        return leftValue.equalsIgnoreCase(rightValue);
    }

    private boolean equalsInteger(Integer left, Integer right) {
        return defaultZero(left).equals(defaultZero(right));
    }

    private boolean equalsDecimal(BigDecimal left, BigDecimal right) {
        return defaultZero(left).compareTo(defaultZero(right)) == 0;
    }

    private boolean equalsDecimalIfProvided(BigDecimal existing, BigDecimal imported) {
        return imported == null || equalsDecimal(existing, imported);
    }

    private BigDecimal defaultZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private Integer defaultZero(Integer value) {
        return value != null ? value : 0;
    }

    private BigDecimal firstNonNullDecimal(BigDecimal... values) {
        if (values == null) {
            return null;
        }
        for (BigDecimal value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (!isBlank(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
