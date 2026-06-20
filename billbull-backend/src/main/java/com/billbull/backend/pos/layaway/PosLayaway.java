package com.billbull.backend.pos.layaway;

import com.billbull.backend.common.BaseEntity;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * A POS layaway: a sale reserved for a customer with an optional deposit and a due
 * date, held until the customer collects (converting it into a real POS_SALE invoice).
 *
 * Deposits are tracked on this record only — there is no GL posting at creation; the
 * financials happen at conversion through the normal POS checkout. Batch/serial lines
 * reserve their specific scanned units at creation (via BatchSelectionService, source
 * type POS_LAYAWAY); normal products are deducted only when the conversion sale posts.
 */
@Entity
@Table(name = "pos_layaways", indexes = {
    @Index(name = "idx_pos_layaway_branch",   columnList = "branch_id"),
    @Index(name = "idx_pos_layaway_status",   columnList = "status"),
    @Index(name = "idx_pos_layaway_number",   columnList = "layaway_number")
})
public class PosLayaway extends BaseEntity {

    @Column(name = "layaway_number", unique = true, length = 40)
    private String layawayNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PosLayawayStatus status = PosLayawayStatus.ACTIVE;

    @Column(name = "customer_code")
    private String customerCode;

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "customer_phone")
    private String customerPhone;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name")
    private String branchName;

    @Column(name = "branch_code")
    private String branchCode;

    @Column(name = "pos_session_id")
    private Long posSessionId;

    @Column(name = "terminal_id")
    private String terminalId;

    @Column(name = "counter_name")
    private String counterName;

    @Column(name = "cashier_name")
    private String cashierName;

    @Column(name = "sale_total", precision = 15, scale = 2)
    private BigDecimal saleTotal = BigDecimal.ZERO;

    @Column(name = "tax_total", precision = 15, scale = 2)
    private BigDecimal taxTotal = BigDecimal.ZERO;

    @Column(name = "bill_discount_amount", precision = 15, scale = 2)
    private BigDecimal billDiscountAmount = BigDecimal.ZERO;

    @Column(name = "deposit_amount", precision = 15, scale = 2)
    private BigDecimal depositAmount = BigDecimal.ZERO;

    @Column(name = "deposit_payment_mode")
    private String depositPaymentMode;

    @Column(name = "deposit_required")
    private Boolean depositRequired = Boolean.FALSE;

    @Column(name = "balance_amount", precision = 15, scale = 2)
    private BigDecimal balanceAmount = BigDecimal.ZERO;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "remarks", length = 1000)
    private String remarks;

    /** The "Reserve Stock" toggle on the modal — records intent for reporting. */
    @Column(name = "reserve_stock_requested")
    private Boolean reserveStockRequested = Boolean.TRUE;

    @Column(name = "converted_invoice_id")
    private Long convertedInvoiceId;

    @Column(name = "converted_invoice_number")
    private String convertedInvoiceNumber;

    @Column(name = "converted_at")
    private LocalDateTime convertedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancelled_by")
    private String cancelledBy;

    @OneToMany(mappedBy = "posLayaway", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference
    private List<PosLayawayItem> items = new ArrayList<>();

    /**
     * Status as seen by the client: an ACTIVE/PARTIALLY_PAID/READY_TO_CONVERT layaway
     * that is past its due date reads as EXPIRED, without persisting the change.
     */
    @Transient
    public PosLayawayStatus getEffectiveStatus() {
        if (isOpen() && dueDate != null && dueDate.isBefore(LocalDate.now())) {
            return PosLayawayStatus.EXPIRED;
        }
        return status;
    }

    @Transient
    public boolean isOpen() {
        return status == PosLayawayStatus.ACTIVE
                || status == PosLayawayStatus.PARTIALLY_PAID
                || status == PosLayawayStatus.READY_TO_CONVERT;
    }

    // Getters & Setters

    public String getLayawayNumber() { return layawayNumber; }
    public void setLayawayNumber(String layawayNumber) { this.layawayNumber = layawayNumber; }

    public PosLayawayStatus getStatus() { return status; }
    public void setStatus(PosLayawayStatus status) { this.status = status; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }

    public String getBranchCode() { return branchCode; }
    public void setBranchCode(String branchCode) { this.branchCode = branchCode; }

    public Long getPosSessionId() { return posSessionId; }
    public void setPosSessionId(Long posSessionId) { this.posSessionId = posSessionId; }

    public String getTerminalId() { return terminalId; }
    public void setTerminalId(String terminalId) { this.terminalId = terminalId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public String getCashierName() { return cashierName; }
    public void setCashierName(String cashierName) { this.cashierName = cashierName; }

    public BigDecimal getSaleTotal() { return saleTotal; }
    public void setSaleTotal(BigDecimal saleTotal) { this.saleTotal = saleTotal; }

    public BigDecimal getTaxTotal() { return taxTotal; }
    public void setTaxTotal(BigDecimal taxTotal) { this.taxTotal = taxTotal; }

    public BigDecimal getBillDiscountAmount() { return billDiscountAmount; }
    public void setBillDiscountAmount(BigDecimal billDiscountAmount) { this.billDiscountAmount = billDiscountAmount; }

    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }

    public String getDepositPaymentMode() { return depositPaymentMode; }
    public void setDepositPaymentMode(String depositPaymentMode) { this.depositPaymentMode = depositPaymentMode; }

    public Boolean getDepositRequired() { return depositRequired; }
    public void setDepositRequired(Boolean depositRequired) { this.depositRequired = depositRequired; }

    public BigDecimal getBalanceAmount() { return balanceAmount; }
    public void setBalanceAmount(BigDecimal balanceAmount) { this.balanceAmount = balanceAmount; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public Boolean getReserveStockRequested() { return reserveStockRequested; }
    public void setReserveStockRequested(Boolean reserveStockRequested) { this.reserveStockRequested = reserveStockRequested; }

    public Long getConvertedInvoiceId() { return convertedInvoiceId; }
    public void setConvertedInvoiceId(Long convertedInvoiceId) { this.convertedInvoiceId = convertedInvoiceId; }

    public String getConvertedInvoiceNumber() { return convertedInvoiceNumber; }
    public void setConvertedInvoiceNumber(String convertedInvoiceNumber) { this.convertedInvoiceNumber = convertedInvoiceNumber; }

    public LocalDateTime getConvertedAt() { return convertedAt; }
    public void setConvertedAt(LocalDateTime convertedAt) { this.convertedAt = convertedAt; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }

    public List<PosLayawayItem> getItems() { return items; }
    public void setItems(List<PosLayawayItem> items) { this.items = items; }
}
