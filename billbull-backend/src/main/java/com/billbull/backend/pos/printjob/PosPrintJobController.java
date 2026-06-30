package com.billbull.backend.pos.printjob;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
 */
@RestController
@RequestMapping("/api/pos/print-jobs")
@CrossOrigin
public class PosPrintJobController {

    private final PosPrintJobService service;

    public PosPrintJobController(PosPrintJobService service) {
        this.service = service;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosPrintJob> create(@RequestBody PosPrintJobService.CreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.enqueue(req));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob get(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosPrintJob> listQueued(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String terminalId,
            @RequestParam(defaultValue = "QUEUED") String status) {
        // Phase B only supports listing QUEUED work (the agent-poll use case); other statuses
        // aren't needed yet and are intentionally not wired up to avoid speculative surface.
        if (!"QUEUED".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only status=QUEUED is supported in Phase B.");
        }
        return service.listQueued(branchId, terminalId);
    }

    @PutMapping("/{id}/dispatch")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob dispatch(@PathVariable Long id) {
        return service.dispatch(id);
    }

    @PutMapping("/{id}/result")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob result(@PathVariable Long id, @RequestBody PosPrintJobService.ResultRequest req) {
        return service.reportResult(id, req);
    }

    @PostMapping("/{id}/retry")
    @PreAuthorize("isAuthenticated()")
    public PosPrintJob retry(@PathVariable Long id) {
        return service.retry(id);
    }
}
