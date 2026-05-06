package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class StockTakeProductResponse {

    private Long id;
    private String code;
    private String sku;
    private String name;
    private String description;
    private String category;
    private Long departmentId;
    private String departmentName;
    private Long brandId;
    private String brandName;
    private String barcode;
    private List<String> barcodes = new ArrayList<>();
    private String image;
    private BigDecimal cost;
    private BigDecimal retailPrice;
    private BigDecimal sellingPrice;
    private Integer stock = 0;
    private boolean batchEnabled;
    private boolean expiryEnabled;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public Long getDepartmentId() { return departmentId; }
    public void setDepartmentId(Long departmentId) { this.departmentId = departmentId; }

    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }

    public Long getBrandId() { return brandId; }
    public void setBrandId(Long brandId) { this.brandId = brandId; }

    public String getBrandName() { return brandName; }
    public void setBrandName(String brandName) { this.brandName = brandName; }

    public String getBarcode() { return barcode; }
    public void setBarcode(String barcode) { this.barcode = barcode; }

    public List<String> getBarcodes() { return barcodes; }
    public void setBarcodes(List<String> barcodes) { this.barcodes = barcodes; }

    public String getImage() { return image; }
    public void setImage(String image) { this.image = image; }

    public BigDecimal getCost() { return cost; }
    public void setCost(BigDecimal cost) { this.cost = cost; }

    public BigDecimal getRetailPrice() { return retailPrice; }
    public void setRetailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; }

    public BigDecimal getSellingPrice() { return sellingPrice; }
    public void setSellingPrice(BigDecimal sellingPrice) { this.sellingPrice = sellingPrice; }

    public Integer getStock() { return stock; }
    public void setStock(Integer stock) { this.stock = stock; }

    public boolean isBatchEnabled() { return batchEnabled; }
    public void setBatchEnabled(boolean batchEnabled) { this.batchEnabled = batchEnabled; }

    public boolean isExpiryEnabled() { return expiryEnabled; }
    public void setExpiryEnabled(boolean expiryEnabled) { this.expiryEnabled = expiryEnabled; }
}
