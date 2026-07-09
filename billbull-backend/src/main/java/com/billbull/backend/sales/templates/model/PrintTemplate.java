package com.billbull.backend.sales.templates.model;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

    /**
     * Owning branch, or null for a global/shared template (the historical behavior for
     * every category). Resolution order when looking up an effective template for a
     * branch is: branch-specific row, then the global (null) row, then a hardcoded
     * system default — see {@link com.billbull.backend.sales.templates.service.PrintTemplateService#resolveTemplate}.
     */
    @Column(name = "branch_id")
    private Long branchId;

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

    // NOTE: deliberately NOT @Lob. On PostgreSQL, @Lob on a String field makes Hibernate
    // store the value as a Large Object (an OID reference into pg_largeobject) instead of
    // inline TEXT — the column then holds a small OID number, not the actual content. A
    // plain @Column with columnDefinition="TEXT" is correct and sufficient here; Hibernate
    // maps un-annotated long Strings to TEXT/CLOB appropriately without @Lob's OID behavior.
    @Column(name = "header_content", columnDefinition = "TEXT")
    private String headerContent;

    @Column(name = "terms_content", columnDefinition = "TEXT")
    private String termsContent;

    @Column(name = "footer_content", columnDefinition = "TEXT")
    private String footerContent;

    @Column(name = "display_options", columnDefinition = "TEXT")
    private String displayOptions; // JSON string

    @Column(name = "columns_config", columnDefinition = "TEXT")
    private String columns; // JSON string
}
