package com.billbull.backend.pos.printjob;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.devicemanager.PosDeviceEventType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;

@ExtendWith(MockitoExtension.class)
class PosPrintJobTimeoutSweepJobTest {

    @Mock
    private PosPrintJobRepository jobRepo;

    @Mock
    private PosPrinterRepository printerRepo;

    @Mock
    private PosDeviceEventLogService eventLogService;

    private PosPrintJobTimeoutSweepJob sweepJob;

    @BeforeEach
    void setUp() {
        sweepJob = new PosPrintJobTimeoutSweepJob(jobRepo, printerRepo, eventLogService);
        ReflectionTestUtils.setField(sweepJob, "timeoutMinutes", 5);
        ReflectionTestUtils.setField(sweepJob, "queuedExpiryMinutes", 60);
    }

    @Test
    void noOpWhenNothingIsStale() {
        when(jobRepo.findStaleDispatched(any())).thenReturn(List.of());

        sweepJob.sweepStaleDispatches();

        verify(jobRepo, never()).failStaleDispatch(any(), any(), any(), any());
    }

    @Test
    void recoversStaleJobAsFailedAndLogsDeviceEvent() {
        PosPrintJob stale = new PosPrintJob();
        stale.setId(1L);
        stale.setPrinterId(5L);
        stale.setBranchId(10L);
        stale.setTerminalId("T001");
        when(jobRepo.findStaleDispatched(any())).thenReturn(List.of(stale));
        when(jobRepo.failStaleDispatch(eq(1L), any(), any(), any())).thenReturn(1);
        PosPrinter printer = new PosPrinter();
        printer.setId(5L);
        printer.setDeviceId(1005L);
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer));

        sweepJob.sweepStaleDispatches();

        verify(jobRepo, times(1)).failStaleDispatch(eq(1L), any(), any(), any());
        verify(eventLogService).record(eq(1005L), eq(PosDeviceEventType.QUEUE_TIMEOUT), any(), any(), any(),
                eq(10L), eq("T001"));
    }

    @Test
    void neverRequeuesAStaleJob() {
        // Explicit guard against the one outcome this sweep must never produce: re-queuing a job
        // whose actual print outcome is unknown, which could cause a duplicate physical print.
        PosPrintJob stale = new PosPrintJob();
        stale.setId(2L);
        stale.setPrinterId(5L);
        when(jobRepo.findStaleDispatched(any())).thenReturn(List.of(stale));
        when(jobRepo.failStaleDispatch(eq(2L), any(), any(), any())).thenReturn(1);
        when(printerRepo.findById(5L)).thenReturn(Optional.empty());

        sweepJob.sweepStaleDispatches();

        verify(jobRepo, never()).save(any());
        verify(jobRepo, never()).claimForDispatch(any(), any());
    }

    @Test
    void skipsJobAlreadyResolvedConcurrentlyBySweep() {
        // failStaleDispatch returning 0 means a legitimate reportResult() landed first — the
        // sweep must not log an event or otherwise act on a job it didn't actually change.
        PosPrintJob stale = new PosPrintJob();
        stale.setId(3L);
        stale.setPrinterId(5L);
        when(jobRepo.findStaleDispatched(any())).thenReturn(List.of(stale));
        when(jobRepo.failStaleDispatch(eq(3L), any(), any(), any())).thenReturn(0);

        sweepJob.sweepStaleDispatches();

        verify(printerRepo, never()).findById(any());
        verify(eventLogService, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void expiresStaleQueuedJobAsFailedAndLogsDeviceEvent() {
        PosPrintJob stale = new PosPrintJob();
        stale.setId(7L);
        stale.setPrinterId(5L);
        stale.setBranchId(10L);
        stale.setTerminalId("T001");
        when(jobRepo.findStaleQueued(any())).thenReturn(List.of(stale));
        when(jobRepo.expireStaleQueued(eq(7L), any(), any(), any())).thenReturn(1);
        PosPrinter printer = new PosPrinter();
        printer.setId(5L);
        printer.setDeviceId(1005L);
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer));

        sweepJob.expireStaleQueuedJobs();

        verify(jobRepo, times(1)).expireStaleQueued(eq(7L), any(), any(), any());
        verify(eventLogService).record(eq(1005L), eq(PosDeviceEventType.QUEUE_TIMEOUT), any(), any(), any(),
                eq(10L), eq("T001"));
        // Terminal FAILED only — never claimed/executed, so a stale receipt can't print later.
        verify(jobRepo, never()).claimForDispatch(any(), any());
        verify(jobRepo, never()).save(any());
    }

    @Test
    void queuedExpiryNoOpWhenNothingIsStale() {
        when(jobRepo.findStaleQueued(any())).thenReturn(List.of());

        sweepJob.expireStaleQueuedJobs();

        verify(jobRepo, never()).expireStaleQueued(any(), any(), any(), any());
    }

    @Test
    void queuedExpirySkipsJobClaimedConcurrently() {
        // expireStaleQueued returning 0 means a dispatch claim landed first — the claim wins and
        // the sweep must not log an event for a job it didn't actually change.
        PosPrintJob stale = new PosPrintJob();
        stale.setId(8L);
        stale.setPrinterId(5L);
        when(jobRepo.findStaleQueued(any())).thenReturn(List.of(stale));
        when(jobRepo.expireStaleQueued(eq(8L), any(), any(), any())).thenReturn(0);

        sweepJob.expireStaleQueuedJobs();

        verify(printerRepo, never()).findById(any());
        verify(eventLogService, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void queuedExpiryCutoffUsesConfiguredMinutes() {
        ReflectionTestUtils.setField(sweepJob, "queuedExpiryMinutes", 120);
        when(jobRepo.findStaleQueued(any())).thenReturn(List.of());

        LocalDateTime before = LocalDateTime.now().minusMinutes(120);
        sweepJob.expireStaleQueuedJobs();
        LocalDateTime after = LocalDateTime.now().minusMinutes(120);

        org.mockito.ArgumentCaptor<LocalDateTime> captor = org.mockito.ArgumentCaptor.forClass(LocalDateTime.class);
        verify(jobRepo).findStaleQueued(captor.capture());
        LocalDateTime usedCutoff = captor.getValue();
        assertEquals(true, !usedCutoff.isBefore(before) && !usedCutoff.isAfter(after));
    }

    @Test
    void timeoutCutoffUsesConfiguredMinutes() {
        ReflectionTestUtils.setField(sweepJob, "timeoutMinutes", 10);
        when(jobRepo.findStaleDispatched(any())).thenReturn(List.of());

        LocalDateTime before = LocalDateTime.now().minusMinutes(10);
        sweepJob.sweepStaleDispatches();
        LocalDateTime after = LocalDateTime.now().minusMinutes(10);

        org.mockito.ArgumentCaptor<LocalDateTime> captor = org.mockito.ArgumentCaptor.forClass(LocalDateTime.class);
        verify(jobRepo).findStaleDispatched(captor.capture());
        LocalDateTime usedCutoff = captor.getValue();
        assertEquals(true, !usedCutoff.isBefore(before) && !usedCutoff.isAfter(after));
    }
}
