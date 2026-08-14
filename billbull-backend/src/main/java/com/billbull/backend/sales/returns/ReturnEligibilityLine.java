package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * One sold line on the original invoice, with the quantities the §10 left-hand "Sold Items"
 * pane renders and the returnable ceiling the §11 scan workflow enforces.
 *
 * <p>All money fields are the ORIGINAL invoice values, not recomputed. §13 requires the
 * return to reverse what was actually charged, so VAT and discount come from the invoice
 * line rather than from any rate applied at return time.
 */
public class ReturnEligibilityLine {

    public Long invoiceItemId;
    public String itemCode;
    public String itemName;
    public String barcode;
    public String unit;

    /** Quantity originally sold on this line. */
    public int soldQty;

    /** Quantity already returned across all non-draft, non-rejected returns. */
    public int returnedQty;

    /** soldQty − returnedQty, floored at 0. The scan workflow's hard ceiling. */
    public int availableQty;

    // ----- Original invoice money, per unit and per line -----

    /** Unit price as invoiced. */
    public BigDecimal unitPrice;

    /** Discount amount on the whole original line (not per unit). */
    public BigDecimal lineDiscount;

    /** VAT amount on the whole original line. */
    public BigDecimal lineVat;

    /** Net line total as invoiced. */
    public BigDecimal lineTotal;

    /** VAT rate applied on the original line, carried so the return reverses the same rate. */
    public Double taxRate;

    /** True when the invoice was priced VAT-inclusive; drives how the reversal is derived. */
    public boolean taxInclusive;

    /**
     * AVAILABLE / PARTIAL / RETURNED — the §10 status pill. Derived here rather than in the
     * UI so both entry points and any report show the same classification.
     */
    public String status;

    /** True when the product is batch-controlled and requires batch selection to return. */
    public boolean batchControlled;

    /** True when the line carried a serial number that must be matched on return. */
    public boolean serialControlled;

    /** Returnable batch lots for a batch-controlled line; empty otherwise. */
    public List<ReturnableBatchResponse> batches = new ArrayList<>();

    /** True when this specific line cannot be returned at all (e.g. it was voided). */
    public boolean lineBlocked;

    public String lineBlockedReason;

    /** Computes the §10 status pill from the quantities. */
    public void resolveStatus() {
        if (returnedQty <= 0) {
            status = "AVAILABLE";
        } else if (returnedQty >= soldQty) {
            status = "RETURNED";
        } else {
            status = "PARTIAL";
        }
    }
}
