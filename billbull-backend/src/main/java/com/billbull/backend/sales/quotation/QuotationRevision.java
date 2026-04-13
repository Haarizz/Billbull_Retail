package com.billbull.backend.sales.quotation;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "sales_quotation_revisions")
public class QuotationRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Integer revisionNumber;
    private String qtnNoDisplay;
    private LocalDate revisionDate;

    @Column(length = 1000)
    private String followUpNote;

    @Enumerated(EnumType.STRING)
    private QuotationStatus statusAtTime;

    @Column(columnDefinition = "TEXT")
    private String itemsSnapshotJson;

    private BigDecimal totalAmountSnapshot;

    @JsonBackReference
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    public QuotationRevision() {}

    // ---------------- GETTERS & SETTERS ----------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Integer getRevisionNumber() { return revisionNumber; }
    public void setRevisionNumber(Integer revisionNumber) { this.revisionNumber = revisionNumber; }

    public String getQtnNoDisplay() { return qtnNoDisplay; }
    public void setQtnNoDisplay(String qtnNoDisplay) { this.qtnNoDisplay = qtnNoDisplay; }

    public LocalDate getRevisionDate() { return revisionDate; }
    public void setRevisionDate(LocalDate revisionDate) { this.revisionDate = revisionDate; }

    public String getFollowUpNote() { return followUpNote; }
    public void setFollowUpNote(String followUpNote) { this.followUpNote = followUpNote; }

    public QuotationStatus getStatusAtTime() { return statusAtTime; }
    public void setStatusAtTime(QuotationStatus statusAtTime) { this.statusAtTime = statusAtTime; }

    public String getItemsSnapshotJson() { return itemsSnapshotJson; }
    public void setItemsSnapshotJson(String itemsSnapshotJson) { this.itemsSnapshotJson = itemsSnapshotJson; }

    public BigDecimal getTotalAmountSnapshot() { return totalAmountSnapshot; }
    public void setTotalAmountSnapshot(BigDecimal totalAmountSnapshot) { this.totalAmountSnapshot = totalAmountSnapshot; }

    public Quotation getQuotation() { return quotation; }
    public void setQuotation(Quotation quotation) { this.quotation = quotation; }
}
