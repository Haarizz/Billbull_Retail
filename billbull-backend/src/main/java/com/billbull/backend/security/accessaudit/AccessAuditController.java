package com.billbull.backend.security.accessaudit;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Read-only API over the access-control audit ledger. There is intentionally no PUT/PATCH/DELETE:
 * history cannot be changed through the application by anyone, administrators included.
 *
 * <p>Access: view needs {@code userManagement.audit} VIEW (ADMIN inherits it from its
 * {@code userManagement} row); export additionally needs EXPORT, and every export is itself
 * recorded in the ledger.
 */
@RestController
@RequestMapping("/api/access-audit")
public class AccessAuditController {

    public static final String MODULE = "userManagement.audit";
    private static final int EXPORT_LIMIT = 20_000;
    private static final DateTimeFormatter CSV_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AccessAuditRepository repository;
    private final AccessAuditService auditService;
    private final ModulePermissionService modulePermissionService;

    public AccessAuditController(AccessAuditRepository repository,
                                 AccessAuditService auditService,
                                 ModulePermissionService modulePermissionService) {
        this.repository = repository;
        this.auditService = auditService;
        this.modulePermissionService = modulePermissionService;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Map<String, Object> search(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String roleName,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String affectedUser,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String changeSetId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        modulePermissionService.requireCanView(MODULE);
        Specification<AccessAuditEvent> spec = filters(from, to, actor, action, targetType, roleName,
                module, affectedUser, branchId, changeSetId, q);
        Page<AccessAuditEvent> result = repository.findAll(spec, PageRequest.of(
                Math.max(page, 0), Math.min(Math.max(size, 1), 200), newestFirst()));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", result.getContent());
        body.put("page", result.getNumber());
        body.put("size", result.getSize());
        body.put("totalElements", result.getTotalElements());
        body.put("totalPages", result.getTotalPages());
        return body;
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ResponseEntity<AccessAuditEvent> get(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return repository.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    /** Filter options for the audit screen. */
    @GetMapping("/facets")
    @Transactional(readOnly = true)
    public Map<String, Object> facets() {
        modulePermissionService.requireCanView(MODULE);
        List<Map<String, String>> actions = new ArrayList<>();
        for (AccessAuditAction a : AccessAuditAction.values()) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("name", a.name());
            m.put("label", a.getLabel());
            m.put("targetType", a.getTargetType().name());
            actions.add(m);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("actions", actions);
        body.put("actors", repository.findDistinctActors());
        body.put("roles", repository.findDistinctRoleNames());
        body.put("total", repository.count());
        return body;
    }

    /** Recomputes the hash chain and reports whether any row was altered, removed or re-ordered. */
    @GetMapping("/verify")
    public AccessAuditService.ChainVerification verify() {
        modulePermissionService.requireCanView(MODULE);
        return auditService.verifyChain();
    }

    @GetMapping(value = "/export", produces = "text/csv")
    @Transactional
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String roleName,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String affectedUser,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) String changeSetId,
            @RequestParam(required = false) String q) {
        modulePermissionService.requireCanView(MODULE);
        modulePermissionService.requireCanExport(MODULE);

        Specification<AccessAuditEvent> spec = filters(from, to, actor, action, targetType, roleName,
                module, affectedUser, branchId, changeSetId, q);
        List<AccessAuditEvent> rows = repository.findAll(spec,
                PageRequest.of(0, EXPORT_LIMIT, newestFirst())).getContent();

        Map<String, Object> filterEcho = new LinkedHashMap<>();
        putIf(filterEcho, "from", from);
        putIf(filterEcho, "to", to);
        putIf(filterEcho, "actor", actor);
        putIf(filterEcho, "action", action);
        putIf(filterEcho, "targetType", targetType);
        putIf(filterEcho, "roleName", roleName);
        putIf(filterEcho, "module", module);
        putIf(filterEcho, "affectedUser", affectedUser);
        putIf(filterEcho, "branchId", branchId);
        putIf(filterEcho, "changeSetId", changeSetId);
        putIf(filterEcho, "q", q);
        filterEcho.put("rows", rows.size());
        auditService.record(AccessAuditService.Entry.of(AccessAuditAction.AUDIT_EXPORTED)
                .target(null, "Access audit log")
                .next(filterEcho)
                .summary("Exported " + rows.size() + " audit entries"));

        byte[] csv = toCsv(rows);
        String filename = "access-audit-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")) + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(csv);
    }

    // ─────────────────────────────────────────────────────────────────────────

    static Specification<AccessAuditEvent> filters(LocalDateTime from, LocalDateTime to, String actor,
                                                   String action, String targetType, String roleName,
                                                   String module, String affectedUser, Long branchId,
                                                   String changeSetId, String q) {
        Specification<AccessAuditEvent> spec = (root, query, cb) -> cb.conjunction();
        if (from != null) spec = spec.and((r, qy, cb) -> cb.greaterThanOrEqualTo(r.get("occurredAt"), from));
        if (to != null) spec = spec.and((r, qy, cb) -> cb.lessThanOrEqualTo(r.get("occurredAt"), to));
        spec = eq(spec, "actorUsername", actor);
        spec = eq(spec, "action", action);
        spec = eq(spec, "targetType", targetType);
        spec = eq(spec, "roleName", roleName);
        spec = eq(spec, "changeSetId", changeSetId);
        if (branchId != null) spec = spec.and((r, qy, cb) -> cb.equal(r.get("branchId"), branchId));
        if (notBlank(module)) {
            String m = module.trim().toLowerCase(Locale.ROOT);
            spec = spec.and((r, qy, cb) -> cb.like(cb.lower(r.get("module")), m + "%"));
        }
        if (notBlank(affectedUser)) {
            String u = "%" + affectedUser.trim().toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((r, qy, cb) -> cb.like(cb.lower(r.get("affectedUsernames")), u));
        }
        if (notBlank(q)) {
            String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((r, qy, cb) -> cb.or(
                    cb.like(cb.lower(r.get("actorUsername")), like),
                    cb.like(cb.lower(r.get("targetLabel")), like),
                    cb.like(cb.lower(r.get("roleName")), like),
                    cb.like(cb.lower(r.get("module")), like),
                    cb.like(cb.lower(r.get("changeSummary")), like),
                    cb.like(cb.lower(r.get("reason")), like),
                    cb.like(cb.lower(r.get("affectedUsernames")), like),
                    cb.like(cb.lower(r.get("ipAddress")), like)));
        }
        return spec;
    }

    private static Sort newestFirst() {
        return Sort.by(Sort.Direction.DESC, "occurredAt").and(Sort.by(Sort.Direction.DESC, "id"));
    }

    private static Specification<AccessAuditEvent> eq(Specification<AccessAuditEvent> spec, String field, String value) {
        if (!notBlank(value)) return spec;
        String v = value.trim();
        return spec.and((r, qy, cb) -> cb.equal(r.get(field), v));
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static void putIf(Map<String, Object> m, String k, Object v) {
        if (v != null && !(v instanceof String s && s.isBlank())) m.put(k, String.valueOf(v));
    }

    static byte[] toCsv(List<AccessAuditEvent> rows) {
        StringBuilder sb = new StringBuilder("﻿"); // BOM so Excel reads UTF-8 (Arabic reasons/names)
        sb.append(String.join(",", "Id", "Time", "Actor", "Actor Roles", "Action", "Target Type", "Target",
                "Role", "Module", "Summary", "Previous Value", "New Value", "Reason", "Affected Users",
                "Affected Usernames", "Branch Id", "Tenant", "IP Address", "User Agent", "Change Set",
                "Request Id", "Row Hash")).append("\r\n");
        for (AccessAuditEvent e : rows) {
            sb.append(String.join(",",
                    cell(e.getId()), cell(e.getOccurredAt() == null ? null : CSV_TIME.format(e.getOccurredAt())),
                    cell(e.getActorUsername()), cell(e.getActorRoles()), cell(e.getAction()), cell(e.getTargetType()),
                    cell(e.getTargetLabel()), cell(e.getRoleName()), cell(e.getModule()), cell(e.getChangeSummary()),
                    cell(e.getPreviousValue()), cell(e.getNewValue()), cell(e.getReason()),
                    cell(e.getAffectedUserCount()), cell(e.getAffectedUsernames()), cell(e.getBranchId()),
                    cell(e.getTenant()), cell(e.getIpAddress()), cell(e.getUserAgent()), cell(e.getChangeSetId()),
                    cell(e.getRequestId()), cell(e.getRowHash()))).append("\r\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** RFC-4180 quoting plus a leading apostrophe on formula-looking text (CSV injection guard). */
    static String cell(Object value) {
        if (value == null) return "";
        String s = String.valueOf(value);
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }
}
