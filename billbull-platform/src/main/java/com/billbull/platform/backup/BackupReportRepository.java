package com.billbull.platform.backup;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BackupReportRepository extends JpaRepository<BackupReport, Long> {

    List<BackupReport> findByTenantIdOrderByReportedAtDesc(Long tenantId, Pageable pageable);

    List<BackupReport> findAllByOrderByReportedAtDesc(Pageable pageable);

    /** Backups taken from the database console are recorded once, keyed by {@code agent:<file>}. */
    boolean existsByTenantIdAndLocation(Long tenantId, String location);

    /** Latest successful DATABASE backup per tenant. */
    @Query(value = "SELECT DISTINCT ON (tenant_id) * FROM backup_reports"
            + " WHERE tenant_id IS NOT NULL AND kind = 'DATABASE' AND status = 'SUCCESS'"
            + " ORDER BY tenant_id, COALESCE(finished_at, reported_at) DESC", nativeQuery = true)
    List<BackupReport> latestSuccessPerTenant();

    /** Latest DATABASE report per tenant, successful or not. */
    @Query(value = "SELECT DISTINCT ON (tenant_id) * FROM backup_reports"
            + " WHERE tenant_id IS NOT NULL AND kind = 'DATABASE'"
            + " ORDER BY tenant_id, reported_at DESC", nativeQuery = true)
    List<BackupReport> latestPerTenant();
}
