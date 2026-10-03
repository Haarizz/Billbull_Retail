package com.billbull.backend.settings.whatsapp;

import java.util.function.Function;

/**
 * Documents that can be sent as a WhatsApp PDF. Each has its own Meta-approved template (chosen
 * in WhatsApp Settings) and the RBAC module whose "view" right gates reading its send history.
 * Adding a type: new constant + template column on {@link WhatsAppConfig} (Flyway migration) +
 * a send-whatsapp endpoint on the document's controller.
 */
public enum WhatsAppDocumentType {
    QUOTATION("sales.quotation", "Quotation", WhatsAppConfig::getQuotationTemplateName),
    SALES_ORDER("sales.order", "Sales Order", WhatsAppConfig::getSalesOrderTemplateName),
    SALES_INVOICE("sales.invoice", "Sales Invoice", WhatsAppConfig::getSalesInvoiceTemplateName);

    private final String module;
    private final String label;
    private final Function<WhatsAppConfig, String> templateName;

    WhatsAppDocumentType(String module, String label, Function<WhatsAppConfig, String> templateName) {
        this.module = module;
        this.label = label;
        this.templateName = templateName;
    }

    public String module() { return module; }

    public String label() { return label; }

    public String templateName(WhatsAppConfig cfg) { return templateName.apply(cfg); }

    /** Null for unknown values instead of throwing — callers turn that into a 400. */
    public static WhatsAppDocumentType parse(String value) {
        if (value == null) return null;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
