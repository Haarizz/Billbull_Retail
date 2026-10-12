package com.billbull.backend.document;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.Path;
import java.util.Map;

import static com.billbull.backend.document.PdfResourcePolicy.Kind.*;
import static org.junit.jupiter.api.Assertions.*;

class PdfResourcePolicyTest {

    @TempDir Path uploads;

    private PdfResourcePolicy policy(Map<String, String> dns) {
        return new PdfResourcePolicy(uploads, host -> {
            String ip = dns.get(host);
            if (ip == null) throw new UnknownHostException(host);
            return new InetAddress[]{InetAddress.getByName(ip)};
        });
    }

    @Test
    void uploadsOnAnyHostAreServedFromTheUploadDirectory() {
        PdfResourcePolicy p = policy(Map.of());
        for (String url : new String[]{
                "https://erp.client.com/uploads/company/logo.png",
                "http://localhost:5173/uploads/company/logo.png",
                "http://127.0.0.1:8080/uploads/company/logo.png?v=3"}) {
            PdfResourcePolicy.Decision d = p.decide(url);
            assertEquals(LOCAL_UPLOAD, d.kind(), url);
            assertEquals(uploads.resolve("company/logo.png").toAbsolutePath().normalize(), d.file());
        }
    }

    @Test
    void uploadPathsCannotEscapeTheUploadDirectory() {
        PdfResourcePolicy p = policy(Map.of());
        assertEquals(BLOCK, p.decide("http://x/uploads/../application.properties").kind());
        assertEquals(BLOCK, p.decide("http://x/uploads/%2e%2e/%2e%2e/etc/passwd").kind());
        assertEquals(BLOCK, p.decide("http://x/uploads/").kind());
    }

    @Test
    void publicHostsAreFetchedPrivateOnesBlocked() {
        PdfResourcePolicy p = policy(Map.of(
                "fonts.googleapis.com", "142.250.74.10",
                "cdn.example.com", "93.184.216.34",
                "metadata.internal", "169.254.169.254",
                "db.lan", "10.0.0.5",
                "router", "192.168.1.1",
                "corp", "172.16.4.4",
                "cgnat", "100.64.1.1",
                "v6local", "fd00::1",
                "mapped", "::ffff:127.0.0.1"));
        assertEquals(FETCH, p.decide("https://fonts.googleapis.com/css2?family=Inter").kind());
        assertEquals(FETCH, p.decide("https://cdn.example.com/brand.png").kind());
        for (String host : new String[]{"metadata.internal", "db.lan", "router", "corp", "cgnat", "v6local", "mapped"}) {
            assertEquals(BLOCK, p.decide("http://" + host + "/latest/meta-data/").kind(), host);
        }
        assertEquals(BLOCK, p.decide("http://127.0.0.1:8080/api/users").kind());
        assertEquals(BLOCK, p.decide("http://localhost:8080/actuator").kind());
        assertEquals(BLOCK, p.decide("http://[::1]/").kind());
        assertEquals(BLOCK, p.decide("http://0.0.0.0/").kind());
        assertEquals(BLOCK, p.decide("http://unknown.invalid/x.png").kind());
    }

    @Test
    void literalAddressesAreJudgedWithTheRealResolver() {
        PdfResourcePolicy p = new PdfResourcePolicy(uploads, InetAddress::getAllByName);
        for (String url : new String[]{
                "http://127.0.0.1:8080/api/users", "http://[::1]:8080/", "http://169.254.169.254/latest/",
                "http://0.0.0.0/", "http://10.1.2.3/", "http://[fd12::1]/", "http://[::ffff:10.0.0.1]/"}) {
            assertEquals(BLOCK, p.decide(url).kind(), url);
        }
        assertEquals(FETCH, p.decide("http://93.184.216.34/logo.png").kind());
    }

    @Test
    void nonHttpSchemesAreBlocked() {
        PdfResourcePolicy p = policy(Map.of());
        assertEquals(BLOCK, p.decide("file:///etc/passwd").kind());
        assertEquals(BLOCK, p.decide("file:///C:/Windows/win.ini").kind());
        assertEquals(BLOCK, p.decide("ftp://example.com/x").kind());
        assertEquals(BLOCK, p.decide("chrome://settings").kind());
        assertEquals(BLOCK, p.decide("not a url").kind());
    }
}
