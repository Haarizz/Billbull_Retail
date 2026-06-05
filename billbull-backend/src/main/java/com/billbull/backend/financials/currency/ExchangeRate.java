package com.billbull.backend.financials.currency;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(
    name = "exchange_rates",
    indexes = {
        @Index(name = "idx_fx_from_to_date", columnList = "from_currency, to_currency, rate_date")
    }
)
public class ExchangeRate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "from_currency", nullable = false, length = 3)
    private String fromCurrency;

    @Column(name = "to_currency", nullable = false, length = 3)
    private String toCurrency;

    @Column(name = "rate_date", nullable = false)
    private LocalDate rateDate;

    /** Units of toCurrency per 1 unit of fromCurrency. */
    @Column(nullable = false, precision = 18, scale = 8)
    private BigDecimal rate;

    public ExchangeRate() {}

    public Long getId() { return id; }

    public String getFromCurrency() { return fromCurrency; }
    public void setFromCurrency(String fromCurrency) { this.fromCurrency = fromCurrency; }

    public String getToCurrency() { return toCurrency; }
    public void setToCurrency(String toCurrency) { this.toCurrency = toCurrency; }

    public LocalDate getRateDate() { return rateDate; }
    public void setRateDate(LocalDate rateDate) { this.rateDate = rateDate; }

    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
}
