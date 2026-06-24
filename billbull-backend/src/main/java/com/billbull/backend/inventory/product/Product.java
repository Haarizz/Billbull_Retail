package com.billbull.backend.inventory.product;

import java.time.LocalDateTime;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.brand.Brand;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.subdepartment.SubDepartment;
import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "products",
    uniqueConstraints = @UniqueConstraint(columnNames = "code"),
    indexes = {
        // Speeds up: WHERE is_active = true (used on every list/search query)
        @Index(name = "idx_product_active", columnList = "is_active"),
        // Speeds up: ORDER BY name ASC
        @Index(name = "idx_product_name", columnList = "name"),
        // Speeds up: WHERE code LIKE ... (search by code)
        @Index(name = "idx_product_code", columnList = "code"),
        // Speeds up: JOIN / filter by brand
        @Index(name = "idx_product_brand", columnList = "brand_id"),
        // Speeds up: JOIN / filter by department
        @Index(name = "idx_product_dept", columnList = "department_id"),
        // Composite: active + name — covers the main list query entirely
        @Index(name = "idx_product_active_name", columnList = "is_active, name"),
        // Speeds up: WHERE status = ...
        @Index(name = "idx_product_status", columnList = "status"),
        // Branch ownership — null = company-wide ("All Branches") shared item.
        @Index(name = "idx_product_branch", columnList = "branch_id")
    }
)
public class Product extends BaseEntity {

    @Column(nullable = false, length = 50)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branch;

    @Column(nullable = false, length = 150)
    private String name;

    private String localName;
    private String sku;

    @Column(length = 300)
    private String shortDesc;

    @Column(length = 1000)
    private String detailedDesc;

    @Enumerated(EnumType.STRING)
    private ProductType productType;

    private String category;

    @JsonProperty("isSerial")
    private boolean isSerial;

    @JsonProperty("isBatch")
    private boolean isBatch;

    private boolean expiryEnabled;

    @Column(nullable = false)
    private boolean fefoEnabled = true;

    @Column(nullable = false)
    private Integer minExpiryDaysForSale = 0;

    @JsonProperty("isWeighing")
    private boolean isWeighing;

    @JsonProperty("isDiscountAllowed")
    private boolean isDiscountAllowed;

    private Integer maxDiscount;

    @Enumerated(EnumType.STRING)
    private ProductStatus status;

    @ManyToOne(optional = false)
    @JoinColumn(name = "brand_id", nullable = false)
    private Brand brand;

    @ManyToOne(optional = true)
    @JoinColumn(name = "department_id", nullable = true)
    private Department department;


    @ManyToOne
    @JoinColumn(name = "sub_department_id")
    private SubDepartment subDepartment;

    // --- BASE ENTITY OVERRIDES ---
    
    @Override
    public Long getId() { return super.getId(); }

    @Override
    public void setId(Long id) { super.setId(id); } // Now valid because BaseEntity has setId

    @Override
    public boolean isActive() { return super.isActive(); }

    @Override
    public void setActive(boolean active) { super.setActive(active); }

    @Override
    public LocalDateTime getCreatedAt() { return super.getCreatedAt(); }

    @Override
    public void setCreatedAt(LocalDateTime createdAt) { super.setCreatedAt(createdAt); }

    @Override
    public String getCreatedBy() { return super.getCreatedBy(); }

    @Override
    public void setCreatedBy(String createdBy) { super.setCreatedBy(createdBy); }

    // --- PRODUCT SPECIFIC GETTERS/SETTERS ---
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public String getShortDesc() { return shortDesc; }
    public void setShortDesc(String shortDesc) { this.shortDesc = shortDesc; }
    public String getDetailedDesc() { return detailedDesc; }
    public void setDetailedDesc(String detailedDesc) { this.detailedDesc = detailedDesc; }
    public ProductType getProductType() { return productType; }
    public void setProductType(ProductType productType) { this.productType = productType; }

    /**
     * True when this product represents a service / labour / fee with no
     * physical inventory. Service products are excluded from stock checks,
     * stock movements, batch selection, and stock reports.
     */
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isService() { return productType == ProductType.SERVICE; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    @JsonProperty("isSerial")
    public boolean isSerial() { return isSerial; }
    public void setSerial(boolean isSerial) { this.isSerial = isSerial; }
    @JsonProperty("isBatch")
    public boolean isBatch() { return isBatch; }
    public void setBatch(boolean isBatch) { this.isBatch = isBatch; }
    public boolean isExpiryEnabled() { return expiryEnabled; }
    public void setExpiryEnabled(boolean expiryEnabled) { this.expiryEnabled = expiryEnabled; }
    public boolean isFefoEnabled() { return fefoEnabled; }
    public void setFefoEnabled(boolean fefoEnabled) { this.fefoEnabled = fefoEnabled; }
    public Integer getMinExpiryDaysForSale() { return minExpiryDaysForSale; }
    public void setMinExpiryDaysForSale(Integer minExpiryDaysForSale) {
        this.minExpiryDaysForSale = minExpiryDaysForSale != null && minExpiryDaysForSale > 0
                ? minExpiryDaysForSale
                : 0;
    }
    public boolean isWeighing() { return isWeighing; }
    public void setWeighing(boolean isWeighing) { this.isWeighing = isWeighing; }
    public boolean isDiscountAllowed() { return isDiscountAllowed; }
    public void setDiscountAllowed(boolean isDiscountAllowed) { this.isDiscountAllowed = isDiscountAllowed; }
    public Integer getMaxDiscount() { return maxDiscount; }
    public void setMaxDiscount(Integer maxDiscount) { this.maxDiscount = maxDiscount; }
    public ProductStatus getStatus() { return status; }
    public void setStatus(ProductStatus status) { this.status = status; }
    public Brand getBrand() { return brand; }
    public void setBrand(Brand brand) { this.brand = brand; }
    public Department getDepartment() { return department; }
    public void setDepartment(Department department) { this.department = department; }
    public SubDepartment getSubDepartment() { return subDepartment; }
    public void setSubDepartment(SubDepartment subDepartment) { this.subDepartment = subDepartment; }

    @OneToOne(mappedBy = "product", cascade = CascadeType.ALL)
    private ProductPricing pricing;

    @OneToOne(mappedBy = "product", cascade = CascadeType.ALL)
    private ProductInventoryPolicy inventory;

    @OneToOne(mappedBy = "product", cascade = CascadeType.ALL)
    private ProductTax tax;

    public ProductPricing getPricing() { return pricing; }
    public void setPricing(ProductPricing pricing) { 
        this.pricing = pricing; 
        if(pricing != null) pricing.setProduct(this);
    }

    public ProductInventoryPolicy getInventory() { return inventory; }
    public void setInventory(ProductInventoryPolicy inventory) { 
        this.inventory = inventory; 
        if(inventory != null) inventory.setProduct(this);
    }

    public ProductTax getTax() { return tax; }
    public void setTax(ProductTax tax) { 
        this.tax = tax; 
        if(tax != null) tax.setProduct(this);
    }
}
