package com.billbull.backend.inventory.department;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

@Service
public class DepartmentExportService {

    public ByteArrayInputStream export(List<DepartmentResponse> departments) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Departments");

            // Create Header Row
            Row headerRow = sheet.createRow(0);
            String[] headers = {
                "ID", "Department Name", "Code", "Description"
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
            for (DepartmentResponse d : departments) {
                Row row = sheet.createRow(rowIdx++);

                // 0. ID
                row.createCell(0).setCellValue(d.getId());
                
                // 1. Name
                row.createCell(1).setCellValue(d.getName());
                
                // 2. Code
                row.createCell(2).setCellValue(d.getCode());
                
                // 3. Description
                Cell descCell = row.createCell(3);
                descCell.setCellValue(d.getDesc());
                descCell.setCellStyle(wrapStyle);
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
