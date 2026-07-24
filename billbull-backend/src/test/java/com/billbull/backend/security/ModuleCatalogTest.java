package com.billbull.backend.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

class ModuleCatalogTest {

    /**
     * Every module key referenced by a controller MODULE constant or a sidebar
     * sub-item must be in the catalog, or the admin matrix cannot manage it.
     */
    @Test
    void containsEveryEnforcedSubModuleKey() {
        List<String> enforcedKeys = List.of(
                // sales
                "sales.customer", "sales.quotation", "sales.order", "sales.proforma",
                "sales.invoice", "sales.delivery", "sales.return", "sales.pos",
                "sales.payment", "sales.templates", "sales.reports", "sales.settings",
                // inventory
                "inventory.category", "inventory.units", "inventory.product",
                "inventory.warehouse", "inventory.stock", "inventory.barcode", "inventory.reports",
                // purchases
                "purchases.vendor", "purchases.lpo", "purchases.grn", "purchases.invoice",
                "purchases.payment", "purchases.templates", "purchases.reports",
                // finance
                "finance.ledger", "finance.voucher", "finance.expense", "finance.reconcile",
                "finance.tax", "finance.reports", "finance.config", "finance.templates",
                // hr
                "hr.employee", "hr.payroll", "hr.attendance",
                // customer
                "customer.inquiry", "customer.followup", "customer.message",
                // user management
                "userManagement.user", "userManagement.role", "userManagement.setup",
                // pos administration
                "pos", "pos.terminals", "pos.sessions", "pos.counters", "pos.devices",
                "pos.printers", "pos.scanners", "pos.hardwareprofiles", "pos.settings",
                // pos terminal lifecycle actions
                "permissions.pos.terminal.register", "permissions.pos.terminal.rename",
                "permissions.pos.terminal.assigncounter", "permissions.pos.terminal.setmain",
                "permissions.pos.terminal.approve", "permissions.pos.terminal.reject",
                "permissions.pos.terminal.archive", "permissions.pos.terminal.restore",
                "permissions.pos.terminal.block", "permissions.pos.terminal.unblock",
                "permissions.pos.terminal.decommission",
                "permissions.pos.terminal.keepactive", "permissions.pos.terminal.setautoarchiveexempt");

        for (String key : enforcedKeys) {
            assertTrue(ModuleCatalog.isValid(key), "Missing from ModuleCatalog: " + key);
        }
    }

    @Test
    void validationIsCaseInsensitiveButStorageIsCanonical() {
        assertTrue(ModuleCatalog.isValid("USERMANAGEMENT.ROLE"));
        assertEquals("userManagement.role", ModuleCatalog.canonicalize("usermanagement.role"));
        assertEquals("sales.pos", ModuleCatalog.canonicalize("SALES.POS"));
    }

    @Test
    void rejectsUnknownKeys() {
        assertFalse(ModuleCatalog.isValid("sales.unknown"));
        assertFalse(ModuleCatalog.isValid(null));
        assertThrows(IllegalArgumentException.class, () -> ModuleCatalog.canonicalize("bogus"));
    }
}
