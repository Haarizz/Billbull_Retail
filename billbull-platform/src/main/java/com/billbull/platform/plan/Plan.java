package com.billbull.platform.plan;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** A subscription plan: which optional modules it includes and its limits (null = unlimited). */
@Entity
@Table(name = "plans")
public class Plan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(nullable = false, unique = true, length = 40)
    public String code;

    @Column(nullable = false, length = 120)
    public String name;

    @Column(length = 500)
    public String description;

    /** Comma-separated optional module keys, e.g. {@code pos,purchases,finance}. */
    @Column(nullable = false, length = 200)
    public String modules = "";

    @Column(name = "max_users")
    public Integer maxUsers;

    @Column(name = "max_branches")
    public Integer maxBranches;

    @Column(name = "max_terminals_per_branch")
    public Integer maxTerminalsPerBranch;

    @Column(name = "monthly_price", precision = 12, scale = 2)
    public BigDecimal monthlyPrice;

    @Column(nullable = false, length = 3)
    public String currency = "AED";

    @Column(nullable = false)
    public boolean active = true;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }

    public Set<String> moduleSet() {
        if (modules == null || modules.isBlank()) return Set.of();
        return Arrays.stream(modules.split(",")).map(String::trim).filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public void setModuleSet(Set<String> set) {
        modules = String.join(",", set);
    }
}
