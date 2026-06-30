package com.billbull.backend.pos.cashdrawer;

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
import java.util.Map;

@RestController
@RequestMapping("/api/pos/cash-drawers")
@CrossOrigin
public class PosCashDrawerController {

    private final PosCashDrawerService service;

    public PosCashDrawerController(PosCashDrawerService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<PosCashDrawer> list(@RequestParam(required = false) Long branchId) {
        return service.list(branchId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PosCashDrawer> create(@RequestBody PosCashDrawerService.UpsertRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer update(@PathVariable Long id, @RequestBody PosCashDrawerService.UpsertRequest req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/kick-result")
    @PreAuthorize("isAuthenticated()")
    public PosCashDrawer kickResult(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        return service.recordKickResult(id, Boolean.TRUE.equals(body.get("success")));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> decommission(@PathVariable Long id) {
        service.decommission(id);
        return ResponseEntity.noContent().build();
    }
}
