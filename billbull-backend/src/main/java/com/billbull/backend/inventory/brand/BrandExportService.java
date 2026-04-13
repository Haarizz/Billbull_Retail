package com.billbull.backend.inventory.brand;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

@Service
public class BrandExportService {

    public ByteArrayInputStream export(List<BrandResponse> brands) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Brands");

            // Create Header Row
            Row headerRow = sheet.createRow(0);
            String[] headers = {
                "ID", "Brand Name", "Code", "Description", "Country", "Region", "Active?", "Barcode Prefix"
            };

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);
            headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            // Wrap style for description
            CellStyle wrapStyle = workbook.createCellStyle();
            wrapStyle.setWrapText(true);
            wrapStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (BrandResponse b : brands) {
                Row row = sheet.createRow(rowIdx++);

                // 0. ID
                row.createCell(0).setCellValue(b.id);
                
                // 1. Name
                row.createCell(1).setCellValue(b.name);
                
                // 2. Code
                row.createCell(2).setCellValue(b.code);
                
                // 3. Description
                Cell descCell = row.createCell(3);
                descCell.setCellValue(b.description);
                descCell.setCellStyle(wrapStyle);

                // 4. Country
                row.createCell(4).setCellValue(b.country);

                // 5. Region
                row.createCell(5).setCellValue(b.region);

                // 6. Active
                row.createCell(6).setCellValue(b.active ? "Yes" : "No");

                // 7. Barcode Prefix
                row.createCell(7).setCellValue(b.prefix);
            }

            // Auto-size columns
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
                if (sheet.getColumnWidth(i) > 20000) {
                    sheet.setColumnWidth(i, 20000);
                }
            }

            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        } catch (IOException e) {
            throw new RuntimeException("Failed to export data to Excel file: " + e.getMessage());
        }
    }
}
