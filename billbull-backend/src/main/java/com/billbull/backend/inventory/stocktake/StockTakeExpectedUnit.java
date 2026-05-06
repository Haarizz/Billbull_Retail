package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(
    name = "stock_take_expected_units",
    indexes = {
        @Index(name = "idx_steu_session", columnList = "session_id"),
        @Index(name = "idx_steu_barcode", columnList = "unit_barcode"),
        @Index(name = "idx_steu_product_bin", columnList = "product_id, expected_bin_id")
    }
)
public class StockTakeExpectedUnit extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    @JsonIgnore
    private StockTakeSession session;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    private String productCode;
    private String sku;
    private String productName;
    private String productBarcode;
    private String brand;
    private String category;
    private String image;

    @Column(name = "warehouse_id", nullable = false)
    private Long warehouseId;

    @Column(name = "expected_bin_id")
    private Long expectedBinId;
    private String expectedBinCode;
    private Long expectedZoneId;
    private Long expectedLocatorId;

    @Column(name = "actual_bin_id")
    private Long actualBinId;
    private String actualBinCode;
    private Long actualZoneId;
    private Long actualLocatorId;

    @Column(name = "unit_barcode", nullable = false, length = 150)
    private String unitBarcode;

    @Column(name = "batch_number", length = 150)
    private String batchNumber;

    private LocalDate expiryDate;
    private BigDecimal unitCost;

    @Column(nullable = false)
    private boolean scanned = false;

    @Column(nullable = false)
    private boolean wrongBin = false;

    private LocalDateTime scannedAt;

    public StockTakeSession getSession() { return session; }
    public void setSession(StockTakeSession session) { this.session = session; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getProductBarcode() { return productBarcode; }
    public void setProductBarcode(String productBarcode) { this.productBarcode = productBarcode; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getImage() { return image; }
    public void setImage(String image) { this.image = image; }

    public Long getWarehouseId() { return warehouseId; }
    public void setWarehouseId(Long warehouseId) { this.warehouseId = warehouseId; }

    public Long getExpectedBinId() { return expectedBinId; }
    public void setExpectedBinId(Long expectedBinId) { this.expectedBinId = expectedBinId; }

    public String getExpectedBinCode() { return expectedBinCode; }
    public void setExpectedBinCode(String expectedBinCode) { this.expectedBinCode = expectedBinCode; }

    public Long getExpectedZoneId() { return expectedZoneId; }
    public void setExpectedZoneId(Long expectedZoneId) { this.expectedZoneId = expectedZoneId; }

    public Long getExpectedLocatorId() { return expectedLocatorId; }
    public void setExpectedLocatorId(Long expectedLocatorId) { this.expectedLocatorId = expectedLocatorId; }

    public Long getActualBinId() { return actualBinId; }
    public void setActualBinId(Long actualBinId) { this.actualBinId = actualBinId; }

    public String getActualBinCode() { return actualBinCode; }
    public void setActualBinCode(String actualBinCode) { this.actualBinCode = actualBinCode; }

    public Long getActualZoneId() { return actualZoneId; }
    public void setActualZoneId(Long actualZoneId) { this.actualZoneId = actualZoneId; }

    public Long getActualLocatorId() { return actualLocatorId; }
    public void setActualLocatorId(Long actualLocatorId) { this.actualLocatorId = actualLocatorId; }

    public String getUnitBarcode() { return unitBarcode; }
    public void setUnitBarcode(String unitBarcode) { this.unitBarcode = unitBarcode; }

    public String getBatchNumber() { return batchNumber; }
    public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public boolean isScanned() { return scanned; }
    public void setScanned(boolean scanned) { this.scanned = scanned; }

    public boolean isWrongBin() { return wrongBin; }
    public void setWrongBin(boolean wrongBin) { this.wrongBin = wrongBin; }

    public LocalDateTime getScannedAt() { return scannedAt; }
    public void setScannedAt(LocalDateTime scannedAt) { this.scannedAt = scannedAt; }
}
