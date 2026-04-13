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
}
