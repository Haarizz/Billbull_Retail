package com.billbull.backend.sales.templates.controller;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.sales.templates.model.PrintTemplate;
import com.billbull.backend.sales.templates.service.PrintTemplateService;

@RestController
@RequestMapping("/api/templates")
public class PrintTemplateController {

    @Autowired
    private PrintTemplateService printTemplateService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    /** Templates are shared between sales and purchases — allow access if the user can view either. */
    private void requireView() {
        if (!modulePermissionService.canView("sales") && !modulePermissionService.canView("purchases")) {
            throw new AccessDeniedException("No view permission for templates");
        }
    }

    private void requireCreate() {
        if (!modulePermissionService.canCreate("sales") && !modulePermissionService.canCreate("purchases")) {
            throw new AccessDeniedException("No create permission for templates");
        }
    }

    private void requireEdit() {
        if (!modulePermissionService.canEdit("sales") && !modulePermissionService.canEdit("purchases")) {
            throw new AccessDeniedException("No edit permission for templates");
        }
    }

    @GetMapping
    public List<PrintTemplate> getAllTemplates() {
        requireView();
        return printTemplateService.getAllTemplates();
    }

    @GetMapping("/search")
    public List<PrintTemplate> getTemplatesByCategory(@RequestParam String category) {
        requireView();
        return printTemplateService.getTemplatesByCategory(category);
    }

    /** All templates in a document family, e.g. base="Sales Invoice" returns
     *  the standard, letterhead, and pre-printed variants together. */
    @GetMapping("/family")
    public List<PrintTemplate> getTemplateFamily(@RequestParam String base) {
        requireView();
        return printTemplateService.getTemplatesByCategoryPrefix(base);
    }

    @PostMapping
    public PrintTemplate createTemplate(@RequestBody PrintTemplate template) {
        requireCreate();
        return printTemplateService.createTemplate(template);
    }

    @PutMapping("/{id}")
    public ResponseEntity<PrintTemplate> updateTemplate(@PathVariable Long id,
            @RequestBody PrintTemplate templateDetails) {
        requireEdit();
        try {
            PrintTemplate updatedTemplate = printTemplateService.updateTemplate(id, templateDetails);
            return ResponseEntity.ok(updatedTemplate);
        } catch (RuntimeException e) {
            e.printStackTrace();
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTemplate(@PathVariable Long id) {
        requireEdit();
        printTemplateService.deleteTemplate(id);
        return ResponseEntity.ok().build();
    }
}
