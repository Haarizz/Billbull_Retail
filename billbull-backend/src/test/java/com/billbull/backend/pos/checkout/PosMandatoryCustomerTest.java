package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.billbull.backend.pos.settings.PosSettings;

/** POS Console > Behavior > Mandatory Customer — the server-side walk-in check. */
class PosMandatoryCustomerTest {

    @Test
    void offByDefaultAllowsWalkIn() {
        PosSettings settings = new PosSettings();
        assertFalse(PosCheckoutController.requiredCustomerMissing(settings, "WALK-IN"));
        assertFalse(PosCheckoutController.requiredCustomerMissing(settings, null));
        assertFalse(PosCheckoutController.requiredCustomerMissing(null, null));
    }

    @Test
    void onRefusesBlankAndWalkInCodes() {
        PosSettings settings = requireCustomer("CUST-WALK");
        assertTrue(PosCheckoutController.requiredCustomerMissing(settings, null));
        assertTrue(PosCheckoutController.requiredCustomerMissing(settings, "  "));
        assertTrue(PosCheckoutController.requiredCustomerMissing(settings, "WALK-IN"));
        assertTrue(PosCheckoutController.requiredCustomerMissing(settings, "walkin"));
        assertTrue(PosCheckoutController.requiredCustomerMissing(settings, "cust-walk"));
    }

    @Test
    void onAcceptsARealCustomer() {
        assertFalse(PosCheckoutController.requiredCustomerMissing(requireCustomer("WALK-IN"), "CUST0042"));
    }

    private static PosSettings requireCustomer(String walkInCode) {
        PosSettings settings = new PosSettings();
        settings.setRequireCustomer(true);
        settings.setWalkInCustomerCode(walkInCode);
        return settings;
    }
}
