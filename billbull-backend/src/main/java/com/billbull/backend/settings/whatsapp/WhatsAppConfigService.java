package com.billbull.backend.settings.whatsapp;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class WhatsAppConfigService {

    /** Sentinel sent to the UI in place of a stored secret; echoed back on save means "keep the stored value". */
    public static final String MASK = "••••••••••••••••";

    /** Meta's Phone Number ID and WABA ID are numeric; 64 is the column length. */
    private static final Pattern META_ID = Pattern.compile("\\d{1,64}");

    /** Meta template names: lowercase letters, digits and underscores. 512 is the column length. */
    private static final Pattern TEMPLATE_NAME = Pattern.compile("[a-z0-9_]{1,512}");

    /** Meta template language codes: "en", "ar", "en_US", "pt_BR", "zh_HK". */
    private static final Pattern LANGUAGE = Pattern.compile("[a-z]{2,3}(_[A-Z]{2,4})?");

    private final WhatsAppConfigRepository repo;

    public WhatsAppConfigService(WhatsAppConfigRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public WhatsAppConfig getConfig() {
        return repo.findById(1L).orElseGet(() -> {
            WhatsAppConfig empty = new WhatsAppConfig();
            empty.setId(1L);
            return empty;
        });
    }

    /** Copy with every secret replaced by {@link #MASK} (or null when unset). Never return the entity itself. */
    @Transactional(readOnly = true)
    public WhatsAppConfig getConfigMasked() {
        return masked(getConfig());
    }

    @Transactional
    public WhatsAppConfig saveConfig(WhatsAppConfig incoming) {
        incoming.setId(1L);
        WhatsAppConfig existing = repo.findById(1L).orElse(null);
        if (MASK.equals(incoming.getAccessToken())) {
            incoming.setAccessToken(existing != null ? existing.getAccessToken() : null);
        }
        if (MASK.equals(incoming.getAppSecret())) {
            incoming.setAppSecret(existing != null ? existing.getAppSecret() : null);
        }
        if (MASK.equals(incoming.getWebhookVerifyToken())) {
            incoming.setWebhookVerifyToken(existing != null ? existing.getWebhookVerifyToken() : null);
        }
        incoming.setPhoneNumberId(trimToNull(incoming.getPhoneNumberId()));
        incoming.setBusinessAccountId(trimToNull(incoming.getBusinessAccountId()));
        requireMetaId(incoming.getPhoneNumberId(), "Phone Number ID");
        requireMetaId(incoming.getBusinessAccountId(), "WhatsApp Business Account ID");
        incoming.setAccessToken(trimToNull(incoming.getAccessToken()));
        incoming.setAppSecret(trimToNull(incoming.getAppSecret()));
        incoming.setWebhookVerifyToken(trimToNull(incoming.getWebhookVerifyToken()));
        // Blank stays blank (null): that document uses the manual flow. Nothing is defaulted here.
        incoming.setQuotationTemplateName(requireTemplateName(incoming.getQuotationTemplateName(), "Quotation"));
        incoming.setSalesOrderTemplateName(requireTemplateName(incoming.getSalesOrderTemplateName(), "Sales Order"));
        incoming.setSalesInvoiceTemplateName(requireTemplateName(incoming.getSalesInvoiceTemplateName(), "Sales Invoice"));
        if (incoming.getDefaultCountryCode() != null) {
            incoming.setDefaultCountryCode(incoming.getDefaultCountryCode().replaceAll("\\D", ""));
        }
        try {
            incoming.setGraphApiVersion(GraphApiVersion.requireUsable(incoming.getGraphApiVersion(), java.time.LocalDate.now()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        String lang = trimToNull(incoming.getTemplateLanguage());
        if (lang != null && !LANGUAGE.matcher(lang).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Language Code must be the code shown in WhatsApp Manager, such as en, ar or en_US.");
        }
        incoming.setTemplateLanguage(lang == null ? "en" : lang);
        return masked(repo.save(incoming));
    }

    /** True when the connection values are present (independent of the enabled switch and of templates). */
    public boolean isConfigured(WhatsAppConfig c) {
        return notBlank(c.getPhoneNumberId()) && notBlank(c.getAccessToken()) && notBlank(c.getTemplateLanguage());
    }

    /** Config ready for sending {@code type}, or an IllegalStateException whose message tells the user what to fix. */
    @Transactional(readOnly = true)
    public WhatsAppConfig requireReady(WhatsAppDocumentType type) {
        WhatsAppConfig c = getConfig();
        if (!Boolean.TRUE.equals(c.getEnabled())) {
            throw new IllegalStateException("WhatsApp is disabled. Go to Settings → WhatsApp Settings and enable it.");
        }
        if (!isConfigured(c)) {
            throw new IllegalStateException("WhatsApp is not fully configured. Go to Settings → WhatsApp Settings "
                    + "and fill in Phone Number ID and Access Token.");
        }
        if (!notBlank(type.templateName(c))) {
            throw new IllegalStateException("No WhatsApp template is set for " + type.label()
                    + ". Go to Settings → WhatsApp Settings → Message Templates.");
        }
        return c;
    }

    /**
     * Non-secret summary any signed-in user may read — the send buttons use it to pick API vs.
     * fallback. {@code templates} says, per document type, whether a template is set.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> publicStatus() {
        WhatsAppConfig c = getConfig();
        Map<String, Object> status = new LinkedHashMap<>();
        boolean configured = isConfigured(c);
        status.put("enabled", Boolean.TRUE.equals(c.getEnabled()) && configured);
        status.put("configured", configured);
        status.put("defaultCountryCode", c.getDefaultCountryCode());
        Map<String, Boolean> templates = new LinkedHashMap<>();
        for (WhatsAppDocumentType t : WhatsAppDocumentType.values()) {
            templates.put(t.name(), notBlank(t.templateName(c)));
        }
        status.put("templates", templates);
        return status;
    }

    private static WhatsAppConfig masked(WhatsAppConfig src) {
        WhatsAppConfig copy = new WhatsAppConfig();
        copy.setId(src.getId());
        copy.setEnabled(src.getEnabled());
        copy.setGraphApiVersion(src.getGraphApiVersion());
        copy.setPhoneNumberId(src.getPhoneNumberId());
        copy.setBusinessAccountId(src.getBusinessAccountId());
        copy.setAccessToken(notBlank(src.getAccessToken()) ? MASK : null);
        copy.setAppSecret(notBlank(src.getAppSecret()) ? MASK : null);
        copy.setWebhookVerifyToken(notBlank(src.getWebhookVerifyToken()) ? MASK : null);
        copy.setDefaultCountryCode(src.getDefaultCountryCode());
        copy.setQuotationTemplateName(src.getQuotationTemplateName());
        copy.setSalesOrderTemplateName(src.getSalesOrderTemplateName());
        copy.setSalesInvoiceTemplateName(src.getSalesInvoiceTemplateName());
        copy.setTemplateLanguage(src.getTemplateLanguage());
        return copy;
    }

    /**
     * Blank is allowed (not set up yet). Anything else must be digits: a browser autofilling the
     * user's BillBull login into these fields must not be saved. The value is never echoed, since
     * it may be that login.
     */
    private static void requireMetaId(String value, String label) {
        if (value != null && !META_ID.matcher(value).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label
                    + " must contain digits only (Meta → WhatsApp → API Setup). It is not a phone number or a username.");
        }
    }

    private static String requireTemplateName(String raw, String label) {
        String name = trimToNull(raw);
        if (name != null && !TEMPLATE_NAME.matcher(name).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " template name must be exactly as in "
                    + "WhatsApp Manager: lowercase letters, digits and underscores, e.g. quotation_document.");
        }
        return name;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
