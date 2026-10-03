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
 * Thin HTTP client for the three Meta WhatsApp Cloud API calls BillBull needs:
 * <ul>
 *   <li>{@code GET  /{phone-number-id}}          — connection test (verified name, number, quality)</li>
 *   <li>{@code POST /{phone-number-id}/media}    — upload the PDF, returns a media id (kept by Meta ~30 days)</li>
 *   <li>{@code POST /{phone-number-id}/messages} — send the approved template with the PDF as its header</li>
 * </ul>
 * Uses the JDK HttpClient so no new dependency is added. Stateless: credentials come from the
 * {@link WhatsAppConfig} passed to each call.
 */
@Component
public class WhatsAppCloudApiClient {

    static final String GRAPH_BASE = "https://graph.facebook.com/";

    private final HttpClient http;
    private final ObjectMapper mapper;

    public WhatsAppCloudApiClient(ObjectMapper mapper) {
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** Returns Meta's view of the sender number: display_phone_number, verified_name, quality_rating. */
    public Map<String, Object> getPhoneNumberInfo(WhatsAppConfig cfg) {
        String url = base(cfg) + cfg.getPhoneNumberId()
                + "?fields=display_phone_number,verified_name,quality_rating,code_verification_status";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + cfg.getAccessToken())
                .GET().build();
        JsonNode body = execute(req);
        @SuppressWarnings("unchecked")
        Map<String, Object> info = mapper.convertValue(body, Map.class);
        return info;
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

        HttpRequest req = HttpRequest.newBuilder(URI.create(base(cfg) + cfg.getPhoneNumberId() + "/media"))
                .timeout(Duration.ofSeconds(60))
                .header("Authorization", "Bearer " + cfg.getAccessToken())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray()))
                .build();
        JsonNode body = execute(req);
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
            req = HttpRequest.newBuilder(URI.create(base(cfg) + cfg.getPhoneNumberId() + "/messages"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", "Bearer " + cfg.getAccessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                    .build();
        } catch (IOException e) {
            throw new WhatsAppApiException("Could not build WhatsApp request.", e);
        }
        JsonNode body = execute(req);
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

    private JsonNode execute(HttpRequest req) {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new WhatsAppApiException("Could not reach WhatsApp (graph.facebook.com): " + e.getMessage(), e);
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
            throw new WhatsAppApiException("WhatsApp error" + (code != null ? " " + code : "") + ": " + msg
                    + (details.isBlank() ? "" : " — " + details), code);
        }
        return body;
    }

    private static String base(WhatsAppConfig cfg) {
        return GRAPH_BASE + cfg.getGraphApiVersion() + "/";
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
