package com.billbull.backend.pos.printjob;

import com.billbull.backend.pos.devicemanager.PosDeviceEventLogService;
import com.billbull.backend.pos.devicemanager.PosDeviceEventResult;
import com.billbull.backend.pos.devicemanager.PosDeviceEventType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Owns the lifecycle of a {@link PosPrintJob}: enqueue, claim (dispatch), report a result
 * (with automatic retry up to {@code maxAttempts}), and manual retry once exhausted. This is
 * the backend's system of record for every print attempt — closing the gap where, previously,
 * a print was a single synchronous browser-to-agent call with no server-side trace.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §7 (Phase B).
 */
@Service
public class PosPrintJobService {

    private final PosPrintJobRepository jobRepo;
    private final PosPrinterRepository printerRepo;
    private final PosDeviceEventLogService eventLogService;

    public PosPrintJobService(PosPrintJobRepository jobRepo, PosPrinterRepository printerRepo,
                               PosDeviceEventLogService eventLogService) {
        this.jobRepo = jobRepo;
        this.printerRepo = printerRepo;
        this.eventLogService = eventLogService;
    }

    public PosPrintJob enqueue(CreateRequest req) {
        if (req == null || req.printerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Printer is required.");
        }
        if (req.jobType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Job type is required.");
        }
        if (req.payload() == null || req.payload().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Print payload is required.");
        }
        PosPrinter printer = printerRepo.findByIdAndIsActiveTrue(req.printerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Printer not found or inactive: " + req.printerId()));

        PosPrintJob job = new PosPrintJob();
        job.setJobType(req.jobType());
        job.setPriority(req.priority() == null ? PrintJobPriority.NORMAL : req.priority());
        job.setPrinterId(printer.getId());
        job.setBranchId(printer.getBranchId());
        job.setTerminalId(printer.getTerminalId());
        job.setCounterName(printer.getCounterName());
        job.setSourceType(req.sourceType());
        job.setSourceRefId(req.sourceRefId());
        job.setPayload(req.payload());
        job.setPayloadFormat(req.payloadFormat() == null ? PrintPayloadFormat.ESC_POS_TEXT : req.payloadFormat());
        job.setScheduledFor(req.scheduledFor());
        job.setStatus(PrintJobStatus.QUEUED);
        job.setRequestedBy(currentUser());
        job = jobRepo.save(job);

        logEvent(printer, job, PosDeviceEventType.PRINT_QUEUED, PosDeviceEventResult.INFO, null);
        return job;
    }

    public PosPrintJob get(Long id) {
        return jobRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Print job not found: " + id));
    }

    /** Jobs an agent (or, in the interim, the browser itself) can claim, ordered HIGH first. */
    public List<PosPrintJob> listQueued(Long branchId, String terminalId) {
        if (branchId != null && terminalId != null && !terminalId.isBlank()) {
            return jobRepo.findByStatusAndBranchIdAndTerminalIdOrderByPriorityAscCreatedAtAsc(
                    PrintJobStatus.QUEUED, branchId, terminalId);
        }
        if (branchId != null) {
            return jobRepo.findByStatusAndBranchIdOrderByPriorityAscCreatedAtAsc(PrintJobStatus.QUEUED, branchId);
        }
        return jobRepo.findByStatusOrderByPriorityAscCreatedAtAsc(PrintJobStatus.QUEUED);
    }

    /**
     * Atomic claim (Phase B.5 hardening): a single guarded {@code UPDATE ... WHERE status =
     * 'QUEUED'} via {@link PosPrintJobRepository#claimForDispatch}, not a read-then-write — so
     * two concurrent callers (e.g. a future real polling agent racing the interim browser path)
     * can never both succeed in claiming the same job. Whichever call's UPDATE actually matches
     * a row wins; the loser sees {@code updated == 0} and gets a 409, exactly as before, just
     * without the race window that a read-then-write would have left open.
     */
    @Transactional
    public PosPrintJob dispatch(Long id) {
        int updated = jobRepo.claimForDispatch(id, LocalDateTime.now());
        if (updated == 0) {
            PosPrintJob existing = get(id);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Job " + id + " is not queued (current status: " + existing.getStatus() + ").");
        }
        PosPrintJob job = get(id);

        PosPrinter printer = printerRepo.findById(job.getPrinterId()).orElse(null);
        if (printer != null) {
            logEvent(printer, job, PosDeviceEventType.PRINT_STARTED, PosDeviceEventResult.INFO, null);
        }
        return job;
    }

    /**
     * Idempotency / duplicate-prevention note (Phase B.5): if a result has already been
     * processed (job is no longer DISPATCHED — e.g. it already reached SUCCEEDED/FAILED, or the
     * timeout sweep already recovered it), a second {@code reportResult} call for the same job
     * is treated as a no-op rather than re-applying a transition. This protects against a
     * duplicate/late network retry of the result call re-running the retry-count or status logic
     * twice for one physical print attempt.
     */
    public PosPrintJob reportResult(Long id, ResultRequest req) {
        PosPrintJob job = get(id);
        if (job.getStatus() != PrintJobStatus.DISPATCHED) {
            return job;
        }
        PosPrinter printer = printerRepo.findById(job.getPrinterId()).orElse(null);

        if (req != null && req.success()) {
            job.setStatus(PrintJobStatus.SUCCEEDED);
            job.setCompletedAt(LocalDateTime.now());
            job.setLastError(null);
            jobRepo.save(job);
            if (printer != null) {
                logEvent(printer, job, PosDeviceEventType.PRINT_COMPLETED, PosDeviceEventResult.SUCCESS, null);
            }
            return job;
        }

        String errorMessage = req != null ? req.errorMessage() : null;
        job.setAttemptCount(job.getAttemptCount() + 1);
        job.setLastError(errorMessage);

        if (job.getAttemptCount() < job.getMaxAttempts()) {
            job.setStatus(PrintJobStatus.QUEUED);
            job.setDispatchedAt(null);
            jobRepo.save(job);
            if (printer != null) {
                logEvent(printer, job, PosDeviceEventType.RETRY, PosDeviceEventResult.FAILED, errorMessage);
            }
        } else {
            job.setStatus(PrintJobStatus.FAILED);
            job.setCompletedAt(LocalDateTime.now());
            jobRepo.save(job);
            if (printer != null) {
                logEvent(printer, job, PosDeviceEventType.PRINT_FAILED, PosDeviceEventResult.FAILED, errorMessage);
            }
        }
        return job;
    }

    /** Manual operator retry once a job has exhausted its automatic attempt budget. */
    public PosPrintJob retry(Long id) {
        PosPrintJob job = get(id);
        if (job.getStatus() != PrintJobStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only a FAILED job can be retried manually (current status: " + job.getStatus() + ").");
        }
        job.setStatus(PrintJobStatus.QUEUED);
        job.setAttemptCount(0);
        job.setLastError(null);
        job.setDispatchedAt(null);
        job.setCompletedAt(null);
        PosPrintJob saved = jobRepo.save(job);

        PosPrinter printer = printerRepo.findById(saved.getPrinterId()).orElse(null);
        if (printer != null) {
            logEvent(printer, saved, PosDeviceEventType.RETRY, PosDeviceEventResult.INFO, "Manual retry");
        }
        return saved;
    }

    private void logEvent(PosPrinter printer, PosPrintJob job, PosDeviceEventType type,
                           PosDeviceEventResult result, String errorMessage) {
        if (printer.getDeviceId() == null) {
            return;
        }
        eventLogService.record(printer.getDeviceId(), type, result, "printJob:" + job.getId(), errorMessage,
                job.getBranchId(), job.getTerminalId());
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    public record CreateRequest(
            Long printerId,
            PrintJobType jobType,
            PrintJobPriority priority,
            String sourceType,
            Long sourceRefId,
            String payload,
            PrintPayloadFormat payloadFormat,
            LocalDateTime scheduledFor
    ) {}

    public record ResultRequest(
            boolean success,
            String errorMessage
    ) {}
}
