package com.billbull.backend.financials.chartofaccounts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class AccountCodeGeneratorTest {

    /** Codes the SystemAccountSeeder plants in the Expenses tree. */
    private static List<String> seededExpenseCodes() {
        return new ArrayList<>(List.of(
                "5000", "5100", "6000", "7500",                       // groups
                "5001", "5002", "5003", "5004", "5005", "5006",       // COGS leaves
                "5999",                                               // Rounding Adjustment — top of the 5xxx band
                "6001", "6002", "6003", "6004", "6005", "6006", "6007",
                "6008", "6009", "6010", "6020", "6030", "6040", "6050", "6099"));
    }

    @Test
    void doesNotWalkOutOfTheBandWhenTheTopCodeIsTaken() {
        // Regression: max+1 over the 5000-5999 band returned 6000 (the seeded
        // "Operating Expenses" group), permanently deadlocking Expenses account creation.
        String code = AccountCodeGenerator.nextCode(null, "Expenses", seededExpenseCodes());

        assertEquals("5007", code, "should fill the first gap in the band, not 5999+1");
    }

    @Test
    void numbersChildrenInsideTheParentHundredBlock() {
        String code = AccountCodeGenerator.nextCode("6000", "Expenses", seededExpenseCodes());

        assertEquals("6011", code, "first free slot under 6000 is 6011 (6001-6010 taken)");
    }

    @Test
    void parentBlockStartsAboveAParentSittingMidBlock() {
        // 1050 "Current Assets" — children must start at 1051, never re-issue 1050 itself.
        String code = AccountCodeGenerator.nextCode("1050", "Assets", List.of("1000", "1050", "1300"));

        assertEquals("1051", code);
    }

    @Test
    void fallsBackToTheNextGroupBandWhenTheParentBlockIsFull() {
        List<String> used = new ArrayList<>(seededExpenseCodes());
        IntStream.rangeClosed(6001, 6099).forEach(n -> used.add(String.valueOf(n)));

        String code = AccountCodeGenerator.nextCode("6000", "Expenses", used);

        assertEquals("5007", code, "parent block exhausted → first free code in the group bands");
    }

    @Test
    void expensesSpillIntoTheSecondaryBandsOnceThePrimaryIsFull() {
        List<String> used = new ArrayList<>();
        IntStream.rangeClosed(5000, 5999).forEach(n -> used.add(String.valueOf(n)));
        IntStream.rangeClosed(6000, 6999).forEach(n -> used.add(String.valueOf(n)));

        String code = AccountCodeGenerator.nextCode(null, "Expenses", used);

        assertEquals("7501", code, "Expenses also owns 7500-7999");
    }

    @Test
    void incomeOwnsBothItsBands() {
        List<String> used = new ArrayList<>();
        IntStream.rangeClosed(4000, 4999).forEach(n -> used.add(String.valueOf(n)));

        assertEquals("7001", AccountCodeGenerator.nextCode(null, "Income", used));
    }

    @Test
    void skipsTheBandRootSoGroupHeadersAreNeverReissued() {
        assertEquals("5001", AccountCodeGenerator.nextCode(null, "Expenses", List.of()));
        assertEquals("1001", AccountCodeGenerator.nextCode(null, "Assets", List.of()));
    }

    @Test
    void unknownGroupsGetTheirOwnBand() {
        assertEquals("9001", AccountCodeGenerator.nextCode(null, "Suspense", List.of()));
    }

    @Test
    void ignoresNonNumericAndBlankExistingCodes() {
        List<String> used = new ArrayList<>();
        used.add(null);
        used.add("   ");
        used.add("SYS-GRP-5000");
        used.add("5001");

        assertEquals("5002", AccountCodeGenerator.nextCode(null, "Expenses", used));
    }

    @Test
    void returnsNullWhenEveryBandIsFull() {
        List<String> used = new ArrayList<>();
        IntStream.rangeClosed(5000, 5999).forEach(n -> used.add(String.valueOf(n)));
        IntStream.rangeClosed(6000, 6999).forEach(n -> used.add(String.valueOf(n)));
        IntStream.rangeClosed(7500, 7999).forEach(n -> used.add(String.valueOf(n)));

        assertNull(AccountCodeGenerator.nextCode(null, "Expenses", used));
    }
}
