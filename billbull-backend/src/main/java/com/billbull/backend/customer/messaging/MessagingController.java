package com.billbull.backend.customer.messaging;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/messaging")
@PreAuthorize("isAuthenticated()")
public class MessagingController {

    private static final String MODULE = "customer";

    @Autowired
    private MessagingService messagingService;

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @GetMapping("/templates")
    public List<MessageTemplate> getTemplates() {
        modulePermissionService.requireCanView(MODULE);
        return messagingService.getAllTemplates();
    }

    @PostMapping("/templates")
    public MessageTemplate createTemplate(@RequestBody MessageTemplate template) {
        modulePermissionService.requireCanCreate(MODULE);
        return messagingService.createTemplate(template);
    }

    @PostMapping("/templates/{id}/use")
    public MessageTemplate useTemplate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        return messagingService.incrementTemplateUsage(id);
    }

    @PutMapping("/templates/{id}")
    public MessageTemplate updateTemplate(@PathVariable Long id, @RequestBody MessageTemplate template) {
        modulePermissionService.requireCanEdit(MODULE);
        return messagingService.updateTemplate(id, template);
    }

    @DeleteMapping("/templates/{id}")
    public void deleteTemplate(@PathVariable Long id) {
        modulePermissionService.requireCanEdit(MODULE);
        messagingService.deleteTemplate(id);
    }

    @GetMapping("/logs")
    public List<MessageLog> getLogs() {
        modulePermissionService.requireCanView(MODULE);
        return messagingService.getMessageLogs();
    }

    @PostMapping("/logs")
    public MessageLog logMessage(@RequestBody MessageLog log) {
        modulePermissionService.requireCanCreate(MODULE);
        return messagingService.logMessage(log);
    }
}
