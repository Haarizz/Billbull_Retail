package com.billbull.backend.financials.chartofaccounts;

public final class AccountSelectionRules {

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
