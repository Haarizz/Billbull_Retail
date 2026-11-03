package com.billbull.backend.sales.templates.service;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import com.billbull.backend.sales.templates.model.PrintTemplate;
import com.billbull.backend.sales.templates.repository.PrintTemplateRepository;

import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PrintTemplateService {

    private final PrintTemplateRepository printTemplateRepository;

    public PrintTemplateService(PrintTemplateRepository printTemplateRepository) {
        this.printTemplateRepository = printTemplateRepository;
    }

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
            unsetOtherDefaults(template.getCategory(), template.getBranchId(), null);
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
                unsetOtherDefaults(templateDetails.getCategory(), templateDetails.getBranchId(), id);
            }

            existingTemplate.setName(templateDetails.getName());
            existingTemplate.setCategory(templateDetails.getCategory());
            existingTemplate.setBranchId(templateDetails.getBranchId());
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

    /** Designer settings blocks a template may store inside display_options. */
    private static final List<String> DESIGNER_SETTINGS_KEYS =
            List.of("salesDesignerSettings", "designerSettings", "purchaseDesignerSettings");

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * Replaces only a template's Terms &amp; Conditions — the "Save as default" action on a document
     * (e.g. Sales Invoice) uses this so it cannot overwrite layout changes someone made in the
     * designer meanwhile. The designers also keep their own copy of the text inside display_options
     * ({@code termsText}/{@code termsConditions}); those are updated too, or the designer would
     * show, and on its next save write back, the old terms.
     */
    public PrintTemplate updateTerms(Long id, String termsContent) {
        PrintTemplate template = printTemplateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found with id " + id));
        String terms = termsContent != null ? termsContent : "";
        template.setTermsContent(terms);
        template.setDisplayOptions(withDesignerTerms(template.getDisplayOptions(), terms));
        return printTemplateRepository.save(template);
    }

    static String withDesignerTerms(String displayOptions, String terms) {
        if (displayOptions == null || displayOptions.isBlank()) {
            return displayOptions;
        }
        try {
            JsonNode root = JSON.readTree(displayOptions);
            if (!(root instanceof ObjectNode rootObject)) {
                return displayOptions;
            }
            boolean changed = false;
            for (String key : DESIGNER_SETTINGS_KEYS) {
                if (rootObject.get(key) instanceof ObjectNode settings) {
                    settings.put("termsText", terms);
                    if (settings.has("termsConditions")) {
                        settings.put("termsConditions", terms);
                    }
                    changed = true;
                }
            }
            return changed ? JSON.writeValueAsString(rootObject) : displayOptions;
        } catch (JsonProcessingException e) {
            // Unreadable legacy options: leave them alone, terms_content is still updated.
            return displayOptions;
        }
    }

    /**
     * Unsets sibling defaults scoped to the same (category, branchId) pair — a branch-specific
     * default only displaces other branch-specific defaults for that branch, and a global
     * (branchId null) default only displaces other global defaults. Without this scoping,
     * saving one branch's default POS template would wrongly clear another branch's default.
     */
    private void unsetOtherDefaults(String category, Long branchId, Long excludeId) {
        List<PrintTemplate> categoryTemplates = branchId == null
                ? printTemplateRepository.findByCategoryAndBranchIdIsNull(category)
                : printTemplateRepository.findByCategoryAndBranchId(category, branchId);
        for (PrintTemplate t : categoryTemplates) {
            if (t.isDefault() && (excludeId == null || !t.getId().equals(excludeId))) {
                t.setDefault(false);
                printTemplateRepository.save(t);
            }
        }
    }

    /**
     * Resolves the effective template for a category, honoring strict priority order:
     * (1) branch-specific default, (2) global (branchId null) default, (3) the hardcoded
     * system fallback built by {@code systemDefaultSupplier}. Never short-circuits to the
     * global row before confirming no branch-specific row exists. Used by POS categories;
     * branchId may be null for callers with no branch context, which simply skips straight
     * to step 2.
     */
    public PrintTemplate resolveTemplate(String category, Long branchId, java.util.function.Supplier<PrintTemplate> systemDefaultSupplier) {
        if (branchId != null) {
            Optional<PrintTemplate> branchDefault = printTemplateRepository.findByCategoryAndBranchId(category, branchId)
                    .stream().filter(PrintTemplate::isDefault).findFirst();
            if (branchDefault.isPresent()) {
                return branchDefault.get();
            }
        }

        Optional<PrintTemplate> globalDefault = printTemplateRepository.findByCategoryAndBranchIdIsNull(category)
                .stream().filter(PrintTemplate::isDefault).findFirst();
        if (globalDefault.isPresent()) {
            return globalDefault.get();
        }

        return systemDefaultSupplier.get();
    }

    public void deleteTemplate(Long id) {
        printTemplateRepository.deleteById(id);
    }
}
