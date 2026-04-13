package com.billbull.backend.sales.salesorder;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "sales_orders")
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class SalesOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String soNumber;

    private LocalDate orderDate;

    private String customerCode;
    private String customerName;

    private String linkedQuotation;
    private String linkedProforma;

    private Double subTotal;
    private Double taxTotal;
    private Double orderTotal;

    private Double advanceAmount;
    private Double balanceDue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private com.billbull.backend.inventory.warehouse.Warehouse warehouse;

    @Enumerated(EnumType.STRING)
    private SalesOrderStatus status;

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

    public String getLinkedProforma() {
        return linkedProforma;
    }

    public void setLinkedProforma(String linkedProforma) {
        this.linkedProforma = linkedProforma;
    }

    public Double getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(Double subTotal) {
        this.subTotal = subTotal;
    }

    public Double getTaxTotal() {
        return taxTotal;
    }

    public void setTaxTotal(Double taxTotal) {
        this.taxTotal = taxTotal;
    }

    public Double getOrderTotal() {
        return orderTotal;
    }

    public void setOrderTotal(Double orderTotal) {
        this.orderTotal = orderTotal;
    }

    public Double getAdvanceAmount() {
        return advanceAmount;
    }

    public void setAdvanceAmount(Double advanceAmount) {
        this.advanceAmount = advanceAmount;
    }

    public Double getBalanceDue() {
        return balanceDue;
    }

    public void setBalanceDue(Double balanceDue) {
        this.balanceDue = balanceDue;
    }

    public com.billbull.backend.inventory.warehouse.Warehouse getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(com.billbull.backend.inventory.warehouse.Warehouse warehouse) {
        this.warehouse = warehouse;
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
}
