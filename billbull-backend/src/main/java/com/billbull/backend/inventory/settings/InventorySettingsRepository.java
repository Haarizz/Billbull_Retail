package com.billbull.backend.inventory.settings;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface InventorySettingsRepository extends JpaRepository<InventorySettings, Long> {
}
