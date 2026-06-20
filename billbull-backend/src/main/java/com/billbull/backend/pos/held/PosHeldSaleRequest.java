package com.billbull.backend.pos.held;

/** Request to park (hold) the current POS cart for the active session. */
public class PosHeldSaleRequest {

    private Long sessionId;
    private Long branchId;
    private String terminalId;
    private String cashierName;
    private String label;
    private String customerCode;
    private String customerName;
    /** Opaque JSON snapshot of the live cart (currentInvoice). */
    private String cartJson;
    private Double total;
    private Integer itemCount;

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }
    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCartJson() { return cartJson; }
    public void setCartJson(String cartJson) { this.cartJson = cartJson; }
    public Double getTotal() { return total; }
    public void setTotal(Double total) { this.total = total; }
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }
}
