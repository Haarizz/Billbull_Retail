package com.billbull.backend.settings.whatsapp;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Test Connection" on the WhatsApp settings page, read-only and always on the SAVED settings.
 * Three separate answers, because they fail separately:
 * <ol>
 *   <li><b>Credentials</b>: the token can read the Phone Number ID ({@code GET /{phone-number-id}}).
 *       A failure here ends the check: nothing else can be read.</li>
 *   <li><b>Business account</b>: the token can read the WABA ID, and the number is registered
 *       under it ({@code /{waba-id}}, {@code /{waba-id}/phone_numbers}).</li>
 *   <li><b>Templates</b>: for each configured name, Meta's template in the saved language, its
 *       status, a DOCUMENT header and the 4 numbered body variables BillBull sends
 *       ({@code /{waba-id}/message_templates}).</li>
 * </ol>
 * "APPROVED" is reported only when Meta says APPROVED for that name and language. Nothing is sent.
 */
public class WhatsAppConnectionCheck {

    /** Every document template gets {{1}}..{{4}}; see the *TemplateParams methods on the controllers. */
    static final int EXPECTED_BODY_PARAMETERS = 4;

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([^{}\\s]+)\\s*}}");

    private final WhatsAppConfigService configService;
    private final WhatsAppCloudApiClient client;

    public WhatsAppConnectionCheck(WhatsAppConfigService configService, WhatsAppCloudApiClient client) {
        this.configService = configService;
        this.client = client;
    }

    /** Per-template outcome. */
    public enum TemplateState {
        /** No name saved for this document: it uses the manual flow. */
        MISSING,
        /** A name is saved but could not be looked up (no WABA ID, or the WABA could not be read). */
        NOT_CHECKED,
        /** Meta has no template with this name in the saved language. */
        NOT_FOUND,
        /** Found, but its status is not APPROVED (PENDING, REJECTED, PAUSED, DISABLED, ...). */
        NOT_APPROVED,
        /** Approved, but sending would fail: wrong header type or body variables. */
        MISMATCH,
        APPROVED
    }

    /**
     * @throws IllegalStateException when the phone id or token is not saved
     * @throws WhatsAppApiException  when Meta rejects the saved credentials (step 1)
     */
    public Map<String, Object> run() {
        WhatsAppConfig cfg = configService.getConfig();
        if (cfg.getPhoneNumberId() == null || cfg.getAccessToken() == null) {
            throw new IllegalStateException("Save the Phone Number ID and Access Token first.");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> info = client.getPhoneNumberInfo(cfg);
        // The old flat fields stay for any caller reading them.
        result.putAll(info);
        Map<String, Object> phone = new LinkedHashMap<>();
        phone.put("status", "VERIFIED");
        phone.put("verifiedName", info.get("verified_name"));
        phone.put("displayPhoneNumber", info.get("display_phone_number"));
        phone.put("qualityRating", info.get("quality_rating"));
        phone.put("codeVerificationStatus", info.get("code_verification_status"));
        result.put("phoneNumber", phone);

        Map<String, Object> waba = new LinkedHashMap<>();
        List<JsonNode> templates = null;
        String templatesProblem;
        if (cfg.getBusinessAccountId() == null) {
            waba.put("status", "NOT_CONFIGURED");
            waba.put("message", "Enter the WhatsApp Business Account ID to check the number and templates.");
            templatesProblem = "Not checked: no WhatsApp Business Account ID is saved.";
        } else {
            try {
                JsonNode account = client.getBusinessAccount(cfg);
                waba.put("name", account.path("name").asText(null));
                boolean linked = client.listPhoneNumberIds(cfg).contains(cfg.getPhoneNumberId());
                waba.put("phoneNumberLinked", linked);
                waba.put("status", linked ? "VERIFIED" : "MISMATCH");
                if (!linked) {
                    waba.put("message", "The Phone Number ID is not registered under this WhatsApp Business Account.");
                }
                templates = client.listTemplates(cfg);
                templatesProblem = null;
            } catch (WhatsAppApiException e) {
                waba.put("status", "FAILED");
                waba.put("message", describe(e));
                templatesProblem = "Not checked: the WhatsApp Business Account could not be read.";
            }
        }
        result.put("businessAccount", waba);

        List<Map<String, Object>> checks = new ArrayList<>();
        for (WhatsAppDocumentType type : WhatsAppDocumentType.values()) {
            checks.add(checkTemplate(type, type.templateName(cfg), cfg.getTemplateLanguage(), templates, templatesProblem));
        }
        result.put("templates", checks);
        result.put("graphApiVersion", cfg.getGraphApiVersionStatus());
        result.put("checkedAt", Instant.now().toString());
        return result;
    }

    static Map<String, Object> checkTemplate(WhatsAppDocumentType type, String name, String language,
                                             List<JsonNode> templates, String notCheckedReason) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("documentType", type.name());
        out.put("label", type.label());
        out.put("name", name);
        out.put("language", language);
        out.put("expectedBodyParameterCount", EXPECTED_BODY_PARAMETERS);
        if (name == null || name.isBlank()) {
            return state(out, TemplateState.MISSING, "No template name saved: " + type.label() + " uses the manual flow.");
        }
        if (templates == null) {
            return state(out, TemplateState.NOT_CHECKED, notCheckedReason);
        }
        JsonNode match = null;
        Set<String> otherLanguages = new TreeSet<>();
        for (JsonNode t : templates) {
            if (!name.equals(t.path("name").asText())) continue;
            String lang = t.path("language").asText();
            if (lang.equals(language)) {
                match = t;
            } else {
                otherLanguages.add(lang);
            }
        }
        if (match == null) {
            return state(out, TemplateState.NOT_FOUND, otherLanguages.isEmpty()
                    ? "Meta has no template named " + name + "."
                    : "Meta has " + name + " only in " + String.join(", ", otherLanguages)
                    + ", not in the saved language " + language + ".");
        }

        String status = match.path("status").asText("").toUpperCase(Locale.ROOT);
        out.put("metaStatus", status);
        out.put("category", match.path("category").asText(null));
        String header = null;
        String bodyText = null;
        for (JsonNode c : match.path("components")) {
            String kind = c.path("type").asText("").toUpperCase(Locale.ROOT);
            if (kind.equals("HEADER")) header = c.path("format").asText("").toUpperCase(Locale.ROOT);
            if (kind.equals("BODY")) bodyText = c.path("text").asText("");
        }
        Set<String> placeholders = new LinkedHashSet<>();
        if (bodyText != null) {
            Matcher m = PLACEHOLDER.matcher(bodyText);
            while (m.find()) placeholders.add(m.group(1));
        }
        out.put("headerFormat", header);
        out.put("bodyParameterCount", placeholders.size());

        if (!"APPROVED".equals(status)) {
            return state(out, TemplateState.NOT_APPROVED, "Meta status is " + (status.isEmpty() ? "unknown" : status)
                    + ". Only APPROVED templates can be sent.");
        }
        boolean named = "NAMED".equalsIgnoreCase(match.path("parameter_format").asText(""))
                || placeholders.stream().anyMatch(p -> !p.matches("\\d+"));
        if (!"DOCUMENT".equals(header)) {
            return state(out, TemplateState.MISMATCH, "The template header is " + (header == null ? "missing" : header)
                    + "; it must be a Document header to carry the PDF.");
        }
        if (named) {
            return state(out, TemplateState.MISMATCH, "The template uses named variables; BillBull sends numbered ones, {{1}} to {{4}}.");
        }
        if (placeholders.size() != EXPECTED_BODY_PARAMETERS) {
            return state(out, TemplateState.MISMATCH, "The template body has " + placeholders.size()
                    + " variables; BillBull sends " + EXPECTED_BODY_PARAMETERS + " ({{1}} to {{4}}).");
        }
        return state(out, TemplateState.APPROVED, "Approved by Meta, with a Document header and 4 body variables.");
    }

    /** One sentence for an administrator. Meta's own text is kept for unknown codes; secrets are already redacted. */
    static String describe(WhatsAppApiException e) {
        Integer code = e.getMetaCode();
        if (code != null && code == 190) {
            return "Meta rejected the access token (error 190): it is invalid, expired or revoked. Generate a new System User token.";
        }
        if (code != null && (code == 10 || code == 200 || (code >= 200 && code < 300))) {
            return "The access token lacks a permission (Meta error " + code + "). It needs whatsapp_business_management "
                    + "and whatsapp_business_messaging, with this WhatsApp Business Account assigned to the System User.";
        }
        if (code != null && code == 100) {
            return "Meta could not find this ID, or the token cannot access it (error 100). Check the IDs in WhatsApp → API Setup.";
        }
        return e.getMessage();
    }

    private static Map<String, Object> state(Map<String, Object> out, TemplateState state, String message) {
        out.put("state", state.name());
        out.put("message", message);
        return out;
    }
}
