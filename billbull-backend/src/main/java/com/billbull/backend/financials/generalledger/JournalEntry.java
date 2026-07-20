package com.billbull.backend.financials.generalledger;

import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Core GL journal entry.
 *
 * PARTITIONING (Phase 8.3 — deferred, apply when row count exceeds ~5M):
 *   PostgreSQL declarative range partitioning by `date` (one partition per fiscal year).
 *   Hibernate does not manage partitions — apply via a raw SQL migration script outside
 *   ddl-auto=update. Create the initial partitions and a yearly auto-create job before
 *   enabling. See docs/gl_partitioning.md for the SQL template.
 *
 * PERIOD-LOCK TRIGGER (Phase 8.4 — deferred until all posting goes through PostingEngineService):
 *   A PostgreSQL trigger `trg_journal_entry_period_check BEFORE INSERT` can guard against
 *   direct SQL or ETL bypassing the application-layer PERIOD_LOCKED check in PostingEngineService.
 *   Apply only after confirming zero direct-SQL writes in production. Template:
 *     CREATE OR REPLACE FUNCTION fn_check_period_open() RETURNS trigger AS $$
 *     BEGIN
 *       IF EXISTS (SELECT 1 FROM accounting_periods WHERE status='Closed'
 *                  AND NEW.date BETWEEN start_date AND end_date) THEN
 *         RAISE EXCEPTION 'PERIOD_LOCKED: % is in a closed period', NEW.date;
 *       END IF;
 *       RETURN NEW;
 *     END; $$ LANGUAGE plpgsql;
 */
@Entity
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "entry_type", discriminatorType = DiscriminatorType.STRING)
@DiscriminatorValue("SYSTEM")
@Table(name = "journal_entries", indexes = {
    @Index(name = "idx_journal_entry_branch",       columnList = "branch_id"),
    @Index(name = "idx_journal_entry_date",         columnList = "date"),
    @Index(name = "idx_journal_entry_reference",    columnList = "reference"),
    @Index(name = "idx_journal_entry_status",       columnList = "status"),
    @Index(name = "idx_journal_entry_branch_date",  columnList = "branch_id, date")
})
@jakarta.persistence.EntityListeners(com.billbull.backend.common.ownership.OwnershipAuditListener.class)
@org.hibernate.annotations.Filter(name = "ownerFilter", condition = "created_by_user_id = :ownerId")
public class JournalEntry  implements com.billbull.backend.common.ownership.OwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable owner id for ownership filtering; stamped on persist by OwnershipAuditListener. Nullable forever. */
    @jakarta.persistence.Column(name = "created_by_user_id", updatable = false)
    private Long createdByUserId;

    // ARCHFIX §1.6: LAZY (was EAGER). Read/serialize paths fetch branch+lines via JOIN FETCH and
    // init them in-session; in-transaction service logic loads it lazily on demand.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    private Branch branch;

    @Column(unique = true, nullable = false)
    private String entryNumber; // Previously jvNumber

    @Column(nullable = false)
    private LocalDate date;

    private String reference;

    @Column(length = 1000)
    private String narration;

    /** Central status constants — keep in sync with DatabaseFixConfig journal_entries_status_check. */
    public static final String STATUS_DRAFT            = "Draft";
    public static final String STATUS_SUBMITTED        = "Submitted";
    public static final String STATUS_PENDING_APPROVAL = "PENDING_APPROVAL";
    public static final String STATUS_APPROVED         = "Approved";
    public static final String STATUS_POSTED           = "Posted";
    public static final String STATUS_REJECTED         = "Rejected";
    public static final String STATUS_VOIDED           = "Voided";

    @Column(nullable = false)
    private String status;

    private String preparedBy;
    private String postedBy;
    private LocalDateTime postedAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", insertable = false, updatable = false)
    private EntryType entryType;

    private String referenceType;
    private Long referenceId;

    // ARCHFIX §1.6: LAZY (was EAGER) + @BatchSize so listing N entries loads their lines in a few
    // batched selects instead of N EAGER round trips. Read/serialize paths init lines in-session.
    @OneToMany(mappedBy = "journalEntry", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @org.hibernate.annotations.BatchSize(size = 50)
    private List<JournalLine> lines = new ArrayList<>();

    public EntryType getEntryType() {
        return entryType;
    }

    public void setEntryType(EntryType entryType) {
        this.entryType = entryType;
    }

    public String getReferenceType() {
        return referenceType;
    }

    public void setReferenceType(String referenceType) {
        this.referenceType = referenceType;
    }

    public Long getReferenceId() {
        return referenceId;
    }

    public void setReferenceId(Long referenceId) {
        this.referenceId = referenceId;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public JournalEntry() {
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Branch getBranch() { return branch; }
    public void setBranch(Branch branch) { this.branch = branch; }

    public String getEntryNumber() {
        return entryNumber;
    }

    public void setEntryNumber(String entryNumber) {
        this.entryNumber = entryNumber;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public String getNarration() {
        return narration;
    }

    public void setNarration(String narration) {
        this.narration = narration;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPreparedBy() {
        return preparedBy;
    }

    public void setPreparedBy(String preparedBy) {
        this.preparedBy = preparedBy;
    }

    public String getPostedBy() {
        return postedBy;
    }

    public void setPostedBy(String postedBy) {
        this.postedBy = postedBy;
    }

    public LocalDateTime getPostedAt() {
        return postedAt;
    }

    public void setPostedAt(LocalDateTime postedAt) {
        this.postedAt = postedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<JournalLine> getLines() {
        return lines;
    }

    public void setLines(List<JournalLine> lines) {
        this.lines = lines;
        for (JournalLine line : lines) {
            line.setJournalEntry(this);
        }
    }

    public void addLine(JournalLine line) {
        lines.add(line);
        line.setJournalEntry(this);
    }

    public void removeLine(JournalLine line) {
        lines.remove(line);
        line.setJournalEntry(null);
    }

    @Override
    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    @Override
    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }
}
