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

    // Server-relayed ESC/POS print for Network/IP printers — lets any device (phone,
    // tablet, another PC) print without a local workstation agent installed. USB/
    // Windows-queue printers still require the local agent since only the machine
    // they're physically plugged into can reach them.
    @PostMapping("/{id}/print/escpos")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<java.util.Map<String, Object>> printEscPos(@PathVariable Long id, @RequestBody PrintEscPosRequest req) {
        service.printEscPos(id, req.dataBase64());
        return ResponseEntity.ok(java.util.Map.of("ok", true, "message", "ESC/POS print job sent successfully."));
    }

    public record PrintEscPosRequest(String dataBase64) {}
}
