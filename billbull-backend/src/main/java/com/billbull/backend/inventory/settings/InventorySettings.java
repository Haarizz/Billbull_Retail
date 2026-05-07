package com.billbull.backend.inventory.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "inventory_settings")
public class InventorySettings {

    @Id
    private Long id = 1L;

    @Column(name = "barcode_print_on_batch_create", nullable = false)
    private boolean barcodePrintOnBatchCreate = false;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public boolean isBarcodePrintOnBatchCreate() {
        return barcodePrintOnBatchCreate;
    }

    public void setBarcodePrintOnBatchCreate(boolean barcodePrintOnBatchCreate) {
        this.barcodePrintOnBatchCreate = barcodePrintOnBatchCreate;
    }
}
