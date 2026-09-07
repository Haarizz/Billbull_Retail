package com.billbull.backend.purchase.batch;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.billbull.backend.inventory.product.Product;

/**
 * Normalisation and validation for batch/expiry lots captured on purchase documents.
 *
 * The rules here are not new business rules — they are the receiving-side counterpart of rules
 * that already exist elsewhere:
 *
 *  - "expiry-controlled means an expiry date is mandatory" mirrors StockTakeService.addBatch,
 *    which rejects a counted batch with no expiry when item.isExpiryEnabled().
 *  - "a product is lot-tracked when it is batch-controlled OR expiry-controlled" mirrors
 *    StockTakeService's isBatchEnabled() || isExpiryEnabled() test. Without this, an
 *    expiry-controlled-but-not-batch-controlled product would have nowhere to carry its expiry.
 *  - "already-expired stock cannot enter inventory" is the receiving-side complement of
 *    BatchSelectionService.blockedReason, which refuses to sell a batch whose expiry has passed.
 *    Receiving it would create stock that can never be issued and can only be written off.
 *    Stock below minExpiryDaysForSale is deliberately NOT blocked on receipt — that is a
 *    sale-time eligibility rule, and blocking short-shelf-life goods at the door would reject
 *    legitimate deliveries. The UI surfaces it as a warning instead.
 */
@Service
public class PurchaseBatchLotService {

    /**
     * A product needs per-unit lot identity when it is batch-controlled or expiry-controlled.
     * Same predicate stock-taking uses, so both modules agree on which products carry batches.
     */
    public boolean isLotTracked(Product product) {
        return product != null && (product.isBatch() || product.isExpiryEnabled());
    }

    public boolean requiresExpiry(Product product) {
        return product != null && product.isExpiryEnabled();
    }

    /** Trim, and drop UI rows that carry no lot information at all. */
    public List<PurchaseBatchLotDraft> normalizeDrafts(List<PurchaseBatchLotDraft> drafts) {
        if (drafts == null || drafts.isEmpty()) {
            return List.of();
        }
        List<PurchaseBatchLotDraft> normalized = new ArrayList<>(drafts.size());
        for (PurchaseBatchLotDraft draft : drafts) {
            if (draft == null) {
                continue;
            }
            int quantity = draft.getQuantity() != null ? draft.getQuantity() : 0;
            String batchNumber = draft.getBatchNumber() != null ? draft.getBatchNumber().trim() : null;
            if (batchNumber != null && batchNumber.isEmpty()) {
                batchNumber = null;
            }
            // A row with no quantity, no expiry and no batch number is an empty UI row, not a lot.
            if (quantity <= 0 && draft.getExpiryDate() == null && batchNumber == null) {
                continue;
            }
            PurchaseBatchLotDraft copy = new PurchaseBatchLotDraft();
            copy.setId(draft.getId());
            copy.setBatchNumber(batchNumber);
            copy.setManufacturingDate(draft.getManufacturingDate());
            copy.setExpiryDate(draft.getExpiryDate());
            copy.setQuantity(quantity);
            normalized.add(copy);
        }
        return normalized;
    }

    /**
     * Save-time validation. Lenient about completeness so a half-entered draft can still be saved,
     * strict about anything that is already wrong.
     */
    public void validateForCapture(Product product, List<PurchaseBatchLotDraft> lots, int baseQty, String context) {
        if (lots == null || lots.isEmpty()) {
            return;
        }
        if (!isLotTracked(product)) {
            throw new IllegalArgumentException(
                    "Batch/expiry lots were supplied for " + context + " but product '"
                            + productCode(product) + "' is neither batch-controlled nor expiry-controlled.");
        }

        int total = 0;
        Set<String> identities = new HashSet<>();
        for (PurchaseBatchLotDraft lot : lots) {
            int quantity = lot.getQuantity() != null ? lot.getQuantity() : 0;
            if (quantity <= 0) {
                throw new IllegalArgumentException(
                        "Batch quantity must be positive for " + context + " (product '"
                                + productCode(product) + "').");
            }
            if (lot.getManufacturingDate() != null && lot.getExpiryDate() != null
                    && !lot.getExpiryDate().isAfter(lot.getManufacturingDate())) {
                throw new IllegalArgumentException(
                        "Expiry date " + lot.getExpiryDate() + " must be after the manufacturing date "
                                + lot.getManufacturingDate() + " for " + context + " (product '"
                                + productCode(product) + "').");
            }
            // Two lots on one line carrying the same batch number and expiry are the same lot
            // recorded twice — merging them silently would hide a data-entry mistake.
            String identity = (lot.getBatchNumber() == null ? "" : lot.getBatchNumber().toUpperCase())
                    + "|" + (lot.getExpiryDate() == null ? "" : lot.getExpiryDate());
            if (!identities.add(identity)) {
                throw new IllegalArgumentException(
                        "Duplicate batch/expiry lot on " + context + " for product '"
                                + productCode(product) + "'"
                                + (lot.getBatchNumber() != null ? " (batch " + lot.getBatchNumber() + ")" : "")
                                + (lot.getExpiryDate() != null ? " expiring " + lot.getExpiryDate() : "")
                                + ". Combine them into a single lot with the total quantity.");
            }
            total += quantity;
        }

        if (baseQty > 0 && total != baseQty) {
            throw new IllegalArgumentException(
                    "Batch quantities for " + context + " (product '" + productCode(product) + "') total "
                            + total + " but the line receives " + baseQty + " units. They must match.");
        }
    }

    /**
     * Post-time validation, run immediately before stock is posted. This is where completeness is
     * enforced: after this point the batch identity is written into the stock ledger and can only
     * be corrected by a reversal.
     */
    public void validateForPosting(
            Product product,
            List<PurchaseBatchLotDraft> lots,
            int baseQty,
            LocalDate receiptDate,
            String context) {

        if (baseQty <= 0 || !isLotTracked(product)) {
            return;
        }

        List<PurchaseBatchLotDraft> normalized = normalizeDrafts(lots);
        if (requiresExpiry(product) && normalized.isEmpty()) {
            throw new IllegalStateException(
                    "Product '" + productCode(product) + "' is expiry-controlled. Enter the batch and "
                            + "expiry date for " + context + " before posting stock.");
        }
        if (normalized.isEmpty()) {
            // Batch-controlled but not expiry-controlled, and nothing captured: the auto-generated
            // single lot is still a valid identity, so this stays permitted (pre-existing behaviour).
            return;
        }

        validateForCapture(product, normalized, baseQty, context);

        LocalDate today = receiptDate != null ? receiptDate : LocalDate.now();
        for (PurchaseBatchLotDraft lot : normalized) {
            if (requiresExpiry(product) && lot.getExpiryDate() == null) {
                throw new IllegalStateException(
                        "Expiry date is required for every batch of expiry-controlled product '"
                                + productCode(product) + "' on " + context + ".");
            }
            if (lot.getExpiryDate() != null && lot.getExpiryDate().isBefore(today)) {
                throw new IllegalStateException(
                        "Batch " + (lot.getBatchNumber() != null ? lot.getBatchNumber() + " " : "")
                                + "of product '" + productCode(product) + "' on " + context
                                + " expired on " + lot.getExpiryDate()
                                + ". Expired stock cannot be received into inventory.");
            }
        }

        int total = normalized.stream().mapToInt(l -> l.getQuantity() != null ? l.getQuantity() : 0).sum();
        if (total != baseQty) {
            throw new IllegalStateException(
                    "Batch quantities for " + context + " (product '" + productCode(product) + "') total "
                            + total + " but " + baseQty + " units are being received.");
        }
    }

    /** Build a draft from persisted lot columns, for reading a saved document back into the UI. */
    public PurchaseBatchLotDraft toDraft(Long id, String batchNumber, LocalDate manufacturingDate,
                                         LocalDate expiryDate, Integer quantity) {
        PurchaseBatchLotDraft draft = new PurchaseBatchLotDraft();
        draft.setId(id);
        draft.setBatchNumber(batchNumber);
        draft.setManufacturingDate(manufacturingDate);
        draft.setExpiryDate(expiryDate);
        draft.setQuantity(quantity);
        return draft;
    }

    private String productCode(Product product) {
        return product != null && product.getCode() != null ? product.getCode() : "?";
    }
}
