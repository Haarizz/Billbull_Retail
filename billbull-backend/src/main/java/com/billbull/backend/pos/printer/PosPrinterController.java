package com.billbull.backend.pos.printer;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
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

/**
 * Printer configuration, runtime status and server-relayed ESC/POS printing.
 *
 * <p>Adding, changing and decommissioning a printer is device administration:
 * {@code pos.printers} create, edit or delete. A printer's stored IP and port are where
 * {@link PosPrinterService#printEscPos} opens a raw socket, so letting any signed-in user write
 * them would let them point the server at any host and port.
 *
 * <p>Reading printers, reporting runtime status and printing stay open to any signed-in user,
 * because receipts, invoices, returns and Retail label and employee-card printing all use them.
 * They are limited to printers of a branch the caller may act on.
 */
@RestController
@RequestMapping("/api/pos/printers")
@CrossOrigin
public class PosPrinterController {

    static final String PRINTER_ADMIN = "pos.printers";
    private static final String LABEL = "Printer";

    private final PosPrinterService service;
    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;

    public PosPrinterController(PosPrinterService service, ModulePermissionService modulePermissionService,
                                BranchAccessService branchAccessService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
    }

    private void requirePrinterInScope(Long id) {
        branchAccessService.assertTransactionBranchAccessible(service.get(id).getBranchId(), LABEL);
    }

    private void requireRequestBranchInScope(PosPrinterService.UpsertRequest req) {
        branchAccessService.assertTransactionBranchAccessible(req != null ? req.branchId() : null, LABEL);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosPrinter> list(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String terminalId,
            @RequestParam(required = false) PosPrinterType deviceType
    ) {
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        return service.list(branchId, terminalId, deviceType);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter get(@PathVariable Long id) {
        requirePrinterInScope(id);
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosPrinter> create(@RequestBody PosPrinterService.UpsertRequest req) {
        modulePermissionService.requireCanCreate(PRINTER_ADMIN);
        requireRequestBranchInScope(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter update(@PathVariable Long id, @RequestBody PosPrinterService.UpsertRequest req) {
        modulePermissionService.requireCanEdit(PRINTER_ADMIN);
        requirePrinterInScope(id);
        requireRequestBranchInScope(req);
        return service.update(id, req);
    }

    @PutMapping("/{id}/runtime")
    @PreAuthorize("isAuthenticated()")
    public PosPrinter updateRuntime(@PathVariable Long id, @RequestBody PosPrinterService.RuntimeRequest req) {
        requirePrinterInScope(id);
        return service.updateRuntime(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        modulePermissionService.requireCanDelete(PRINTER_ADMIN);
        requirePrinterInScope(id);
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
        // Checked before any byte is sent: a refused call must not reach the printer or its drawer.
        // The bytes must also pass the printer's own command policy (ESC/POS, or ZPL for a label
        // printer); a refused job is a 422 PRINT_COMMAND_REJECTED and nothing is sent.
        requirePrinterInScope(id);
        service.printRaw(id, req.dataBase64(), req.format());
        return ResponseEntity.ok(java.util.Map.of("ok", true, "message", "Print job sent successfully."));
    }

    /** {@code format} is optional ({@code ESCPOS} or {@code ZPL}); older clients send only the data. */
    public record PrintEscPosRequest(String dataBase64, String format) {
        public PrintEscPosRequest(String dataBase64) {
            this(dataBase64, null);
        }
    }
}
