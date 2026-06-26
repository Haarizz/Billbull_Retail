package com.billbull.backend.pos.printer;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pos/printers")
@CrossOrigin
public class PosPrinterController {

    private final PosPrinterService service;

    public PosPrinterController(PosPrinterService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosPrinter> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String terminalId,
            @RequestParam(required = false) PosPrinterType deviceType
    ) {
        return service.list(branchId, terminalId, deviceType);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosPrinter> create(@RequestBody PosPrinterService.UpsertRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter update(@PathVariable Long id, @RequestBody PosPrinterService.UpsertRequest req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/runtime")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter updateRuntime(@PathVariable Long id, @RequestBody PosPrinterService.RuntimeRequest req) {
        return service.updateRuntime(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        service.decommission(id);
        return ResponseEntity.noContent().build();
    }
}
