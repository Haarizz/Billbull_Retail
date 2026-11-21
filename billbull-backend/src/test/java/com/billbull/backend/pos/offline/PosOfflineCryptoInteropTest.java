package com.billbull.backend.pos.offline;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * M3: JavaScript ↔ Java interoperability of the offline record format. The vectors file is produced
 * by the browser's own canonicaliser (packages/shared/.../offline/jcs.js) and Node WebCrypto, so these
 * tests prove the two sides agree byte for byte and that a WebCrypto P1363 signature verifies here.
 */
class PosOfflineCryptoInteropTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode vectors() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/pos-offline/jcs-vectors.json")) {
            return mapper.readTree(in);
        }
    }

    @Test
    void canonicalFormMatchesTheBrowserForEverySharedVector() throws Exception {
        for (JsonNode v : vectors().path("vectors")) {
            String canonical = OfflineJcs.canonicalize(mapper.readTree(v.path("input").asText()));
            assertEquals(v.path("expected").asText(), canonical, v.path("name").asText());
        }
    }

    @Test
    void browserSignatureVerifiesInJava() throws Exception {
        JsonNode sig = vectors().path("signature");
        byte[] canonical = OfflineJcs.canonicalBytes(sig.path("record"));
        assertArrayEquals(sig.path("canonical").asText().getBytes(StandardCharsets.UTF_8), canonical);
        assertEquals(sig.path("sha256").asText(), PosOfflineCrypto.sha256Hex(canonical));
        var key = PosOfflineCrypto.parseP256Spki(sig.path("spki").asText());
        assertTrue(PosOfflineCrypto.verify(key, canonical, PosOfflineCrypto.base64UrlDecode(sig.path("sig").asText())));
    }

    @Test
    void anEditedRecordNoLongerVerifies() throws Exception {
        JsonNode sig = vectors().path("signature");
        ObjectNode edited = (ObjectNode) sig.path("record").deepCopy();
        edited.put("totalMinor", 1);
        var key = PosOfflineCrypto.parseP256Spki(sig.path("spki").asText());
        assertFalse(PosOfflineCrypto.verify(key, OfflineJcs.canonicalBytes(edited),
                PosOfflineCrypto.base64UrlDecode(sig.path("sig").asText())));
    }

    @Test
    void floatingPointNumbersAreRefusedRatherThanCanonicalised() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> OfflineJcs.canonicalize(mapper.readTree("{\"a\":1.5}")));
        assertThrows(IllegalArgumentException.class, () -> OfflineJcs.canonicalize(mapper.readTree("{\"a\":1.0}")));
        assertThrows(IllegalArgumentException.class, () -> OfflineJcs.canonicalize(mapper.readTree("{\"a\":9007199254740992}")));
    }

    @Test
    void leaseJwsIsCompactEs256WithARawP1363Signature() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = gen.generateKeyPair();
        var loaded = new PosOfflineSigningKeyStore.Loaded("tenant_x", "kid1", pair.getPrivate(), pair.getPublic(),
                Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));
        ObjectNode claims = mapper.createObjectNode().put("lid", "abc").put("exp", 123);
        String[] parts = PosOfflineLeaseService.signJws(claims, loaded).split("\\.");
        assertEquals(3, parts.length);
        JsonNode header = mapper.readTree(PosOfflineCrypto.base64UrlDecode(parts[0]));
        assertEquals("ES256", header.path("alg").asText());
        byte[] sigBytes = PosOfflineCrypto.base64UrlDecode(parts[2]);
        assertEquals(64, sigBytes.length, "JWS ES256 signatures are r||s, which WebCrypto verifies directly");
        assertTrue(PosOfflineCrypto.verify(pair.getPublic(), (parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII), sigBytes));
    }
}
