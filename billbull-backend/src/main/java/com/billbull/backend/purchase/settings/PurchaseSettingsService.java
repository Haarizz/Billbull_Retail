package com.billbull.backend.purchase.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseSettingsService {

    private final PurchaseSettingsRepository repo;
    private final PurchaseDocumentNumberingService numberingService;

    public PurchaseSettingsService(
            PurchaseSettingsRepository repo,
            PurchaseDocumentNumberingService numberingService) {
        this.repo = repo;
        this.numberingService = numberingService;
    }

    /**
     * Returns the singleton settings row. If it doesn't exist yet, creates a default one.
     */
    @Transactional
    public PurchaseSettings getSettings() {
        PurchaseSettings settings = repo.findById(1L).orElseGet(() -> {
            PurchaseSettings defaults = new PurchaseSettings();
            defaults.setId(1L);
            return defaults;
        });
        settings.setDocumentNumbering(numberingService.getAllSettingsWithPreview());
        return settings;
    }

    /**
     * Upserts the singleton settings row.
     */
    @Transactional
    public PurchaseSettings saveSettings(PurchaseSettings incoming) {
        var documentNumbering = numberingService.saveSettings(incoming.getDocumentNumbering());
        incoming.setId(1L); // Always singleton
        PurchaseSettings saved = repo.save(incoming);
        saved.setDocumentNumbering(documentNumbering);
        return saved;
    }
}
