package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;

public class LpoItemResponse {

    private Long productId;
    private String itemCode;
    private String itemName;
    private String barcode;
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

    public LpoItemResponse(LpoItem item) {
        this.productId = item.getProduct().getId();
        this.itemCode = item.getItemCode();
        this.itemName = item.getItemName();
        this.barcode = item.getBarcode();
        this.uom = item.getUom();
        this.quantity = item.getQuantity();
        this.unitPrice = item.getUnitPrice();
        this.discountPercent = item.getDiscountPercent();
        this.lineTotal = item.getLineTotal();
        this.receivedQuantity = 0; // Default to 0, will be populated by service
        this.focQty = item.getFocQty();
        this.focUnit = item.getFocUnit();
        this.remarks = item.getRemarks();
        this.image = null; // Will be populated in service if needed, or by constructor if we change the
                           // signature
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
}
