package com.billbull.backend.pos.printjob;

import com.billbull.backend.pos.printer.PosPrinterService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * POST   /api/pos/print-jobs               create (browser, or any backend caller)
 * GET    /api/pos/print-jobs/{id}          poll a single job's status
 * GET    /api/pos/print-jobs?status=QUEUED&branchId=&terminalId=   agent poll for work
 * PUT    /api/pos/print-jobs/{id}/dispatch claim a queued job
 * PUT    /api/pos/print-jobs/{id}/result   report the outcome (auto-retries on failure)
 * POST   /api/pos/print-jobs/{id}/retry    manual retry once auto-retries are exhausted
 *
 * <p>Jobs are bookkeeping for prints the browser sends itself (see {@code localPrintAgent.js});
 * nothing executes a queued payload today. A job's payload is the receipt text, so every
 * endpoint is limited to jobs of a branch the caller may act on: the printer's branch on create,
 * the stored job's branch otherwise. Creating, claiming and reporting follow the printing rule
 * (any signed-in user of the branch, because Retail invoice, return and label prints record jobs
 * too); claiming and reporting are further limited to the job's own requester unless the caller
 * administers printers. Listing the queue and manual retry are printer administration
 * ({@code pos.printers} view / edit).
 */
@RestController
@RequestMapping("/api/pos/print-jobs")
@CrossOrigin
public class PosPrintJobController {

    static final String PRINTER_ADMIN = "pos.printers";
    private static final String LABEL = "Print job";

    private final PosPrintJobService service;
    private final PosPrinterService printerService;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosPrintJobController(PosPrintJobService service, PosPrinterService printerService,
                                 ModulePermissionService modulePermissionService,
                                 BranchAccessService branchAccessService) {
        this.service = service;
        this.printerService = printerService;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private PosPrintJob jobInScope(Long id) {
        PosPrintJob job = service.get(id);
        branchAccessService.assertTransactionBranchAccessible(job.getBranchId(), LABEL);
        return job;
    }

    /** The job's requester, or a printer administrator, may move it through its lifecycle. */
    private void requireOwnJobOrPrinterAdmin(PosPrintJob job) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String caller = auth != null ? auth.getName() : null;
        if (caller != null && caller.equals(job.getRequestedBy())) return;
        modulePermissionService.requireCanEdit(PRINTER_ADMIN);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosPrintJob> create(@RequestBody PosPrintJobService.CreateRequest req) {
        if (req != null && req.printerId() != null) {
            branchAccessService.assertTransactionBranchAccessible(
                    printerService.get(req.printerId()).getBranchId(), LABEL);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.enqueue(req));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob get(@PathVariable Long id) {
        return jobInScope(id);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosPrintJob> listQueued(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String terminalId,
            @RequestParam(defaultValue = "QUEUED") String status) {
        modulePermissionService.requireCanView(PRINTER_ADMIN);
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        // Phase B only supports listing QUEUED work (the agent-poll use case); other statuses
        // aren't needed yet and are intentionally not wired up to avoid speculative surface.
        if (!"QUEUED".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only status=QUEUED is supported in Phase B.");
        }
        // A null branchId lists every branch, so the rows are filtered too.
        return service.listQueued(branchId, terminalId).stream()
                .filter(job -> branchAccessService.canAccessTransactionBranch(job.getBranchId()))
                .toList();
    }

    @PutMapping("/{id}/dispatch")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob dispatch(@PathVariable Long id) {
        requireOwnJobOrPrinterAdmin(jobInScope(id));
        return service.dispatch(id);
    }

    @PutMapping("/{id}/result")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob result(@PathVariable Long id, @RequestBody PosPrintJobService.ResultRequest req) {
        requireOwnJobOrPrinterAdmin(jobInScope(id));
        return service.reportResult(id, req);
    }

    @PostMapping("/{id}/retry")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob retry(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(PRINTER_ADMIN);
        jobInScope(id);
        return service.retry(id);
    }
}
