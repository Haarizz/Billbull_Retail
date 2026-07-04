package com.billbull.backend.pos.printjob;

import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.devicemanager.PosDeviceEventResult;
import com.billbull.backend.pos.devicemanager.PosDeviceEventType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Stale-job recovery (Phase B.5 hardening): a job claimed via {@code dispatch()} but never
 * resolved by a {@code reportResult()} call (e.g. a crashed agent, a closed browser tab mid-print)
 * would otherwise sit in DISPATCHED forever. This sweep finds those and resolves them.
 *
 * <p><b>Retry policy — deliberately FAILED, never auto-requeued:</b> a timed-out job's actual
 * outcome is unknown — the print may have silently succeeded and only the result report was
 * lost. Automatically requeuing it for another dispatch could print the same receipt twice.
 * Instead this sweep always lands a timed-out job in the terminal {@code FAILED} state, which
 * requires an explicit operator-invoked {@link PosPrintJobService#retry(Long)} — a deliberate
 * human decision, made after checking whether the physical print actually happened — rather than
 * a blind automatic resubmission. This is the "no duplicate execution" guarantee for this path.
 *
 * <p><b>No duplicate handling against a late-arriving result:</b> the recovery UPDATE
 * ({@link PosPrintJobRepository#failStaleDispatch}) is guarded exactly like the dispatch claim —
 * it only takes effect if the job is still DISPATCHED and still past the cutoff at the instant of
 * the UPDATE. If a legitimate {@code reportResult} call lands concurrently with the sweep, the
 * sweep's UPDATE simply matches zero rows and is skipped for that job.
 */
@Component
public class PosPrintJobTimeoutSweepJob {

    private static final Logger log = LoggerFactory.getLogger(PosPrintJobTimeoutSweepJob.class);

    private final PosPrintJobRepository jobRepo;
    private final PosPrinterRepository printerRepo;
    private final PosDeviceEventLogService eventLogService;

    /** How long a job may sit DISPATCHED with no reported result before it's considered stale. */
    @Value("${pos.printjob.dispatch-timeout-minutes:5}")
    private int timeoutMinutes;

    /**
     * How long a job may sit QUEUED with nothing claiming it before it's expired. In the interim
     * browser-executed model a job is dispatched within seconds of being created, so a QUEUED row
     * this old means the dispatch call itself failed — and a receipt from an hour ago must never
     * suddenly print the day a real polling agent starts consuming the queue.
     */
    @Value("${pos.printjob.queued-expiry-minutes:60}")
    private int queuedExpiryMinutes;

    public PosPrintJobTimeoutSweepJob(PosPrintJobRepository jobRepo, PosPrinterRepository printerRepo,
                                       PosDeviceEventLogService eventLogService) {
        this.jobRepo = jobRepo;
        this.printerRepo = printerRepo;
        this.eventLogService = eventLogService;
    }

    /** Runs every minute; cheap no-op when there's nothing stale. */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void sweepStaleDispatches() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(timeoutMinutes);
        List<PosPrintJob> candidates = jobRepo.findStaleDispatched(cutoff);
        if (candidates.isEmpty()) {
            return;
        }

        String error = "Dispatch timed out after " + timeoutMinutes + " minute(s) with no result reported.";
        int recovered = 0;
        for (PosPrintJob job : candidates) {
            int updated = jobRepo.failStaleDispatch(job.getId(), LocalDateTime.now(), error, cutoff);
            if (updated == 0) {
                continue; // a result arrived concurrently — not our job to touch anymore
            }
            recovered++;

            PosPrinter printer = printerRepo.findById(job.getPrinterId()).orElse(null);
            if (printer != null && printer.getDeviceId() != null) {
                eventLogService.record(printer.getDeviceId(), PosDeviceEventType.QUEUE_TIMEOUT,
                        PosDeviceEventResult.FAILED, "printJob:" + job.getId(), error,
                        job.getBranchId(), job.getTerminalId());
            }
        }

        if (recovered > 0) {
            log.warn("[PosPrintJobTimeoutSweep] Recovered {} stale DISPATCHED job(s) older than {} minute(s).",
                    recovered, timeoutMinutes);
        }
    }

    /**
     * Expires jobs that never left QUEUED (their dispatch call failed) once they are older than
     * {@code queuedExpiryMinutes}. Lands them in FAILED — same terminal state as the dispatch
     * sweep, requiring an explicit operator {@link PosPrintJobService#retry(Long)} — never
     * auto-executes them, so a stale receipt can't print out of nowhere later.
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void expireStaleQueuedJobs() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(queuedExpiryMinutes);
        List<PosPrintJob> candidates = jobRepo.findStaleQueued(cutoff);
        if (candidates.isEmpty()) {
            return;
        }

        String error = "Expired after sitting QUEUED for over " + queuedExpiryMinutes
                + " minute(s) without being dispatched.";
        int expired = 0;
        for (PosPrintJob job : candidates) {
            int updated = jobRepo.expireStaleQueued(job.getId(), LocalDateTime.now(), error, cutoff);
            if (updated == 0) {
                continue; // claimed by a dispatch concurrently — the claim wins
            }
            expired++;

            PosPrinter printer = printerRepo.findById(job.getPrinterId()).orElse(null);
            if (printer != null && printer.getDeviceId() != null) {
                eventLogService.record(printer.getDeviceId(), PosDeviceEventType.QUEUE_TIMEOUT,
                        PosDeviceEventResult.FAILED, "printJob:" + job.getId(), error,
                        job.getBranchId(), job.getTerminalId());
            }
        }

        if (expired > 0) {
            log.warn("[PosPrintJobTimeoutSweep] Expired {} stale QUEUED job(s) older than {} minute(s).",
                    expired, queuedExpiryMinutes);
        }
    }
}
