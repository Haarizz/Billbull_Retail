package com.billbull.backend.inventory.barcode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BarcodeTemplateService {

    private static final String CONTENT_SCALE_FIELD = "_contentScale";

    private static final List<SystemTemplateSeed> SYSTEM_TEMPLATES = List.of(
            new SystemTemplateSeed(
                    "dual_standard_70x50",
                    "Standard Dual 70x50mm",
                    "Balanced two-barcode label",
                    70.0,
                    50.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(0.9, true, true, true, true, false, false, false, true, true, true)),
            new SystemTemplateSeed(
                    "dual_compact_80x35",
                    "Compact Dual 80x35mm",
                    "Compact batch barcode label",
                    80.0,
                    35.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(0.78, true, true, true, false, false, false, false, false, true, true)),
            new SystemTemplateSeed(
                    "dual_retail_90x50",
                    "Retail Dual 90x50mm",
                    "Price and expiry focused",
                    90.0,
                    50.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(0.9, true, true, true, true, true, false, false, true, true, true)),
            new SystemTemplateSeed(
                    "dual_detailed_100x60",
                    "Detailed Dual 100x60mm",
                    "Company and item details",
                    100.0,
                    60.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(0.95, true, true, true, true, true, true, true, true, true, true)),
            new SystemTemplateSeed(
                    "dual_sheet_90x50",
                    "Sheet Dual 90x50mm",
                    "Two-column sheet friendly",
                    90.0,
                    50.0,
                    "Sheet",
                    2,
                    "CODE128",
                    fields(0.88, true, true, true, true, false, false, false, true, true, true)),
            new SystemTemplateSeed(
                    "roll_zebra_100x75",
                    "Zebra Roll 100x75mm",
                    "Thermal roll, single label/page (Zebra ZD220t)",
                    100.0,
                    75.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(1.0, true, true, true, true, false, true, true, true, true, true)),
            new SystemTemplateSeed(
                    "qr_batch_50x50",
                    "QR Code 50x50mm",
                    "QR label with expiry text",
                    50.0,
                    50.0,
                    "Roll",
                    1,
                    "CODE128",
                    fields(0.9, false, true, true, false, false, false, false, false, false, true)));

    private final BarcodeTemplateRepository repository;
    private final ObjectMapper objectMapper;

    public BarcodeTemplateService(BarcodeTemplateRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public List<BarcodeTemplate> getAll() {
        ensureSystemTemplates();
        return repository.findAll(Sort.by(Sort.Direction.ASC, "id"));
    }

    public BarcodeTemplate create(BarcodeTemplate template) {
        template.setSystem(false); // User created templates are never system
        template.setSystemKey(null);
        return repository.save(template);
    }

    public BarcodeTemplate update(Long id, BarcodeTemplate updates) {
        BarcodeTemplate existing = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found"));

        existing.setName(updates.getName());
        existing.setDescription(updates.getDescription());
        existing.setWidth(updates.getWidth());
        existing.setHeight(updates.getHeight());
        existing.setType(updates.getType());
        existing.setFields(updates.getFields());
        existing.setPerPage(updates.getPerPage());
        existing.setBarcodeFormat(updates.getBarcodeFormat());

        return repository.save(existing);
    }

    public void delete(Long id) {
        BarcodeTemplate template = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found"));
        
        if (template.isSystem()) {
            throw new RuntimeException("Cannot delete system template");
        }
        
        repository.delete(template);
    }
    
    public BarcodeTemplate getById(Long id) {
        return repository.findById(id).orElseThrow(() -> new RuntimeException("Template not found"));
    }

    private void ensureSystemTemplates() {
        for (SystemTemplateSeed seed : SYSTEM_TEMPLATES) {
            BarcodeTemplate template = repository.findBySystemKey(seed.key()).orElse(null);
            if (template != null) {
                if (!template.isSystem()) {
                    template.setSystem(true);
                    repository.save(template);
                }
                continue;
            }

            BarcodeTemplate systemTemplate = new BarcodeTemplate();
            systemTemplate.setSystem(true);
            systemTemplate.setSystemKey(seed.key());
            systemTemplate.setName(seed.name());
            systemTemplate.setDescription(seed.description());
            systemTemplate.setWidth(seed.width());
            systemTemplate.setHeight(seed.height());
            systemTemplate.setType(seed.type());
            systemTemplate.setPerPage(seed.perPage());
            systemTemplate.setBarcodeFormat(seed.barcodeFormat());
            systemTemplate.setFields(writeFields(seed.fields()));
            repository.save(systemTemplate);
        }
    }

    private String writeFields(Map<String, Object> fields) {
        try {
            return objectMapper.writeValueAsString(fields);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize barcode template fields", e);
        }
    }

    private static Map<String, Object> fields(
            double contentScale,
            boolean barcode,
            boolean name,
            boolean price,
            boolean sku,
            boolean unit,
            boolean company,
            boolean itemCode,
            boolean brandName,
            boolean batchNumber,
            boolean expiryDate) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("barcode", barcode);
        fields.put("name", name);
        fields.put("price", price);
        fields.put("sku", sku);
        fields.put("unit", unit);
        fields.put("company", company);
        fields.put("qr", !barcode);
        fields.put("itemCode", itemCode);
        fields.put("brandName", brandName);
        fields.put("batchNumber", batchNumber);
        fields.put("expiryDate", expiryDate);
        fields.put(CONTENT_SCALE_FIELD, contentScale);
        return fields;
    }

    private record SystemTemplateSeed(
            String key,
            String name,
            String description,
            Double width,
            Double height,
            String type,
            Integer perPage,
            String barcodeFormat,
            Map<String, Object> fields) {
    }
}
