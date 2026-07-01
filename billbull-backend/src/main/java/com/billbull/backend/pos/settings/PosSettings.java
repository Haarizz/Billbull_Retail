package com.billbull.backend.pos.settings;

import com.fasterxml.jackson.annotation.JsonProperty;
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

    // Detailed cart view — per-field toggles (only honored when cartViewMode = DETAILED)
    @Column(name = "cart_show_barcode")
    private Boolean cartShowBarcode = true;

    @Column(name = "cart_show_product_code")
    private Boolean cartShowProductCode = true;

    @Column(name = "cart_show_batch_number")
    private Boolean cartShowBatchNumber = true;

    @Column(name = "cart_show_serial_number")
    private Boolean cartShowSerialNumber = false;

    @Column(name = "cart_show_expiry_date")
    private Boolean cartShowExpiryDate = false;

    // Price check
    @Column(name = "price_check_show_stock")
    private Boolean priceCheckShowStock = true;

    // Z-Report control
    @Column(name = "z_report_access", length = 30)
    private String zReportAccess = "SUPERVISOR"; // ANY, SUPERVISOR, MAIN_POS

    // Cash drawer triggers — comma-separated subset of the supported keys below.
    // The drawer opens only for events whose key is present in this list.
    // Supported keys:
    //   CASH_PAYMENT     — successful cash payment completion
    //   RECEIPT_PRINT    — receipt printing
    //   CHANGE_RETURN    — change return transaction
    //   CASH_SETTLEMENT  — cash settlement selection
    //   CASH_DROP        — cash drop
    //   CASH_OUT         — cash out
    //   MANUAL_OPEN      — manual supervisor open
    @Column(name = "cash_drawer_triggers", length = 500)
    private String cashDrawerTriggers = "CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN";

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
    private String defaultLayout = "classic"; // classic, compact, or focus

    @Column(name = "layout_hide_category_panel")
    private Boolean layoutHideCategoryPanel = false;

    @Column(name = "layout_hide_items_panel")
    private Boolean layoutHideItemsPanel = false;

    // Comma-separated set of action button IDs that are hidden in the Cart Focus panel
    @Column(name = "layout_hidden_panel_buttons", length = 500)
    private String layoutHiddenPanelButtons = "";

    // Print template config — JSON blob for all POS receipt/invoice template settings
    @Column(name = "print_template_config", columnDefinition = "TEXT")
    private String printTemplateConfig;

    // Walk-in customer code
    @Column(name = "walk_in_customer_code", length = 50)
    private String walkInCustomerCode = "WALK-IN";

    // Auto-print receipt after payment
    @Column(name = "auto_print_receipt")
    private Boolean autoPrintReceipt = false;

    // Tax inclusive pricing
    @JsonProperty("taxInclusive")
    @Column(name = "tax_inclusive")
    private Boolean taxInclusive = false;

    // Default tax rate
    @JsonProperty("defaultTaxRate")
    @Column(name = "default_tax_rate")
    private Double defaultTaxRate = 5.0;

    /** Maximum allowed absolute cash variance on session close before supervisor approval is required.
     *  0 (default) = disabled (no gate). Uses branch currency. */
    @Column(name = "cash_variance_threshold", precision = 15, scale = 2)
    private java.math.BigDecimal cashVarianceThreshold = java.math.BigDecimal.ZERO;

    // Terminal lifecycle
    @Column(name = "require_terminal_approval")
    private Boolean requireTerminalApproval = false;

    @Column(name = "orphan_archive_days")
    private Integer orphanArchiveDays = 90;

    // Session lifecycle
    @Column(name = "session_idle_timeout_minutes")
    private Integer sessionIdleTimeoutMinutes = 0; // 0 = disabled

    @Column(name = "session_max_duration_hours")
    private Integer sessionMaxDurationHours = 0; // 0 = disabled

    // Heartbeat
    @Column(name = "heartbeat_interval_seconds")
    private Integer heartbeatIntervalSeconds = 60;

    @Column(name = "offline_threshold_minutes")
    private Integer offlineThresholdMinutes = 15;

    @Column(name = "idle_threshold_minutes")
    private Integer idleThresholdMinutes = 5;

    // Getters & Setters

    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }

    public Integer getMaxTerminalsPerBranch() { return maxTerminalsPerBranch; }
    public void setMaxTerminalsPerBranch(Integer maxTerminalsPerBranch) { this.maxTerminalsPerBranch = maxTerminalsPerBranch; }

    public Boolean getRequireSupervisorForVoid() { return requireSupervisorForVoid; }
    public void setRequireSupervisorForVoid(Boolean requireSupervisorForVoid) { this.requireSupervisorForVoid = requireSupervisorForVoid; }

    public String getSupervisorApprovalMode() { return supervisorApprovalMode; }
    public void setSupervisorApprovalMode(String supervisorApprovalMode) { this.supervisorApprovalMode = supervisorApprovalMode; }

    // ARCHFIX S5: never serialize the supervisor PIN (now a BCrypt hash) to the client. The setter
    // stays public so the save request body can still carry a new raw PIN (Jackson deserializes via
    // the setter; @JsonIgnore on the getter only blocks the OUTBOUND value).
    @com.fasterxml.jackson.annotation.JsonIgnore
    public String getSupervisorPin() { return supervisorPin; }
    public void setSupervisorPin(String supervisorPin) { this.supervisorPin = supervisorPin; }

    /** Whether a supervisor PIN is configured — lets the UI show "set/not set" without leaking it. */
    @com.fasterxml.jackson.annotation.JsonProperty(value = "supervisorPinSet", access = com.fasterxml.jackson.annotation.JsonProperty.Access.READ_ONLY)
    public boolean isSupervisorPinSet() {
        return supervisorPin != null && !supervisorPin.isBlank();
    }

    public String getVoidMode() { return voidMode; }
    public void setVoidMode(String voidMode) { this.voidMode = voidMode; }

    public String getCartViewMode() { return cartViewMode; }
    public void setCartViewMode(String cartViewMode) { this.cartViewMode = cartViewMode; }

    public Boolean getCartShowBarcode() { return cartShowBarcode; }
    public void setCartShowBarcode(Boolean cartShowBarcode) { this.cartShowBarcode = cartShowBarcode; }

    public Boolean getCartShowProductCode() { return cartShowProductCode; }
    public void setCartShowProductCode(Boolean cartShowProductCode) { this.cartShowProductCode = cartShowProductCode; }

    public Boolean getCartShowBatchNumber() { return cartShowBatchNumber; }
    public void setCartShowBatchNumber(Boolean cartShowBatchNumber) { this.cartShowBatchNumber = cartShowBatchNumber; }

    public Boolean getCartShowSerialNumber() { return cartShowSerialNumber; }
    public void setCartShowSerialNumber(Boolean cartShowSerialNumber) { this.cartShowSerialNumber = cartShowSerialNumber; }

    public Boolean getCartShowExpiryDate() { return cartShowExpiryDate; }
    public void setCartShowExpiryDate(Boolean cartShowExpiryDate) { this.cartShowExpiryDate = cartShowExpiryDate; }

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

    public Boolean getLayoutHideCategoryPanel() { return layoutHideCategoryPanel; }
    public void setLayoutHideCategoryPanel(Boolean layoutHideCategoryPanel) { this.layoutHideCategoryPanel = layoutHideCategoryPanel; }

    public Boolean getLayoutHideItemsPanel() { return layoutHideItemsPanel; }
    public void setLayoutHideItemsPanel(Boolean layoutHideItemsPanel) { this.layoutHideItemsPanel = layoutHideItemsPanel; }

    public String getLayoutHiddenPanelButtons() { return layoutHiddenPanelButtons; }
    public void setLayoutHiddenPanelButtons(String layoutHiddenPanelButtons) { this.layoutHiddenPanelButtons = layoutHiddenPanelButtons; }

    public String getPrintTemplateConfig() { return printTemplateConfig; }
    public void setPrintTemplateConfig(String printTemplateConfig) { this.printTemplateConfig = printTemplateConfig; }

    public String getWalkInCustomerCode() { return walkInCustomerCode; }
    public void setWalkInCustomerCode(String walkInCustomerCode) { this.walkInCustomerCode = walkInCustomerCode; }

    public Boolean getAutoPrintReceipt() { return autoPrintReceipt; }
    public void setAutoPrintReceipt(Boolean autoPrintReceipt) { this.autoPrintReceipt = autoPrintReceipt; }

    public Boolean getTaxInclusive() { return taxInclusive; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }

    public Double getDefaultTaxRate() { return defaultTaxRate; }
    public void setDefaultTaxRate(Double defaultTaxRate) { this.defaultTaxRate = defaultTaxRate; }

    public java.math.BigDecimal getCashVarianceThreshold() { return cashVarianceThreshold; }
    public void setCashVarianceThreshold(java.math.BigDecimal cashVarianceThreshold) {
        this.cashVarianceThreshold = cashVarianceThreshold;
    }

    public Boolean getRequireTerminalApproval() { return requireTerminalApproval; }
    public void setRequireTerminalApproval(Boolean requireTerminalApproval) { this.requireTerminalApproval = requireTerminalApproval; }

    public Integer getOrphanArchiveDays() { return orphanArchiveDays; }
    public void setOrphanArchiveDays(Integer orphanArchiveDays) { this.orphanArchiveDays = orphanArchiveDays; }

    public Integer getSessionIdleTimeoutMinutes() { return sessionIdleTimeoutMinutes; }
    public void setSessionIdleTimeoutMinutes(Integer sessionIdleTimeoutMinutes) { this.sessionIdleTimeoutMinutes = sessionIdleTimeoutMinutes; }

    public Integer getSessionMaxDurationHours() { return sessionMaxDurationHours; }
    public void setSessionMaxDurationHours(Integer sessionMaxDurationHours) { this.sessionMaxDurationHours = sessionMaxDurationHours; }

    public Integer getHeartbeatIntervalSeconds() { return heartbeatIntervalSeconds; }
    public void setHeartbeatIntervalSeconds(Integer heartbeatIntervalSeconds) { this.heartbeatIntervalSeconds = heartbeatIntervalSeconds; }

    public Integer getOfflineThresholdMinutes() { return offlineThresholdMinutes; }
    public void setOfflineThresholdMinutes(Integer offlineThresholdMinutes) { this.offlineThresholdMinutes = offlineThresholdMinutes; }

    public Integer getIdleThresholdMinutes() { return idleThresholdMinutes; }
    public void setIdleThresholdMinutes(Integer idleThresholdMinutes) { this.idleThresholdMinutes = idleThresholdMinutes; }
}
