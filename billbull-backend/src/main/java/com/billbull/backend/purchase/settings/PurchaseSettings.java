package com.billbull.backend.purchase.settings;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.util.ArrayList;
import java.util.List;

/**
 * Singleton entity: always ONE row with id = 1.
 * Stores global configuration for the Purchase module.
 *
 * Currently the only persisted concern is document numbering, which lives in its
 * own table ({@link PurchaseDocumentNumberSetting}) and is exposed here as a
 * transient list so the frontend can read/write it through one settings payload.
 */
@Entity
@Table(name = "purchase_settings")
public class PurchaseSettings {

    @Id
    private Long id = 1L;

    @Transient
    private List<PurchaseDocumentNumberSetting> documentNumbering = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public List<PurchaseDocumentNumberSetting> getDocumentNumbering() {
        return documentNumbering;
    }

    public void setDocumentNumbering(List<PurchaseDocumentNumberSetting> documentNumbering) {
        this.documentNumbering = documentNumbering;
    }
}
