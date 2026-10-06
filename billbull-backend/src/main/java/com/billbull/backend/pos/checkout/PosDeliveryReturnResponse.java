package com.billbull.backend.pos.checkout;

import java.math.BigDecimal;

/**
 * What happened to a delivery order that was returned, as the till needs to report it.
 *
 * <p>{@code outstanding} and {@code orderClosed} are the two the cashier acts on, and they are
 * separate facts on purpose: an order can be fully returned and still owe a retained delivery
 * charge, in which case it stays in the list with that balance to collect. The till shows what
 * is left rather than assuming a return always ends the order.
 *
 * @param returnNumber    the credit note raised, for the receipt and the register
 * @param returnValue     the goods value credited back
 * @param fullReturn      true when every line came back in full
 * @param deliveryChargeWaived true when the charge was cancelled with the goods
 * @param outstanding     what the order still owes after the return
 * @param orderClosed     true when the order left the pending-delivery list
 */
public record PosDeliveryReturnResponse(
        String returnNumber,
        BigDecimal returnValue,
        boolean fullReturn,
        boolean deliveryChargeWaived,
        BigDecimal outstanding,
        boolean orderClosed) {
}
