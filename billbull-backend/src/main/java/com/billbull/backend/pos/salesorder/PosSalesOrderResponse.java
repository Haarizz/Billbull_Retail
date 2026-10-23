package com.billbull.backend.pos.salesorder;

import com.billbull.backend.sales.salesorder.SalesOrder;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

import java.math.BigDecimal;

/**
 * A Sales Order as POS → Orders lists it: the order itself (serialized flat, exactly as the Sales
 * Order API returns it) plus the advance still open on it, which the till deducts from what it
 * collects so the customer is never asked for the same money twice.
 */
public class PosSalesOrderResponse {

    @JsonUnwrapped
    private final SalesOrder order;

    /** Advance received on the order and not yet applied to any invoice. */
    private final BigDecimal openAdvance;

    public PosSalesOrderResponse(SalesOrder order, BigDecimal openAdvance) {
        this.order = order;
        this.openAdvance = openAdvance != null ? openAdvance : BigDecimal.ZERO;
    }

    public SalesOrder getOrder() { return order; }

    public BigDecimal getOpenAdvance() { return openAdvance; }

    /** True when the order is to be delivered, which the till fulfils through Process Delivery
     *  and Delivery Settlement instead of a checkout. Only an explicit "Delivery" counts: the Sales
     *  Order editor always saves a type, while the till's own "Save as Order" saves none. */
    public boolean isDeliveryOrder() {
        return order.getDeliveryType() != null && "delivery".equalsIgnoreCase(order.getDeliveryType().trim());
    }
}
