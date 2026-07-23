package com.billbull.backend.inventory.reservation;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A soft stock reservation for a non-batch product, held against a warehouse for the
 * lifetime of a source document (currently POS_LAYAWAY). Mirrors {@code BatchAllocation}
 * for batch-controlled products but carries no batch/bin — reservation is scoped to the
 * warehouse because POS checkout itself resolves branch -> default warehouse with no bin
 * selection. Creates no {@code StockMovement} row: reserved quantity only affects the
 * derived available = onHand - reserved computation, never on-hand itself.
 */
@Entity
@Table(name = "pos_stock_reservations", indexes = {
    @Index(name = "idx_pos_stock_reservation_source", columnList = "source_document_type, source_document_id, status"),
    @Index(name = "idx_pos_stock_reservation_source_line", columnList = "source_document_type, source_line_id, status"),
    @Index(name = "idx_pos_stock_reservation_product_warehouse", columnList = "product_id, warehouse_id, status")
})
public class PosStockReservation extends BaseEntity {

    @Column(name = "source_document_type", nullable = false, length = 40)
    private String sourceDocumentType;

    @Column(name = "source_document_id", nullable = false)
    private Long sourceDocumentId;

    @Column(name = "source_line_id", nullable = false)
    private Long sourceLineId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_code", nullable = false, length = 80)
    private String productCode;

    @Column(name = "warehouse_id", nullable = false)
    private Long warehouseId;

    @Column(nullable = false, precision = 18, scale = 3)
    private BigDecimal quantity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosStockReservationStatus status = PosStockReservationStatus.RESERVED;

    @Column(name = "reserved_by", length = 120)
    private String reservedBy;

    @Column(name = "reserved_at", nullable = false)
    private LocalDateTime reservedAt;

    @Column(name = "released_at")
    private LocalDateTime releasedAt;

    public String getSourceDocumentType() { return sourceDocumentType; }
    public void setSourceDocumentType(String sourceDocumentType) { this.sourceDocumentType = sourceDocumentType; }

    public Long getSourceDocumentId() { return sourceDocumentId; }
    public void setSourceDocumentId(Long sourceDocumentId) { this.sourceDocumentId = sourceDocumentId; }

    public Long getSourceLineId() { return sourceLineId; }
    public void setSourceLineId(Long sourceLineId) { this.sourceLineId = sourceLineId; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getProductCode() { return productCode; }
    public void setProductCode(String productCode) { this.productCode = productCode; }

    public Long getWarehouseId() { return warehouseId; }
    public void setWarehouseId(Long warehouseId) { this.warehouseId = warehouseId; }

    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }

    public PosStockReservationStatus getStatus() { return status; }
    public void setStatus(PosStockReservationStatus status) { this.status = status; }

    public String getReservedBy() { return reservedBy; }
    public void setReservedBy(String reservedBy) { this.reservedBy = reservedBy; }

    public LocalDateTime getReservedAt() { return reservedAt; }
    public void setReservedAt(LocalDateTime reservedAt) { this.reservedAt = reservedAt; }

    public LocalDateTime getReleasedAt() { return releasedAt; }
    public void setReleasedAt(LocalDateTime releasedAt) { this.releasedAt = releasedAt; }
}
