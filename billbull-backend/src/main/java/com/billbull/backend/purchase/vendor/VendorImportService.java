package com.billbull.backend.purchase.vendor;

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
public class VendorImportService {

    private final VendorRepository repository;

    public VendorImportService(VendorRepository repository) {
        this.repository = repository;
    }

    public String importVendors(MultipartFile file) {
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
                int headerRowNum = findHeaderRow(sheet, "Vendor Code");
                if (headerRowNum < 0) {
                    errors.add("Sheet '" + sheet.getSheetName() + "': Vendor Code header not found.");
                    continue;
                }

                for (int r = headerRowNum + 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null || isReportFooterRow(row, 17)) {
                        skippedCount++;
                        continue;
                    }

                    try {
                        String code = cell(row, 1);
                        String vendorName = cell(row, 4);
                        if (isBlank(code) || isBlank(vendorName)) {
                            skippedCount++;
                            continue;
                        }

                        Optional<Vendor> existing = repository.findByCode(code.trim());
                        boolean isUpdate = existing.isPresent();
                        Vendor vendor = existing.orElseGet(Vendor::new);

                        String groupA = cell(row, 2);
                        String groupB = cell(row, 3);
                        String type = cell(row, 5);
                        String profitRate = cell(row, 6);
                        String address = cell(row, 7);
                        String city = cell(row, 8);
                        String state = cell(row, 9);
                        String country = cell(row, 10);
                        String trn = cell(row, 11);
                        String phone = cell(row, 12);
                        String salesPerson = cell(row, 13);
                        String mobile = cell(row, 14);
                        String email = cell(row, 15);
                        String inactive = firstNonBlank(cell(row, 16), cell(row, 17));

                        vendor.setCode(limit(code.trim(), 255));
                        vendor.setName(limit(vendorName.trim(), 255));
                        vendor.setActive(true);
                        vendor.setStatus(isChecked(inactive) ? "Blocked" : "Active");
                        vendor.setVendorGroup(limit(firstNonBlank(groupA, groupB, "General"), 255));
                        vendor.setVendorType(limit(firstNonBlank(type, "Purchase"), 255));
                        vendor.setCategory(limit(firstNonBlank(groupA, groupB, "General"), 255));
                        vendor.setCountry(limit(firstNonBlank(country, "United Arab Emirates"), 255));
                        vendor.setTaxId(limit(trn, 255));
                        vendor.setPrimaryPhone(limit(phone, 255));
                        vendor.setMobile(limit(mobile, 255));
                        vendor.setEmail(limit(email, 255));
                        vendor.setContact(limit(firstNonBlank(mobile, phone, salesPerson), 255));
                        vendor.setPrefComm(resolvePreferredCommunication(email, mobile, phone));
                        vendor.setPriority(firstNonBlank(vendor.getPriority(), "P2 - High"));
                        vendor.setCurrency(firstNonBlank(vendor.getCurrency(), "AED"));
                        vendor.setPayTerms(firstNonBlank(vendor.getPayTerms(), "Cash on Delivery"));
                        vendor.setBalType(firstNonBlank(vendor.getBalType(), "Payable (We owe vendor)"));
                        vendor.setPayPref(firstNonBlank(vendor.getPayPref(), "Bank Transfer"));
                        if (vendor.getOpeningBalance() == null) {
                            vendor.setOpeningBalance(BigDecimal.ZERO);
                        }
                        if (vendor.getBalance() == null) {
                            vendor.setBalance(BigDecimal.ZERO);
                        }
                        if (vendor.getRating() == null) {
                            vendor.setRating(BigDecimal.ZERO);
                        }
                        vendor.setAddress(limit(joinNonBlank(", ", address, city, state, country), 255));
                        vendor.setCommNotes(limit(buildNotes(
                                "Sales Person", salesPerson,
                                "Def Profit Rate", profitRate,
                                "City", city,
                                "State", state,
                                "Group 2", groupB,
                                "Inactive", inactive), 255));

                        repository.save(vendor);
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

    private String resolvePreferredCommunication(String email, String mobile, String phone) {
        if (!isBlank(email)) {
            return "Email";
        }
        if (!isBlank(mobile)) {
            return "WhatsApp";
        }
        if (!isBlank(phone)) {
            return "Phone";
        }
        return "Email";
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
