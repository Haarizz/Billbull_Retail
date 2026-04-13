package com.billbull.backend.inventory.subdepartment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class SubDepartmentRequest {

    @NotBlank
    public String name;

    @NotBlank
    public String code;

    @NotNull
    public Long departmentId;

    public String description;

    public boolean active;
    public boolean allowOverride;
    public boolean autoCreateGroups;
    public boolean restrictTerminals;
    
    
}
