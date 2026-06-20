package com.billbull.backend.pos.held;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

/**
 * A parked POS cart ("Hold"). Session-scoped: a held sale belongs to the POS session
 * it was parked in and is recalled only within that session. The cart payload is stored
 * opaquely as JSON (the live cart shape is rich and largely transient), with summary
 * columns for the recall list.
 */
@Entity
@Table(name = "pos_held_sales", indexes = {
    @Index(name = "idx_pos_held_session", columnList = "pos_session_id"),
    @Index(name = "idx_pos_held_branch",  columnList = "branch_id")
})
public class PosHeldSale extends BaseEntity {

    @Column(name = "pos_session_id")
    private Long posSessionId;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "terminal_id")
    private String terminalId;

    @Column(name = "cashier_name")
    private String cashierName;

    @Column(name = "label")
    private String label;

    @Column(name = "customer_code")
    private String customerCode;

    @Column(name = "customer_name")
    private String customerName;

    @Lob
    @Column(name = "cart_json", columnDefinition = "text")
    private String cartJson;

    @Column(name = "total")
    private Double total = 0.0;

    @Column(name = "item_count")
    private Integer itemCount = 0;

    // Getters & Setters

    public Long getPosSessionId() { return posSessionId; }
    public void setPosSessionId(Long posSessionId) { this.posSessionId = posSessionId; }

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
