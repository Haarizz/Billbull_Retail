package com.billbull.backend.inventory.product;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
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

    private final ProductRepository productRepo;
    private final BrandRepository brandRepo;
    private final DepartmentRepository departmentRepo;
    private final UnitRepository unitRepo;
    private final ProductPackingRepository packingRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository mediaRepo;
    private final ProductImageStorageService imageStorageService;

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

    // No outer @Transactional: each productRepo.save() runs in its own implicit JPA
    // transaction.
    // This prevents one bad row from corrupting the entire Hibernate session.
    @CacheEvict(value = "productList", allEntries = true)
    public String importProducts(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Import file is empty");
        }

        int successCount = 0;
        int duplicateCount = 0;
        int emptySheetCount = 0;
        int errorCount = 0;
        List<String> errors = new ArrayList<>();

        Unit defaultUnit = unitRepo.findByNameIgnoreCaseAndIsActiveTrue("Piece")
                .or(() -> unitRepo.findByNameIgnoreCaseAndIsActiveTrue("Nos"))
                .or(() -> unitRepo.findByIsActiveTrueOrderByNameAsc().stream().findFirst())
                .orElseGet(() -> {
                    // Auto-create "Nos" unit if none exist in the database
                    Unit nos = new Unit("Nos", "NOS", "Number of pieces - auto created during import");
                    return unitRepo.save(nos);
                });

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            int numberOfSheets = workbook.getNumberOfSheets();

            for (int i = 0; i < numberOfSheets; i++) {
                Sheet sheet = workbook.getSheetAt(i);
                String sheetName = sheet.getSheetName();

                // Check if the sheet has any data (at least 2 rows: header + 1 data row)
                if (sheet.getLastRowNum() < 1) {
                    emptySheetCount++;
                    continue;
                }

                // --- ROBUST HEADER DETECTION ---
                Row headerRow = null;
                int headerRowNum = -1;
                Map<String, Integer> headerMap = new HashMap<>();

                // Scan first 20 rows to find header row (first row with any recognized column)
                for (int r = 0; r <= Math.min(sheet.getLastRowNum(), 20); r++) {
                    Row curRow = sheet.getRow(r);
                    if (curRow == null)
                        continue;

                    Map<String, Integer> tempMap = new HashMap<>();
                    for (Cell cell : curRow) {
                        try {
                            if (cell.getCellType() == CellType.STRING) {
                                String val = cell.getStringCellValue().trim().toLowerCase();
                                if (!val.isBlank()) {
                                    tempMap.put(val, cell.getColumnIndex());
                                    // Add normalized version (alphanumeric only) for fuzzy matching
                                    String normalized = val.replaceAll("[^a-z0-9]", "");
                                    if (!normalized.isEmpty())
                                        tempMap.put(normalized, cell.getColumnIndex());
                                }
                            }
                        } catch (Exception ignored) {
                        }
                    }

                    // Check if this row looks like a header row
                    Integer foundCodeIdx = findContentIndex(tempMap, "item code", "code", "product code");
                    Integer foundModelIdx = findContentIndex(tempMap, "supplier model no", "supplier model", "model no",
                            "model no.", "model", "model number", "item model");

                    if (foundCodeIdx != null || foundModelIdx != null) {
                        headerRow = curRow;
                        headerRowNum = r;
                        headerMap = tempMap;
                        break;
                    }
                }

                if (headerRow == null) {
                    errors.add("Sheet '" + sheetName
                            + "': Could not find header row (e.g., 'Model' or 'Item Code') - skipped.");
                    continue;
                }

                Brand brand = getOrCreateBrand(sheetName);
                // Department is intentionally left null — user assigns it after import

                // --- Build row → embedded image map using POI XSSFDrawing ---
                Map<Integer, PictureData> rowImageMap = new HashMap<>();
                if (sheet instanceof XSSFSheet xssfSheet) {
                    XSSFDrawing drawing = xssfSheet.getDrawingPatriarch();
                    if (drawing != null) {
                        for (XSSFShape shape : drawing.getShapes()) {
                            if (shape instanceof XSSFPicture pic) {
                                XSSFClientAnchor anchor = (XSSFClientAnchor) pic.getAnchor();
                                int anchorRow = anchor.getRow1();
                                rowImageMap.put(anchorRow, pic.getPictureData());
                            }
                        }
                    }
                }

                // Column mapping based on detected header row
                Integer modelIdx = findContentIndex(headerMap, "supplier model no", "supplier model", "model no",
                        "model no.", "model", "model number", "item model");
                Integer codeIdx = findContentIndex(headerMap, "item code", "code", "product code");
                Integer nameIdx = findContentIndex(headerMap, "item name", "description", "product name", "name",
                        "item description");
                Integer picIdx = findContentIndex(headerMap, "picture", "image", "photo", "img", "item photo");
                // Catalogue no used ONLY as a last-resort identifier (not model)
                Integer catIdx = findContentIndex(headerMap, "catalogue no", "catalogue code", "cat no", "cat code",
                        "catalog no", "catalog code");
                // Brand column to build a meaningful name when no name column exists
                Integer brandColIdx = findContentIndex(headerMap, "brand", "brand name", "make");

                // If no explicit code column, use Model No as the code
                if (codeIdx == null && modelIdx != null)
                    codeIdx = modelIdx;
                // If no model column, fall back to code column for barcode
                if (modelIdx == null && codeIdx != null)
                    modelIdx = codeIdx;

                // Process data rows starting AFTER the header row
                for (int r = headerRowNum + 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null)
                        continue;

                    try {
                        String valModel = (modelIdx != null) ? getCellValue(row.getCell(modelIdx)) : null;
                        String valCode = (codeIdx != null) ? getCellValue(row.getCell(codeIdx)) : null;
                        String valName = (nameIdx != null) ? getCellValue(row.getCell(nameIdx)) : null;
                        String valPic = (picIdx != null) ? getCellValue(row.getCell(picIdx)) : null;
                        String valCat = (catIdx != null) ? getCellValue(row.getCell(catIdx)) : null;
                        String valBrandCol = (brandColIdx != null) ? getCellValue(row.getCell(brandColIdx)) : null;

                        boolean modelIsBlank = (valModel == null || valModel.trim().isEmpty());
                        boolean codeIsBlank = (valCode == null || valCode.trim().isEmpty());
                        boolean nameIsBlank = (valName == null || valName.trim().isEmpty());
                        boolean catIsBlank = (valCat == null || valCat.trim().isEmpty());

                        // Build a meaningful display name for the product
                        // Priority: explicit name → brand+catalogue → catalogue → sheet name
                        String finalName;
                        if (!nameIsBlank) {
                            finalName = valName.trim();
                        } else if (!catIsBlank) {
                            // Combine brand column (if present in row) with catalogue no for a readable
                            // name
                            String brandPart = (valBrandCol != null && !valBrandCol.trim().isEmpty())
                                    ? valBrandCol.trim() + " - "
                                    : "";
                            finalName = brandPart + valCat.trim();
                        } else if (!modelIsBlank) {
                            finalName = valModel.trim();
                        } else if (!codeIsBlank) {
                            finalName = valCode.trim();
                        } else {
                            // Truly blank row — skip silently
                            continue;
                        }
                        if (finalName.length() > 150)
                            finalName = finalName.substring(0, 150);

                        // Determine internal code (DB requires non-null unique value)
                        // Priority: model no → item code → catalogue no → name
                        String finalCode;
                        if (!modelIsBlank) {
                            finalCode = valModel.trim();
                        } else if (!codeIsBlank) {
                            finalCode = valCode.trim();
                        } else if (!catIsBlank) {
                            // Use catalogue no as the code since there's no model/code
                            finalCode = valCat.trim();
                        } else {
                            // Last resort: use the name as code
                            finalCode = finalName;
                        }
                        if (finalCode.length() > 50)
                            finalCode = finalCode.substring(0, 50);

                        // Duplicate check
                        if (productRepo.existsByCodeAndIsActiveTrue(finalCode)) {
                            duplicateCount++;
                            errors.add(
                                    "DUPLICATE: " + sheetName + " - '" + finalCode + "' already exists in the system.");
                            continue;
                        }

                        Product product = new Product();
                        product.setCode(finalCode);
                        product.setName(finalName);
                        product.setBrand(brand);
                        // department = null (user will assign after import)
                        product.setStatus(ProductStatus.ACTIVE);
                        product.setActive(true);
                        product.setProductType(ProductType.STOCK);
                        product.setCategory("General");

                        ProductPricing pricing = new ProductPricing();
                        pricing.setCost(BigDecimal.ZERO);
                        pricing.setRetailPrice(BigDecimal.ZERO);
                        product.setPricing(pricing);

                        ProductInventoryPolicy inventory = new ProductInventoryPolicy();
                        inventory.setDefaultUnit(defaultUnit);

                        ProductPackingRequest defaultPacking = new ProductPackingRequest();
                        String barcodeVal = (valModel != null && !valModel.trim().isEmpty()) ? valModel.trim()
                                : finalCode;
                        defaultPacking.setBarcode(barcodeVal);
                        defaultPacking.setLevel("1");
                        defaultPacking.setConversion(BigDecimal.ONE);

                        List<ProductPackingRequest> packings = new ArrayList<>();
                        packings.add(defaultPacking);
                        inventory.setPackings(packings);
                        product.setInventory(inventory);

                        ProductTax tax = new ProductTax();
                        product.setTax(tax);

                        Product savedProduct = productRepo.save(product);

                        // --- 1. Packing (only if unit exists) ---
                        if (defaultUnit != null) {
                            ProductPacking packing = new ProductPacking();
                            packing.setProduct(savedProduct);
                            packing.setUnit(defaultUnit);
                            packing.setLevel("1");
                            packing.setConversion(BigDecimal.ONE);
                            packing.setBaseQty(BigDecimal.ONE);
                            packing.setSale(true);
                            packing.setPurchase(true);
                            ProductPacking savedPacking = packingRepo.save(packing);

                            // --- 2. Barcode (skip if duplicate) ---
                            boolean barcodeExists = barcodeRepo.existsByBarcode(barcodeVal);
                            if (!barcodeExists) {
                                ProductBarcode barcode = new ProductBarcode();
                                barcode.setProduct(savedProduct);
                                barcode.setPacking(savedPacking);
                                barcode.setBarcode(barcodeVal);
                                barcodeRepo.save(barcode);
                            }
                        }

                        // --- 3. Picture: prefer embedded image, fall back to text cell ---
                        PictureData embeddedPic = rowImageMap.get(r);
                        String imageUrl = null;
                        if (embeddedPic != null) {
                            String ext = embeddedPic.suggestFileExtension();
                            imageUrl = imageStorageService.storeRawBytes(embeddedPic.getData(), ext);
                        } else if (valPic != null && !valPic.trim().isEmpty()) {
                            imageUrl = valPic.trim();
                        }
                        if (imageUrl != null) {
                            ProductMedia media = new ProductMedia();
                            media.setProduct(savedProduct);
                            media.setImageUrl(imageUrl);
                            media.setPrimary(true);
                            mediaRepo.save(media);
                        }

                        successCount++;

                    } catch (Exception e) {
                        errorCount++;
                        errors.add("Sheet '" + sheetName + "' Row " + (r + 1) + ": " + e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }

        StringBuilder result = new StringBuilder();
        int totalSkipped = duplicateCount + emptySheetCount;
        result.append("Import Completed. Success: ").append(successCount);
        result.append(", Skipped: ").append(totalSkipped);
        if (totalSkipped > 0) {
            result.append(" (").append(duplicateCount).append(" duplicates, ")
                    .append(emptySheetCount).append(" empty sheets)");
        }
        result.append(", Errors: ").append(errorCount);
        if (!errors.isEmpty()) {
            result.append(". details: ").append(errors.subList(0, Math.min(errors.size(), 5)));
        }
        return result.toString();
    }

    private Brand getOrCreateBrand(String brandName) {
        String trimmedName = brandName.trim();

        // 1. Try exact name match (active or inactive)
        Optional<Brand> byName = brandRepo.findByNameIgnoreCase(trimmedName);
        if (byName.isPresent()) {
            Brand found = byName.get();
            // Re-activate brands that may have been soft-deleted
            if (!found.isActive()) {
                found.setActive(true);
                brandRepo.save(found);
            }
            return found;
        }

        // 2. Create new brand with a guaranteed unique code
        String generatedCode = generateUniqueCode(trimmedName);
        // If code collides, append a short random suffix to ensure uniqueness
        if (brandRepo.findByCodeIgnoreCase(generatedCode).isPresent()) {
            generatedCode = generatedCode + String.valueOf(System.currentTimeMillis() % 1000);
            if (generatedCode.length() > 10)
                generatedCode = generatedCode.substring(0, 10);
        }

        Brand newBrand = new Brand();
        newBrand.setName(trimmedName);
        newBrand.setCode(generatedCode);
        newBrand.setActive(true);
        return brandRepo.save(newBrand);
    }

    private Department getOrCreateDepartment(String deptName) {
        // 1. Try exact name match first
        Optional<Department> found = departmentRepo.findByNameIgnoreCase(deptName.trim());
        if (found.isPresent())
            return found.get();

        // 2. Fall back to any existing department to avoid schema issues
        // (departments created via UI have all required fields set properly)
        List<Department> allDepts = departmentRepo.findAll();
        if (!allDepts.isEmpty()) {
            return allDepts.get(0);
        }

        // 3. Last resort: create a bare-minimum General department
        Department newDept = new Department();
        newDept.setName("General");
        newDept.setCode("GEN");
        // barcodePrefix defaults to "" (NOT NULL safe), autoGenerate defaults to false
        return departmentRepo.save(newDept);
    }

    private String generateUniqueCode(String name) {
        String slug = name.replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        String base = slug.length() > 6 ? slug.substring(0, 6) : slug;
        // Append timestamp suffix if empty
        if (base.isBlank())
            base = "GEN";
        return base;
    }

    private Integer findContentIndex(Map<String, Integer> map, String... keys) {
        for (String key : keys) {
            // Try exact match first
            if (map.containsKey(key))
                return map.get(key);
            // Try normalized match
            String normalizedKey = key.replaceAll("[^a-z0-9]", "");
            if (map.containsKey(normalizedKey))
                return map.get(normalizedKey);
        }
        return null; // Not found
    }

    private String getCellValue(Cell cell) {
        if (cell == null)
            return null;
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                // Check if date or just number? Assuming code/name are strings.
                // If model is numeric (e.g. 101), return as string "101"
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getDateCellValue().toString();
                }
                double val = cell.getNumericCellValue();
                if (val == (long) val)
                    return String.format("%d", (long) val);
                return String.valueOf(val);
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    return String.valueOf(cell.getNumericCellValue());
                }
            default:
                return "";
        }
    }
}
