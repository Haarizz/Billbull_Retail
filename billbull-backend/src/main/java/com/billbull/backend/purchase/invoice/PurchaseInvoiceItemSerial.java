package com.billbull.backend.purchase.invoice;

import java.time.LocalDate;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "purchase_invoice_item_serials", indexes = {
        @Index(name = "idx_pi_item_serial_invoice_item", columnList = "invoice_item_id"),
        @Index(name = "idx_pi_item_serial_serial", columnList = "serial_number")
})
public class PurchaseInvoiceItemSerial extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_item_id", nullable = false)
    private PurchaseInvoiceItem invoiceItem;

    @Column(name = "serial_number", nullable = false, length = 120)
    private String serialNumber;

    @Column(name = "manufacturing_date")
    private LocalDate manufacturingDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    public PurchaseInvoiceItem getInvoiceItem() {
        return invoiceItem;
    }

    public void setInvoiceItem(PurchaseInvoiceItem invoiceItem) {
        this.invoiceItem = invoiceItem;
    }

    public String getSerialNumber() {
        return serialNumber;
    }

    public void setSerialNumber(String serialNumber) {
        this.serialNumber = serialNumber;
    }

    public LocalDate getManufacturingDate() {
        return manufacturingDate;
    }

    public void setManufacturingDate(LocalDate manufacturingDate) {
        this.manufacturingDate = manufacturingDate;
    }

    public LocalDate getExpiryDate() {
        return expiryDate;
    }

    public void setExpiryDate(LocalDate expiryDate) {
        this.expiryDate = expiryDate;
    }
}
