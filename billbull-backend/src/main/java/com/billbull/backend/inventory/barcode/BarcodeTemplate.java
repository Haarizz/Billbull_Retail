package com.billbull.backend.inventory.barcode;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "barcode_templates")
public class BarcodeTemplate extends BaseEntity {

    @Column(nullable = false)
    private String name;

    private String description;

    private Double width;
    private Double height;

    private String type; // e.g., 'Roll', 'Sheet'

    @Column(columnDefinition = "TEXT")
    private String fields; // JSON string representing enabled fields

    private Integer perPage;

    private boolean isSystem;

    @Column(name = "system_key", unique = true, length = 80)
    private String systemKey;

    @Column(length = 30)
    private String barcodeFormat; // CODE128, EAN13, EAN8, UPC, CODE39, ITF14, etc.

    // Branch-Level Inventory Phase 6A: nullable branch (null = shared/global). Additive only —
    // template branch-scoping/resolution is wired in Phase 9A. Column created by Flyway V36.
    @Column(name = "branch_id")
    private Long branchId;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Double getWidth() {
        return width;
    }

    public void setWidth(Double width) {
        this.width = width;
    }

    public Double getHeight() {
        return height;
    }

    public void setHeight(Double height) {
        this.height = height;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getFields() {
        return fields;
    }

    public void setFields(String fields) {
        this.fields = fields;
    }

    public Integer getPerPage() {
        return perPage;
    }

    public void setPerPage(Integer perPage) {
        this.perPage = perPage;
    }

    public boolean isSystem() {
        return isSystem;
    }

    public void setSystem(boolean system) {
        isSystem = system;
    }

    public String getSystemKey() {
        return systemKey;
    }

    public void setSystemKey(String systemKey) {
        this.systemKey = systemKey;
    }

    public String getBarcodeFormat() {
        return barcodeFormat;
    }

    public void setBarcodeFormat(String barcodeFormat) {
        this.barcodeFormat = barcodeFormat;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }
}
