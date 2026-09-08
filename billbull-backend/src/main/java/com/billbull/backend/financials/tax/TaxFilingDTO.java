package com.billbull.backend.financials.tax;

import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaxFilingDTO {
    private Long id;
    private Long configId;
    private String type;  // From TaxConfiguration
    private String period;
    private String dueDate;
    private String filedDate;
    private BigDecimal amount;
    private String status;
    private Integer documents;
    private String notes;
    private String attachmentPath;
    private String attachmentName;

    // --- Live ledger figures for the filing's period (see TaxService.getAllFilings).
    // `amount` stays the recorded/declared figure; these are what the GL actually
    // holds for the same period, so an untouched filing no longer reads as 0.00
    // while the VAT reports show activity. Null for non-VAT tax types or when the
    // period string cannot be resolved to a date range.
    private String periodStart;
    private String periodEnd;
    private BigDecimal ledgerOutputTax;
    private BigDecimal ledgerInputTax;
    private BigDecimal ledgerAmount;

    public static TaxFilingDTO fromEntity(TaxFiling filing) {
        TaxFilingDTO dto = new TaxFilingDTO();
        dto.setId(filing.getId());
        dto.setConfigId(filing.getTaxConfiguration().getId());
        dto.setType(filing.getTaxConfiguration().getType());
        dto.setPeriod(filing.getPeriod());
        dto.setDueDate(filing.getDueDate());
        dto.setFiledDate(filing.getFiledDate());
        dto.setAmount(filing.getAmount());
        dto.setStatus(filing.getStatus());
        dto.setDocuments(filing.getDocuments());
        dto.setNotes(filing.getNotes());
        dto.setAttachmentPath(filing.getAttachmentPath());
        dto.setAttachmentName(filing.getAttachmentName());
        return dto;
    }
}
