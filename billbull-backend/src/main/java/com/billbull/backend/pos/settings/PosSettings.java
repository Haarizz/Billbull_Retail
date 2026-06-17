package com.billbull.backend.pos.settings;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "pos_settings")
public class PosSettings extends BaseEntity {

    @Column(name = "branch_id", unique = true)
    private Long branchId;

    // Session & terminal
    @Column(name = "max_terminals_per_branch")
    private Integer maxTerminalsPerBranch = 5;

    // Supervisor approval
    @Column(name = "require_supervisor_for_void")
    private Boolean requireSupervisorForVoid = false;

    @Column(name = "supervisor_approval_mode", length = 20)
    private String supervisorApprovalMode = "PIN"; // PIN or PASSWORD

    @Column(name = "supervisor_pin", length = 100)
    private String supervisorPin;

    // Void behavior
    @Column(name = "void_mode", length = 20)
    private String voidMode = "VOID"; // VOID = strikethrough, DELETE = remove

    // Cart view
    @Column(name = "cart_view_mode", length = 20)
    private String cartViewMode = "MINIMAL"; // MINIMAL or DETAILED

    // Price check
    @Column(name = "price_check_show_stock")
    private Boolean priceCheckShowStock = true;

    // Z-Report control
    @Column(name = "z_report_access", length = 30)
    private String zReportAccess = "SUPERVISOR"; // ANY, SUPERVISOR, MAIN_POS

    // Cash drawer triggers (comma-separated list)
    @Column(name = "cash_drawer_triggers", length = 500)
    private String cashDrawerTriggers = "CASH_PAYMENT,RECEIPT_PRINT";

    // Receipt sharing
    @Column(name = "receipt_share_enabled")
    private Boolean receiptShareEnabled = true;

    @Column(name = "receipt_share_whatsapp")
    private Boolean receiptShareWhatsapp = true;

    @Column(name = "receipt_share_sms")
    private Boolean receiptShareSms = true;

    @Column(name = "receipt_share_email")
    private Boolean receiptShareEmail = true;

    // POS layout
    @Column(name = "default_layout", length = 20)
    private String defaultLayout = "classic"; // classic or focus

    // Walk-in customer code
    @Column(name = "walk_in_customer_code", length = 50)
    private String walkInCustomerCode = "WALK-IN";

    // Auto-print receipt after payment
    @Column(name = "auto_print_receipt")
    private Boolean autoPrintReceipt = false;

    // Tax inclusive pricing
    @Column(name = "tax_inclusive")
    private Boolean taxInclusive = false;

    // Default tax rate
    @Column(name = "default_tax_rate")
    private Double defaultTaxRate = 5.0;

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public Integer getMaxTerminalsPerBranch() { return maxTerminalsPerBranch; }
    public void setMaxTerminalsPerBranch(Integer maxTerminalsPerBranch) { this.maxTerminalsPerBranch = maxTerminalsPerBranch; }

    public Boolean getRequireSupervisorForVoid() { return requireSupervisorForVoid; }
    public void setRequireSupervisorForVoid(Boolean requireSupervisorForVoid) { this.requireSupervisorForVoid = requireSupervisorForVoid; }

    public String getSupervisorApprovalMode() { return supervisorApprovalMode; }
    public void setSupervisorApprovalMode(String supervisorApprovalMode) { this.supervisorApprovalMode = supervisorApprovalMode; }

    public String getSupervisorPin() { return supervisorPin; }
    public void setSupervisorPin(String supervisorPin) { this.supervisorPin = supervisorPin; }

    public String getVoidMode() { return voidMode; }
    public void setVoidMode(String voidMode) { this.voidMode = voidMode; }

    public String getCartViewMode() { return cartViewMode; }
    public void setCartViewMode(String cartViewMode) { this.cartViewMode = cartViewMode; }

    public Boolean getPriceCheckShowStock() { return priceCheckShowStock; }
    public void setPriceCheckShowStock(Boolean priceCheckShowStock) { this.priceCheckShowStock = priceCheckShowStock; }

    public String getZReportAccess() { return zReportAccess; }
    public void setZReportAccess(String zReportAccess) { this.zReportAccess = zReportAccess; }

    public String getCashDrawerTriggers() { return cashDrawerTriggers; }
    public void setCashDrawerTriggers(String cashDrawerTriggers) { this.cashDrawerTriggers = cashDrawerTriggers; }

    public Boolean getReceiptShareEnabled() { return receiptShareEnabled; }
    public void setReceiptShareEnabled(Boolean receiptShareEnabled) { this.receiptShareEnabled = receiptShareEnabled; }

    public Boolean getReceiptShareWhatsapp() { return receiptShareWhatsapp; }
    public void setReceiptShareWhatsapp(Boolean receiptShareWhatsapp) { this.receiptShareWhatsapp = receiptShareWhatsapp; }

    public Boolean getReceiptShareSms() { return receiptShareSms; }
    public void setReceiptShareSms(Boolean receiptShareSms) { this.receiptShareSms = receiptShareSms; }

    public Boolean getReceiptShareEmail() { return receiptShareEmail; }
    public void setReceiptShareEmail(Boolean receiptShareEmail) { this.receiptShareEmail = receiptShareEmail; }

    public String getDefaultLayout() { return defaultLayout; }
    public void setDefaultLayout(String defaultLayout) { this.defaultLayout = defaultLayout; }

    public String getWalkInCustomerCode() { return walkInCustomerCode; }
    public void setWalkInCustomerCode(String walkInCustomerCode) { this.walkInCustomerCode = walkInCustomerCode; }

    public Boolean getAutoPrintReceipt() { return autoPrintReceipt; }
    public void setAutoPrintReceipt(Boolean autoPrintReceipt) { this.autoPrintReceipt = autoPrintReceipt; }

    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }

    public Double getDefaultTaxRate() { return defaultTaxRate; }
    public void setDefaultTaxRate(Double defaultTaxRate) { this.defaultTaxRate = defaultTaxRate; }
}
