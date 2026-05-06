package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class StockTakeUnitScanResponse {
    private Long id;
    private StockTakeUnitScanStatus status;
    private StockTakeUnknownScanResolution resolution;
    private String message;
    private String barcode;
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

    public static StockTakeUnitScanResponse from(StockTakeUnitScan scan) {
        StockTakeUnitScanResponse response = new StockTakeUnitScanResponse();
        response.setId(scan.getId());
        response.setStatus(scan.getStatus());
        response.setResolution(scan.getResolution());
        response.setMessage(scan.getMessage());
        response.setBarcode(scan.getScannedBarcode());
        response.setProductId(scan.getProductId());
        response.setProductCode(scan.getProductCode());
        response.setProductName(scan.getProductName());
        response.setBatchNumber(scan.getBatchNumber());
        response.setExpiryDate(scan.getExpiryDate());
        response.setExpectedBinId(scan.getExpectedBinId());
        response.setExpectedBinCode(scan.getExpectedBinCode());
        response.setScannedBinId(scan.getScannedBinId());
        response.setScannedBinCode(scan.getScannedBinCode());
        response.setScannedAt(scan.getCreatedAt());
        return response;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public StockTakeUnitScanStatus getStatus() { return status; }
    public void setStatus(StockTakeUnitScanStatus status) { this.status = status; }

    public StockTakeUnknownScanResolution getResolution() { return resolution; }
    public void setResolution(StockTakeUnknownScanResolution resolution) { this.resolution = resolution; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }

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
}
