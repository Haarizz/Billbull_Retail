package com.billbull.platform.backup;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One backup run reported by a server's backup script. */
@Entity
@Table(name = "backup_reports")
public class BackupReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "tenant_id")
    public Long tenantId;

    @Column(name = "tenant_code", length = 40)
    public String tenantCode;

    @Column(name = "database_name", length = 100)
    public String databaseName;

    /** {@code DATABASE} (pg_dump) or {@code UPLOADS} (files archive). */
    @Column(nullable = false, length = 20)
    public String kind = "DATABASE";

    /** {@code SUCCESS} or {@code FAILED}. */
    @Column(nullable = false, length = 20)
    public String status;

    @Column(name = "started_at")
    public Instant startedAt;

    @Column(name = "finished_at")
    public Instant finishedAt;

    @Column(name = "size_bytes")
    public Long sizeBytes;

    @Column(length = 500)
    public String location;

    @Column(name = "checksum_sha256", length = 64)
    public String checksumSha256;

    @Column(length = 1000)
    public String message;

    @Column(name = "reported_at", nullable = false)
    public Instant reportedAt;

    @Column(name = "reporter_ip", length = 64)
    public String reporterIp;
}
