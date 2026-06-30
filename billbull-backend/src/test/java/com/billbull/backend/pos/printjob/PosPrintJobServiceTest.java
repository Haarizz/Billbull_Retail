package com.billbull.backend.pos.printjob;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import com.billbull.backend.pos.printer.PosPrinterStatus;

@ExtendWith(MockitoExtension.class)
class PosPrintJobServiceTest {

    @Mock
    private PosPrintJobRepository jobRepo;

    @Mock
    private PosPrinterRepository printerRepo;

    @Mock
    private PosDeviceEventLogService eventLogService;

    private PosPrintJobService service;

    @BeforeEach
    void setUp() {
        service = new PosPrintJobService(jobRepo, printerRepo, eventLogService);
        lenient().when(jobRepo.save(any(PosPrintJob.class))).thenAnswer(invocation -> {
            PosPrintJob job = invocation.getArgument(0);
            if (job.getId() == null) job.setId(1L);
            return job;
        });
    }

    @Test
    void enqueueRejectsUnknownPrinter() {
        when(printerRepo.findByIdAndIsActiveTrue(9L)).thenReturn(Optional.empty());
        PosPrintJobService.CreateRequest req = new PosPrintJobService.CreateRequest(
                9L, PrintJobType.RECEIPT, null, "SALES_INVOICE", 100L, "receipt text", null, null);

        assertThrows(ResponseStatusException.class, () -> service.enqueue(req));
    }

    @Test
    void enqueueCreatesQueuedJobInheritingPrinterScope() {
        PosPrinter printer = printer(5L, 10L, "T001", "Counter 1");
        when(printerRepo.findByIdAndIsActiveTrue(5L)).thenReturn(Optional.of(printer));

        PosPrintJobService.CreateRequest req = new PosPrintJobService.CreateRequest(
                5L, PrintJobType.RECEIPT, null, "SALES_INVOICE", 100L, "receipt text", null, null);
        PosPrintJob job = service.enqueue(req);

        assertEquals(PrintJobStatus.QUEUED, job.getStatus());
        assertEquals(PrintJobPriority.NORMAL, job.getPriority());
        assertEquals(10L, job.getBranchId());
        assertEquals("T001", job.getTerminalId());
        assertEquals("Counter 1", job.getCounterName());
    }

    @Test
    void dispatchFailsWhenAtomicClaimMatchesNoRow() {
        // Simulates the job not being QUEUED anymore — whether because it was already
        // dispatched by a concurrent caller, or simply completed — the guarded UPDATE
        // (jobRepo.claimForDispatch) matches zero rows either way.
        when(jobRepo.claimForDispatch(eq(2L), any())).thenReturn(0);
        PosPrintJob current = job(2L, PrintJobStatus.DISPATCHED);
        when(jobRepo.findById(2L)).thenReturn(Optional.of(current));

        assertThrows(ResponseStatusException.class, () -> service.dispatch(2L));
    }

    @Test
    void dispatchLosesRaceWhenAnotherCallerAlreadyClaimedTheJob() {
        // Two callers racing dispatch(3L): the DB-level guarded UPDATE can only ever match the
        // row for one of them. The loser's claimForDispatch call returns 0, proving the atomic
        // claim — not a read-then-write — is what prevents a double-claim.
        when(jobRepo.claimForDispatch(eq(3L), any())).thenReturn(0);
        when(jobRepo.findById(3L)).thenReturn(Optional.of(job(3L, PrintJobStatus.DISPATCHED)));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.dispatch(3L));
        assertEquals(409, ex.getStatusCode().value());
    }

    @Test
    void dispatchClaimsQueuedJob() {
        when(jobRepo.claimForDispatch(eq(3L), any())).thenReturn(1);
        PosPrintJob afterClaim = job(3L, PrintJobStatus.DISPATCHED);
        afterClaim.setPrinterId(5L);
        afterClaim.setDispatchedAt(java.time.LocalDateTime.now());
        when(jobRepo.findById(3L)).thenReturn(Optional.of(afterClaim));
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer(5L, 10L, "T001", "Counter 1")));

        PosPrintJob dispatched = service.dispatch(3L);

        assertEquals(PrintJobStatus.DISPATCHED, dispatched.getStatus());
        assertNotNull(dispatched.getDispatchedAt());
    }

    @Test
    void reportResultSuccessMarksSucceeded() {
        PosPrintJob job = job(4L, PrintJobStatus.DISPATCHED);
        job.setPrinterId(5L);
        when(jobRepo.findById(4L)).thenReturn(Optional.of(job));
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer(5L, 10L, "T001", "Counter 1")));

        PosPrintJob result = service.reportResult(4L, new PosPrintJobService.ResultRequest(true, null));

        assertEquals(PrintJobStatus.SUCCEEDED, result.getStatus());
    }

    @Test
    void reportResultFailureRequeuesUntilMaxAttempts() {
        PosPrintJob job = job(6L, PrintJobStatus.DISPATCHED);
        job.setPrinterId(5L);
        job.setMaxAttempts(2);
        when(jobRepo.findById(6L)).thenReturn(Optional.of(job));
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer(5L, 10L, "T001", "Counter 1")));

        PosPrintJob afterFirstFailure = service.reportResult(6L, new PosPrintJobService.ResultRequest(false, "jam"));
        assertEquals(PrintJobStatus.QUEUED, afterFirstFailure.getStatus());
        assertEquals(1, afterFirstFailure.getAttemptCount());

        // The auto-requeued job must go through a real dispatch() again before a second result
        // can apply — reportResult's idempotency guard (only acts from DISPATCHED) enforces this.
        // The mocked claim simulates the atomic UPDATE's effect on the row directly, since a
        // mocked int-returning method can't mutate `job` on its own the way a real UPDATE would.
        when(jobRepo.claimForDispatch(eq(6L), any())).thenAnswer(invocation -> {
            job.setStatus(PrintJobStatus.DISPATCHED);
            return 1;
        });
        service.dispatch(6L);

        PosPrintJob afterSecondFailure = service.reportResult(6L, new PosPrintJobService.ResultRequest(false, "jam again"));
        assertEquals(PrintJobStatus.FAILED, afterSecondFailure.getStatus());
        assertEquals(2, afterSecondFailure.getAttemptCount());
    }

    @Test
    void reportResultIsIdempotentOnAlreadySucceededJob() {
        // A duplicate/late network retry of the result call must not re-process a job that's
        // already terminal — proves the duplicate-prevention guard in reportResult().
        PosPrintJob job = job(10L, PrintJobStatus.SUCCEEDED);
        job.setPrinterId(5L);
        when(jobRepo.findById(10L)).thenReturn(Optional.of(job));

        PosPrintJob result = service.reportResult(10L, new PosPrintJobService.ResultRequest(false, "duplicate-late-failure"));

        assertEquals(PrintJobStatus.SUCCEEDED, result.getStatus());
        assertEquals(0, result.getAttemptCount());
        verify(printerRepo, never()).findById(any());
    }

    @Test
    void reportResultIsIdempotentOnAlreadyFailedJob() {
        PosPrintJob job = job(11L, PrintJobStatus.FAILED);
        job.setAttemptCount(3);
        when(jobRepo.findById(11L)).thenReturn(Optional.of(job));

        PosPrintJob result = service.reportResult(11L, new PosPrintJobService.ResultRequest(true, null));

        assertEquals(PrintJobStatus.FAILED, result.getStatus());
        assertEquals(3, result.getAttemptCount());
    }

    @Test
    void manualRetryOnlyAllowedFromFailed() {
        PosPrintJob job = job(7L, PrintJobStatus.QUEUED);
        when(jobRepo.findById(7L)).thenReturn(Optional.of(job));

        assertThrows(ResponseStatusException.class, () -> service.retry(7L));
    }

    @Test
    void manualRetryResetsAttemptCountAndRequeues() {
        PosPrintJob job = job(8L, PrintJobStatus.FAILED);
        job.setPrinterId(5L);
        job.setAttemptCount(3);
        when(jobRepo.findById(8L)).thenReturn(Optional.of(job));
        when(printerRepo.findById(5L)).thenReturn(Optional.of(printer(5L, 10L, "T001", "Counter 1")));

        PosPrintJob retried = service.retry(8L);

        assertEquals(PrintJobStatus.QUEUED, retried.getStatus());
        assertEquals(0, retried.getAttemptCount());
    }

    private PosPrintJob job(Long id, PrintJobStatus status) {
        PosPrintJob job = new PosPrintJob();
        job.setId(id);
        job.setJobType(PrintJobType.RECEIPT);
        job.setPayload("text");
        job.setStatus(status);
        return job;
    }

    private PosPrinter printer(Long id, Long branchId, String terminalId, String counterName) {
        PosPrinter printer = new PosPrinter();
        printer.setId(id);
        printer.setDeviceId(id + 1000);
        printer.setBranchId(branchId);
        printer.setTerminalId(terminalId);
        printer.setCounterName(counterName);
        printer.setStatus(PosPrinterStatus.ACTIVE);
        return printer;
    }
}
