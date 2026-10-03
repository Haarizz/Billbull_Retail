package com.billbull.backend.settings.whatsapp;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PhoneNumberNormalizerTest {

    @Test
    void uaeLocalWithTrunkZeroGetsCountryCode() {
        assertEquals("971501234567", PhoneNumberNormalizer.normalize("050 123 4567", "971"));
    }

    @Test
    void nineDigitLocalGetsCountryCode() {
        assertEquals("971501234567", PhoneNumberNormalizer.normalize("501234567", "971"));
    }

    @Test
    void plusPrefixedNumberIsKeptAsIs() {
        assertEquals("919207685882", PhoneNumberNormalizer.normalize("+91 92076 85882", "971"));
    }

    @Test
    void doubleZeroPrefixIsInternational() {
        assertEquals("919207685882", PhoneNumberNormalizer.normalize("0091 9207685882", "971"));
    }

    @Test
    void longNumberIsTreatedAsAlreadyInternational() {
        assertEquals("971501234567", PhoneNumberNormalizer.normalize("971-50-1234567", "971"));
    }

    @Test
    void tenDigitNationalNumberUsesTenantCountryCode() {
        assertEquals("919207685882", PhoneNumberNormalizer.normalize("9207685882", "91"));
    }

    @Test
    void blankOrTooShortIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> PhoneNumberNormalizer.normalize("  ", "971"));
        assertThrows(IllegalArgumentException.class, () -> PhoneNumberNormalizer.normalize("+12", "971"));
    }
}
