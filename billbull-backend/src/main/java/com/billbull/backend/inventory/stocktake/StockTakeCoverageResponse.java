package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class StockTakeCoverageResponse {
    private int expectedUnits;
    private int scannedUnits;
    private int missingUnits;
    private int wrongBinUnits;
    private int duplicateScans;
    private int unexpectedScans;
    private List<ProductCoverage> products = new ArrayList<>();
    private List<ProductCoverage> missedProducts = new ArrayList<>();
    private List<UnitScanSummary> unknownScans = new ArrayList<>();
    private List<UnitScanSummary> recentScans = new ArrayList<>();

    public int getExpectedUnits() { return expectedUnits; }
    public void setExpectedUnits(int expectedUnits) { this.expectedUnits = expectedUnits; }

    public int getScannedUnits() { return scannedUnits; }
    public void setScannedUnits(int scannedUnits) { this.scannedUnits = scannedUnits; }

    public int getMissingUnits() { return missingUnits; }
    public void setMissingUnits(int missingUnits) { this.missingUnits = missingUnits; }

    public int getWrongBinUnits() { return wrongBinUnits; }
    public void setWrongBinUnits(int wrongBinUnits) { this.wrongBinUnits = wrongBinUnits; }

    public int getDuplicateScans() { return duplicateScans; }
    public void setDuplicateScans(int duplicateScans) { this.duplicateScans = duplicateScans; }

    public int getUnexpectedScans() { return unexpectedScans; }
    public void setUnexpectedScans(int unexpectedScans) { this.unexpectedScans = unexpectedScans; }

    public List<ProductCoverage> getProducts() { return products; }
    public void setProducts(List<ProductCoverage> products) { this.products = products; }

    public List<ProductCoverage> getMissedProducts() { return missedProducts; }
    public void setMissedProducts(List<ProductCoverage> missedProducts) { this.missedProducts = missedProducts; }

    public List<UnitScanSummary> getUnknownScans() { return unknownScans; }
    public void setUnknownScans(List<UnitScanSummary> unknownScans) { this.unknownScans = unknownScans; }

    public List<UnitScanSummary> getRecentScans() { return recentScans; }
    public void setRecentScans(List<UnitScanSummary> recentScans) { this.recentScans = recentScans; }

    public static class ProductCoverage {
        private Long productId;
        private String productCode;
        private String sku;
        private String productName;
        private String brand;
        private String category;
        private String image;
        private Integer expectedQty = 0;
        private Integer scannedQty = 0;
        private Integer missingQty = 0;
        private Integer wrongBinQty = 0;
        private Integer duplicateQty = 0;
        private List<String> missingBarcodes = new ArrayList<>();
        private List<UnitScanSummary> wrongBinScans = new ArrayList<>();
        private List<UnitScanSummary> duplicateScans = new ArrayList<>();

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }

        public String getProductCode() { return productCode; }
        public void setProductCode(String productCode) { this.productCode = productCode; }

        public String getSku() { return sku; }
        public void setSku(String sku) { this.sku = sku; }

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }

        public String getBrand() { return brand; }
        public void setBrand(String brand) { this.brand = brand; }

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }

        public String getImage() { return image; }
        public void setImage(String image) { this.image = image; }

        public Integer getExpectedQty() { return expectedQty; }
        public void setExpectedQty(Integer expectedQty) { this.expectedQty = expectedQty; }

        public Integer getScannedQty() { return scannedQty; }
        public void setScannedQty(Integer scannedQty) { this.scannedQty = scannedQty; }

        public Integer getMissingQty() { return missingQty; }
        public void setMissingQty(Integer missingQty) { this.missingQty = missingQty; }

        public Integer getWrongBinQty() { return wrongBinQty; }
        public void setWrongBinQty(Integer wrongBinQty) { this.wrongBinQty = wrongBinQty; }

        public Integer getDuplicateQty() { return duplicateQty; }
        public void setDuplicateQty(Integer duplicateQty) { this.duplicateQty = duplicateQty; }

        public List<String> getMissingBarcodes() { return missingBarcodes; }
        public void setMissingBarcodes(List<String> missingBarcodes) { this.missingBarcodes = missingBarcodes; }

        public List<UnitScanSummary> getWrongBinScans() { return wrongBinScans; }
        public void setWrongBinScans(List<UnitScanSummary> wrongBinScans) { this.wrongBinScans = wrongBinScans; }

        public List<UnitScanSummary> getDuplicateScans() { return duplicateScans; }
        public void setDuplicateScans(List<UnitScanSummary> duplicateScans) { this.duplicateScans = duplicateScans; }
    }

    public static class UnitScanSummary {
        private Long id;
        private String barcode;
        private StockTakeUnitScanStatus status;
        private StockTakeUnknownScanResolution resolution;
        private Long productId;
        private String productCode;
        private String productName;
        private String batchNumber;
        private LocalDate expiryDate;
        private Long expectedBinId;
        private String expectedBinCode;
        private Long scannedBinId;
        private String scannedBinCode;
        private LocalDateTime scannedAt;
        private String message;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }

        public String getBarcode() { return barcode; }
        public void setBarcode(String barcode) { this.barcode = barcode; }

        public StockTakeUnitScanStatus getStatus() { return status; }
        public void setStatus(StockTakeUnitScanStatus status) { this.status = status; }

        public StockTakeUnknownScanResolution getResolution() { return resolution; }
        public void setResolution(StockTakeUnknownScanResolution resolution) { this.resolution = resolution; }

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }

        public String getProductCode() { return productCode; }
        public void setProductCode(String productCode) { this.productCode = productCode; }

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }

        public String getBatchNumber() { return batchNumber; }
        public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

        public LocalDate getExpiryDate() { return expiryDate; }
        public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

        public Long getExpectedBinId() { return expectedBinId; }
        public void setExpectedBinId(Long expectedBinId) { this.expectedBinId = expectedBinId; }

        public String getExpectedBinCode() { return expectedBinCode; }
        public void setExpectedBinCode(String expectedBinCode) { this.expectedBinCode = expectedBinCode; }

        public Long getScannedBinId() { return scannedBinId; }
        public void setScannedBinId(Long scannedBinId) { this.scannedBinId = scannedBinId; }

        public String getScannedBinCode() { return scannedBinCode; }
        public void setScannedBinCode(String scannedBinCode) { this.scannedBinCode = scannedBinCode; }

        public LocalDateTime getScannedAt() { return scannedAt; }
        public void setScannedAt(LocalDateTime scannedAt) { this.scannedAt = scannedAt; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
