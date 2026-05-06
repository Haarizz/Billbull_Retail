package com.billbull.backend.inventory.stocktake;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(
    name = "stock_take_unit_scans",
    indexes = {
        @Index(name = "idx_stus_session", columnList = "session_id"),
        @Index(name = "idx_stus_barcode", columnList = "scanned_barcode"),
        @Index(name = "idx_stus_status", columnList = "status")
    }
)
public class StockTakeUnitScan extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    @JsonIgnore
    private StockTakeSession session;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expected_unit_id")
    @JsonIgnore
    private StockTakeExpectedUnit expectedUnit;

    private String scannedBarcode;

    @Enumerated(EnumType.STRING)
    private StockTakeUnitScanStatus status;

    @Enumerated(EnumType.STRING)
    private StockTakeUnknownScanResolution resolution = StockTakeUnknownScanResolution.PENDING;

    private Long productId;
    private String productCode;
    private String productName;
    private String batchNumber;
    private LocalDate expiryDate;

    private Long expectedBinId;
    private String expectedBinCode;
    private Long scannedBinId;
    private String scannedBinCode;
    private Long scannedZoneId;
    private Long scannedLocatorId;

    private String message;

    public StockTakeSession getSession() { return session; }
    public void setSession(StockTakeSession session) { this.session = session; }

    public StockTakeExpectedUnit getExpectedUnit() { return expectedUnit; }
    public void setExpectedUnit(StockTakeExpectedUnit expectedUnit) { this.expectedUnit = expectedUnit; }

    public String getScannedBarcode() { return scannedBarcode; }
    public void setScannedBarcode(String scannedBarcode) { this.scannedBarcode = scannedBarcode; }

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

    public Long getScannedZoneId() { return scannedZoneId; }
    public void setScannedZoneId(Long scannedZoneId) { this.scannedZoneId = scannedZoneId; }

    public Long getScannedLocatorId() { return scannedLocatorId; }
    public void setScannedLocatorId(Long scannedLocatorId) { this.scannedLocatorId = scannedLocatorId; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
