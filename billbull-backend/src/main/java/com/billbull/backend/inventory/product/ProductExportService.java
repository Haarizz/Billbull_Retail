package com.billbull.backend.inventory.product;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.util.IOUtils;
import org.apache.poi.util.Units;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;

@Service
public class ProductExportService {

    private static final String UPLOAD_DIR = System.getProperty("user.dir") + "/uploads/products";

    public ByteArrayInputStream export(List<ProductAggregateResponse> products) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Products");

            // Create Header Row
            Row headerRow = sheet.createRow(0);
            String[] headers = {
                "Image", "ID", "Product Code", "Product Name", "Local Name", "SKU", 
                "Type", "Category", "Brand", "Department", "Sub-Department", 
                "Short Description", "Detailed Description", "Status",
                "Cost Price", "Landing Cost", "Net Landed Cost", "Cost Method",
                "Retail Price", "Wholesale Price", "Min Price", "Max Price", "Online Price", "Markup (%)", "GP (%)",
                "Purchase Tax (%)", "Sales Tax (%)", "Tax Category", "HSN Code",
                "Default Unit", "Reorder Unit", "Reorder Level", "Reorder Qty", 
                "Safety Stock", "Min Stock", "Max Stock", "Allow Negative Stock?",
                "Procurement Type", "Default Vendor", "Warehouse", "Zone", "Locator", "Bin",
                "Serial Tracking?", "Batch Tracking?", "Weighing Scale Item?", "Tags", "Packings"
            };

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);
            headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // Define wrap style for description fields
            CellStyle wrapStyle = workbook.createCellStyle();
            wrapStyle.setWrapText(true);
            wrapStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            int rowIdx = 1;
            for (ProductAggregateResponse p : products) {
                Row row = sheet.createRow(rowIdx++);
                row.setHeight((short) 1000); // Height for image (approx 50px)

                // 0. Image
                if (p.getPrimaryImage() != null && !p.getPrimaryImage().isEmpty()) {
                    try {
                        String filename = p.getPrimaryImage().substring(p.getPrimaryImage().lastIndexOf("/") + 1);
                        Path imagePath = Path.of(UPLOAD_DIR, filename);
                        
                        int pictureType = Workbook.PICTURE_TYPE_JPEG;
                        if (filename.toLowerCase().endsWith(".png")) {
                            pictureType = Workbook.PICTURE_TYPE_PNG;
                        }

                        try (InputStream is = new FileInputStream(imagePath.toFile())) {
                            byte[] bytes = IOUtils.toByteArray(is);
                            int pictureIdx = workbook.addPicture(bytes, pictureType);
                            
                            Drawing<?> drawing = sheet.createDrawingPatriarch();
                            ClientAnchor anchor = workbook.getCreationHelper().createClientAnchor();
                            
                            anchor.setCol1(0);
                            anchor.setRow1(row.getRowNum());
                            anchor.setCol2(1);
                            anchor.setRow2(row.getRowNum() + 1);
                            
                            // Inset logic to keep aspect ratio or padding? 
                            // Standard Excel behavior with POI anchors is stretching to fit unless resize is called.
                            // To fit PROPORTIONALLY within the cell is complex (requires reading image dim).
                            // For "fit in the image column", user usually means "don't spill over". 
                            // Stretching is acceptable or padding.
                            // Let's add a small padding by using dx/dy
                            anchor.setDx1(5 * Units.EMU_PER_PIXEL);
                            anchor.setDy1(5 * Units.EMU_PER_PIXEL);
                            anchor.setDx2(-5 * Units.EMU_PER_PIXEL);
                            anchor.setDy2(-5 * Units.EMU_PER_PIXEL);
                            anchor.setAnchorType(ClientAnchor.AnchorType.MOVE_AND_RESIZE);
                            
                            Picture pict = drawing.createPicture(anchor, pictureIdx);
                            // Do NOT call resize() to force it into the anchor bounds
                        }
                    } catch (IOException e) {
                        // Ignore
                        System.err.println("Failed to load image for product " + p.getProduct().getId() + ": " + e.getMessage());
                    }
                }

                // 1. ID
                row.createCell(1).setCellValue(p.getProduct().getId());
                
                // 2. Code
                row.createCell(2).setCellValue(p.getProduct().getCode());
                
                // 3. Name
                row.createCell(3).setCellValue(p.getProduct().getName());
                
                // 4. Local Name
                row.createCell(4).setCellValue(p.getProduct().getLocalName());
                
                // 5. SKU
                row.createCell(5).setCellValue(p.getProduct().getSku());

                // 6. Type
                row.createCell(6).setCellValue(
                    p.getProduct().getProductType() != null ? p.getProduct().getProductType().toString() : ""
                );

                // 7. Category
                row.createCell(7).setCellValue(p.getProduct().getCategory());

                // 8. Brand
                row.createCell(8).setCellValue(
                    p.getProduct().getBrand() != null ? p.getProduct().getBrand().getName() : ""
                );

                // 9. Department
                row.createCell(9).setCellValue(
                    p.getProduct().getDepartment() != null ? p.getProduct().getDepartment().getName() : ""
                );

                // 10. Sub-Department
                row.createCell(10).setCellValue(
                    p.getProduct().getSubDepartment() != null ? p.getProduct().getSubDepartment().getName() : ""
                );

                // 11. Description in wrapped cell
                Cell descCell = row.createCell(11);
                descCell.setCellValue(p.getProduct().getShortDesc());
                descCell.setCellStyle(wrapStyle);

                // 12. Detailed Description
                Cell detDescCell = row.createCell(12);
                detDescCell.setCellValue(p.getProduct().getDetailedDesc());
                detDescCell.setCellStyle(wrapStyle);

                // 13. Status
                row.createCell(13).setCellValue(
                    p.getProduct().getStatus() != null ? p.getProduct().getStatus().toString() : ""
                );

                // --- PRICING ---
                if (p.getPricing() != null) {
                    if (p.getPricing().getCost() != null) row.createCell(14).setCellValue(p.getPricing().getCost().doubleValue());
                    if (p.getPricing().getLandingCost() != null) row.createCell(15).setCellValue(p.getPricing().getLandingCost().doubleValue());
                    if (p.getPricing().getNlc() != null) row.createCell(16).setCellValue(p.getPricing().getNlc().doubleValue());
                    row.createCell(17).setCellValue(
                        p.getPricing().getCostMethod() != null ? p.getPricing().getCostMethod().toString() : ""
                    );
                    if (p.getPricing().getRetailPrice() != null) row.createCell(18).setCellValue(p.getPricing().getRetailPrice().doubleValue());
                    if (p.getPricing().getWholesalePrice() != null) row.createCell(19).setCellValue(p.getPricing().getWholesalePrice().doubleValue());
                    if (p.getPricing().getMinPrice() != null) row.createCell(20).setCellValue(p.getPricing().getMinPrice().doubleValue());
                    if (p.getPricing().getMaxPrice() != null) row.createCell(21).setCellValue(p.getPricing().getMaxPrice().doubleValue());
                    if (p.getPricing().getOnlinePrice() != null) row.createCell(22).setCellValue(p.getPricing().getOnlinePrice().doubleValue());
                    if (p.getPricing().getMarkup() != null) row.createCell(23).setCellValue(p.getPricing().getMarkup() + "%");
                    if (p.getPricing().getGp() != null) row.createCell(24).setCellValue(p.getPricing().getGp() + "%");
                }

                // --- TAX ---
                if (p.getTax() != null) {
                    if (p.getTax().getPurchaseTax() != null) row.createCell(25).setCellValue(p.getTax().getPurchaseTax().doubleValue());
                    if (p.getTax().getSalesTax() != null) row.createCell(26).setCellValue(p.getTax().getSalesTax().doubleValue());
                    row.createCell(27).setCellValue(p.getTax().getTaxCategory());
                    row.createCell(28).setCellValue(p.getTax().getHsnCode());
                }

                // --- INVENTORY ---
                if (p.getInventory() != null) {
                    if (p.getInventory().getDefaultUnit() != null) row.createCell(29).setCellValue(p.getInventory().getDefaultUnit().getName());
                    if (p.getInventory().getReorderUnit() != null) row.createCell(30).setCellValue(p.getInventory().getReorderUnit().getName());
                    row.createCell(31).setCellValue(p.getInventory().getReorderLevel());
                    row.createCell(32).setCellValue(p.getInventory().getReorderQty());
                    row.createCell(33).setCellValue(p.getInventory().getSafetyStock());
                    row.createCell(34).setCellValue(p.getInventory().getMinStock());
                    row.createCell(35).setCellValue(p.getInventory().getMaxStock());
                    row.createCell(36).setCellValue(p.getInventory().isAllowNegative() ? "Yes" : "No");
                    row.createCell(37).setCellValue(p.getInventory().getProcurementType());
                    if (p.getInventory().getDefaultVendor() != null) row.createCell(38).setCellValue(p.getInventory().getDefaultVendor().getName());
                    if (p.getInventory().getWarehouse() != null) row.createCell(39).setCellValue(p.getInventory().getWarehouse().getName());
                    if (p.getInventory().getZone() != null) row.createCell(40).setCellValue(p.getInventory().getZone().getName());
                    if (p.getInventory().getLocator() != null) row.createCell(41).setCellValue(p.getInventory().getLocator().getName());
                    if (p.getInventory().getBin() != null) row.createCell(42).setCellValue(p.getInventory().getBin().getName());
                }

                // --- FLAGS ---
                row.createCell(43).setCellValue(p.getProduct().isSerial() ? "Yes" : "No");
                row.createCell(44).setCellValue(p.getProduct().isBatch() ? "Yes" : "No");
                row.createCell(45).setCellValue(p.getProduct().isWeighing() ? "Yes" : "No");

                // --- TAGS ---
                // Tags are not available in Product entity
                // List<String> tags = p.getProduct().getTags();
                // if (tags != null) {
                //     row.createCell(46).setCellValue(String.join(", ", tags));
                // }

                // --- PACKINGS ---
                if (p.getInventory() != null && p.getInventory().getPackings() != null) {
                    StringBuilder packingsStr = new StringBuilder();
                    for (ProductPackingRequest pkg : p.getInventory().getPackings()) {
                        packingsStr.append(pkg.getLevel()).append(": ")
                                   .append(pkg.getConversion()).append("x ")
                                   .append(pkg.getUnit() != null ? pkg.getUnit() : "?"); // Unit is ID here

                        if (pkg.getBarcode() != null && !pkg.getBarcode().isBlank()) {
                            packingsStr.append(" [BC: ").append(pkg.getBarcode()).append("]");
                        }

                        packingsStr.append(" | ");
                    }
                    row.createCell(47).setCellValue(packingsStr.toString());
                }
            }

            // Auto-size columns
            for (int i = 0; i < headers.length; i++) {
                if (i != 0) { // Skip image column for auto-size
                    sheet.autoSizeColumn(i);
                     // Set a max width to prevent massive descriptions
                    if (sheet.getColumnWidth(i) > 20000) {
                        sheet.setColumnWidth(i, 20000);
                    }
                } else {
                    sheet.setColumnWidth(0, 3000); // Fixed width for image column (approx 1 inch)
                }
            }

            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        } catch (IOException e) {
            throw new RuntimeException("Failed to export data to Excel file: " + e.getMessage());
        }
    }
}
