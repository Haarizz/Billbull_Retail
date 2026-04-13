package com.billbull.backend.inventory.warehouse;

import jakarta.validation.constraints.NotBlank;

public class WarehouseRequestDto {

    @NotBlank
    private String name;

    @NotBlank
    private String type;

    @NotBlank
    private String address;

    private String status;

    private Integer capacity;

    private Integer utilization;

    // ===== Getters & Setters =====

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
}
