package com.billbull.backend.settings.whatsapp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Thin HTTP client for the Meta WhatsApp Cloud API calls BillBull needs:
 * <ul>
 *   <li>{@code GET  /{phone-number-id}}          — connection test (verified name, number, quality)</li>
 *   <li>{@code GET  /{waba-id}}, {@code /{waba-id}/phone_numbers}, {@code /{waba-id}/message_templates}
 *       — connection test (WABA access, number ownership, template approval)</li>
 *   <li>{@code POST /{phone-number-id}/media}    — upload the PDF, returns a media id (kept by Meta ~30 days)</li>
 *   <li>{@code POST /{phone-number-id}/messages} — send the approved template with the PDF as its header</li>
 * </ul>
 * Uses the JDK HttpClient so no new dependency is added. Stateless: credentials come from the
 * {@link WhatsAppConfig} passed to each call.
 */
@Component
public class WhatsAppCloudApiClient {

    static final String GRAPH_BASE = "https://graph.facebook.com/";

    /** Pages read when listing a WABA's numbers or templates: 10 x 100 is far beyond any real account. */
    static final int MAX_PAGES = 10;
    private static final java.util.regex.Pattern META_ID = java.util.regex.Pattern.compile("\\d{1,64}");
    private static final java.util.regex.Pattern CURSOR = java.util.regex.Pattern.compile("[A-Za-z0-9_=-]{1,512}");

    private final HttpClient http;
    private final ObjectMapper mapper;

    @org.springframework.beans.factory.annotation.Autowired
    public WhatsAppCloudApiClient(ObjectMapper mapper) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    /** For tests: a mocked HttpClient, so no call leaves the machine. */
    WhatsAppCloudApiClient(ObjectMapper mapper, HttpClient http) {
        this.mapper = mapper;
        this.http = http;
    }

    /** Returns Meta's view of the sender number: display_phone_number, verified_name, quality_rating. */
    public Map<String, Object> getPhoneNumberInfo(WhatsAppConfig cfg) {
        String url = base(cfg) + phoneId(cfg)
                + "?fields=display_phone_number,verified_name,quality_rating,code_verification_status";
        JsonNode body = execute(get(cfg, url), cfg);
        @SuppressWarnings("unchecked")
        Map<String, Object> info = mapper.convertValue(body, Map.class);
        return info;
    }

    /** {@code id} and {@code name} of the WhatsApp Business Account; fails when the token cannot read it. */
    public JsonNode getBusinessAccount(WhatsAppConfig cfg) {
        return execute(get(cfg, base(cfg) + wabaId(cfg) + "?fields=id,name"), cfg);
    }

    /** Ids of the phone numbers registered under the WABA. */
    public List<String> listPhoneNumberIds(WhatsAppConfig cfg) {
        List<String> ids = new java.util.ArrayList<>();
        for (JsonNode row : listEdge(cfg, "phone_numbers", "id")) {
            ids.add(row.path("id").asText(""));
        }
        return ids;
    }

    /** Every message template of the WABA with name, language, status, category, format and components. */
    public List<JsonNode> listTemplates(WhatsAppConfig cfg) {
        return listEdge(cfg, "message_templates", "name,language,status,category,parameter_format,components");
    }

    /**
     * Pages through {@code /{waba-id}/{edge}} by the {@code after} cursor. The next request is always
     * built here on graph.facebook.com; Meta's "next" URL is never followed.
     */
    private List<JsonNode> listEdge(WhatsAppConfig cfg, String edge, String fields) {
        List<JsonNode> rows = new java.util.ArrayList<>();
        String after = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            String url = base(cfg) + wabaId(cfg) + "/" + edge + "?fields=" + fields + "&limit=100"
                    + (after != null ? "&after=" + after : "");
            JsonNode body = execute(get(cfg, url), cfg);
            body.path("data").forEach(rows::add);
            String next = body.path("paging").path("cursors").path("after").asText(null);
            boolean more = body.path("paging").has("next");
            if (!more || next == null || !CURSOR.matcher(next).matches()) break;
            after = next;
        }
        return rows;
    }

    private static HttpRequest get(WhatsAppConfig cfg, String url) {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + cfg.getAccessToken())
                .GET().build();
    }

    /** Uploads a file to the sender number's media store and returns its media id. */
    public String uploadMedia(WhatsAppConfig cfg, byte[] bytes, String filename, String mimeType) {
        String boundary = "----BillBull" + UUID.randomUUID().toString().replace("-", "");
        ByteArrayOutputStream out = new ByteArrayOutputStream(bytes.length + 512);
        writeField(out, boundary, "messaging_product", "whatsapp");
        writeField(out, boundary, "type", mimeType);
        writeBytes(out, ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + filename.replace("\"", "") + "\"\r\n"
                + "Content-Type: " + mimeType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        writeBytes(out, bytes);
        writeBytes(out, ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest req = HttpRequest.newBuilder(URI.create(base(cfg) + phoneId(cfg) + "/media"))
                .timeout(Duration.ofSeconds(60))
                .header("Authorization", "Bearer " + cfg.getAccessToken())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray()))
                .build();
        JsonNode body = execute(req, cfg);
        String id = body.path("id").asText(null);
        if (id == null || id.isBlank()) {
            throw new WhatsAppApiException("Meta did not return a media id for the uploaded PDF.", (Integer) null);
        }
        return id;
    }

    /**
     * Sends an approved template whose header is a DOCUMENT and whose body has {@code bodyParams.size()}
     * text variables ({{1}}, {{2}}, ...). Returns the WhatsApp message id ("wamid...") that later
     * webhook status callbacks refer to.
     */
    public String sendDocumentTemplate(WhatsAppConfig cfg, String toPhone, String templateName,
                                       String mediaId, String filename, List<String> bodyParams) {
        ObjectNode root = mapper.createObjectNode();
        root.put("messaging_product", "whatsapp");
        root.put("recipient_type", "individual");
        root.put("to", toPhone);
        root.put("type", "template");
        ObjectNode template = root.putObject("template");
        template.put("name", templateName);
        template.putObject("language").put("code", cfg.getTemplateLanguage());
        ArrayNode components = template.putArray("components");

        ObjectNode header = components.addObject();
        header.put("type", "header");
        ObjectNode doc = header.putArray("parameters").addObject();
        doc.put("type", "document");
        doc.putObject("document").put("id", mediaId).put("filename", filename);

        if (bodyParams != null && !bodyParams.isEmpty()) {
            ObjectNode bodyComp = components.addObject();
            bodyComp.put("type", "body");
            ArrayNode params = bodyComp.putArray("parameters");
            for (String p : bodyParams) {
                params.addObject().put("type", "text").put("text", sanitizeParam(p));
            }
        }

        HttpRequest req;
        try {
            req = HttpRequest.newBuilder(URI.create(base(cfg) + phoneId(cfg) + "/messages"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", "Bearer " + cfg.getAccessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                    .build();
        } catch (IOException e) {
            throw new WhatsAppApiException("Could not build WhatsApp request.", e);
        }
        JsonNode body = execute(req, cfg);
        String wamid = body.path("messages").path(0).path("id").asText(null);
        if (wamid == null || wamid.isBlank()) {
            throw new WhatsAppApiException("Meta accepted the request but returned no message id.", (Integer) null);
        }
        return wamid;
    }

    /**
     * Meta rejects template text parameters containing newlines, tabs or more than four
     * consecutive spaces (error 132018), and an empty parameter. Flatten instead of failing.
     */
    static String sanitizeParam(String value) {
        String v = value == null ? "" : value.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {2,}", " ").trim();
        return v.isEmpty() ? "-" : v;
    }

    /** Every message that leaves here has the token and app secret removed, whatever Meta echoed. */
    private JsonNode execute(HttpRequest req, WhatsAppConfig cfg) {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new WhatsAppApiException(redact("Could not reach WhatsApp (graph.facebook.com): " + e.getMessage(), cfg), (Integer) null);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WhatsAppApiException("WhatsApp request was interrupted.", e);
        }
        JsonNode body;
        try {
            body = mapper.readTree(res.body() == null || res.body().isBlank() ? "{}" : res.body());
        } catch (IOException e) {
            throw new WhatsAppApiException("Unreadable response from WhatsApp (HTTP " + res.statusCode() + ").", e);
        }
        if (res.statusCode() >= 400 || body.has("error")) {
            JsonNode err = body.path("error");
            Integer code = err.has("code") ? err.path("code").asInt() : null;
            String details = err.path("error_data").path("details").asText("");
            String msg = err.path("message").asText("HTTP " + res.statusCode());
            throw new WhatsAppApiException(redact("WhatsApp error" + (code != null ? " " + code : "") + ": " + msg
                    + (details.isBlank() ? "" : " — " + details), cfg), code);
        }
        return body;
    }

    static String redact(String message, WhatsAppConfig cfg) {
        String out = message == null ? "" : message;
        for (String secret : new String[] {cfg.getAccessToken(), cfg.getAppSecret(), cfg.getWebhookVerifyToken()}) {
            if (secret != null && secret.length() >= 6) out = out.replace(secret, "[redacted]");
        }
        return out;
    }

    /**
     * The URL is built from saved settings, so each segment is checked first: the host is fixed to
     * graph.facebook.com, and the version and ids can only be the shapes Meta uses.
     */
    private static String base(WhatsAppConfig cfg) {
        if (!GraphApiVersion.isWellFormed(cfg.getGraphApiVersion())) {
            throw new WhatsAppApiException("The saved Graph API Version is not valid. Set it to "
                    + GraphApiVersion.DEFAULT + " in WhatsApp Settings and save.", (Integer) null);
        }
        return GRAPH_BASE + cfg.getGraphApiVersion() + "/";
    }

    private static String phoneId(WhatsAppConfig cfg) {
        if (cfg.getPhoneNumberId() == null || !META_ID.matcher(cfg.getPhoneNumberId()).matches()) {
            throw new WhatsAppApiException("The saved Phone Number ID is missing or not numeric.", (Integer) null);
        }
        return cfg.getPhoneNumberId();
    }

    private static String wabaId(WhatsAppConfig cfg) {
        if (cfg.getBusinessAccountId() == null || !META_ID.matcher(cfg.getBusinessAccountId()).matches()) {
            throw new WhatsAppApiException("The saved WhatsApp Business Account ID is missing or not numeric.", (Integer) null);
        }
        return cfg.getBusinessAccountId();
    }

    private static void writeField(ByteArrayOutputStream out, String boundary, String name, String value) {
        writeBytes(out, ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
                + value + "\r\n").getBytes(StandardCharsets.UTF_8));
    }

    private static void writeBytes(ByteArrayOutputStream out, byte[] bytes) {
        out.write(bytes, 0, bytes.length);
    }
}
