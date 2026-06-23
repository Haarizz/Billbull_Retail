package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.util.List;

import com.billbull.backend.purchase.serial.PurchaseSerialDraft;

public class InvoiceItemDraft {

    private Long id;
    private String itemCode;
    private String itemName;
    private String barcode;
    private String image;
    private String uom;
    private Integer qty;
    private Integer focQty; // Added
    private String focUnit;
    private BigDecimal unitCost;
    private BigDecimal netCost;

    private BigDecimal discountPercent; // Added
    private BigDecimal discountAmount; // Added
    private BigDecimal taxPercent;
    private BigDecimal taxAmount;
    private BigDecimal lineTotal;
    private String remarks;
    private String detailedDesc;
    private String sku;
    private String brandName;
    private String shortDesc;
    private String localName;
    private Boolean serialEnabled;
    private List<PurchaseSerialDraft> serials;
    private Boolean batchEnabled;
    private List<InvoiceItemBatchDraft> batches;

    // ✅ REQUIRED: default constructor
    public InvoiceItemDraft() {
    }

    // --- getters & setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getItemCode() {
        return itemCode;
    }

    public void setItemCode(String itemCode) {
        this.itemCode = itemCode;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public String getBarcode() {
        return barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public String getUom() {
        return uom;
    }

    public void setUom(String uom) {
        this.uom = uom;
    }

    public Integer getQty() {
        return qty;
    }

    public void setQty(Integer qty) {
        this.qty = qty;
    }

    public Integer getFocQty() {
        return focQty;
    }

    public void setFocQty(Integer focQty) {
        this.focQty = focQty;
    }

    public String getFocUnit() {
        return focUnit;
    }

    public void setFocUnit(String focUnit) {
        this.focUnit = focUnit;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public BigDecimal getNetCost() {
        return netCost;
    }

    public void setNetCost(BigDecimal netCost) {
        this.netCost = netCost;
    }

    public BigDecimal getDiscountPercent() {
        return discountPercent;
    }

    public void setDiscountPercent(BigDecimal discountPercent) {
        this.discountPercent = discountPercent;
    }

    public BigDecimal getDiscountAmount() {
        return discountAmount;
    }

    public void setDiscountAmount(BigDecimal discountAmount) {
        this.discountAmount = discountAmount;
    }

    public BigDecimal getTaxPercent() {
        return taxPercent;
    }

    public void setTaxPercent(BigDecimal taxPercent) {
        this.taxPercent = taxPercent;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public void setLineTotal(BigDecimal lineTotal) {
        this.lineTotal = lineTotal;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public String getDetailedDesc() {
        return detailedDesc;
    }

    public void setDetailedDesc(String detailedDesc) {
        this.detailedDesc = detailedDesc;
    }

    public Boolean getBatchEnabled() {
        return batchEnabled;
    }

    public void setBatchEnabled(Boolean batchEnabled) {
        this.batchEnabled = batchEnabled;
    }

    public List<InvoiceItemBatchDraft> getBatches() {
        return batches;
    }

    public void setBatches(List<InvoiceItemBatchDraft> batches) {
        this.batches = batches;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public String getBrandName() {
        return brandName;
    }

    public void setBrandName(String brandName) {
        this.brandName = brandName;
    }

    public String getShortDesc() {
        return shortDesc;
    }

    public void setShortDesc(String shortDesc) {
        this.shortDesc = shortDesc;
    }

    public String getLocalName() {
        return localName;
    }

    public void setLocalName(String localName) {
        this.localName = localName;
    }

    public Boolean getSerialEnabled() {
        return serialEnabled;
    }

    public void setSerialEnabled(Boolean serialEnabled) {
        this.serialEnabled = serialEnabled;
    }

    public List<PurchaseSerialDraft> getSerials() {
        return serials;
    }

    public void setSerials(List<PurchaseSerialDraft> serials) {
        this.serials = serials;
    }
}
