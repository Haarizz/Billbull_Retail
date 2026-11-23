package com.billbull.backend.pos.offline;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The tenant's offline-lease signing key (ECDSA P-256).
 *
 * <p>Held in a file outside the tenant database ({@code pos.offline.signing-key-dir}, one pair per
 * tenant database name), so a leaked database or backup cannot mint leases: it holds only lease
 * rows and public keys. Generated on first use. Back the directory up with the server's other
 * secrets; losing it only means tills must fetch a new lease (outstanding leases stay verifiable
 * server-side because ingest trusts the lease row, not the till's copy).
 */
@Component
public class PosOfflineSigningKeyStore {

    private static final Logger log = LoggerFactory.getLogger(PosOfflineSigningKeyStore.class);

    private final JdbcTemplate jdbc;
    private final Path dir;

    private volatile Loaded loaded;

    public record Loaded(String tenant, String keyId, PrivateKey privateKey, PublicKey publicKey, String spkiBase64) {}

    public PosOfflineSigningKeyStore(JdbcTemplate jdbc,
                                     @Value("${pos.offline.signing-key-dir:${user.home}/.billbull/pos-offline-keys}") String dir) {
        this.jdbc = jdbc;
        this.dir = Path.of(dir);
    }

    /** The tenant identity: the database name, as {@code pos_checkout_attempts.tenant_db} uses. */
    public String tenant() {
        return current().tenant();
    }

    public Loaded current() {
        Loaded l = loaded;
        if (l != null) return l;
        synchronized (this) {
            if (loaded == null) loaded = loadOrCreate(jdbc.queryForObject("SELECT current_database()", String.class));
            return loaded;
        }
    }

    private Loaded loadOrCreate(String tenant) {
        String safe = tenant.replaceAll("[^A-Za-z0-9_.-]", "_");
        Path priv = dir.resolve(safe + ".p8");
        Path pub = dir.resolve(safe + ".spki");
        try {
            KeyFactory kf = KeyFactory.getInstance("EC");
            if (!Files.exists(priv) || !Files.exists(pub)) {
                Files.createDirectories(dir);
                KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
                gen.initialize(new ECGenParameterSpec("secp256r1"));
                KeyPair pair = gen.generateKeyPair();
                Files.writeString(priv, Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),
                        StandardCharsets.US_ASCII, StandardOpenOption.CREATE_NEW);
                Files.writeString(pub, Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),
                        StandardCharsets.US_ASCII, StandardOpenOption.CREATE_NEW);
                restrictToOwner(priv);
                log.info("Generated the offline-lease signing key for tenant {} in {}", tenant, dir);
            }
            PrivateKey privateKey = kf.generatePrivate(new PKCS8EncodedKeySpec(
                    Base64.getDecoder().decode(Files.readString(priv, StandardCharsets.US_ASCII).trim())));
            String spki = Files.readString(pub, StandardCharsets.US_ASCII).trim();
            PublicKey publicKey = PosOfflineCrypto.parseP256Spki(spki);
            String keyId = PosOfflineCrypto.sha256Hex(Base64.getDecoder().decode(spki)).substring(0, 16);
            return new Loaded(tenant, keyId, privateKey, publicKey, spki);
        } catch (IOException | GeneralSecurityException e) {
            throw new IllegalStateException("Offline-lease signing key unavailable in " + dir + ": " + e.getMessage(), e);
        }
    }

    private static void restrictToOwner(Path file) {
        try {
            file.toFile().setReadable(false, false);
            file.toFile().setReadable(true, true);
            file.toFile().setWritable(false, false);
            file.toFile().setWritable(true, true);
        } catch (SecurityException ignored) {
            // Best effort; the directory's own ACL is the real control.
        }
    }
}
