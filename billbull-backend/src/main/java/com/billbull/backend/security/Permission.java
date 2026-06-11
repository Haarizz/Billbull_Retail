package com.billbull.backend.security;

/**
 * Granular permissions for RBAC system.
 * Each permission represents a specific action on a module.
 */
public enum Permission {

    // User Management
    USER_CREATE,
    USER_EDIT,
    USER_DELETE,
    USER_VIEW_ALL,
    ROLE_ASSIGN,

    // Inventory Module
    INVENTORY_READ,
    INVENTORY_WRITE,
    PRODUCT_READ,
    PRODUCT_WRITE,
    WAREHOUSE_READ,
    WAREHOUSE_WRITE,
    STOCK_TRANSFER,
    BARCODE_PRINT,

    // Purchase Module
    PURCHASE_CREATE,
    PURCHASE_EDIT,
    PURCHASE_VIEW,
    VENDOR_CREATE,
    VENDOR_EDIT,
    VENDOR_VIEW,
    VENDOR_LEDGER_VIEW,
    PURCHASE_PAYMENT,
    GRN_CREATE,
    GRN_VIEW,
    LPO_CREATE,
    LPO_VIEW,

    // Sales Module
    SALES_CREATE,
    SALES_EDIT,
    SALES_VIEW,
    CUSTOMER_CREATE,
    CUSTOMER_EDIT,
    CUSTOMER_VIEW,
    QUOTATION_CREATE,
    QUOTATION_EDIT,
    SALES_ORDER_CREATE,
    SALES_ORDER_EDIT,
    DELIVERY_CREATE,
    DELIVERY_FULFILL,
    SALES_INVOICE_CREATE,
    SALES_INVOICE_VIEW,
    SALES_PAYMENT_CREATE,
    SALES_PAYMENT_VIEW,

    // Financial Module
    FINANCE_VIEW,
    FINANCE_CREATE,
    FINANCE_EDIT,
    LEDGER_VIEW,
    LEDGER_EDIT,
    EXPENSE_CREATE,
    EXPENSE_VIEW,
    VOUCHER_CREATE,
    VOUCHER_VIEW,
    RECONCILIATION_VIEW,
    RECONCILIATION_EDIT,
    TAX_VIEW,
    TAX_EDIT,
    REPORT_VIEW,
    REPORT_EXPORT,

    // HR/Payroll Module
    EMPLOYEE_CREATE,
    EMPLOYEE_EDIT,
    EMPLOYEE_VIEW,
    SALARY_CREATE,
    SALARY_VIEW,
    SALARY_SUMMARY_VIEW,
    SALARY_ADVANCE_CREATE,
    SALARY_ADVANCE_VIEW,

    // Customer Connect
    INQUIRY_CREATE,
    INQUIRY_EDIT,
    INQUIRY_VIEW,
    FOLLOWUP_CREATE,
    MESSAGING_ACCESS,

    // Inventory — sensitive overrides
    PRODUCT_ALLOW_NEGATIVE_STOCK,

    // Dashboard & Reports
    DASHBOARD_VIEW,
    TALLY_SYNC,
    AUDIT_LOG_VIEW;

    /**
     * Check if permission name matches
     */
    public boolean matches(String permissionName) {
        return this.name().equals(permissionName);
    }
}
