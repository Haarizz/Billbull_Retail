package com.billbull.backend.inventory.subdepartment;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

@Service
public class SubDepartmentExportService {

    public ByteArrayInputStream export(List<SubDepartmentResponse> subDepartments) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Sub-Departments");

            // Create Header Row
            Row headerRow = sheet.createRow(0);
            String[] headers = {
                "ID", "Sub-Department Name", "Code", "Department", "Description", 
                "Active?"
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
            for (SubDepartmentResponse d : subDepartments) {
                Row row = sheet.createRow(rowIdx++);

                // 0. ID
                row.createCell(0).setCellValue(d.id);
                
                // 1. Name
                row.createCell(1).setCellValue(d.name);
                
                // 2. Code
                row.createCell(2).setCellValue(d.code);

                // 3. Department
                row.createCell(3).setCellValue(d.departmentName);
                
                // 4. Description
                Cell descCell = row.createCell(4);
                descCell.setCellValue(d.description);
                descCell.setCellStyle(wrapStyle);

                // 5. Active
                row.createCell(5).setCellValue(d.active ? "Yes" : "No");
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
