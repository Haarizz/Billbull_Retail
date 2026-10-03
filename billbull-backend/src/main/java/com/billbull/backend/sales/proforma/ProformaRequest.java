package com.billbull.backend.sales.proforma;

import java.time.LocalDate;
import java.util.List;
import java.math.BigDecimal;

public class ProformaRequest {

    public String piNumber;
    public LocalDate piDate;
    public LocalDate validUntil;

    public Long customerId;
    public String customerCode;
    public String customerName;
    public String customerTrn;

    public String quotationNo;
    public String salesOrderNo;

    public String paymentMethod;
    public BigDecimal advancePaid;
    public String paymentReference;
    public String paymentNotes;
    /** Footer discount percentage (used when billDiscountType is "percent" or absent). */
    public BigDecimal billDiscount;
    /** "percent" (default) or "amount". */
    public String billDiscountType;
    /** The fixed footer amount when billDiscountType is "amount". */
    public BigDecimal billDiscountAmount;
    public Boolean taxInclusive;

    public List<ProformaItemRequest> items;
}
