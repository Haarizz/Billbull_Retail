package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonProperty;

public class LpoItemResponse {

    private Long productId;
    private String itemCode;
    private String itemName;
    private String barcode;
    private String sku;
    private String brand;
    private String shortDesc;
    private String uom;
    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal discountPercent;
    private BigDecimal lineTotal;
    private Integer receivedQuantity;
    private Integer focQty;
    private String focUnit;
    private String remarks;
    private String image;
    private BigDecimal purchaseTax;
    private String detailedDesc;
    @JsonProperty("isSerial")
    private boolean isSerial;
    @JsonProperty("isBatchTracked")
    private boolean isBatchTracked;

    public LpoItemResponse(LpoItem item) {
        this.productId = item.getProduct().getId();
        this.itemCode = item.getItemCode();
        this.itemName = item.getItemName();
        this.barcode = item.getBarcode();
        this.sku = item.getProduct().getSku();
        this.brand = (item.getProduct().getBrand() != null) ? item.getProduct().getBrand().getName() : null;
        this.shortDesc = item.getProduct().getShortDesc();
        this.uom = item.getUom();
        this.quantity = item.getQuantity();
        this.unitPrice = item.getUnitPrice();
        this.discountPercent = item.getDiscountPercent();
        this.lineTotal = item.getLineTotal();
        this.receivedQuantity = 0;
        this.focQty = item.getFocQty();
        this.focUnit = item.getFocUnit();
        this.remarks = item.getRemarks();
        this.image = null;
        // Mirrors PurchaseTaxResolutionService (product tax, else 0% — no hardcoded default).
        // This is a plain response DTO built outside Spring's context, so the logic is
        // duplicated inline rather than injected; keep both in sync if either changes.
        this.purchaseTax = (item.getProduct().getTax() != null && item.getProduct().getTax().getPurchaseTax() != null)
                ? item.getProduct().getTax().getPurchaseTax()
                : java.math.BigDecimal.ZERO;
        this.detailedDesc = item.getProduct().getDetailedDesc();
        this.isSerial = item.getProduct().isSerial();
        this.isBatchTracked = item.getProduct().isBatch();
    }

    public Long getProductId() {
        return productId;
    }

    public String getItemCode() {
        return itemCode;
    }

    public String getItemName() {
        return itemName;
    }

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }

    public String getSku() {
        return sku;
    }

    public String getBrand() {
        return brand;
    }

    public String getShortDesc() {
        return shortDesc;
    }

    public String getUom() {
        return uom;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public BigDecimal getDiscountPercent() {
        return discountPercent;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public Integer getReceivedQuantity() {
        return receivedQuantity;
    }

    public void setReceivedQuantity(Integer receivedQuantity) {
        this.receivedQuantity = receivedQuantity;
    }

    public Integer getFocQty() {
        return focQty;
    }

    public String getFocUnit() {
        return focUnit;
    }

    public String getRemarks() {
        return remarks;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public BigDecimal getPurchaseTax() {
        return purchaseTax;
    }

    public String getDetailedDesc() {
        return detailedDesc;
    }

    @JsonProperty("isSerial")
    public boolean isSerial() {
        return isSerial;
    }

    @JsonProperty("isBatchTracked")
    public boolean isBatchTracked() {
        return isBatchTracked;
    }
}
