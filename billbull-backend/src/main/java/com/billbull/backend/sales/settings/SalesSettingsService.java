package com.billbull.backend.sales.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SalesSettingsService {

    private final SalesSettingsRepository repo;
    private final SalesDocumentNumberingService numberingService;

    public SalesSettingsService(
            SalesSettingsRepository repo,
            SalesDocumentNumberingService numberingService) {
        this.repo = repo;
        this.numberingService = numberingService;
    }

    /**
     * Returns the singleton settings row. If it doesn't exist yet,
     * creates a default one (stockCheckRequired = false, policy = NO_IMPACT).
     */
    @Transactional
    public SalesSettings getSettings() {
        SalesSettings settings = repo.findById(1L).orElseGet(() -> {
            SalesSettings defaults = new SalesSettings();
            defaults.setId(1L);
            defaults.setStockCheckRequired(false);
            defaults.setCreditLimitPolicy(CreditLimitPolicy.NO_IMPACT);
            return defaults;
        });
        settings.setDocumentNumbering(numberingService.getAllSettingsWithPreview());
        return settings;
    }

    /**
     * Upserts the singleton settings row.
     */
    @Transactional
    public SalesSettings saveSettings(SalesSettings incoming) {
        var documentNumbering = numberingService.saveSettings(incoming.getDocumentNumbering());
        incoming.setId(1L); // Always singleton
        SalesSettings saved = repo.save(incoming);
        saved.setDocumentNumbering(documentNumbering);
        return saved;
    }
}
