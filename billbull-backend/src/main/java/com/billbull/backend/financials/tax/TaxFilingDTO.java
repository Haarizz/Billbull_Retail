package com.billbull.backend.financials.tax;

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
    private Double amount;
    private String status;
    private Integer documents;
    private String notes;
    private String attachmentPath;
    private String attachmentName;

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
