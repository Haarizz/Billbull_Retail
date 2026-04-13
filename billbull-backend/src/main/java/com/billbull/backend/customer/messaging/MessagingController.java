package com.billbull.backend.customer.messaging;

import com.billbull.backend.security.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/messaging")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'SALES', 'SALES')")
public class MessagingController {

    @Autowired
    private MessagingService messagingService;

    @Autowired
    private AuditLogService auditLogService;

    @GetMapping("/templates")
    public List<MessageTemplate> getTemplates() {
        return messagingService.getAllTemplates();
    }

    @PostMapping("/templates")
    public MessageTemplate createTemplate(@RequestBody MessageTemplate template) {
        return messagingService.createTemplate(template);
    }

    @PostMapping("/templates/{id}/use")
    public MessageTemplate useTemplate(@PathVariable Long id) {
        return messagingService.incrementTemplateUsage(id);
    }

    @PutMapping("/templates/{id}")
    public MessageTemplate updateTemplate(@PathVariable Long id, @RequestBody MessageTemplate template) {
        return messagingService.updateTemplate(id, template);
    }

    @DeleteMapping("/templates/{id}")
    public void deleteTemplate(@PathVariable Long id) {
        messagingService.deleteTemplate(id);
    }

    @GetMapping("/logs")
    public List<MessageLog> getLogs() {
        return messagingService.getMessageLogs();
    }

    @PostMapping("/logs")
    public MessageLog logMessage(@RequestBody MessageLog log) {
        return messagingService.logMessage(log);
    }
}
