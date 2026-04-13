package com.billbull.backend.financials.reports;

import java.math.BigDecimal;

/**
 * Tax Dashboard Summary DTO.
 * Shows output tax, input tax, and net tax payable.
 */
public class TaxDashboardDTO {
    private BigDecimal outputTax; // Tax collected from customers (sales)
    private BigDecimal inputTax; // Tax paid to vendors (purchases)
    private BigDecimal taxableSalesBase; // Base amount for sales
    private BigDecimal taxablePurchaseBase; // Base amount for purchases
    private BigDecimal netTaxPayable; // Output - Input
    private String period;

    public TaxDashboardDTO() {
    }

    public BigDecimal getOutputTax() {
        return outputTax;
    }

    public void setOutputTax(BigDecimal outputTax) {
        this.outputTax = outputTax;
    }

    public BigDecimal getInputTax() {
        return inputTax;
    }

    public void setInputTax(BigDecimal inputTax) {
        this.inputTax = inputTax;
    }

    public BigDecimal getNetTaxPayable() {
        return netTaxPayable;
    }

    public void setNetTaxPayable(BigDecimal netTaxPayable) {
        this.netTaxPayable = netTaxPayable;
    }

    public BigDecimal getTaxableSalesBase() {
        return taxableSalesBase;
    }

    public void setTaxableSalesBase(BigDecimal taxableSalesBase) {
        this.taxableSalesBase = taxableSalesBase;
    }

    public BigDecimal getTaxablePurchaseBase() {
        return taxablePurchaseBase;
    }

    public void setTaxablePurchaseBase(BigDecimal taxablePurchaseBase) {
        this.taxablePurchaseBase = taxablePurchaseBase;
    }

    public String getPeriod() {
        return period;
    }

    public void setPeriod(String period) {
        this.period = period;
    }
}
