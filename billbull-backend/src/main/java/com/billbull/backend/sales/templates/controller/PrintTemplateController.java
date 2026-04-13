package com.billbull.backend.sales.templates.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
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
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class PrintTemplateController {

    @Autowired
    private PrintTemplateService printTemplateService;

    @GetMapping
    public List<PrintTemplate> getAllTemplates() {
        return printTemplateService.getAllTemplates();
    }

    @GetMapping("/search")
    public List<PrintTemplate> getTemplatesByCategory(@RequestParam String category) {
        return printTemplateService.getTemplatesByCategory(category);
    }

    @PostMapping
    public PrintTemplate createTemplate(@RequestBody PrintTemplate template) {
        return printTemplateService.createTemplate(template);
    }

    @PutMapping("/{id}")
    public ResponseEntity<PrintTemplate> updateTemplate(@PathVariable Long id,
            @RequestBody PrintTemplate templateDetails) {
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
        printTemplateService.deleteTemplate(id);
        return ResponseEntity.ok().build();
    }
}