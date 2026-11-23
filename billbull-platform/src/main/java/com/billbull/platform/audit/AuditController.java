package com.billbull.platform.audit;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('VIEWER')")
public class AuditController {

    private final AuditEventRepository repository;
    private final AuditService auditService;

    public AuditController(AuditEventRepository repository, AuditService auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) Long tenantId,
                                    @RequestParam(required = false) String action,
                                    @RequestParam(required = false) String actor,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        Page<AuditEvent> p = repository.findAll(AuditEventRepository.filter(tenantId, action, actor),
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(200, size)), Sort.by(Sort.Direction.DESC, "id")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", p.getContent().stream().map(AuditController::view).toList());
        out.put("page", p.getNumber());
        out.put("totalPages", p.getTotalPages());
        out.put("totalItems", p.getTotalElements());
        return out;
    }

    @GetMapping("/verify")
    public Map<String, Object> verify() {
        return auditService.verify();
    }

    static Map<String, Object> view(AuditEvent e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id);
        m.put("occurredAt", e.occurredAt);
        m.put("actorEmail", e.actorEmail);
        m.put("action", e.action);
        m.put("targetType", e.targetType);
        m.put("targetId", e.targetId);
        m.put("tenantId", e.tenantId);
        m.put("detail", e.detail);
        m.put("ip", e.ip);
        return m;
    }

    public static List<Map<String, Object>> views(List<AuditEvent> events) {
        return events.stream().map(AuditController::view).toList();
    }
}
