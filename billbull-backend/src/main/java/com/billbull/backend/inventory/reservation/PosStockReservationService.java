package com.billbull.backend.inventory.reservation;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Soft warehouse-level stock reservation for non-batch products, the counterpart to
 * {@code BatchSelectionService} for batch-controlled products. POS layaways/holds and
 * PI Flow Pro-forma Invoices out for delivery create reservations here. Never touches StockMovement/on-hand — a
 * reservation only affects the derived available = onHand - reserved computation
 * (see {@code WarehouseStockService}).
 */
@Service
@Transactional
public class PosStockReservationService {

    public static final String DOC_TYPE_POS_LAYAWAY = "POS_LAYAWAY";

    private final PosStockReservationRepository repo;

    public PosStockReservationService(PosStockReservationRepository repo) {
        this.repo = repo;
    }

    /** A POS Pro-forma Invoice out for delivery (PI Flow) — held until settlement converts it. */
    public static final String DOC_TYPE_POS_PROFORMA = "POS_PROFORMA";

    /** Reserve a non-batch layaway line against the given warehouse. */
    public PosStockReservation reserveForLayawayLine(
            Long layawayId, Long lineId, Long productId, String productCode,
            Long warehouseId, int quantity) {
        if (layawayId == null || lineId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved layaway and item are required");
        }
        return reserveForSourceLine(DOC_TYPE_POS_LAYAWAY, layawayId, lineId, productId, productCode,
                warehouseId, quantity);
    }

    /** Reserve a non-batch Pro-forma Invoice line against the given warehouse. */
    public PosStockReservation reserveForProformaLine(
            Long invoiceId, Long lineId, Long productId, String productCode,
            Long warehouseId, int quantity) {
        if (invoiceId == null || lineId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved pro-forma invoice and item are required");
        }
        return reserveForSourceLine(DOC_TYPE_POS_PROFORMA, invoiceId, lineId, productId, productCode,
                warehouseId, quantity);
    }

    private PosStockReservation reserveForSourceLine(
            String sourceDocumentType, Long sourceDocumentId, Long lineId, Long productId, String productCode,
            Long warehouseId, int quantity) {
        if (warehouseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No warehouse resolved for branch — cannot reserve stock for " + productCode);
        }
        if (quantity <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reservation quantity must be positive");
        }

        PosStockReservation reservation = new PosStockReservation();
        reservation.setSourceDocumentType(sourceDocumentType);
        reservation.setSourceDocumentId(sourceDocumentId);
        reservation.setSourceLineId(lineId);
        reservation.setProductId(productId);
        reservation.setProductCode(productCode);
        reservation.setWarehouseId(warehouseId);
        reservation.setQuantity(BigDecimal.valueOf(quantity));
        reservation.setStatus(PosStockReservationStatus.RESERVED);
        reservation.setReservedBy(currentUsername());
        reservation.setReservedAt(LocalDateTime.now());
        return repo.save(reservation);
    }

    /** Release every reservation held for a layaway (cancel / expire / convert / admin release). */
    public void releaseLayaway(Long layawayId) {
        releaseSourceDocument(DOC_TYPE_POS_LAYAWAY, layawayId);
    }

    public void releaseSourceDocument(String sourceDocumentType, Long sourceDocumentId) {
        List<PosStockReservation> reservations = repo.findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
                sourceDocumentType, sourceDocumentId, PosStockReservationStatus.RESERVED);
        LocalDateTime now = LocalDateTime.now();
        for (PosStockReservation reservation : reservations) {
            reservation.setStatus(PosStockReservationStatus.RELEASED);
            reservation.setReleasedAt(now);
        }
        repo.saveAll(reservations);
    }

    private String currentUsername() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "system";
    }
}
