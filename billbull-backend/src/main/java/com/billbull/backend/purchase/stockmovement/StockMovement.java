package com.billbull.backend.purchase.stockmovement;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

@Entity
@Table(name = "stock_movements", indexes = {
				// Speeds up getTotalAvailableStockForProducts and findStockByWarehouse
				@jakarta.persistence.Index(name = "idx_sm_product_id", columnList = "product_id"),
				@jakarta.persistence.Index(name = "idx_sm_warehouse_id", columnList = "warehouse_id"),
				// Composite index for findLastMovementDates (GROUP BY product_id + filter on
				// source_type + MAX on created_at)
				@jakarta.persistence.Index(name = "idx_sm_product_source_created", columnList = "product_id, source_type, created_at"),
				// Branch-Level Inventory Phase 1: composite indexes backing the branch-scoped
				// on-hand aggregates added in Phase 3. Created by Flyway V34; declared here so the
				// entity matches the schema (and Hibernate validate passes once tenants baseline).
				@jakarta.persistence.Index(name = "idx_sm_branch_product", columnList = "branch_id, product_id"),
				@jakarta.persistence.Index(name = "idx_sm_branch_warehouse", columnList = "branch_id, warehouse_id")
		})
public class StockMovement extends BaseEntity {

	@Enumerated(EnumType.STRING)
	private StockSourceType sourceType; // LPO, GRN, DIRECT_PURCHASE

	private Long sourceId;

	private Long productId;

	private Long warehouseId;

	// Branch-Level Inventory Phase 1: denormalized branch, stamped from the warehouse's branch at
	// write time (Phase 2). NULLABLE and unread for now — legacy/global rows stay null and remain
	// visible under the "null = shared/global" rule. Kept as a plain scalar (like productId /
	// warehouseId), not a @ManyToOne; the FK to branches is enforced at the DB level by Flyway V34.
	@jakarta.persistence.Column(name = "branch_id")
	private Long branchId;

	private Long zoneId; // Optional zone within warehouse
	private Long locatorId; // Optional locator (aisle/rack) within zone
	private Long binId; // Optional bin within locator

	// ARCHFIX §1.11: BigDecimal(18,3) (was Integer) — supports fractional units (kg/L) and avoids
	// SUM(int) overflow on the highest-volume ledger table. Signed: +ve inbound, -ve deduction.
	@jakarta.persistence.Column(precision = 18, scale = 3)
	private java.math.BigDecimal quantity; // always +ve here (IN)

	private LocalDate movementDate;

	private String referenceNo; // LPO-xxx / GRN-xxx / DP-xxx

	private String batchNumber; // Batch/Lot number for traceability

	@jakarta.persistence.Column(name = "serial_number", length = 120)
	private String serialNumber; // Serial number for serialized traceability

	private LocalDate expiryDate; // Product expiry date

	// Unit cost at the time of inbound receipt (from GRN/Purchase).
	// Used to compute weighted average cost for COGS at delivery.
	private java.math.BigDecimal unitCost;

	// True when this deduction was permitted to proceed despite insufficient stock
	// because the product's allowNegative flag was set. Enables negative-stock audit queries.
	private boolean negativeOverride;

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

	public String getSerialNumber() {
		return serialNumber;
	}

	public void setSerialNumber(String serialNumber) {
		this.serialNumber = serialNumber;
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

	public Long getBranchId() {
		return branchId;
	}

	public void setBranchId(Long branchId) {
		this.branchId = branchId;
	}

	public java.math.BigDecimal getQuantity() {
		return quantity;
	}

	public void setQuantity(java.math.BigDecimal quantity) {
		this.quantity = quantity;
	}

	/** Convenience setter for the many integer-quantity call sites (ARCHFIX §1.11). */
	public void setQuantity(int quantity) {
		this.quantity = java.math.BigDecimal.valueOf(quantity);
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

	public boolean isNegativeOverride() {
		return negativeOverride;
	}

	public void setNegativeOverride(boolean negativeOverride) {
		this.negativeOverride = negativeOverride;
	}
}
