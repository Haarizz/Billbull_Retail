package com.billbull.platform.health;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HealthSnapshotRepository extends JpaRepository<HealthSnapshot, Long> {

    Optional<HealthSnapshot> findTopByTenantIdOrderByCheckedAtDesc(Long tenantId);

    List<HealthSnapshot> findByTenantIdOrderByCheckedAtDesc(Long tenantId, Pageable pageable);

    /** Latest snapshot per tenant. */
    @Query(value = "SELECT DISTINCT ON (tenant_id) * FROM health_snapshots ORDER BY tenant_id, checked_at DESC",
            nativeQuery = true)
    List<HealthSnapshot> latestPerTenant();

    /** Latest snapshot per tenant that carried a full report (build / migration figures). */
    @Query(value = "SELECT DISTINCT ON (tenant_id) * FROM health_snapshots"
            + " WHERE flyway_version IS NOT NULL OR artifact_sha256 IS NOT NULL"
            + " ORDER BY tenant_id, checked_at DESC", nativeQuery = true)
    List<HealthSnapshot> latestReportingPerTenant();

    @Modifying
    @Query("DELETE FROM HealthSnapshot h WHERE h.checkedAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
