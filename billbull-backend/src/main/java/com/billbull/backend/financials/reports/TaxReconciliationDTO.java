package com.billbull.backend.financials.reports;

import java.math.BigDecimal;
import java.util.List;

/**
 * Audit DTO for Tax Reconciliation.
 * Shows transactional breakdown of tax base and tax amounts.
 */
public class TaxReconciliationDTO {
    private String period;
    private List<TaxAuditLine> lines;

    public static class TaxAuditLine {
        private String documentNumber;
        private String date; // ISO transaction date of the voucher
        private String type; // SALES or PURCHASE
        private BigDecimal baseAmount;
        private BigDecimal taxAmount;
        private String accountName;

        public TaxAuditLine(String documentNumber, String date, String type, BigDecimal baseAmount,
                BigDecimal taxAmount, String accountName) {
            this.documentNumber = documentNumber;
            this.date = date;
            this.type = type;
            this.baseAmount = baseAmount;
            this.taxAmount = taxAmount;
            this.accountName = accountName;
        }

        public String getDocumentNumber() {
            return documentNumber;
        }

        public String getDate() {
            return date;
        }

        public String getType() {
            return type;
        }

        public BigDecimal getBaseAmount() {
            return baseAmount;
        }

        public BigDecimal getTaxAmount() {
            return taxAmount;
        }

        public String getAccountName() {
            return accountName;
        }
    }

    public String getPeriod() {
        return period;
    }

    public void setPeriod(String period) {
        this.period = period;
    }

    public List<TaxAuditLine> getLines() {
        return lines;
    }

    public void setLines(List<TaxAuditLine> lines) {
        this.lines = lines;
    }
}
