package com.billbull.backend.sales.delivery;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.email.DocumentEmailSender;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/delivery-notes")
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class DeliveryNoteController {

    private static final String MODULE = "sales";

    private final DeliveryNoteService service;
    private final DocumentEmailSender emailSender;
    private final ModulePermissionService modulePermissionService;

    public DeliveryNoteController(DeliveryNoteService service, DocumentEmailSender emailSender,
                                  ModulePermissionService modulePermissionService) {
        this.service = service;
        this.emailSender = emailSender;
        this.modulePermissionService = modulePermissionService;
    }

    // QA-040: send the DN email using the frontend-rendered HTML body.
    @PostMapping("/{id}/send-email")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> sendEmail(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        try {
            String toEmail = body != null ? (String) body.get("toEmail") : null;
            String subject = body != null ? (String) body.get("subject") : null;
            String htmlBody = body != null ? (String) body.get("htmlBody") : null;
            List<Map<String, String>> inlineAttachments = body != null
                    ? (List<Map<String, String>>) body.get("inlineAttachments")
                    : null;

            DeliveryNoteResponse dn = service.get(id);
            if (subject == null || subject.isBlank()) {
                String num = dn != null && dn.dnNumber != null ? dn.dnNumber : ("DN-" + id);
                subject = "Delivery Note " + num + " from " + emailSender.getFromName();
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
    public List<DeliveryNoteResponse> list() {
        modulePermissionService.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<DeliveryNoteResponse> page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        java.util.List<DeliveryNoteResponse> all = (fromDate != null || toDate != null)
                ? service.listByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : service.list();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        return Map.of("dnNumber", service.generateDeliveryNoteNumber());
    }

    @GetMapping("/uninvoiced/{customerCode}")
    public List<DeliveryNoteResponse> getUninvoiced(@PathVariable String customerCode) {
        return service.getUninvoicedForCustomer(customerCode);
    }

    @GetMapping("/{id}")
    public DeliveryNoteResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public DeliveryNoteResponse create(@RequestBody DeliveryNoteRequest req) {
        modulePermissionService.requireCanCreate(MODULE);
        return service.create(req);
    }

    @PutMapping("/{id}")
    public DeliveryNoteResponse update(
            @PathVariable Long id,
            @RequestBody DeliveryNoteRequest req) {
        modulePermissionService.requireCanEdit(MODULE);
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/dispatch")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse dispatch(@PathVariable Long id) {
        return service.markDispatched(id);
    }

    @PostMapping("/{id}/deliver")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse deliver(
            @PathVariable Long id,
            @RequestParam(required = false) String receivedBy) {
        return service.markDelivered(id, receivedBy);
    }

    @PostMapping("/{id}/advance-status")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse advanceStatus(
            @PathVariable Long id,
            @RequestParam(required = false) String receivedBy) {
        return service.advanceStatus(id, receivedBy);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    @PostMapping("/{dnId}/items/{itemId}/batch-selection")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse saveBatchSelection(
            @PathVariable Long dnId,
            @PathVariable Long itemId,
            @RequestBody BatchSelectionRequest request) {
        return service.saveBatchSelection(dnId, itemId, request);
    }

    @DeleteMapping("/{dnId}/items/{itemId}/batch-selection")
    @PreAuthorize("hasAnyRole('ADMIN','SALES','INVENTORY_MANAGER')")
    public DeliveryNoteResponse deleteBatchSelection(
            @PathVariable Long dnId,
            @PathVariable Long itemId) {
        return service.deleteBatchSelection(dnId, itemId);
    }
}
