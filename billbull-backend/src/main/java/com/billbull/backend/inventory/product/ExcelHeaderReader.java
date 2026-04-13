package com.billbull.backend.inventory.product;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.File;
import java.io.FileInputStream;

public class ExcelHeaderReader {
    public static void main(String[] args) {
        String filePath = "c:\\Users\\Gokul\\OneDrive\\Desktop\\Billbull ERP\\All Brand Machines Stock -31-12-2025.xlsx";
        try (FileInputStream fis = new FileInputStream(new File(filePath));
             Workbook workbook = new XSSFWorkbook(fis)) {
            
            System.out.println("=== SHEETS ===");
            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                System.out.println(workbook.getSheetName(i));
            }

            for (int i = 0; i < Math.min(5, workbook.getNumberOfSheets()); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                System.out.println("\n=== Sheet: " + sheet.getSheetName() + " ===");
                Row headerRow = sheet.getRow(0);
                if (headerRow != null) {
                    System.out.print("Headers: ");
                    for (Cell cell : headerRow) {
                        System.out.print("[" + cell.toString() + "] ");
                    }
                    System.out.println();
                }
                
                for (int r = 1; r <= Math.min(5, sheet.getLastRowNum()); r++) {
                    Row row = sheet.getRow(r);
                    if (row != null) {
                        System.out.print("Row " + r + ": ");
                        for (Cell cell : row) {
                            System.out.print("[" + cell.toString() + "] ");
                        }
                        System.out.println();
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
