package com.billbull.backend.settings.whatsapp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Formatting shared by every document's template variables, so a customer sees amounts and dates
 * the same way on a quotation, an order and an invoice.
 */
public final class WhatsAppTemplateParams {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

    private WhatsAppTemplateParams() {}

    /** "AED 2,800.00" — falls back to AED when the document/company has no currency. */
    public static String amount(String currency, BigDecimal value) {
        String cur = currency == null || currency.isBlank() ? "AED" : currency.trim();
        return cur + " " + String.format(Locale.ENGLISH, "%,.2f", value == null ? BigDecimal.ZERO : value);
    }

    /** "08 Oct 2026", or {@code fallback} when the date is unset. */
    public static String date(LocalDate value, String fallback) {
        return value == null ? fallback : value.format(DATE);
    }

    /** Strips the " - CODE" suffix some documents store on the customer name. */
    public static String customerName(String name, String code) {
        if (name == null || name.isBlank()) return "Customer";
        String n = name.trim();
        if (code != null && !code.isBlank() && n.endsWith(" - " + code)) {
            n = n.substring(0, n.length() - (" - " + code).length());
        }
        return n;
    }
}
