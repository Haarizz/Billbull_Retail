package com.billbull.backend.inventory.warehouse;

public class WarehouseResponse {

    private Long id;
    private String name;
    private String type;
    private String address;
    private String status;
    private Integer capacity;
    private Integer utilization;
    private Long zoneCount;
    private Long locatorCount;
    private Long binCount;
    private Long branchId;
    private String branchName;
    private String branchCode;

    // ===== Getters & Setters =====

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

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getCapacity() {
        return capacity;
    }

    public void setCapacity(Integer capacity) {
        this.capacity = capacity;
    }

    public Integer getUtilization() {
        return utilization;
    }

    public void setUtilization(Integer utilization) {
        this.utilization = utilization;
    }

    public Long getZoneCount() {
        return zoneCount;
    }

    public void setZoneCount(Long zoneCount) {
        this.zoneCount = zoneCount;
    }

    public Long getLocatorCount() {
        return locatorCount;
    }

    public void setLocatorCount(Long locatorCount) {
        this.locatorCount = locatorCount;
    }

    public Long getBinCount() {
        return binCount;
    }

    public void setBinCount(Long binCount) {
        this.binCount = binCount;
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

    public String getBranchCode() {
        return branchCode;
    }

    public void setBranchCode(String branchCode) {
        this.branchCode = branchCode;
    }
}
