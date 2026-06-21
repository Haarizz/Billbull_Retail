package com.billbull.backend.config;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.security.AuditLogRepository;

/** ARCHFIX §1.12 — audit retention is opt-in and deletes by a cutoff derived from the window. */
@ExtendWith(MockitoExtension.class)
class AuditLogRetentionJobTest {

    @Mock private AuditLogRepository auditLogRepository;

    private AuditLogRetentionJob job(int months) {
        AuditLogRetentionJob j = new AuditLogRetentionJob(auditLogRepository);
        ReflectionTestUtils.setField(j, "retentionMonths", months);
        return j;
    }

    @Test
    void disabledByDefaultDeletesNothing() {
        job(0).purgeOldAuditLogs();
        verify(auditLogRepository, never()).deleteByAccessTimeBefore(any());
    }

    @Test
    void negativeRetentionIsAlsoNoOp() {
        job(-5).purgeOldAuditLogs();
        verify(auditLogRepository, never()).deleteByAccessTimeBefore(any());
    }

    @Test
    void positiveRetentionPurgesOlderThanCutoff() {
        when(auditLogRepository.deleteByAccessTimeBefore(any())).thenReturn(42);
        LocalDateTime before = LocalDateTime.now().minusMonths(24);

        job(24).purgeOldAuditLogs();

        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(auditLogRepository).deleteByAccessTimeBefore(cutoff.capture());
        // cutoff ~= now - 24 months (allow a small clock delta between the two now() calls)
        LocalDateTime after = LocalDateTime.now().minusMonths(24);
        org.junit.jupiter.api.Assertions.assertTrue(
                !cutoff.getValue().isBefore(before.minusSeconds(5))
                        && !cutoff.getValue().isAfter(after.plusSeconds(5)),
                "cutoff must be ~24 months ago");
    }
}
