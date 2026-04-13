package com.billbull.backend.inventory.brand;

import java.util.List;

public class BrandRequest {

    public String name;
    public String code;
    public String description;
    public String country;
    public String region;
    public boolean active;
    public List<String> tags;

    // Barcode Prefix Settings
    public String prefix;
    public Integer prefixLength;
    public Integer suffixLength;

    // Auto Generation Control
    public Boolean auto;

    // Validation Rules
    public Boolean ruleGlobalUnique;
    public Boolean ruleBrandUnique;
    public Boolean ruleManualOverride;
}
