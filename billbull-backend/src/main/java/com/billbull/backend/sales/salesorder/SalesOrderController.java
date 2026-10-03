package com.billbull.backend.sales.salesorder;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.email.DocumentEmailSender;
import com.billbull.backend.settings.whatsapp.DocumentWhatsAppSender;
import com.billbull.backend.settings.whatsapp.WhatsAppApiException;
import com.billbull.backend.settings.whatsapp.WhatsAppDocumentType;
import com.billbull.backend.settings.whatsapp.WhatsAppTemplateParams;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/sales/sales-orders")
@PreAuthorize("isAuthenticated()")
public class SalesOrderController {

    private static final String MODULE = "sales.order";

    private final SalesOrderService service;
    private final SalesOrderAttachmentRepository attachmentRepo;
    private final AuditLogService auditLogService;
    private final DocumentEmailSender emailSender;
    private final ModulePermissionService modulePermissionService;
    private final DocumentWhatsAppSender whatsAppSender;
    private final CompanyProfileService companyProfileService;

    /**
     * Root for sales-order attachments, always resolved to an ABSOLUTE path.
     * MultipartFile.transferTo() hands a relative path straight to Part.write(),
     * which Tomcat resolves against the servlet TEMP dir rather than the working
     * directory -- so a relative target misses the directory we just created and
     * the upload dies with an IOException, which is what made confirming an order
     * with an attachment fail. Files.copy() to an absolute path sidesteps that,
     * matching ProductImageStorageService and ReceiptVoucherService.
     */
    private final Path attachmentRoot;


    public SalesOrderController(
            SalesOrderService service,
            SalesOrderAttachmentRepository attachmentRepo,
            AuditLogService auditLogService,
            DocumentEmailSender emailSender,
            ModulePermissionService modulePermissionService,
            DocumentWhatsAppSender whatsAppSender,
            CompanyProfileService companyProfileService,
            @org.springframework.beans.factory.annotation.Value("${upload.path:uploads/}") String uploadPath) {
        this.attachmentRoot = Paths.get(uploadPath, "sales-orders").toAbsolutePath().normalize();
        this.service = service;
        this.attachmentRepo = attachmentRepo;
        this.auditLogService = auditLogService;
        this.emailSender = emailSender;
        this.modulePermissionService = modulePermissionService;
        this.whatsAppSender = whatsAppSender;
        this.companyProfileService = companyProfileService;
    }

    // QA-040: send the SO email using the frontend-rendered HTML body.
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

            SalesOrder order = service.getById(id);
            if (subject == null || subject.isBlank()) {
                subject = "Sales Order " + order.getSoNumber() + " from " + emailSender.getFromName();
            }
            emailSender.send(toEmail, subject, htmlBody, inlineAttachments);
            return ResponseEntity.ok(Map.of("message", "Email sent successfully to " + toEmail));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to send email: " + e.getMessage());
        }
    }

    /**
     * Sends the sales-order PDF as a WhatsApp document (Meta Cloud API, "sales_order_document"
     * template). Body: { toPhone (required: the SO stores no customer phone, so the frontend sends
     * the customer master's mobile), html (required: the same print HTML as Print) }.
     */
    @PostMapping("/{id}/send-whatsapp")
    public ResponseEntity<?> sendWhatsApp(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        modulePermissionService.requireCanView(MODULE);
        try {
            SalesOrder order = service.getById(id);
            return ResponseEntity.ok(whatsAppSender.send(new DocumentWhatsAppSender.SendRequest(
                    WhatsAppDocumentType.SALES_ORDER,
                    order.getId(),
                    order.getSoNumber(),
                    order.getBranch() != null ? order.getBranch().getId() : null,
                    body.get("toPhone") instanceof String s ? s : null,
                    (String) body.get("html"),
                    order.getSoNumber(),
                    orderTemplateParams(order, companyProfileService.getProfile().getCurrency()))));
        } catch (IllegalArgumentException | IllegalStateException | WhatsAppApiException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * Body variables of the "sales_order_document" template, in order:
     * {{1}} customer name, {{2}} SO no, {{3}} order total with currency, {{4}} expected delivery
     * date ("to be confirmed" when unset). Changing this order requires re-approving the template
     * in Meta; see docs/whatsapp-business-api-integration-2026-10-01.md.
     */
    static List<String> orderTemplateParams(SalesOrder order, String currency) {
        return List.of(
                WhatsAppTemplateParams.customerName(order.getCustomerName(), order.getCustomerCode()),
                order.getSoNumber() == null ? "-" : order.getSoNumber(),
                WhatsAppTemplateParams.amount(currency, order.getOrderTotal()),
                WhatsAppTemplateParams.date(order.getExpectedDeliveryDate(), "to be confirmed"));
    }

    @PostMapping
    public ResponseEntity<?> save(@RequestBody SalesOrder order) {
        modulePermissionService.requireCanCreate(MODULE);
        try {
            return ResponseEntity.ok(service.save(order));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping
    public List<SalesOrder> getAll() {
        modulePermissionService.requireCanView(MODULE);
        return service.getAll();
    }

    @GetMapping("/page")
    public com.billbull.backend.util.PageResponse<SalesOrder> getPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        modulePermissionService.requireCanView(MODULE);
        java.util.List<SalesOrder> all = (fromDate != null || toDate != null)
                ? service.getAllByDateRange(
                        fromDate != null ? java.time.LocalDate.parse(fromDate) : java.time.LocalDate.of(2000, 1, 1),
                        toDate != null ? java.time.LocalDate.parse(toDate) : java.time.LocalDate.now())
                : service.getAll();
        return com.billbull.backend.util.PaginationUtil.paginate(all, page, size, search, status);
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        modulePermissionService.requireCanView(MODULE);
        return service.getStats();
    }

    @GetMapping("/next-number")
    public Map<String, String> getNextNumber() {
        modulePermissionService.requireCanCreate(MODULE);
        return Map.of("soNumber", service.generateSalesOrderNumber());
    }

    @GetMapping("/{id}")
    public SalesOrder getById(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.getById(id);
    }

    /**
     * QA-032: Return the Receipt Vouchers linked to this Sales Order so the
     * editor can offer a "Print Advance Receipt" action.
     */
    @GetMapping("/{id}/receipt-vouchers")
    public List<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> getReceiptVouchers(@PathVariable Long id) {
        modulePermissionService.requireCanView(MODULE);
        return service.getReceiptVouchersForOrder(id);
    }

    @PutMapping("/{id}/status")
    public void updateStatus(@PathVariable Long id, @RequestParam String status) {
        modulePermissionService.requireCanEdit(MODULE);
        service.updateStatusById(id, SalesOrderStatus.valueOf(status));
    }

    @PostMapping("/{orderId}/items/{itemId}/batch-selection")
    public ResponseEntity<?> saveBatchSelection(
            @PathVariable Long orderId,
            @PathVariable Long itemId,
            @RequestBody BatchSelectionRequest request) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.saveBatchSelection(orderId, itemId, request));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{orderId}/items/{itemId}/batch-selection")
    public ResponseEntity<?> deleteBatchSelection(
            @PathVariable Long orderId,
            @PathVariable Long itemId) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.deleteBatchSelection(orderId, itemId));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping(value = "/{id}/attachments",
            consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {

        modulePermissionService.requireCanEdit(MODULE);

        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Attachment file must not be empty."));
        }

        // Order must exist (and be accessible) before anything touches the disk.
        SalesOrder order = service.getById(id);

        String originalName = sanitizeFileName(file.getOriginalFilename());

        try {
            Path dir = attachmentRoot.resolve(String.valueOf(id)).normalize();
            Files.createDirectories(dir);

            // Unique on disk so a re-upload of the same name never clobbers the
            // earlier file; the display name stays what the user picked.
            String storedName = UUID.randomUUID() + "_" + originalName;
            Path target = dir.resolve(storedName).normalize();
            if (!target.startsWith(attachmentRoot)) {
                return ResponseEntity.badRequest().body(Map.of("message", "Invalid attachment file name."));
            }
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

            SalesOrderAttachment att = new SalesOrderAttachment();
            att.setFileName(originalName);
            att.setFileType(file.getContentType());
            // Web-servable path — StaticResourceConfig maps /uploads/** to ./uploads/.
            att.setFilePath("/uploads/sales-orders/" + id + "/" + storedName);
            att.setSalesOrder(order);

            SalesOrderAttachment saved = attachmentRepo.save(att);
            return ResponseEntity.ok(Map.of(
                    "id", saved.getId(),
                    "fileName", saved.getFileName(),
                    "fileType", saved.getFileType() == null ? "" : saved.getFileType(),
                    "filePath", saved.getFilePath(),
                    "salesOrderId", id));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("message", "Failed to store attachment: " + e.getMessage()));
        }
    }

    /**
     * Strip any directory component a browser may send (IE/Edge historically send the
     * full client path) plus control characters, so an upload cannot escape the order
     * folder. 92 is the backslash code point, kept numeric to stay escape-free.
     */
    private static String sanitizeFileName(String original) {
        String name = original == null ? "" : original.replace((char) 92, '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        StringBuilder cleaned = new StringBuilder(name.length());
        for (char c : name.toCharArray()) {
            if (c >= ' ') {
                cleaned.append(c);
            }
        }
        name = cleaned.toString().trim();
        return name.isEmpty() || name.equals(".") || name.equals("..") ? "attachment" : name;
    }
}
