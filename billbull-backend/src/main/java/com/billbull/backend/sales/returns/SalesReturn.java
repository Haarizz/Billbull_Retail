package com.billbull.backend.sales.returns;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "sales_returns", indexes = {
    @Index(name = "idx_sales_return_branch", columnList = "branch_id"),
    // Speeds the date-bounded sales-report loader.
    @Index(name = "idx_sales_return_date", columnList = "return_date")
})
@JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class SalesReturn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true)
    private String returnNumber;

    private LocalDate returnDate;
    private String customerCode;
    private String customerName;
    private String linkedInvoice;

    @Column(precision = 15, scale = 2)
    private BigDecimal subTotal;
    @Column(precision = 15, scale = 2)
    private BigDecimal taxAmount;
    @Column(precision = 15, scale = 2)
    private BigDecimal totalAmount;

    private String reason;
    private String returnAction; // Credit Note, Refund, Replacement

    @Column(length = 1000)
    private String internalNotes;

    @Enumerated(EnumType.STRING)
    private SalesReturnStatus status;

    // ARCHFIX §1.6: LAZY (was EAGER). Read paths that serialize items use a JOIN FETCH finder
    // (findAllWithItems / findByIdWithItems); the nested batches load via @BatchSize on the item.
    @OneToMany(mappedBy = "salesReturn", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference
    @org.hibernate.annotations.BatchSize(size = 50)
    private List<SalesReturnItem> items;

    /* ===== GETTERS & SETTERS ===== */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getReturnNumber() {
        return returnNumber;
    }

    public void setReturnNumber(String returnNumber) {
        this.returnNumber = returnNumber;
    }

    public LocalDate getReturnDate() {
        return returnDate;
    }

    public void setReturnDate(LocalDate returnDate) {
        this.returnDate = returnDate;
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

    public String getLinkedInvoice() {
        return linkedInvoice;
    }

    public void setLinkedInvoice(String linkedInvoice) {
        this.linkedInvoice = linkedInvoice;
    }

    public BigDecimal getSubTotal() {
        return subTotal;
    }

    public void setSubTotal(BigDecimal subTotal) {
        this.subTotal = subTotal;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getReturnAction() {
        return returnAction;
    }

    public void setReturnAction(String returnAction) {
        this.returnAction = returnAction;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public void setInternalNotes(String internalNotes) {
        this.internalNotes = internalNotes;
    }

    public SalesReturnStatus getStatus() {
        return status;
    }

    public void setStatus(SalesReturnStatus status) {
        this.status = status;
    }

    public List<SalesReturnItem> getItems() {
        return items;
    }

    public void setItems(List<SalesReturnItem> items) {
        this.items = items;
    }
}
