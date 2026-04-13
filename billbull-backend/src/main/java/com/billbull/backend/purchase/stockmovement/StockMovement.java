package com.billbull.backend.purchase.stockmovement;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "stock_movements", uniqueConstraints = @UniqueConstraint(columnNames = { "source_type", "source_id",
		"product_id" }), indexes = {
				// Speeds up getTotalAvailableStockForProducts and findStockByWarehouse
				@jakarta.persistence.Index(name = "idx_sm_product_id", columnList = "product_id"),
				@jakarta.persistence.Index(name = "idx_sm_warehouse_id", columnList = "warehouse_id"),
				// Composite index for findLastMovementDates (GROUP BY product_id + filter on
				// source_type + MAX on created_at)
				@jakarta.persistence.Index(name = "idx_sm_product_source_created", columnList = "product_id, source_type, created_at")
		})
public class StockMovement extends BaseEntity {

	@Enumerated(EnumType.STRING)
	private StockSourceType sourceType; // LPO, GRN, DIRECT_PURCHASE

	private Long sourceId;

	private Long productId;

	private Long warehouseId;

	private Long zoneId; // Optional zone within warehouse
	private Long locatorId; // Optional locator (aisle/rack) within zone
	private Long binId; // Optional bin within locator

	private Integer quantity; // always +ve here (IN)

	private LocalDate movementDate;

	private String referenceNo; // LPO-xxx / GRN-xxx / DP-xxx

	private String batchNumber; // Batch/Lot number for traceability

	private LocalDate expiryDate; // Product expiry date

	// Unit cost at the time of inbound receipt (from GRN/Purchase).
	// Used to compute weighted average cost for COGS at delivery.
	private java.math.BigDecimal unitCost;

	// Getters and Setters

	public Long getZoneId() {
		return zoneId;
	}

	public void setZoneId(Long zoneId) {
		this.zoneId = zoneId;
	}

	public Long getLocatorId() {
		return locatorId;
	}

	public void setLocatorId(Long locatorId) {
		this.locatorId = locatorId;
	}

	public Long getBinId() {
		return binId;
	}

	public void setBinId(Long binId) {
		this.binId = binId;
	}

	public String getBatchNumber() {
		return batchNumber;
	}

	public void setBatchNumber(String batchNumber) {
		this.batchNumber = batchNumber;
	}

	public LocalDate getExpiryDate() {
		return expiryDate;
	}

	public void setExpiryDate(LocalDate expiryDate) {
		this.expiryDate = expiryDate;
	}

	public StockSourceType getSourceType() {
		return sourceType;
	}

	public void setSourceType(StockSourceType sourceType) {
		this.sourceType = sourceType;
	}

	public Long getSourceId() {
		return sourceId;
	}

	public void setSourceId(Long sourceId) {
		this.sourceId = sourceId;
	}

	public Long getProductId() {
		return productId;
	}

	public void setProductId(Long productId) {
		this.productId = productId;
	}

	public Long getWarehouseId() {
		return warehouseId;
	}

	public void setWarehouseId(Long warehouseId) {
		this.warehouseId = warehouseId;
	}

	public Integer getQuantity() {
		return quantity;
	}

	public void setQuantity(Integer quantity) {
		this.quantity = quantity;
	}

	public LocalDate getMovementDate() {
		return movementDate;
	}

	public void setMovementDate(LocalDate movementDate) {
		this.movementDate = movementDate;
	}

	public String getReferenceNo() {
		return referenceNo;
	}

	public void setReferenceNo(String referenceNo) {
		this.referenceNo = referenceNo;
	}

	public java.math.BigDecimal getUnitCost() {
		return unitCost;
	}

	public void setUnitCost(java.math.BigDecimal unitCost) {
		this.unitCost = unitCost;
	}
}