package com.billbull.backend.sales.proforma;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/proforma")
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class ProformaController {

    private final ProformaService service;
    private final AuditLogService auditLogService;

    public ProformaController(ProformaService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<ProformaResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public ProformaResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ProformaResponse create(@RequestBody ProformaRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ProformaResponse update(
            @PathVariable Long id,
            @RequestBody ProformaRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/issue")
    public ProformaResponse issue(@PathVariable Long id) {
        return service.issue(id);
    }
}
