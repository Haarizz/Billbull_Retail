package com.billbull.backend.financials.chartofaccounts;

public final class AccountSelectionRules {

    /** Cash in Hand / Petty Cash as seeded by SystemAccountSeeder. */
    private static final java.util.Set<String> SYSTEM_CASH_CODES = java.util.Set.of("1001", "1012");

    private AccountSelectionRules() {
    }

    public static boolean isBankAccount(Account account) {
        if (account == null) {
            return false;
        }
        if (isArchivedOrInactive(account.getStatus())) {
            return false;
        }
        if (Boolean.TRUE.equals(account.getIsGroup())) {
            return false;
        }
        if (!isAssetAccount(account)) {
            return false;
        }

        String searchableText = normalize(
                account.getName(),
                account.getSubGroup(),
                account.getReportGroup(),
                account.getDescription());

        return hasBankMarker(searchableText);
    }

    /**
     * True for a physical-cash settlement account (Cash in Hand, Petty Cash, a till/drawer
     * float) as opposed to a real bank account.
     *
     * <p>Needed because {@link #isBankAccount} deliberately matches loosely across the
     * account's name, sub-group, report group and description — and the standard chart of
     * accounts files cash accounts under the report group {@code CASH_AND_BANK}, whose text
     * contains "bank". Cash in Hand (1001) and Petty Cash (1012) therefore pass the bank
     * test, which is right for a generic "which account did the money move through?" picker
     * (paying an expense out of Petty Cash is valid) but wrong for anything that must be an
     * actual bank account — an online/bank transfer received into Cash in Hand would inflate
     * the POS drawer count and never reconcile against a bank statement.
     *
     * <p>Matched on the account's own name/description and the two seeded system codes only —
     * never the report group, which every cash-and-bank account shares.
     */
    public static boolean isCashAccount(Account account) {
        if (account == null) {
            return false;
        }
        String code = normalize(account.getCode());
        if (SYSTEM_CASH_CODES.contains(code)) {
            return true;
        }
        String searchableText = normalize(account.getName(), account.getDescription());
        if (searchableText.contains("bank")) {
            // e.g. "Cash deposits — Bank Account (Main)": the bank marker wins.
            return false;
        }
        return searchableText.contains("cash")
                || searchableText.contains("petty")
                || searchableText.contains("till")
                || searchableText.contains("drawer");
    }

    private static boolean isArchivedOrInactive(String status) {
        String normalized = normalize(status);
        return "archived".equals(normalized) || "inactive".equals(normalized);
    }

    private static boolean isAssetAccount(Account account) {
        String group = normalize(account.getAccountGroup());
        String type = normalize(account.getAccountType());
        return "assets".equals(group) || "asset".equals(group) || "asset".equals(type);
    }

    private static boolean hasBankMarker(String text) {
        return text.contains("bank")
                || text.contains("checking")
                || text.contains("chequing")
                || text.contains("savings")
                || text.contains("current account")
                || text.contains("deposit account");
    }

    private static String normalize(String... values) {
        StringBuilder builder = new StringBuilder();
        if (values != null) {
            for (String value : values) {
                if (value != null && !value.isBlank()) {
                    builder.append(' ').append(value.toLowerCase().trim());
                }
            }
        }
        return builder.toString().replaceAll("\\s+", " ").trim();
    }
}
