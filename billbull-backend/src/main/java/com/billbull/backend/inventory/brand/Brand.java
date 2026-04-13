package com.billbull.backend.inventory.brand;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "brands", uniqueConstraints = {
        @UniqueConstraint(columnNames = "code"),
        @UniqueConstraint(columnNames = "name")
})
public class Brand extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, length = 10)
    private String code;

    @Column(length = 500)
    private String description;

    private String country;
    private String region;

    // Stored as file path or URL
    private String logoPath;

    // ✅ FIX: EAGER + initialized collection
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "brand_tags", joinColumns = @JoinColumn(name = "brand_id"))
    @Column(name = "tag")
    private List<String> tags = new ArrayList<>();

    @Column(nullable = false)
    private boolean active = true;

    // --------------------
    // Barcode Prefix Settings
    // --------------------

    @Column(name = "barcode_prefix", length = 10)
    private String barcodePrefix;

    @Column(name = "prefix_length")
    private Integer prefixLength;

    @Column(name = "suffix_length")
    private Integer suffixLength;

    // --------------------
    // Auto Generation Control
    // --------------------

    @Column(name = "auto_generate")
    private Boolean autoGenerate;

    // --------------------
    // Validation Rules
    // --------------------

    @Column(name = "rule_global_unique")
    private Boolean ruleGlobalUnique;

    @Column(name = "rule_brand_unique")
    private Boolean ruleBrandUnique;

    @Column(name = "rule_manual_override")
    private Boolean ruleManualOverride;

    // --------------------
    // Generated Barcode
    // --------------------

    @Column(name = "barcode", unique = true, length = 50)
    private String barcode;

    // -------- getters & setters --------

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getLogoPath() {
        return logoPath;
    }

    public void setLogoPath(String logoPath) {
        this.logoPath = logoPath;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public String getBarcodePrefix() {
        return barcodePrefix;
    }

    public void setBarcodePrefix(String barcodePrefix) {
        this.barcodePrefix = barcodePrefix;
    }

    public Integer getPrefixLength() {
        return prefixLength;
    }

    public void setPrefixLength(Integer prefixLength) {
        this.prefixLength = prefixLength;
    }

    public Integer getSuffixLength() {
        return suffixLength;
    }

    public void setSuffixLength(Integer suffixLength) {
        this.suffixLength = suffixLength;
    }

    public Boolean getAutoGenerate() {
        return autoGenerate;
    }

    public void setAutoGenerate(Boolean autoGenerate) {
        this.autoGenerate = autoGenerate;
    }

    public Boolean getRuleGlobalUnique() {
        return ruleGlobalUnique;
    }

    public void setRuleGlobalUnique(Boolean ruleGlobalUnique) {
        this.ruleGlobalUnique = ruleGlobalUnique;
    }

    public Boolean getRuleBrandUnique() {
        return ruleBrandUnique;
    }

    public void setRuleBrandUnique(Boolean ruleBrandUnique) {
        this.ruleBrandUnique = ruleBrandUnique;
    }

    public Boolean getRuleManualOverride() {
        return ruleManualOverride;
    }

    public void setRuleManualOverride(Boolean ruleManualOverride) {
        this.ruleManualOverride = ruleManualOverride;
    }

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }
}
