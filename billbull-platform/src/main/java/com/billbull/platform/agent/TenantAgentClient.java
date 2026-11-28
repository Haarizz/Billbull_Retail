package com.billbull.platform.agent;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.billbull.platform.config.SecretCipher;
import com.billbull.platform.tenant.Tenant;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Calls a tenant backend's platform agent ({@code <agentUrl>/api/platform/...}), signing every
 * request with that tenant's own secret. A fresh nonce per call means a captured request can't be
 * replayed, and the tenant rejects anything older than its clock-skew window.
 *
 * <p>Redirects are never followed: the signature covers the path, and a redirect would be a sign
 * the agent URL is wrong.
 */
@Component
public class TenantAgentClient {

    private final SecretCipher cipher;
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final Duration requestTimeout;

    public TenantAgentClient(SecretCipher cipher, ObjectMapper mapper,
                             @Value("${platform.agent.connect-timeout-ms:4000}") long connectTimeoutMs,
                             @Value("${platform.agent.request-timeout-ms:10000}") long requestTimeoutMs) {
        this.cipher = cipher;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        this.requestTimeout = Duration.ofMillis(requestTimeoutMs);
    }

    public boolean configured(Tenant t) {
        return t.agentUrl != null && !t.agentUrl.isBlank() && t.agentSecretEnc != null;
    }

    public AgentResponse get(Tenant t, String path, String actor) {
        return call(t, "GET", path, null, actor);
    }

    public AgentResponse put(Tenant t, String path, Object body, String actor) {
        return call(t, "PUT", path, body, actor);
    }

    public AgentResponse post(Tenant t, String path, Object body, String actor) {
        return call(t, "POST", path, body, actor);
    }

    AgentResponse call(Tenant t, String method, String path, Object body, String actor) {
        return call(t, method, path, body, actor, requestTimeout);
    }

    /** As {@link #call}, with its own timeout — for console statements that may run for minutes. */
    public AgentResponse call(Tenant t, String method, String path, Object body, String actor, Duration timeout) {
        if (!configured(t)) {
            return new AgentResponse(0, null, 0, "agent URL or secret not set");
        }
        long started = System.nanoTime();
        try {
            HttpRequest request = signed(t, method, path, body, actor, timeout, "application/json");
            HttpResponse<byte[]> res = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            long ms = (System.nanoTime() - started) / 1_000_000;
            JsonNode json = parse(res.body());
            return new AgentResponse(res.statusCode(), json, ms, null);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new AgentResponse(0, null, elapsed(started), "interrupted");
        } catch (Exception e) {
            String msg = e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
            return new AgentResponse(0, null, elapsed(started), msg.length() > 300 ? msg.substring(0, 300) : msg);
        }
    }

    /**
     * A signed GET whose body is streamed rather than buffered (database dumps can be gigabytes).
     * The caller must close the returned stream. {@code timeout} only covers the wait for the
     * response headers.
     */
    public HttpResponse<java.io.InputStream> stream(Tenant t, String path, String actor, Duration timeout)
            throws java.io.IOException, InterruptedException {
        if (!configured(t)) throw new java.io.IOException("agent URL or secret not set");
        HttpRequest request = signed(t, "GET", path, null, actor, timeout, "application/octet-stream, application/json");
        return http.send(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    private HttpRequest signed(Tenant t, String method, String path, Object body, String actor, Duration timeout,
                               String accept) throws java.io.IOException {
        URI uri = URI.create(stripTrailingSlash(t.agentUrl.trim()) + path);
        String signedPath = uri.getRawPath();
        byte[] bytes = body == null ? new byte[0] : mapper.writeValueAsBytes(body);
        String ts = String.valueOf(Instant.now().getEpochSecond());
        String nonce = UUID.randomUUID().toString();
        String secret = cipher.decrypt(t.agentSecretEnc);

        HttpRequest.Builder rb = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Accept", accept)
                .header(AgentSignature.HEADER_TIMESTAMP, ts)
                .header(AgentSignature.HEADER_NONCE, nonce)
                .header(AgentSignature.HEADER_SIGNATURE, AgentSignature.sign(secret, method, signedPath, ts, nonce, bytes))
                .header(AgentSignature.HEADER_ACTOR, actor == null ? "platform" : actor);
        if (body != null) {
            rb.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofByteArray(bytes));
        } else {
            rb.method(method, HttpRequest.BodyPublishers.noBody());
        }
        return rb.build();
    }

    private JsonNode parse(byte[] body) {
        if (body == null || body.length == 0) return null;
        try {
            return mapper.readTree(body);
        } catch (Exception e) {
            return null;
        }
    }

    private static long elapsed(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
