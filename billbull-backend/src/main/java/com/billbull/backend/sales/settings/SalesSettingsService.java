package com.billbull.backend.sales.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SalesSettingsService {

    private final SalesSettingsRepository repo;

    public SalesSettingsService(SalesSettingsRepository repo) {
        this.repo = repo;
    }

    /**
     * Returns the singleton settings row. If it doesn't exist yet,
     * creates a default one (stockCheckRequired = false, policy = NO_IMPACT).
     */
    @Transactional(readOnly = true)
    public SalesSettings getSettings() {
        return repo.findById(1L).orElseGet(() -> {
            SalesSettings defaults = new SalesSettings();
            defaults.setId(1L);
            defaults.setStockCheckRequired(false);
            defaults.setCreditLimitPolicy(CreditLimitPolicy.NO_IMPACT);
            return defaults;
        });
    }

    /**
     * Upserts the singleton settings row.
     */
    @Transactional
    public SalesSettings saveSettings(SalesSettings incoming) {
        incoming.setId(1L); // Always singleton
        return repo.save(incoming);
    }
}
