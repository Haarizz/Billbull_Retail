package com.billbull.backend.sales.templates.model;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;
import com.fasterxml.jackson.annotation.JsonProperty;

@Data
@EqualsAndHashCode(callSuper = true)
@Entity
@Table(name = "print_templates")
public class PrintTemplate extends BaseEntity {

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String name;

    @JsonProperty("isDefault")
    @Column(name = "is_default")
    private boolean isDefault;

    /**
     * Rendering family for the template: FULL (structured letterhead HTML),
     * LETTERHEAD (overlay onto pre-printed letterhead), or PREPRINTED (values
     * only, printed onto pre-printed stationery). Drives which renderer the
     * print pipeline uses. Defaults to FULL for legacy rows.
     */
    @Column(name = "template_type")
    private String templateType;

    @Column(name = "paper_size")
    private String paperSize;

    private String orientation;

    @Lob
    @Column(name = "header_content", columnDefinition = "TEXT")
    private String headerContent;

    @Lob
    @Column(name = "terms_content", columnDefinition = "TEXT")
    private String termsContent;

    @Lob
    @Column(name = "footer_content", columnDefinition = "TEXT")
    private String footerContent;

    @Lob
    @Column(name = "display_options", columnDefinition = "TEXT")
    private String displayOptions; // JSON string

    @Lob
    @Column(name = "columns_config", columnDefinition = "TEXT")
    private String columns; // JSON string
}
