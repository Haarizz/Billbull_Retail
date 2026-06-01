package com.billbull.backend.inventory.product;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
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
            byte[] bytes = file.getBytes();
            importExecutor.submit(() -> runImportJob(bytes, job));
        } catch (IOException e) {
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

    private void runImportJob(byte[] bytes, ImportJobStatus job) {
        job.status = "RUNNING";
        job.startedAt = System.currentTimeMillis();
        try {
            job.message = importProducts(new ByteArrayInputStream(bytes), job);
            job.status = "SUCCESS";
        } catch (Exception e) {
            job.errorCount++;
            job.message = "Import Failed: " + e.getMessage();
            job.errors.add(job.message);
            job.status = "FAILED";
        } finally {
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
                Integer codeIdx = findContentIndex(headerMap, "item code", "code", "product code");
                Integer nameIdx = findContentIndex(headerMap, "item name", "description", "product description",
                        "product name", "name", "item description");
                Integer picIdx = findContentIndex(headerMap, "picture", "image", "photo", "img", "item photo");
                Integer barcodeIdx = findContentIndex(headerMap, "barcode", "bar code", "ean", "upc");
                Integer unitIdx = findContentIndex(headerMap, "unit code", "unit", "uom");
                Integer deptIdx = findContentIndex(headerMap, "department name", "department", "dept");
                Integer costIdx = findContentIndex(headerMap, "cost");
                Integer lastSupCostIdx = findContentIndex(headerMap, "last sup cost", "last supplier cost",
                        "landing cost");
                Integer priceInclTaxIdx = findContentIndex(headerMap, "price incl tax", "price including tax",
                        "retail price", "selling price");
                Integer costInclTaxIdx = findContentIndex(headerMap, "cost incl tax", "cost including tax", "nlc");
                Integer inactiveIdx = findContentIndex(headerMap, "inactive", "in active");
                Integer markupIdx = findContentIndex(headerMap, "markup");
                Integer gpIdx = findContentIndex(headerMap, "gross profit", "gp");
                Integer catIdx = findContentIndex(headerMap, "catalogue no", "catalogue code", "cat no", "cat code",
                        "catalog no", "catalog code");
                Integer brandColIdx = findContentIndex(headerMap, "brand", "brand name", "make");

                if (codeIdx == null && modelIdx != null) {
                    codeIdx = modelIdx;
                }
                if (modelIdx == null && codeIdx != null) {
                    modelIdx = codeIdx;
                }

                String fallbackBrandName = "Sheet".equalsIgnoreCase(sheetName) ? "General" : sheetName;
                Brand fallbackBrand = getOrCreateBrand(fallbackBrandName);
                Map<Integer, PictureData> rowImageMap = buildRowImageMap(sheet);

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

                        String valModel = cell(row, modelIdx);
                        String valCode = cell(row, codeIdx);
                        String valName = cell(row, nameIdx);
                        String valPic = cell(row, picIdx);
                        String valBarcode = cell(row, barcodeIdx);
                        String valUnit = cell(row, unitIdx);
                        String valDept = cell(row, deptIdx);
                        String valInactive = cell(row, inactiveIdx);
                        String valCat = cell(row, catIdx);
                        String valBrandCol = cell(row, brandColIdx);

                        String finalName = firstNonBlank(valName, valCat, valModel, valCode);
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
                        BigDecimal markup = parseDecimal(cell(row, markupIdx));
                        BigDecimal gp = parseDecimal(cell(row, gpIdx));
                        String barcodeValue = firstNonBlank(valBarcode, baseCode);

                        Product product = null;
                        boolean isUpdate = false;

                        Optional<Product> existingByBarcode = findProductByBarcode(barcodeValue);
                        if (existingByBarcode.isPresent()
                                && productMatchesRow(existingByBarcode.get(), finalName, barcodeValue, cost,
                                        lastSupCost, priceInclTax, costInclTax, markup, gp)) {
                            counters.skippedCount++;
                            continue;
                        }

                        Optional<Product> existingByCode = productRepo.findByCode(baseCode);
                        if (!repeatedCodeInCurrentFile && existingByCode.isPresent()) {
                            product = existingByCode.get();
                            isUpdate = true;
                        } else if (repeatedCodeInCurrentFile) {
                            if (existingByCode.isPresent()
                                    && productMatchesRow(existingByCode.get(), finalName, barcodeValue, cost,
                                            lastSupCost, priceInclTax, costInclTax, markup, gp)) {
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
                        product.setBrand(!isBlank(valBrandCol) ? getOrCreateBrand(valBrandCol) : fallbackBrand);
                        product.setActive(true);
                        product.setStatus(isChecked(valInactive) ? ProductStatus.DRAFT : ProductStatus.ACTIVE);
                        product.setProductType(ProductType.STOCK);

                        if (!isBlank(valDept)) {
                            Department department = getOrCreateDepartment(valDept);
                            product.setDepartment(department);
                            product.setCategory(department.getName());
                        } else if (isBlank(product.getCategory())) {
                            product.setCategory("General");
                        }

                        ProductPricing pricing = product.getPricing() != null ? product.getPricing() : new ProductPricing();
                        pricing.setCost(defaultZero(cost));
                        pricing.setLandingCost(defaultZero(lastSupCost));
                        pricing.setNlc(defaultZero(costInclTax));
                        pricing.setRetailPrice(defaultZero(priceInclTax));
                        pricing.setMarkup(defaultZero(markup));
                        pricing.setGp(defaultZero(gp));
                        pricing.setCostInclusive(costInclTax != null && costInclTax.compareTo(BigDecimal.ZERO) > 0);
                        product.setPricing(pricing);

                        Unit rowUnit = getOrCreateUnit(valUnit, fallbackUnit);
                        ProductInventoryPolicy inventory = product.getInventory() != null
                                ? product.getInventory()
                                : new ProductInventoryPolicy();
                        inventory.setDefaultUnit(rowUnit);
                        product.setInventory(inventory);

                        ProductTax tax = product.getTax() != null ? product.getTax() : new ProductTax();
                        tax.setTaxCategory("Standard");
                        tax.setPurchaseTax(new BigDecimal("5"));
                        tax.setSalesTax(new BigDecimal("5"));
                        product.setTax(tax);

                        Product savedProduct = productRepo.save(product);

                        ProductPacking packing = upsertDefaultPacking(savedProduct, rowUnit, cost, priceInclTax);
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
            Integer foundCodeIdx = findContentIndex(headerMap, "item code", "code", "product code");
            Integer foundModelIdx = findContentIndex(headerMap, "supplier model no", "supplier model", "model no",
                    "model no.", "model", "model number", "item model");
            if (foundCodeIdx != null || foundModelIdx != null) {
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
            String val = getCellValue(cell).trim().toLowerCase();
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

    private Optional<Product> findProductByBarcode(String barcodeValue) {
        if (isBlank(barcodeValue)) {
            return Optional.empty();
        }
        return barcodeRepo.findFirstByBarcode(barcodeValue.trim()).map(ProductBarcode::getProduct);
    }

    private boolean productMatchesRow(Product product, String name, String barcodeValue, BigDecimal cost,
            BigDecimal lastSupCost, BigDecimal priceInclTax, BigDecimal costInclTax, BigDecimal markup, BigDecimal gp) {
        if (product == null) {
            return false;
        }
        if (!equalsText(product.getName(), name)) {
            return false;
        }
        ProductPricing pricing = product.getPricing();
        if (pricing != null) {
            if (!equalsDecimal(pricing.getCost(), defaultZero(cost))
                    || !equalsDecimal(pricing.getLandingCost(), defaultZero(lastSupCost))
                    || !equalsDecimal(pricing.getRetailPrice(), defaultZero(priceInclTax))
                    || !equalsDecimal(pricing.getNlc(), defaultZero(costInclTax))
                    || !equalsDecimal(pricing.getMarkup(), defaultZero(markup))
                    || !equalsDecimal(pricing.getGp(), defaultZero(gp))) {
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

    private boolean equalsText(String left, String right) {
        String leftValue = left == null ? "" : left.trim();
        String rightValue = right == null ? "" : right.trim();
        return leftValue.equalsIgnoreCase(rightValue);
    }

    private boolean equalsDecimal(BigDecimal left, BigDecimal right) {
        return defaultZero(left).compareTo(defaultZero(right)) == 0;
    }

    private BigDecimal defaultZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
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
