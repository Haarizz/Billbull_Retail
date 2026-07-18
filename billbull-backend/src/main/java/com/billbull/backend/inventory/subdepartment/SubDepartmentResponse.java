package com.billbull.backend.inventory.subdepartment;

public class SubDepartmentResponse {

    public Long id;
    public String name;
    public String code;

    public Long departmentId;
    public String departmentName;
    public String departmentCode;

    public String description;

    public int items;
    public int brands;
    public int noBarcode;

    public boolean active;

    public boolean allowOverride;
    public boolean autoCreateGroups;
    public boolean restrictTerminals;

    // Branch-Level Inventory Phase 11 — owning branch (null = shared/global) for the SPA badges.
    public Long branchId;
    public String branchName;
}
