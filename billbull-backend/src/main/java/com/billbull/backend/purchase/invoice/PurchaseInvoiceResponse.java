package com.billbull.backend.purchase.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class PurchaseInvoiceResponse {

    private Long id;
    private String invoiceNumber;
    private LocalDate invoiceDate;

    private String vendorName;
    private String sourceType;
    private String referenceNo;
    private String warehouseName;

    // ✅ GRN linkage (OPTIONAL)
    private Long grnId;
    private String grnNo;
    private String vendorInvoiceNo;
    private Long lpoId;

    private Long warehouseId;
    private Long zoneId;
    private Long locatorId;
    private Long binId;

    private BigDecimal freight;
    private BigDecimal customsDuty;
    private BigDecimal handling;
    private BigDecimal clearing;
    private BigDecimal insurance;
    private BigDecimal otherCosts;

    // ✅ Editor-only items (OPTIONAL)
    private List<InvoiceItemDraft> items;

    private BigDecimal subTotal;
    private BigDecimal grandTotal;
    private BigDecimal taxTotal;
    private BigDecimal amountPaid;
    private BigDecimal balanceDue;

    private LocalDate dueDate;

    private InvoiceStatus status;
    private PaymentStatus paymentStatus;

    /* ===== REQUIRED constructor (DO NOT REMOVE) ===== */

    /* ===== Empty constructor for GRN draft ===== */
    public PurchaseInvoiceResponse() {
    }

    public PurchaseInvoiceResponse(Long id, String invoiceNumber, LocalDate invoiceDate, String vendorName,
            String sourceType, String referenceNo, String warehouseName, Long grnId, String grnNo,
            String vendorInvoiceNo, List<InvoiceItemDraft> items, BigDecimal grandTotal, BigDecimal taxTotal,
            InvoiceStatus status, PaymentStatus paymentStatus) {
        super();
        this.id = id;
        this.invoiceNumber = invoiceNumber;
        this.invoiceDate = invoiceDate;
        this.vendorName = vendorName;
        this.sourceType = sourceType;
        this.referenceNo = referenceNo;
        this.warehouseName = warehouseName;
        this.grnId = grnId;
        this.grnNo = grnNo;
        this.vendorInvoiceNo = vendorInvoiceNo;
        this.items = items;
        this.grandTotal = grandTotal;
        this.taxTotal = taxTotal;
        this.status = status;
        this.paymentStatus = paymentStatus;
    }

    /* ===== getters & setters ===== */
    public String getVendorInvoiceNo() {
        return vendorInvoiceNo;
    }

    public void setVendorInvoiceNo(String vendorInvoiceNo) {
        this.vendorInvoiceNo = vendorInvoiceNo;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getInvoiceNumber() {
        return invoiceNumber;
    }

    public void setInvoiceNumber(String invoiceNumber) {
        this.invoiceNumber = invoiceNumber;
    }

    public LocalDate getInvoiceDate() {
        return invoiceDate;
    }

    public void setInvoiceDate(LocalDate invoiceDate) {
        this.invoiceDate = invoiceDate;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getReferenceNo() {
        return referenceNo;
    }

    public void setReferenceNo(String referenceNo) {
        this.referenceNo = referenceNo;
    }

    public String getWarehouseName() {
        return warehouseName;
    }

    public void setWarehouseName(String warehouseName) {
        this.warehouseName = warehouseName;
    }

    public Long getGrnId() {
        return grnId;
    }

    public void setGrnId(Long grnId) {
        this.grnId = grnId;
    }

    public String getGrnNo() {
        return grnNo;
    }

    public void setGrnNo(String grnNo) {
        this.grnNo = grnNo;
    }

    public List<InvoiceItemDraft> getItems() {
        return items;
    }

    public void setItems(List<InvoiceItemDraft> items) {
        this.items = items;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
    }

    public BigDecimal getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(BigDecimal taxTotal) {
        this.taxTotal = taxTotal;
    }

    public BigDecimal getAmountPaid() {
        return amountPaid;
    }

    public void setAmountPaid(BigDecimal amountPaid) {
        this.amountPaid = amountPaid;
    }

    public BigDecimal getBalanceDue() {
        return balanceDue;
    }

    public void setBalanceDue(BigDecimal balanceDue) {
        this.balanceDue = balanceDue;
    }

    public InvoiceStatus getStatus() {
        return status;
    }

    public void setStatus(InvoiceStatus status) {
        this.status = status;
    }

    public PaymentStatus getPaymentStatus() {
        return paymentStatus;
    }

    public void setPaymentStatus(PaymentStatus paymentStatus) {
        this.paymentStatus = paymentStatus;
    }

    public Long getLpoId() {
        return lpoId;
    }

    public void setLpoId(Long lpoId) {
        this.lpoId = lpoId;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    public Long getZoneId() {
        return zoneId;
    }

    public void setZoneId(Long zoneId) {
        this.zoneId = zoneId;
    }

    public Long getLocatorId() {
        return locatorId;
    }

    public void setLocatorId(Long locatorId) {
        this.locatorId = locatorId;
    }

    public Long getBinId() {
        return binId;
    }

    public void setBinId(Long binId) {
        this.binId = binId;
    }

    public BigDecimal getFreight() {
        return freight;
    }

    public void setFreight(BigDecimal freight) {
        this.freight = freight;
    }

    public BigDecimal getCustomsDuty() {
        return customsDuty;
    }

    public void setCustomsDuty(BigDecimal customsDuty) {
        this.customsDuty = customsDuty;
    }

    public BigDecimal getHandling() {
        return handling;
    }

    public void setHandling(BigDecimal handling) {
        this.handling = handling;
    }

    public BigDecimal getClearing() {
        return clearing;
    }

    public void setClearing(BigDecimal clearing) {
        this.clearing = clearing;
    }

    public BigDecimal getInsurance() {
        return insurance;
    }

    public void setInsurance(BigDecimal insurance) {
        this.insurance = insurance;
    }

    public BigDecimal getOtherCosts() {
        return otherCosts;
    }

    public void setOtherCosts(BigDecimal otherCosts) {
        this.otherCosts = otherCosts;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }
}
