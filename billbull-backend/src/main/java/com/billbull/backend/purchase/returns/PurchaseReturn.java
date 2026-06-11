package com.billbull.backend.purchase.returns;

import com.billbull.backend.settings.branch.Branch;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "purchase_returns", indexes = {
    @Index(name = "idx_purchase_return_branch", columnList = "branch_id"),
    @Index(name = "idx_purchase_return_date",   columnList = "return_date"),
    @Index(name = "idx_purchase_return_number", columnList = "debit_note_number")
})
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class PurchaseReturn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true, nullable = false)
    private String debitNoteNumber;

    private LocalDate returnDate;

    private String vendorName;
    private String vendorCode;

    /** Original Purchase Invoice number this return is linked to. */
    private String linkedInvoiceNumber;

    private BigDecimal subTotal;
    private BigDecimal taxTotal;
    private BigDecimal grandTotal;

    private String reason;

    @Column(length = 1000)
    private String notes;

    @Enumerated(EnumType.STRING)
    private PurchaseReturnStatus status;

    @OneToMany(mappedBy = "purchaseReturn", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference
    private List<PurchaseReturnItem> items = new ArrayList<>();

    // Getters & Setters

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getDebitNoteNumber() { return debitNoteNumber; }
    public void setDebitNoteNumber(String debitNoteNumber) { this.debitNoteNumber = debitNoteNumber; }

    public LocalDate getReturnDate() { return returnDate; }
    public void setReturnDate(LocalDate returnDate) { this.returnDate = returnDate; }

    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }

    public String getVendorCode() { return vendorCode; }
    public void setVendorCode(String vendorCode) { this.vendorCode = vendorCode; }

    public String getLinkedInvoiceNumber() { return linkedInvoiceNumber; }
    public void setLinkedInvoiceNumber(String linkedInvoiceNumber) { this.linkedInvoiceNumber = linkedInvoiceNumber; }

    public BigDecimal getSubTotal() { return subTotal; }
    public void setSubTotal(BigDecimal subTotal) { this.subTotal = subTotal; }

    public BigDecimal getTaxTotal() { return taxTotal; }
    public void setTaxTotal(BigDecimal taxTotal) { this.taxTotal = taxTotal; }

    public BigDecimal getGrandTotal() { return grandTotal; }
    public void setGrandTotal(BigDecimal grandTotal) { this.grandTotal = grandTotal; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public PurchaseReturnStatus getStatus() { return status; }
    public void setStatus(PurchaseReturnStatus status) { this.status = status; }

    public List<PurchaseReturnItem> getItems() { return items; }
    public void setItems(List<PurchaseReturnItem> items) { this.items = items; }
}
