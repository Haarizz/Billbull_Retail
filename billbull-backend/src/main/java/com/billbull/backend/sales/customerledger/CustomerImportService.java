package com.billbull.backend.sales.customerledger;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class CustomerImportService {

    private final CustomerRepository repository;

    public CustomerImportService(CustomerRepository repository) {
        this.repository = repository;
    }

    public String importCustomers(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Import file is empty");
        }

        int createdCount = 0;
        int updatedCount = 0;
        int skippedCount = 0;
        int errorCount = 0;
        List<String> errors = new ArrayList<>();

        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                Sheet sheet = workbook.getSheetAt(i);
                int headerRowNum = findHeaderRow(sheet, "Customer Code");
                if (headerRowNum < 0) {
                    errors.add("Sheet '" + sheet.getSheetName() + "': Customer Code header not found.");
                    continue;
                }

                for (int r = headerRowNum + 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null || isReportFooterRow(row, 22)) {
                        skippedCount++;
                        continue;
                    }

                    try {
                        String code = cell(row, 1);
                        String name = cell(row, 2);
                        if (isBlank(code) || isBlank(name)) {
                            skippedCount++;
                            continue;
                        }

                        Optional<Customer> existing = repository.findByCode(code.trim());
                        boolean isUpdate = existing.isPresent();
                        Customer customer = existing.orElseGet(Customer::new);

                        String address = cell(row, 4);
                        String city = cell(row, 5);
                        String trn = cell(row, 6);
                        String route = cell(row, 7);
                        String phone = cell(row, 8);
                        String contactPerson = cell(row, 9);
                        String mobile = cell(row, 10);
                        String email = cell(row, 11);
                        String salesPerson = cell(row, 12);
                        String deliveryPerson = cell(row, 13);
                        String customerCompany = cell(row, 14);
                        String location = cell(row, 15);
                        String customerType = cell(row, 16);
                        String priceGroup = cell(row, 17);
                        String customerGroup = cell(row, 18);
                        String businessType = cell(row, 19);
                        String defaultTerm = cell(row, 20);
                        String status = firstNonBlank(cell(row, 21), cell(row, 22), "Active");

                        customer.setCode(limit(code.trim(), 255));
                        customer.setName(limit(name.trim(), 255));
                        customer.setBillingAddress(limit(address, 1000));
                        customer.setDefaultShippingAddress(limit(joinNonBlank(", ", address, city, location), 1000));
                        customer.setCity(limit(city, 255));
                        customer.setTrn(limit(trn, 255));
                        customer.setPhone(limit(phone, 255));
                        customer.setMobile(limit(mobile, 255));
                        customer.setEmail(limit(email, 255));
                        customer.setSalesman(limit(salesPerson, 255));
                        customer.setGroupType(limit(firstNonBlank(customerGroup, customerType, "General"), 255));
                        customer.setPriceList(limit(firstNonBlank(priceGroup, "General"), 255));
                        customer.setPayMode(limit(defaultTerm, 255));
                        customer.setPayTerms(limit(normalizePaymentTerms(defaultTerm), 255));
                        customer.setStatus(limit(status, 255));
                        customer.setBranch(limit(location, 255));
                        customer.setWarehouse(limit(route, 255));
                        customer.setCreditStatus(firstNonBlank(customer.getCreditStatus(), "Good"));
                        customer.setBlockCredit(Boolean.FALSE);
                        if (customer.getBalance() == null) {
                            customer.setBalance(BigDecimal.ZERO);
                        }
                        if (customer.getTotalSales() == null) {
                            customer.setTotalSales(BigDecimal.ZERO);
                        }
                        customer.setNotes(limit(buildNotes(
                                "Contact Person", contactPerson,
                                "Delivery Person", deliveryPerson,
                                "Customer Company", customerCompany,
                                "Customer Type", customerType,
                                "Customer Business Type", businessType,
                                "Default Term ID", defaultTerm,
                                "Route", route), 1000));

                        repository.save(customer);
                        if (isUpdate) {
                            updatedCount++;
                        } else {
                            createdCount++;
                        }
                    } catch (Exception e) {
                        errorCount++;
                        errors.add("Sheet '" + sheet.getSheetName() + "' Row " + (r + 1) + ": " + e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }

        StringBuilder result = new StringBuilder();
        result.append("Import Completed. Created: ").append(createdCount);
        result.append(", Updated: ").append(updatedCount);
        result.append(", Skipped: ").append(skippedCount);
        result.append(", Errors: ").append(errorCount);
        if (!errors.isEmpty()) {
            result.append(". details: ").append(errors.subList(0, Math.min(errors.size(), 5)));
        }
        return result.toString();
    }

    private int findHeaderRow(Sheet sheet, String headerText) {
        for (int r = 0; r <= Math.min(sheet.getLastRowNum(), 20); r++) {
            Row row = sheet.getRow(r);
            if (row != null && headerText.equalsIgnoreCase(cell(row, 1))) {
                return r;
            }
        }
        return -1;
    }

    private String normalizePaymentTerms(String value) {
        if (isBlank(value)) {
            return "Immediate";
        }
        if ("cash".equalsIgnoreCase(value.trim())) {
            return "Immediate";
        }
        return value.trim();
    }

    private String buildNotes(String... pairs) {
        List<String> parts = new ArrayList<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            String label = pairs[i];
            String value = pairs[i + 1];
            if (!isBlank(value)) {
                parts.add(label + ": " + value.trim());
            }
        }
        return String.join("; ", parts);
    }

    private boolean isReportFooterRow(Row row, int lastColumnOneBased) {
        String first = cell(row, 1);
        String last = cell(row, lastColumnOneBased);
        return first != null
                && first.matches("\\d{1,2}/\\d{1,2}/\\d{4}")
                && last != null
                && last.matches("\\d+\\s+of\\s+\\d+");
    }

    private String cell(Row row, int oneBasedIndex) {
        if (row == null || oneBasedIndex <= 0) {
            return null;
        }
        Cell cell = row.getCell(oneBasedIndex - 1);
        if (cell == null) {
            return null;
        }
        String value = new DataFormatter().formatCellValue(cell);
        return value == null ? null : value.replace('\u00A0', ' ').trim();
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

    private String joinNonBlank(String delimiter, String... values) {
        List<String> parts = new ArrayList<>();
        for (String value : values) {
            if (!isBlank(value)) {
                parts.add(value.trim());
            }
        }
        return String.join(delimiter, parts);
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
