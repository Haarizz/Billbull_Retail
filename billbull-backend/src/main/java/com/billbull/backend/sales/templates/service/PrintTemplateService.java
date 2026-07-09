package com.billbull.backend.sales.templates.service;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

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
