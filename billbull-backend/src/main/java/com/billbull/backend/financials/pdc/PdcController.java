package com.billbull.backend.financials.pdc;

import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/pdcs")
public class PdcController {

    private final PdcService pdcService;

    public PdcController(PdcService pdcService) {
        this.pdcService = pdcService;
    }

    @GetMapping
    public ResponseEntity<List<PdcEntry>> getAllPdcs() {
        return ResponseEntity.ok(pdcService.getAllPdcs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PdcEntry> getPdc(@PathVariable Long id) {
        return ResponseEntity.ok(pdcService.getPdc(id));
    }

    @PostMapping("/receive")
    public ResponseEntity<PdcEntry> receivePdc(@RequestBody PdcEntry pdc) {
        return ResponseEntity.ok(pdcService.receivePdc(pdc));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<PdcEntry> updateStatus(@PathVariable Long id, @RequestParam PdcStatus status) {
        return ResponseEntity.ok(pdcService.updateStatus(id, status));
    }
}
