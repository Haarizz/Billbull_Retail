package com.billbull.backend.pos.checkout;

import java.util.List;

/**
 * What the till sends to return a delivery order from POS Delivery Settlement.
 *
 * <p>Deliberately small. There is no refund method, because an unpaid return has only one legal
 * settlement and the server picks it (see {@link PosDeliveryReturnService}); no amounts, because
 * every figure is pro-rated server-side from the invoice the customer was actually billed; and
 * no return date, because it is the accounting date of a credit note and the server stamps it
 * from the session business day. A till that computed any of those could disagree with the
 * invoice it is crediting.
 */
public class PosDeliveryReturnRequest {

    /** Why the goods came back — a {@code SalesReturnReasonCode} name. Defaults to CUSTOMER_RETURN. */
    private String reason;

    /** Condition of the goods, a {@code SalesReturnCondition} name. Defaults to GOOD, which restocks. */
    private String condition;

    /** Free-text note from the cashier, kept on the return header and each line. */
    private String remarks;

    /**
     * Which items are coming back. Empty or absent means the whole order, which is the common
     * case — the customer refused the delivery outright.
     */
    private List<Line> lines;

    /**
     * The cashier answer to the delivery charge, honoured only when the branch policy is ASK.
     * Null means waive, matching the ASK default.
     */
    private Boolean waiveDeliveryCharge;

    private Long sessionId;
    private String terminalId;
    private String counterName;

    /**
     * Supervisor credentials, forwarded to the returns engine. Required only when the standard
     * return authorization policy flags this return for sign-off — the same rule, and the same
     * threshold, as a return raised anywhere else.
     */
    private String supervisorUsername;
    private String supervisorPassword;

    /** One line of a partial return. Quantity only — the money is derived from the invoice. */
    public static class Line {
        private String itemCode;
        private Integer returnQty;

        public String getItemCode() { return itemCode; }
        public void setItemCode(String itemCode) { this.itemCode = itemCode; }
        public Integer getReturnQty() { return returnQty; }
        public void setReturnQty(Integer returnQty) { this.returnQty = returnQty; }
    }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
    public List<Line> getLines() { return lines; }
    public void setLines(List<Line> lines) { this.lines = lines; }
    public Boolean getWaiveDeliveryCharge() { return waiveDeliveryCharge; }
    public void setWaiveDeliveryCharge(Boolean waiveDeliveryCharge) { this.waiveDeliveryCharge = waiveDeliveryCharge; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }
    public String getSupervisorUsername() { return supervisorUsername; }
    public void setSupervisorUsername(String supervisorUsername) { this.supervisorUsername = supervisorUsername; }
    public String getSupervisorPassword() { return supervisorPassword; }
    public void setSupervisorPassword(String supervisorPassword) { this.supervisorPassword = supervisorPassword; }
}
