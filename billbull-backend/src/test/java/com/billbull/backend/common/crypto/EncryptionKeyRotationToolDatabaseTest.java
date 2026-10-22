package com.billbull.backend.common.crypto;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * T-P0-2: {@link EncryptionKeyRotationTool#run} end to end against a real PostgreSQL database: the
 * dry run writes nothing, {@code --apply} commits, a failure rolls every column back, and a second
 * run changes nothing.
 *
 * <p>It never touches an application database. It runs only when
 * {@code -Dbillbull.rotation-test.admin-url=jdbc:postgresql://host:port/postgres} is given (plus
 * {@code .user} and {@code .password}); otherwise every test is skipped. With it, the test creates
 * its own database named {@code bb_rotation_test_<random>}, builds the four encrypted columns there,
 * and drops the database afterwards.
 */
class EncryptionKeyRotationToolDatabaseTest {

    private static final String OLD = EncryptionKeyPolicy.DEV_FALLBACK_KEY;
    private static final String NEW = "rotation-test-new-key-0123456789abcdef-XYZ";
    private static final String THIRD = "a-key-nobody-configured-0123456789abcdef";
    private static final String PREFIX = "bb_rotation_test_";

    private static String adminUrl;
    private static String user;
    private static String password;
    private static String database;
    private static String url;

    private final EncryptedStringConverter oldKey = new EncryptedStringConverter(OLD);
    private final EncryptedStringConverter newKey = new EncryptedStringConverter(NEW);

    @BeforeAll
    static void createScratchDatabase() throws Exception {
        adminUrl = System.getProperty("billbull.rotation-test.admin-url");
        assumeTrue(adminUrl != null && !adminUrl.isBlank(),
                "set -Dbillbull.rotation-test.admin-url to run against a scratch PostgreSQL database");
        user = System.getProperty("billbull.rotation-test.user", "postgres");
        password = System.getProperty("billbull.rotation-test.password", "");
        database = PREFIX + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        try (Connection admin = DriverManager.getConnection(adminUrl, user, password);
             Statement st = admin.createStatement()) {
            st.execute("CREATE DATABASE " + database);
        }
        url = adminUrl.substring(0, adminUrl.lastIndexOf('/') + 1) + database;
        assertTrue(url.endsWith("/" + database) && database.startsWith(PREFIX), "scratch database only");
        try (Connection db = DriverManager.getConnection(url, user, password); Statement st = db.createStatement()) {
            st.execute("CREATE TABLE email_config (id bigint PRIMARY KEY, password varchar(1024))");
            st.execute("CREATE TABLE whatsapp_config (id bigint PRIMARY KEY, access_token varchar(2048), "
                    + "app_secret varchar(1024), webhook_verify_token varchar(1024))");
        }
    }

    @AfterAll
    static void dropScratchDatabase() throws Exception {
        if (database == null) return;
        try (Connection admin = DriverManager.getConnection(adminUrl, user, password);
             Statement st = admin.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
        }
    }

    @BeforeEach
    void seed() throws Exception {
        try (Connection db = connect(); Statement st = db.createStatement()) {
            st.execute("DELETE FROM email_config");
            st.execute("DELETE FROM whatsapp_config");
        }
        try (Connection db = connect()) {
            insert(db, "INSERT INTO email_config (id, password) VALUES (1, ?)", oldKey.convertToDatabaseColumn("smtp-app-pw"));
            try (PreparedStatement ps = db.prepareStatement(
                    "INSERT INTO whatsapp_config (id, access_token, app_secret, webhook_verify_token) VALUES (1, ?, ?, ?)")) {
                ps.setString(1, oldKey.convertToDatabaseColumn("meta-token-123"));
                ps.setString(2, "legacy-plain-app-secret"); // pre-encryption row
                ps.setString(3, null);
                ps.executeUpdate();
            }
        }
    }

    @Test
    void dryRunIsTheDefaultAndWritesNothing() throws Exception {
        Map<String, String> before = snapshot();

        Result r = run(false);

        assertEquals(0, r.code, r.output);
        assertTrue(r.output.contains("Dry run passed"), r.output);
        assertEquals(before, snapshot());
        assertNoSecretsIn(r.output);
    }

    @Test
    void applyReEncryptsEveryValueAndASecondRunChangesNothing() throws Exception {
        Result first = run(true);

        assertEquals(0, first.code, first.output);
        Map<String, String> after = snapshot();
        assertEquals("smtp-app-pw", newKey.convertToEntityAttribute(after.get("email_config.password")));
        assertEquals("meta-token-123", newKey.convertToEntityAttribute(after.get("whatsapp_config.access_token")));
        assertEquals("legacy-plain-app-secret", newKey.convertToEntityAttribute(after.get("whatsapp_config.app_secret")));
        assertNull(after.get("whatsapp_config.webhook_verify_token"));
        assertTrue(after.get("whatsapp_config.app_secret").startsWith(EncryptedStringConverter.PREFIX));
        assertThrows(IllegalStateException.class,
                () -> oldKey.convertToEntityAttribute(after.get("email_config.password")));

        Result second = run(true);

        assertEquals(0, second.code, second.output);
        assertEquals(after, snapshot(), "a repeated run must leave the ciphertext untouched");
        assertTrue(second.output.contains("email_config.password: 0 re-encrypted, 0 plaintext encrypted, 1 already on the new key"),
                second.output);
        assertNoSecretsIn(first.output);
        assertNoSecretsIn(second.output);
    }

    @Test
    void aValueThatNeitherKeyOpensRollsBackEveryColumn() throws Exception {
        try (Connection db = connect()) {
            // Last column in the tool's order, so the earlier columns were already rewritten in the transaction.
            insert(db, "UPDATE whatsapp_config SET webhook_verify_token = ? WHERE id = 1",
                    new EncryptedStringConverter(THIRD).convertToDatabaseColumn("verify-me"));
        }
        Map<String, String> before = snapshot();

        Result r = run(true);

        assertEquals(1, r.code, r.output);
        assertTrue(r.output.contains("whatsapp_config.webhook_verify_token id=1 decrypts with neither"), r.output);
        assertEquals(before, snapshot(), "nothing may be committed when one value fails");
        assertNoSecretsIn(r.output);
        assertFalse(r.output.contains(THIRD));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────

    private record Result(int code, String output) {}

    private Result run(boolean apply) throws Exception {
        java.util.List<String> args = new java.util.ArrayList<>(java.util.List.of(
                "--url", url, "--user", user, "--old-key-is-dev-default"));
        if (apply) args.add("--apply");
        Map<String, String> env = new HashMap<>();
        env.put("EMAIL_ENC_KEY_NEW", NEW);
        env.put("BILLBULL_DB_PASSWORD", password);
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int code = EncryptionKeyRotationTool.run(args.toArray(String[]::new), env,
                new PrintStream(buf, true, StandardCharsets.UTF_8));
        return new Result(code, buf.toString(StandardCharsets.UTF_8));
    }

    private Map<String, String> snapshot() throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        try (Connection db = connect(); Statement st = db.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT password FROM email_config WHERE id = 1")) {
                rs.next();
                values.put("email_config.password", rs.getString(1));
            }
            try (ResultSet rs = st.executeQuery(
                    "SELECT access_token, app_secret, webhook_verify_token FROM whatsapp_config WHERE id = 1")) {
                rs.next();
                values.put("whatsapp_config.access_token", rs.getString(1));
                values.put("whatsapp_config.app_secret", rs.getString(2));
                values.put("whatsapp_config.webhook_verify_token", rs.getString(3));
            }
        }
        return values;
    }

    private void assertNoSecretsIn(String output) throws Exception {
        for (String secret : new String[] {OLD, NEW, "smtp-app-pw", "meta-token-123", "legacy-plain-app-secret", password}) {
            // A short scratch DB password (e.g. "admin") could match ordinary words in the output.
            if (secret == null || secret.length() < 8) continue;
            assertFalse(output.contains(secret), "output must not contain a key, secret or password");
        }
        for (String stored : snapshot().values()) {
            if (stored != null) assertFalse(output.contains(stored), "output must not contain ciphertext");
        }
    }

    private static Connection connect() throws Exception {
        return DriverManager.getConnection(url, user, password);
    }

    private static void insert(Connection db, String sql, String value) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(sql)) {
            ps.setString(1, value);
            ps.executeUpdate();
        }
    }
}
