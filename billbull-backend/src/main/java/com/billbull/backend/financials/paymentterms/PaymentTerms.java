package com.billbull.backend.financials.paymentterms;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "payment_terms")
public class PaymentTerms {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String code; // e.g. "NET_30", "2_10_NET_30"

    @Column(nullable = false)
    private String name; // e.g. "Net 30 Days"

    /** Days after invoice date until payment is due. */
    @Column(nullable = false)
    private Integer netDays = 0;

    /** Discount % if paid within earlyPaymentDiscountDays. 0 = no discount. */
    @Column(precision = 5, scale = 2)
    private BigDecimal earlyPaymentDiscountPercent = BigDecimal.ZERO;

    /** Days from invoice date within which earlyPaymentDiscount applies. */
    private Integer earlyPaymentDiscountDays = 0;

    @Column(nullable = false)
    private Boolean isActive = true;

    public PaymentTerms() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Integer getNetDays() { return netDays; }
    public void setNetDays(Integer netDays) { this.netDays = netDays; }

    public BigDecimal getEarlyPaymentDiscountPercent() { return earlyPaymentDiscountPercent; }
    public void setEarlyPaymentDiscountPercent(BigDecimal earlyPaymentDiscountPercent) {
        this.earlyPaymentDiscountPercent = earlyPaymentDiscountPercent;
    }

    public Integer getEarlyPaymentDiscountDays() { return earlyPaymentDiscountDays; }
    public void setEarlyPaymentDiscountDays(Integer earlyPaymentDiscountDays) {
        this.earlyPaymentDiscountDays = earlyPaymentDiscountDays;
    }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
