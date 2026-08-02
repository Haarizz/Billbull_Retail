package com.billbull.backend.pos.businessdate;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Tracks the current Business Date per branch, independent of the server clock.
 * Advances only via {@link PosBusinessDateService#advanceBusinessDate}, called once
 * at the tail of a successful Day Close — never derived from {@code LocalDate.now()}.
 * Deliberately has no OPEN/CLOSED status field: whether the current business date is
 * closed is answered by {@code PosDayCloseRepository.existsByBranchIdAndCloseDate},
 * which stays the single source of truth for that question.
 */
@Entity
@Table(name = "pos_business_dates", uniqueConstraints = {
        @UniqueConstraint(name = "uk_pos_business_date_branch", columnNames = {"branch_id"})
})
public class PosBusinessDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "branch_id", nullable = false, unique = true)
    private Long branchId;

    @Column(name = "current_business_date", nullable = false)
    private LocalDate currentBusinessDate;

    @Column(name = "last_advanced_at")
    private LocalDateTime lastAdvancedAt;

    @Column(name = "last_advanced_by", length = 100)
    private String lastAdvancedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public LocalDate getCurrentBusinessDate() { return currentBusinessDate; }
    public void setCurrentBusinessDate(LocalDate currentBusinessDate) { this.currentBusinessDate = currentBusinessDate; }

    public LocalDateTime getLastAdvancedAt() { return lastAdvancedAt; }
    public void setLastAdvancedAt(LocalDateTime lastAdvancedAt) { this.lastAdvancedAt = lastAdvancedAt; }

    public String getLastAdvancedBy() { return lastAdvancedBy; }
    public void setLastAdvancedBy(String lastAdvancedBy) { this.lastAdvancedBy = lastAdvancedBy; }
}
