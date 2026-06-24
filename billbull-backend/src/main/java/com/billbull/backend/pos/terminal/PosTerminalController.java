package com.billbull.backend.pos.terminal;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pos/terminals")
@CrossOrigin
public class PosTerminalController {

    private final PosTerminalService service;

    public PosTerminalController(PosTerminalService service) {
        this.service = service;
    }

    @PostMapping("/register")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> body) {
        String deviceFingerprint = body.getOrDefault("deviceFingerprint", "").toString();
        String deviceInfo = body.get("deviceInfo") != null ? body.get("deviceInfo").toString() : null;
        String terminalName = body.get("terminalName") != null ? body.get("terminalName").toString() : null;
        String counterName = body.get("counterName") != null ? body.get("counterName").toString() : null;
        return ResponseEntity.ok(service.registerOrRefresh(deviceFingerprint, deviceInfo, terminalName, counterName));
    }

    @GetMapping("/branch/{branchId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getForBranch(branchId));
    }

    @GetMapping("/branch/{branchId}/all")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PosTerminal>> getAllForBranch(@PathVariable Long branchId) {
        return ResponseEntity.ok(service.getAllForBranch(branchId));
    }

    @PutMapping("/{terminalId}/rename")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> rename(@PathVariable String terminalId, @RequestBody Map<String, Object> body) {
        String terminalName = body.get("terminalName") != null ? body.get("terminalName").toString() : null;
        String counterName  = body.get("counterName")  != null ? body.get("counterName").toString()  : null;
        return ResponseEntity.ok(service.rename(terminalId, terminalName, counterName));
    }

    @PutMapping("/{terminalId}/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setStatus(@PathVariable String terminalId, @RequestBody Map<String, Object> body) {
        String statusStr = body.getOrDefault("status", "ACTIVE").toString();
        PosTerminalStatus status = PosTerminalStatus.valueOf(statusStr.toUpperCase());
        return ResponseEntity.ok(service.setStatus(terminalId, status));
    }

    @PutMapping("/{terminalId}/set-main")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosTerminal> setMainPos(@PathVariable String terminalId) {
        return ResponseEntity.ok(service.setMainPos(terminalId));
    }
}
