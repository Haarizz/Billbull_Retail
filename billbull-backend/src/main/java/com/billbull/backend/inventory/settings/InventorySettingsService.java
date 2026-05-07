package com.billbull.backend.inventory.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventorySettingsService {

    private final InventorySettingsRepository repository;

    public InventorySettingsService(InventorySettingsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public InventorySettings getSettings() {
        return repository.findById(1L).orElseGet(() -> {
            InventorySettings defaults = new InventorySettings();
            defaults.setId(1L);
            defaults.setBarcodePrintOnBatchCreate(false);
            return defaults;
        });
    }

    @Transactional
    public InventorySettings saveSettings(InventorySettings incoming) {
        incoming.setId(1L);
        return repository.save(incoming);
    }
}
