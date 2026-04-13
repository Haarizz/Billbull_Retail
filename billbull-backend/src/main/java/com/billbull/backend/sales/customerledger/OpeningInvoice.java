package com.billbull.backend.sales.customerledger;

import com.fasterxml.jackson.annotation.JsonIgnore; // Import this
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
public class OpeningInvoice {

    public OpeningInvoice() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // --- ADD THIS RELATIONSHIP ---
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    @JsonIgnore // Prevents infinite recursion
    private Customer customer;
    // -----------------------------

    private String number;
    private LocalDate date;
    private BigDecimal amount;
    private BigDecimal outstanding;
    private String remarks;

    // --- ADD GETTER & SETTER FOR CUSTOMER ---
    public Customer getCustomer() { return customer; }
    public void setCustomer(Customer customer) { this.customer = customer; }
    // ----------------------------------------

    // ... Keep existing getters and setters ...
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNumber() { return number; }
    public void setNumber(String number) { this.number = number; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getOutstanding() { return outstanding; }
    public void setOutstanding(BigDecimal outstanding) { this.outstanding = outstanding; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
}