package com.billbull.backend.pos.printjob;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A single print request routed through the Device Manager rather than dispatched directly
 * from the browser to the local hardware agent. Gives the backend a true record of every print
 * attempt (queue, retry, audit) instead of a synchronous fire-and-forget call.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §7 / §9 (Phase B).
 */
@Entity
@Table(name = "pos_print_jobs", indexes = {
        @Index(name = "idx_print_jobs_status_printer", columnList = "status, printer_id"),
        @Index(name = "idx_print_jobs_branch_terminal", columnList = "branch_id, terminal_id")
})
public class PosPrintJob extends BaseEntity {

    @Enumerated(EnumType.STRING)
    @Column(name = "job_type", nullable = false, length = 20)
    private PrintJobType jobType;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 10)
    private PrintJobPriority priority = PrintJobPriority.NORMAL;

    @Column(name = "printer_id", nullable = false)
    private Long printerId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "terminal_id", length = 80)
    private String terminalId;

    @Column(name = "counter_name", length = 120)
    private String counterName;

    @Column(name = "source_type", length = 30)
    private String sourceType;

    @Column(name = "source_ref_id")
    private Long sourceRefId;

    @Lob
    @Column(name = "payload", nullable = false)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "payload_format", nullable = false, length = 20)
    private PrintPayloadFormat payloadFormat = PrintPayloadFormat.ESC_POS_TEXT;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PrintJobStatus status = PrintJobStatus.QUEUED;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 3;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "dispatched_at")
    private LocalDateTime dispatchedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "scheduled_for")
    private LocalDateTime scheduledFor;

    @Column(name = "requested_by", length = 100)
    private String requestedBy;

    public PrintJobType getJobType() { return jobType; }
    public void setJobType(PrintJobType jobType) { this.jobType = jobType; }

    public PrintJobPriority getPriority() { return priority; }
    public void setPriority(PrintJobPriority priority) { this.priority = priority; }

    public Long getPrinterId() { return printerId; }
    public void setPrinterId(Long printerId) { this.printerId = printerId; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public Long getSourceRefId() { return sourceRefId; }
    public void setSourceRefId(Long sourceRefId) { this.sourceRefId = sourceRefId; }

    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }

    public PrintPayloadFormat getPayloadFormat() { return payloadFormat; }
    public void setPayloadFormat(PrintPayloadFormat payloadFormat) { this.payloadFormat = payloadFormat; }

    public PrintJobStatus getStatus() { return status; }
    public void setStatus(PrintJobStatus status) { this.status = status; }

    public int getAttemptCount() { return attemptCount; }
    public void setAttemptCount(int attemptCount) { this.attemptCount = attemptCount; }

    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }

    public LocalDateTime getDispatchedAt() { return dispatchedAt; }
    public void setDispatchedAt(LocalDateTime dispatchedAt) { this.dispatchedAt = dispatchedAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public LocalDateTime getScheduledFor() { return scheduledFor; }
    public void setScheduledFor(LocalDateTime scheduledFor) { this.scheduledFor = scheduledFor; }

    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }
}
