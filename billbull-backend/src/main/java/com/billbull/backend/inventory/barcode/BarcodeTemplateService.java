package com.billbull.backend.inventory.barcode;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BarcodeTemplateService {

    private final BarcodeTemplateRepository repository;

    public BarcodeTemplateService(BarcodeTemplateRepository repository) {
        this.repository = repository;
    }

    public List<BarcodeTemplate> getAll() {
        // Here we could seed system templates if empty, but for now just return what's in DB
        return repository.findAll();
    }

    public BarcodeTemplate create(BarcodeTemplate template) {
        template.setSystem(false); // User created templates are never system
        return repository.save(template);
    }

    public BarcodeTemplate update(Long id, BarcodeTemplate updates) {
        BarcodeTemplate existing = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found"));
        
        if (existing.isSystem()) {
            // Allow updating system templates? Usually no, but maybe width/height tuning? 
            // For safety, let's say NO for now, or restriction on name change?
            // User requirement: "cannot delete system templates". Didn't say cannot edit.
            // But usually system templates should be immutable or reset-table. 
            // Let's allow edit but keep isSystem=true. 
        }

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
}
