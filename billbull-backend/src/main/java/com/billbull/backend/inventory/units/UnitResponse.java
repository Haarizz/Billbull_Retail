package com.billbull.backend.inventory.units;

public class UnitResponse {

	private Long id;
	private String name;
	private String symbol;
	private String description;
	private boolean active;
	private long usedIn; // for frontend display
	private Long baseUnitId;
	private String baseUnitName;
	private java.math.BigDecimal conversionRate;
	// Branch-Level Inventory Phase 11 — owning branch (null = shared/global) for the SPA badges.
	private Long branchId;
	private String branchName;

	public UnitResponse(Unit unit, long usedIn) {
		this.id = unit.getId();
		this.name = unit.getName();
		this.symbol = unit.getSymbol();
		this.description = unit.getDescription();
		this.active = unit.isActive();
		this.usedIn = usedIn;
		if (unit.getBaseUnit() != null) {
			this.baseUnitId = unit.getBaseUnit().getId();
			this.baseUnitName = unit.getBaseUnit().getName();
		}
		this.conversionRate = unit.getConversionRate();
		if (unit.getBranch() != null) {
			this.branchId = unit.getBranch().getId();
			this.branchName = unit.getBranch().getName();
		}
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public boolean isActive() {
		return active;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public long getUsedIn() {
		return usedIn;
	}

	public void setUsedIn(long usedIn) {
		this.usedIn = usedIn;
	}

	public Long getBaseUnitId() {
		return baseUnitId;
	}

	public void setBaseUnitId(Long baseUnitId) {
		this.baseUnitId = baseUnitId;
	}

	public String getBaseUnitName() {
		return baseUnitName;
	}

	public void setBaseUnitName(String baseUnitName) {
		this.baseUnitName = baseUnitName;
	}

	public java.math.BigDecimal getConversionRate() {
		return conversionRate;
	}

	public void setConversionRate(java.math.BigDecimal conversionRate) {
		this.conversionRate = conversionRate;
	}

	public Long getBranchId() {
		return branchId;
	}

	public void setBranchId(Long branchId) {
		this.branchId = branchId;
	}

	public String getBranchName() {
		return branchName;
	}

	public void setBranchName(String branchName) {
		this.branchName = branchName;
	}
}