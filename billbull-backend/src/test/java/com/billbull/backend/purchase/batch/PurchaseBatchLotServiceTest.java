package com.billbull.backend.purchase.batch;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.product.Product;

/**
 * The receiving-side batch/expiry rules. These mirror rules that already exist on the counting
 * side (StockTakeService) and the selling side (BatchSelectionService); the tests state which,
 * so a change to one is visibly a change to the pair.
 */
class PurchaseBatchLotServiceTest {

    private final PurchaseBatchLotService service = new PurchaseBatchLotService();

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 2);

    // ── Which products are lot-tracked ──────────────────────────────────────────────────────

    @Test
    void batchControlledProductIsLotTracked() {
        assertTrue(service.isLotTracked(product(true, false)));
    }

    @Test
    void expiryControlledProductIsLotTrackedEvenWithoutTheBatchFlag() {
        // Same predicate as StockTakeService: isBatchEnabled() || isExpiryEnabled().
        assertTrue(service.isLotTracked(product(false, true)));
    }

    @Test
    void plainProductIsNotLotTracked() {
        assertFalse(service.isLotTracked(product(false, false)));
    }

    // ── Normalisation ───────────────────────────────────────────────────────────────────────

    @Test
    void emptyUiRowsAreDropped() {
        List<PurchaseBatchLotDraft> normalized = service.normalizeDrafts(List.of(
                lot("  ", null, 0),
                lot("LOT-1", TODAY.plusMonths(6), 4)));

        assertEquals(1, normalized.size());
        assertEquals("LOT-1", normalized.get(0).getBatchNumber());
    }

    @Test
    void blankBatchNumberBecomesNullSoAnIdentityIsGenerated() {
        List<PurchaseBatchLotDraft> normalized = service.normalizeDrafts(List.of(
                lot("   ", TODAY.plusMonths(6), 2)));

        assertEquals(1, normalized.size());
        assertEquals(null, normalized.get(0).getBatchNumber());
    }

    // ── Capture-time (save) validation ──────────────────────────────────────────────────────

    @Test
    void lotsOnANonTrackedProductAreRejected() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.validateForCapture(product(false, false),
                        List.of(lot(null, TODAY.plusMonths(2), 3)), 3, "test line"));
        assertTrue(error.getMessage().contains("neither batch-controlled nor expiry-controlled"));
    }

    @Test
    void lotQuantitiesMustTotalTheLineQuantity() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.validateForCapture(product(true, false),
                        List.of(lot(null, TODAY.plusMonths(2), 2)), 5, "test line"));
        assertTrue(error.getMessage().contains("total 2"), error.getMessage());
    }

    @Test
    void twoLotsWithTheSameBatchNumberAndExpiryAreRejectedAsADuplicate() {
        // Mirrors StockTakeService, which rejects a second counted row with the same
        // (batch number, expiry) identity on one item.
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.validateForCapture(product(true, true),
                        List.of(lot("LOT-A", TODAY.plusMonths(4), 2),
                                lot("LOT-A", TODAY.plusMonths(4), 3)),
                        5, "test line"));
        assertTrue(error.getMessage().contains("Duplicate batch/expiry lot"));
    }

    @Test
    void theSameBatchNumberWithDifferentExpiryDatesIsAllowed() {
        // Distinct inventory lots: same supplier lot code, different shelf life.
        assertDoesNotThrow(() -> service.validateForCapture(product(true, true),
                List.of(lot("LOT-A", TODAY.plusMonths(4), 2),
                        lot("LOT-A", TODAY.plusMonths(9), 3)),
                5, "test line"));
    }

    @Test
    void expiryOnOrBeforeTheManufacturingDateIsRejected() {
        PurchaseBatchLotDraft lot = lot("LOT-A", TODAY.plusMonths(2), 3);
        lot.setManufacturingDate(TODAY.plusMonths(2));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.validateForCapture(product(true, true), List.of(lot), 3, "test line"));
        assertTrue(error.getMessage().contains("must be after the manufacturing date"));
    }

    @Test
    void aHalfEnteredDraftWithNoLotsSavesWithoutComplaint() {
        assertDoesNotThrow(() -> service.validateForCapture(product(true, true), List.of(), 5, "test line"));
    }

    // ── Post-time validation ────────────────────────────────────────────────────────────────

    @Test
    void expiryControlledProductCannotPostWithoutAnyLots() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.validateForPosting(product(true, true), List.of(), 4, TODAY, "test line"));
        assertTrue(error.getMessage().contains("expiry-controlled"));
    }

    @Test
    void expiryControlledProductCannotPostWithALotMissingItsExpiry() {
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.validateForPosting(product(true, true),
                        List.of(lot("LOT-A", null, 4)), 4, TODAY, "test line"));
        assertTrue(error.getMessage().contains("Expiry date is required"));
    }

    @Test
    void alreadyExpiredStockCannotBeReceived() {
        // Complement of BatchSelectionService.blockedReason: stock that has expired can never be
        // issued, so receiving it would only create a write-off.
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.validateForPosting(product(true, true),
                        List.of(lot("LOT-A", TODAY.minusDays(1), 4)), 4, TODAY, "test line"));
        assertTrue(error.getMessage().contains("Expired stock cannot be received"));
    }

    @Test
    void stockExpiringTodayitselfIsStillReceivable() {
        assertDoesNotThrow(() -> service.validateForPosting(product(true, true),
                List.of(lot("LOT-A", TODAY, 4)), 4, TODAY, "test line"));
    }

    @Test
    void nearExpiryStockBelowMinimumShelfLifeIsNotBlockedOnReceipt() {
        // minExpiryDaysForSale is a sale-time eligibility rule (BatchSelectionService), not a
        // receiving rule: short-dated deliveries are legitimate and the UI warns instead.
        Product product = product(true, true);
        product.setMinExpiryDaysForSale(90);

        assertDoesNotThrow(() -> service.validateForPosting(product,
                List.of(lot("LOT-A", TODAY.plusDays(10), 4)), 4, TODAY, "test line"));
    }

    @Test
    void batchOnlyProductCanStillPostWithNoLotsCaptured() {
        // Pre-existing behaviour: the auto-generated single lot is a valid identity.
        assertDoesNotThrow(() -> service.validateForPosting(product(true, false),
                List.of(), 4, TODAY, "test line"));
    }

    @Test
    void plainProductSkipsLotValidationEntirely() {
        assertDoesNotThrow(() -> service.validateForPosting(product(false, false),
                List.of(), 4, TODAY, "test line"));
    }

    private Product product(boolean batchControlled, boolean expiryControlled) {
        Product product = new Product();
        product.setCode("CODE-10");
        product.setBatch(batchControlled);
        product.setExpiryEnabled(expiryControlled);
        return product;
    }

    private PurchaseBatchLotDraft lot(String batchNumber, LocalDate expiryDate, int quantity) {
        PurchaseBatchLotDraft draft = new PurchaseBatchLotDraft();
        draft.setBatchNumber(batchNumber);
        draft.setExpiryDate(expiryDate);
        draft.setQuantity(quantity);
        return draft;
    }
}
