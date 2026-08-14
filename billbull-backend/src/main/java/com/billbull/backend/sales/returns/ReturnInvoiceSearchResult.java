package com.billbull.backend.sales.returns;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One candidate invoice in the §8 "Find Original Invoice" search. Deliberately flat and
 * cheap: it carries only what the results list renders, so a search across a large invoice
 * table never serializes full item graphs.
 *
 * <p>{@link #returnEligible} is an advisory hint for the list UI. It is NOT authoritative —
 * the frontend must call the eligibility endpoint before opening the return, and the backend
 * revalidates again at confirmation (§9, §29).
 */
public class ReturnInvoiceSearchResult {

    public Long invoiceId;
    public String invoiceNumber;
    public String receiptNumber;
    public LocalDate invoiceDate;
    public String customerCode;
    public String customerName;
    public String customerMobile;
    public String branchName;
    public String salesperson;
    public String paymentMode;
    public BigDecimal invoiceTotal;
    public String status;
    public int itemCount;

    /** Units still returnable across the whole invoice; 0 means fully returned. */
    public int returnableQty;

    /** Units already returned on approved returns. */
    public int alreadyReturnedQty;

    /** Advisory only — see class javadoc. */
    public boolean returnEligible;

    /** Short human-readable reason when {@link #returnEligible} is false. */
    public String ineligibleReason;
}
