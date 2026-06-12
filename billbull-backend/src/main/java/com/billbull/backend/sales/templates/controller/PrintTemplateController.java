package com.billbull.backend.sales.templates.controller;

import com.billbull.backend.security.ModulePermissionService;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
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

    private static final String MODULE = "sales";

    @Autowired
    private PrintTemplateService printTemplateService;

    @Autowired
    private ModulePermissionService modulePermissionService;

    @GetMapping
    public List<PrintTemplate> getAllTemplates() {
        modulePermissionService.requireCanView(MODULE);
        return printTemplateService.getAllTemplates();
    }

    @GetMapping("/search")
    public List<PrintTemplate> getTemplatesByCategory(@RequestParam String category) {
        modulePermissionService.requireCanView(MODULE);
        return printTemplateService.getTemplatesByCategory(category);
    }

    /** All templates in a document family, e.g. base="Sales Invoice" returns
     *  the standard, letterhead, and pre-printed variants together. */
    @GetMapping("/family")
    public List<PrintTemplate> getTemplateFamily(@RequestParam String base) {
        modulePermissionService.requireCanView(MODULE);
        return printTemplateService.getTemplatesByCategoryPrefix(base);
    }

    @PostMapping
    public PrintTemplate createTemplate(@RequestBody PrintTemplate template) {
        modulePermissionService.requireCanCreate(MODULE);
        return printTemplateService.createTemplate(template);
    }

    @PutMapping("/{id}")
    public ResponseEntity<PrintTemplate> updateTemplate(@PathVariable Long id,
            @RequestBody PrintTemplate templateDetails) {
        modulePermissionService.requireCanEdit(MODULE);
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
        modulePermissionService.requireCanEdit(MODULE);
        printTemplateService.deleteTemplate(id);
        return ResponseEntity.ok().build();
    }
}
