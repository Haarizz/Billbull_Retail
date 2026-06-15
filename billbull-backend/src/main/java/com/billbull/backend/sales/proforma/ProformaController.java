package com.billbull.backend.sales.proforma;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/proforma")
@PreAuthorize("isAuthenticated()")
public class ProformaController {

    private static final String MODULE = "sales";

    private final ProformaService service;
    private final AuditLogService auditLogService;
    private final DocumentEmailSender emailSender;
    private final ModulePermissionService modulePermissionService;

    public ProformaController(ProformaService service, AuditLogService auditLogService,
                              DocumentEmailSender emailSender,
                              ModulePermissionService modulePermissionService) {
        this.service = service;
        this.auditLogService = auditLogService;
        this.emailSender = emailSender;
        this.modulePermissionService = modulePermissionService;
    }

    // QA-040: send the Proforma email using the frontend-rendered HTML body.
    @PostMapping("/{id}/send-email")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        modulePermissionService.requireCanExport(MODULE);
        try {
            String toEmail = body != null ? (String) body.get("toEmail") : null;
            String subject = body != null ? (String) body.get("subject") : null;
            String htmlBody = body != null ? (String) body.get("htmlBody") : null;
            List<Map<String, String>> inlineAttachments = body != null
                    ? (List<Map<String, String>>) body.get("inlineAttachments")
                    : null;

            ProformaResponse pi = service.get(id);
            if (subject == null || subject.isBlank()) {
                String num = pi != null && pi.getPiNumber() != null ? pi.getPiNumber() : ("PI-" + id);
                subject = "Proforma Invoice " + num + " from " + emailSender.getFromName();
            }
            emailSender.send(toEmail, subject, htmlBody, inlineAttachments);
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " + toEmail));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to send email: " + e.getMessage());
        }
    }

    @GetMapping
    public List<ProformaResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<ProformaResponse> page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        modulePermissionService.requireCanView(MODULE);
        java.util.List<ProformaResponse> all = (fromDate != null || toDate != null)
                ? service.listByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : service.list();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        modulePermissionService.requireCanView(MODULE);
        return Map.of("piNumber", service.generateProformaNumber());
    }

    @GetMapping("/{id}")
    public ProformaResponse get(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.get(id);
    }

    @PostMapping
    public ProformaResponse create(@RequestBody ProformaRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ProformaResponse update(
            @PathVariable Long id,
            @RequestBody ProformaRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        service.delete(id);
    }

    @PostMapping("/{id}/issue")
    public ProformaResponse issue(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.issue(id);
    }

    @PostMapping("/{id}/cancel")
    public ProformaResponse cancel(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.cancel(id);
    }
}
