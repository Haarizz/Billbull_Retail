package com.billbull.backend.security;

import java.time.LocalDateTime;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit-logs")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public Page<AuditLog> search(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String requestId,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String clientHost,
            @RequestParam(required = false) Integer minStatus,
            @RequestParam(required = false) Integer maxStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {

        Specification<AuditLog> spec = (root, query, cb) -> cb.conjunction();
        spec = andEqual(spec, "eventType", eventType);
        spec = andEqual(spec, "entityType", entityType);
        spec = andEqual(spec, "entityId", entityId);
        spec = andEqual(spec, "username", username);
        spec = andEqual(spec, "requestId", requestId);
        spec = andEqual(spec, "branchId", branchId);
        spec = andLike(spec, "clientHost", clientHost);

        if (minStatus != null) {
            spec = spec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("httpStatus"), minStatus));
        }
        if (maxStatus != null) {
            spec = spec.and((root, query, cb) -> cb.lessThanOrEqualTo(root.get("httpStatus"), maxStatus));
        }
        if (from != null) {
            spec = spec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("accessTime"), from));
        }
        if (to != null) {
            spec = spec.and((root, query, cb) -> cb.lessThanOrEqualTo(root.get("accessTime"), to));
        }

        int pageNumber = Math.max(page, 0);
        int pageSize = Math.min(Math.max(size, 1), 500);

        return auditLogRepository.findAll(
                spec,
                PageRequest.of(pageNumber, pageSize, Sort.by(Sort.Direction.DESC, "accessTime")));
    }

    @GetMapping("/request/{requestId}")
    public java.util.List<AuditLog> byRequestId(@PathVariable String requestId) {
        return auditLogRepository.findByRequestIdOrderByAccessTimeDesc(
                requestId, PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "accessTime")));
    }

    @GetMapping("/entity/{entityType}/{entityId}")
    public java.util.List<AuditLog> byEntity(@PathVariable String entityType, @PathVariable String entityId) {
        return auditLogRepository.findByEntityTypeAndEntityIdOrderByAccessTimeDesc(
                entityType, entityId, PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "accessTime")));
    }

    private Specification<AuditLog> andEqual(Specification<AuditLog> spec, String field, Object value) {
        if (value == null || (value instanceof String text && text.isBlank())) {
            return spec;
        }
        return spec.and((root, query, cb) -> cb.equal(root.get(field), value));
    }

    private Specification<AuditLog> andLike(Specification<AuditLog> spec, String field, String value) {
        if (value == null || value.isBlank()) {
            return spec;
        }
        String pattern = "%" + value.trim().toLowerCase() + "%";
        return spec.and((root, query, cb) -> cb.like(cb.lower(root.get(field).as(String.class)), pattern));
    }
}
