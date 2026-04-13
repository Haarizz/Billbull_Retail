package com.billbull.backend.inventory.subdepartment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class SubDepartmentRequest {

    @NotBlank
    public String name;

    // Optional on quick-add — service auto-generates when blank
    public String code;

    @NotNull
    public Long departmentId;

    public String description;

    // Use Boolean (not primitive) so null means "default to active"
    public Boolean active;
    public boolean allowOverride;
    public boolean autoCreateGroups;
    public boolean restrictTerminals;
    
    
}
