package com.billbull.backend.sales.salesorder;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "sales_orders", indexes = {
    @Index(name = "idx_sales_order_branch", columnList = "branch_id"),
    // Speeds the date-bounded sales-report loader.
    @Index(name = "idx_sales_order_date", columnList = "order_date")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class SalesOrder  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true)
    private String soNumber;

    private LocalDate orderDate;

    private String customerCode;
    private String customerName;

    private String linkedQuotation;
    /**
     * Revision number of the source quotation at the moment of conversion.
     * Lets us reconstruct exactly what the customer agreed to, even after the
     * quotation is subsequently revised. Null when not converted from a quotation.
     */
    private Integer linkedQuotationRevision;
    private String linkedProforma;

    @Column(precision = 15, scale = 2)
    private BigDecimal subTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal orderTotal;

    @Column(precision = 15, scale = 2)
    private BigDecimal advanceAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal balanceDue;
    /** Bill-level discount PERCENTAGE rate (not money). */
    private Double billDiscount;

    @Column(name = "bill_discount_amount", precision = 15, scale = 2)
    private BigDecimal billDiscountAmount;

    @Column(name = "bill_discount_type", length = 20)
    private String billDiscountType;

    private String paymentMethod;
    private String paymentReference;
    private String deliveryType;
    private LocalDate expectedDeliveryDate;

    @Column(length = 500)
    private String shippingAddress;

    @Column(length = 500)
    private String deliveryInstructions;

    @Column(length = 1000)
    private String customerNotes;

    @Column(length = 1000)
    private String internalNotes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private com.billbull.backend.inventory.warehouse.Warehouse warehouse;

    @Enumerated(EnumType.STRING)
    private SalesOrderStatus status;

    /**
     * Whether line prices on this order are entered VAT-exclusive (tax added
     * on top) or VAT-inclusive (tax extracted out of the line). Default
     * EXCLUSIVE preserves legacy behaviour.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12, columnDefinition = "varchar(12) default 'EXCLUSIVE'")
    private com.billbull.backend.sales.common.VatMode vatMode
            = com.billbull.backend.sales.common.VatMode.EXCLUSIVE;

    // ✅ KEEP LAZY (IMPORTANT)
    @OneToMany(mappedBy = "salesOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    private List<SalesOrderItem> items;

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getSoNumber() {
        return soNumber;
    }

    public void setSoNumber(String soNumber) {
        this.soNumber = soNumber;
    }

    public LocalDate getOrderDate() {
        return orderDate;
    }

    public void setOrderDate(LocalDate orderDate) {
        this.orderDate = orderDate;
    }

    public String getCustomerCode() {
        return customerCode;
    }

    public void setCustomerCode(String customerCode) {
        this.customerCode = customerCode;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getLinkedQuotation() {
        return linkedQuotation;
    }

    public void setLinkedQuotation(String linkedQuotation) {
        this.linkedQuotation = linkedQuotation;
    }

    public Integer getLinkedQuotationRevision() {
        return linkedQuotationRevision;
    }

    public void setLinkedQuotationRevision(Integer linkedQuotationRevision) {
        this.linkedQuotationRevision = linkedQuotationRevision;
    }

    public String getLinkedProforma() {
        return linkedProforma;
    }

    public void setLinkedProforma(String linkedProforma) {
        this.linkedProforma = linkedProforma;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(BigDecimal taxTotal) {
        this.taxTotal = taxTotal;
    }

    public BigDecimal getOrderTotal() {
        return orderTotal;
    }

    public void setOrderTotal(BigDecimal orderTotal) {
        this.orderTotal = orderTotal;
    }

    public BigDecimal getAdvanceAmount() {
        return advanceAmount;
    }

    public void setAdvanceAmount(BigDecimal advanceAmount) {
        this.advanceAmount = advanceAmount;
    }

    public BigDecimal getBalanceDue() {
        return balanceDue;
    }

    public void setBalanceDue(BigDecimal balanceDue) {
        this.balanceDue = balanceDue;
    }

    public Double getBillDiscount() {
        return billDiscount;
    }

    public void setBillDiscount(Double billDiscount) {
        this.billDiscount = billDiscount;
    }

    public BigDecimal getBillDiscountAmount() {
        return billDiscountAmount;
    }

    public void setBillDiscountAmount(BigDecimal billDiscountAmount) {
        this.billDiscountAmount = billDiscountAmount;
    }

    public String getBillDiscountType() {
        return billDiscountType;
    }

    public void setBillDiscountType(String billDiscountType) {
        this.billDiscountType = billDiscountType;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public void setPaymentMethod(String paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public void setPaymentReference(String paymentReference) {
        this.paymentReference = paymentReference;
    }

    public String getDeliveryType() {
        return deliveryType;
    }

    public void setDeliveryType(String deliveryType) {
        this.deliveryType = deliveryType;
    }

    public LocalDate getExpectedDeliveryDate() {
        return expectedDeliveryDate;
    }

    public void setExpectedDeliveryDate(LocalDate expectedDeliveryDate) {
        this.expectedDeliveryDate = expectedDeliveryDate;
    }

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        this.shippingAddress = shippingAddress;
    }

    public String getDeliveryInstructions() {
        return deliveryInstructions;
    }

    public void setDeliveryInstructions(String deliveryInstructions) {
        this.deliveryInstructions = deliveryInstructions;
    }

    public String getCustomerNotes() {
        return customerNotes;
    }

    public void setCustomerNotes(String customerNotes) {
        this.customerNotes = customerNotes;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public void setInternalNotes(String internalNotes) {
        this.internalNotes = internalNotes;
    }

    @com.fasterxml.jackson.annotation.JsonIgnore
    public com.billbull.backend.inventory.warehouse.Warehouse getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(com.billbull.backend.inventory.warehouse.Warehouse warehouse) {
        this.warehouse = warehouse;
    }

    @Transient
    public Long getWarehouseId() {
        return warehouse != null ? warehouse.getId() : null;
    }

    @Transient
    public String getWarehouseName() {
        return warehouse != null ? warehouse.getName() : null;
    }

    public com.billbull.backend.sales.common.VatMode getVatMode() {
        return vatMode;
    }

    public void setVatMode(com.billbull.backend.sales.common.VatMode vatMode) {
        this.vatMode = vatMode;
    }

    public SalesOrderStatus getStatus() {
        return status;
    }

    public void setStatus(SalesOrderStatus status) {
        this.status = status;
    }

    public List<SalesOrderItem> getItems() {
        return items;
    }

    public void setItems(List<SalesOrderItem> items) {
        this.items = items;
    }

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
