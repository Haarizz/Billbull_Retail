package com.billbull.backend.sales.salesorder;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

@RestController
@RequestMapping("/api/sales/sales-orders")
@CrossOrigin
@PreAuthorize("hasAnyRole('ADMIN','SALES')")
public class SalesOrderController {

    private final SalesOrderService service;
    private final SalesOrderAttachmentRepository attachmentRepo;
    private final AuditLogService auditLogService;

    public SalesOrderController(
            SalesOrderService service,
            SalesOrderAttachmentRepository attachmentRepo,
            AuditLogService auditLogService) {
        this.service = service;
        this.attachmentRepo = attachmentRepo;
        this.auditLogService = auditLogService;
    }

    @PostMapping
    public SalesOrder save(@RequestBody SalesOrder order) {
        return service.save(order);
    }

    @GetMapping
    public List<SalesOrder> getAll() {
        return service.getAll();
    }

    @GetMapping("/{id}")
    public SalesOrder getById(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping("/{id}/attachments")
    public SalesOrderAttachment upload(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) throws Exception {

        String dir = "uploads/sales-orders/" + id;
        Files.createDirectories(Paths.get(dir));

        String filePath = dir + "/" + file.getOriginalFilename();
        file.transferTo(new File(filePath));

        SalesOrderAttachment att = new SalesOrderAttachment();
        att.setFileName(file.getOriginalFilename());
        att.setFileType(file.getContentType());
        att.setFilePath(filePath);
        att.setSalesOrder(service.getById(id));

        return attachmentRepo.save(att);
    }
}
