package com.billbull.backend.sales.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "sales_document_number_settings")
public class SalesDocumentNumberSetting {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private SalesDocumentType documentType;

    @Column(nullable = false, length = 80)
    private String label;

    @Column(nullable = false)
    private boolean autoNumberingEnabled = true;

    @Column(nullable = false, length = 30)
    private String prefix;

    @Column(nullable = false)
    private Integer nextNumber = 1;

    @Transient
    private String preview;

    public static SalesDocumentNumberSetting defaultFor(SalesDocumentType type) {
        SalesDocumentNumberSetting setting = new SalesDocumentNumberSetting();
        setting.setDocumentType(type);
        setting.setLabel(type.getLabel());
        setting.setAutoNumberingEnabled(true);
        setting.setPrefix(type.getDefaultPrefix());
        setting.setNextNumber(1);
        return setting;
    }

    public SalesDocumentType getDocumentType() {
        return documentType;
    }

    public void setDocumentType(SalesDocumentType documentType) {
        this.documentType = documentType;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public boolean isAutoNumberingEnabled() {
        return autoNumberingEnabled;
    }

    public void setAutoNumberingEnabled(boolean autoNumberingEnabled) {
        this.autoNumberingEnabled = autoNumberingEnabled;
    }

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    public Integer getNextNumber() {
        return nextNumber;
    }

    public void setNextNumber(Integer nextNumber) {
        this.nextNumber = nextNumber;
    }

    public String getPreview() {
        return preview;
    }

    public void setPreview(String preview) {
        this.preview = preview;
    }
}
