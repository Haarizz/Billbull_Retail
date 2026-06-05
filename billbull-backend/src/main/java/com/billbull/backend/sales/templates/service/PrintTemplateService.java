package com.billbull.backend.sales.templates.service;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.billbull.backend.sales.templates.model.PrintTemplate;
import com.billbull.backend.sales.templates.repository.PrintTemplateRepository;

import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PrintTemplateService {

    @Autowired
    private PrintTemplateRepository printTemplateRepository;

    public List<PrintTemplate> getAllTemplates() {
        return printTemplateRepository.findAll();
    }

    public List<PrintTemplate> getTemplatesByCategory(String category) {
        return printTemplateRepository.findByCategory(category);
    }

    /**
     * Returns every template in a document family (e.g. all "Sales Invoice*"
     * categories: standard, letterhead, and pre-printed). Used by the print
     * picker so the user can choose any variant at print time. Backfills a
     * derived {@code templateType} for legacy rows that predate the column.
     */
    public List<PrintTemplate> getTemplatesByCategoryPrefix(String prefix) {
        List<PrintTemplate> templates = printTemplateRepository.findByCategoryStartingWith(prefix);
        templates.forEach(this::ensureTemplateType);
        return templates;
    }

    private void ensureTemplateType(PrintTemplate t) {
        if (t.getTemplateType() != null && !t.getTemplateType().isBlank()) {
            return;
        }
        String cat = t.getCategory() != null ? t.getCategory().toLowerCase() : "";
        if (cat.contains("pre-printed") || cat.contains("preprinted")) {
            t.setTemplateType("PREPRINTED");
        } else if (cat.contains("letterhead")) {
            t.setTemplateType("LETTERHEAD");
        } else {
            t.setTemplateType("FULL");
        }
    }

    public PrintTemplate createTemplate(PrintTemplate template) {
        if (template.isDefault()) {
            unsetOtherDefaults(template.getCategory(), null);
        }
        return printTemplateRepository.save(template);
    }

    public PrintTemplate updateTemplate(Long id, PrintTemplate templateDetails) {
        Optional<PrintTemplate> optionalTemplate = printTemplateRepository.findById(id);
        if (optionalTemplate.isPresent()) {
            PrintTemplate existingTemplate = optionalTemplate.get();

            // Always clean up sibling defaults when saving a default template.
            // Older seed data may already contain duplicate defaults, so checking
            // only the previous state of this row leaves the duplicates behind.
            if (templateDetails.isDefault()) {
                unsetOtherDefaults(templateDetails.getCategory(), id);
            }

            existingTemplate.setName(templateDetails.getName());
            existingTemplate.setCategory(templateDetails.getCategory());
            existingTemplate.setDefault(templateDetails.isDefault());
            existingTemplate.setPaperSize(templateDetails.getPaperSize());
            existingTemplate.setOrientation(templateDetails.getOrientation());
            existingTemplate.setHeaderContent(templateDetails.getHeaderContent());
            existingTemplate.setTermsContent(templateDetails.getTermsContent());
            existingTemplate.setFooterContent(templateDetails.getFooterContent());
            existingTemplate.setDisplayOptions(templateDetails.getDisplayOptions());
            existingTemplate.setColumns(templateDetails.getColumns());
            existingTemplate.setTemplateType(templateDetails.getTemplateType());

            return printTemplateRepository.save(existingTemplate);
        } else {
            throw new RuntimeException("Template not found with id " + id);
        }
    }

    private void unsetOtherDefaults(String category, Long excludeId) {
        List<PrintTemplate> categoryTemplates = printTemplateRepository.findByCategory(category);
        for (PrintTemplate t : categoryTemplates) {
            if (t.isDefault() && (excludeId == null || !t.getId().equals(excludeId))) {
                t.setDefault(false);
                printTemplateRepository.save(t);
            }
        }
    }

    public void deleteTemplate(Long id) {
        printTemplateRepository.deleteById(id);
    }
}
