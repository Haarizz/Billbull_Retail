package com.billbull.backend.inventory.barcode;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BarcodeTemplateRepository extends JpaRepository<BarcodeTemplate, Long> {
    Optional<BarcodeTemplate> findBySystemKey(String systemKey);
}
