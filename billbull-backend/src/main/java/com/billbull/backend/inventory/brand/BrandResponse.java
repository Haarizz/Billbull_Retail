package com.billbull.backend.inventory.brand;

import java.util.List;

public class BrandResponse {

    public Long id;
    public String name;
    public String code;
    public String description;
    public String country;
    public String region;
    public String logoUrl;
    public boolean active;
    public List<String> tags;

    // UI helpers
    public long productsCount; // placeholder (future)

    // Barcode fields
    public String prefix;
    public Integer prefixLength;
    public Integer suffixLength;
    public String rule;
    public Boolean auto;

    // Barcode Validation Rules
    public Boolean ruleGlobalUnique;
    public Boolean ruleBrandUnique;
    public Boolean ruleManualOverride;
}