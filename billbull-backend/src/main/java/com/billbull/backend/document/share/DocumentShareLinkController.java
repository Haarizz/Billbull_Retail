package com.billbull.backend.document.share;

import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.whatsapp.WhatsAppDocumentType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Staff side of document share links: make a link for the WhatsApp message, and list the earlier
 * links to a document. Needs "view" on the document's module, like send-whatsapp and Download PDF.
 */
@RestController
@RequestMapping("/api/document-links")
@PreAuthorize("isAuthenticated()")
public class DocumentShareLinkController {

    private final DocumentShareLinkService service;
    private final ModulePermissionService permissionService;

    public DocumentShareLinkController(DocumentShareLinkService service, ModulePermissionService permissionService) {
        this.service = service;
        this.permissionService = permissionService;
    }

    /**
     * Body: { documentType: QUOTATION | SALES_ORDER | SALES_INVOICE, documentId, html,
     * presentation (optional): "RECEIPT" for a POS sale, shown to the customer as a receipt }.
     */
    public record CreateRequest(String documentType, Long documentId, String html, String presentation) {}

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateRequest body) {
        WhatsAppDocumentType type = body == null ? null : WhatsAppDocumentType.parse(body.documentType());
        if (type == null || body.documentId() == null) {
            return ResponseEntity.badRequest().body("documentType and documentId are required.");
        }
        permissionService.requireCan(type.module(), "view");
        try {
            return ResponseEntity.ok(service.create(type, body.documentId(), body.html(), body.presentation()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping
    public ResponseEntity<List<DocumentShareLinkService.LinkInfo>> history(@RequestParam String documentType,
                                                                          @RequestParam Long documentId) {
        WhatsAppDocumentType type = WhatsAppDocumentType.parse(documentType);
        if (type == null) {
            return ResponseEntity.badRequest().build();
        }
        permissionService.requireCan(type.module(), "view");
        return ResponseEntity.ok(service.history(type, documentId));
    }
}
