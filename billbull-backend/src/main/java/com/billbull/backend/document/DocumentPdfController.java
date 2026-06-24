package com.billbull.backend.document;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

/**
 * Converts document HTML (built by the frontend print renderer) into a real,
 * vector, selectable-text PDF via headless Chromium. One endpoint serves every
 * module (quotation, invoice, LPO, ...) because the HTML is module-agnostic.
 */
@RestController
@RequestMapping("/api/documents")
@CrossOrigin(origins = "*")
public class DocumentPdfController {

    private final HtmlPdfService pdfService;

    public DocumentPdfController(HtmlPdfService pdfService) {
        this.pdfService = pdfService;
    }

    public static class PdfRequest {
        private String html;
        private String filename;

        public String getHtml() { return html; }
        public void setHtml(String html) { this.html = html; }
        public String getFilename() { return filename; }
        public void setFilename(String filename) { this.filename = filename; }
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/pdf")
    public ResponseEntity<byte[]> renderPdf(@RequestBody PdfRequest request) {
        if (request == null || request.getHtml() == null || request.getHtml().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        byte[] pdf = pdfService.render(request.getHtml());

        String name = (request.getFilename() == null || request.getFilename().isBlank())
                ? "document" : request.getFilename();
        // Strip any extension the caller passed; we always append .pdf.
        name = name.replaceAll("\\.[Pp][Dd][Ff]$", "");
        String safe = name.replaceAll("[^A-Za-z0-9._\\- ]", "_");

        ContentDisposition cd = ContentDisposition.attachment()
                .filename(safe + ".pdf", StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }
}
