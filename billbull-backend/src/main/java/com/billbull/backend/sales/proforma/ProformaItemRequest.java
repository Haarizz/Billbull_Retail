package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;

public class ProformaItemRequest {
    public String itemCode;
    public String barcode;
    public String description;
    public String unit;
    public BigDecimal quantity;
    public BigDecimal price;
    public BigDecimal taxPercent;
    public Integer foc;
}