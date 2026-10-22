package com.billbull.backend.common.crypto;

import java.io.PrintStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Re-encrypts the stored integration secrets of one tenant database from an old
 * {@code EMAIL_ENC_KEY} to a new one, in the existing {@code enc:v1:} format. Offline: stop that
 * tenant's backend first, back the database up, and start the backend with the new key afterwards.
 *
 * <pre>
 * EMAIL_ENC_KEY_OLD=... EMAIL_ENC_KEY_NEW=... BILLBULL_DB_PASSWORD=... \
 * java -cp billbull-backend-0.0.1-SNAPSHOT.jar \
 *      -Dloader.main=com.billbull.backend.common.crypto.EncryptionKeyRotationTool \
 *      org.springframework.boot.loader.launch.PropertiesLauncher \
 *      --url jdbc:postgresql://localhost:5432/&lt;db&gt; --user &lt;db user&gt; [--old-key-is-dev-default] [--apply]
 * </pre>
 *
 * <ul>
 *   <li>Keys and the database password come from the environment, so they stay out of the
 *       process list and shell history. {@code --old-key-is-dev-default} uses the public development
 *       key as the old key, for a deployment that never set one.</li>
 *   <li>The new key must pass {@link EncryptionKeyPolicy} for a deployment.</li>
 *   <li>Everything runs in one transaction. Each value is decrypted with the old key, encrypted
 *       with the new one and decrypted again to compare. Without {@code --apply} the transaction is
 *       rolled back (dry run). Any value that decrypts with neither key aborts the run with nothing
 *       written.</li>
 *   <li>Values already under the new key are left alone, so a run can be repeated. Legacy
 *       plaintext values are encrypted with the new key.</li>
 *   <li>Output is counts per column. No secret, key or ciphertext is printed.</li>
 * </ul>
 * Exit codes: 0 done (or dry run passed), 1 failed and rolled back, 2 usage error.
 */
public final class EncryptionKeyRotationTool {

    /** A column written through {@link EncryptedStringConverter}; the table has a {@code id} key. */
    record EncryptedColumn(String table, String column) {
        @Override
        public String toString() { return table + "." + column; }
    }

    /**
     * Every column that uses {@link EncryptedStringConverter}. A test scans the entities and fails
     * when a new {@code @Convert(converter = EncryptedStringConverter.class)} column is missing here.
     */
    static final List<EncryptedColumn> COLUMNS = List.of(
            new EncryptedColumn("email_config", "password"),
            new EncryptedColumn("whatsapp_config", "access_token"),
            new EncryptedColumn("whatsapp_config", "app_secret"),
            new EncryptedColumn("whatsapp_config", "webhook_verify_token"));

    enum Outcome { REENCRYPTED, PLAINTEXT_ENCRYPTED, ALREADY_ON_NEW_KEY }

    record Rotation(String stored, Outcome outcome) {}

    private EncryptionKeyRotationTool() {}

    public static void main(String[] args) {
        int code;
        try {
            code = run(args, System.getenv(), System.out);
        } catch (Exception e) {
            System.out.println("Rotation failed, nothing was written: " + e.getMessage());
            code = 1;
        }
        System.exit(code);
    }

    /**
     * One stored value under the new key. Throws IllegalStateException (without the value) when
     * it decrypts with neither key or the new ciphertext does not round-trip.
     */
    static Rotation rotate(String stored, EncryptedStringConverter oldKey, EncryptedStringConverter newKey) {
        if (!stored.startsWith(EncryptedStringConverter.PREFIX)) {
            return new Rotation(newKey.convertToDatabaseColumn(stored), Outcome.PLAINTEXT_ENCRYPTED);
        }
        String plain;
        try {
            plain = oldKey.convertToEntityAttribute(stored);
        } catch (IllegalStateException notOldKey) {
            try {
                newKey.convertToEntityAttribute(stored);
                return new Rotation(stored, Outcome.ALREADY_ON_NEW_KEY);
            } catch (IllegalStateException notNewKey) {
                throw new IllegalStateException("decrypts with neither the old nor the new key");
            }
        }
        String rotated = newKey.convertToDatabaseColumn(plain);
        if (!plain.equals(newKey.convertToEntityAttribute(rotated))) {
            throw new IllegalStateException("re-encrypted value does not decrypt back to the original");
        }
        return new Rotation(rotated, Outcome.REENCRYPTED);
    }

    static int run(String[] args, Map<String, String> env, PrintStream out) throws SQLException {
        String url = null;
        String user = null;
        boolean apply = false;
        boolean oldIsDevDefault = false;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--url" -> url = i + 1 < args.length ? args[++i] : null;
                case "--user" -> user = i + 1 < args.length ? args[++i] : null;
                case "--apply" -> apply = true;
                case "--old-key-is-dev-default" -> oldIsDevDefault = true;
                default -> {
                    out.println("Unknown argument: " + args[i]);
                    return 2;
                }
            }
        }
        String oldSecret = oldIsDevDefault ? EncryptionKeyPolicy.DEV_FALLBACK_KEY : env.get("EMAIL_ENC_KEY_OLD");
        String newSecret = env.get("EMAIL_ENC_KEY_NEW");
        if (url == null || user == null || oldSecret == null || oldSecret.isBlank()) {
            out.println("Usage: --url <jdbc url> --user <db user> [--old-key-is-dev-default] [--apply], with "
                    + "EMAIL_ENC_KEY_OLD (unless --old-key-is-dev-default), EMAIL_ENC_KEY_NEW and "
                    + "BILLBULL_DB_PASSWORD in the environment.");
            return 2;
        }
        try {
            // Judge the new key as a deployment would: the development key or a short key is refused.
            EncryptionKeyPolicy.resolve(newSecret, new String[] {"deployment"});
        } catch (IllegalStateException e) {
            out.println("EMAIL_ENC_KEY_NEW " + e.getMessage().substring(EncryptionKeyPolicy.PROPERTY.length() + 1));
            return 2;
        }
        if (newSecret.equals(oldSecret)) {
            out.println("EMAIL_ENC_KEY_NEW is the same as the old key; nothing to rotate.");
            return 2;
        }

        EncryptedStringConverter oldKey = new EncryptedStringConverter(oldSecret);
        EncryptedStringConverter newKey = new EncryptedStringConverter(newSecret);
        try (Connection db = DriverManager.getConnection(url, user, env.get("BILLBULL_DB_PASSWORD"))) {
            db.setAutoCommit(false);
            try {
                List<String> report = new ArrayList<>();
                for (EncryptedColumn column : COLUMNS) {
                    report.add(rotateColumn(db, column, oldKey, newKey));
                }
                verifyAllReadable(db, newKey);
                report.forEach(out::println);
                if (apply) {
                    db.commit();
                    out.println("Committed. Start the backend with the new EMAIL_ENC_KEY and check Email and "
                            + "WhatsApp settings (Send Test Email, Test Connection).");
                } else {
                    db.rollback();
                    out.println("Dry run passed; nothing was written. Re-run with --apply to commit.");
                }
                return 0;
            } catch (RuntimeException | SQLException e) {
                db.rollback();
                out.println("Rotation failed, nothing was written: " + e.getMessage());
                return 1;
            }
        }
    }

    private static String rotateColumn(Connection db, EncryptedColumn column,
                                       EncryptedStringConverter oldKey, EncryptedStringConverter newKey)
            throws SQLException {
        if (!tableExists(db, column.table())) {
            return column + ": table not present, skipped";
        }
        Map<Outcome, Integer> counts = new EnumMap<>(Outcome.class);
        // Table and column names are the constants above, never input.
        String select = "SELECT id, " + column.column() + " FROM " + column.table()
                + " WHERE " + column.column() + " IS NOT NULL AND " + column.column() + " <> '' FOR UPDATE";
        String update = "UPDATE " + column.table() + " SET " + column.column() + " = ? WHERE id = ?";
        try (PreparedStatement read = db.prepareStatement(select);
             ResultSet rows = read.executeQuery();
             PreparedStatement write = db.prepareStatement(update)) {
            while (rows.next()) {
                long id = rows.getLong(1);
                Rotation rotation;
                try {
                    rotation = rotate(rows.getString(2), oldKey, newKey);
                } catch (IllegalStateException e) {
                    throw new IllegalStateException(column + " id=" + id + " " + e.getMessage());
                }
                if (rotation.outcome() != Outcome.ALREADY_ON_NEW_KEY) {
                    write.setString(1, rotation.stored());
                    write.setLong(2, id);
                    write.executeUpdate();
                }
                counts.merge(rotation.outcome(), 1, Integer::sum);
            }
        }
        return column + ": " + counts.getOrDefault(Outcome.REENCRYPTED, 0) + " re-encrypted, "
                + counts.getOrDefault(Outcome.PLAINTEXT_ENCRYPTED, 0) + " plaintext encrypted, "
                + counts.getOrDefault(Outcome.ALREADY_ON_NEW_KEY, 0) + " already on the new key";
    }

    /** Second pass inside the same transaction: every stored value must now decrypt with the new key. */
    private static void verifyAllReadable(Connection db, EncryptedStringConverter newKey) throws SQLException {
        for (EncryptedColumn column : COLUMNS) {
            if (!tableExists(db, column.table())) continue;
            try (PreparedStatement read = db.prepareStatement("SELECT id, " + column.column() + " FROM "
                    + column.table() + " WHERE " + column.column() + " IS NOT NULL AND " + column.column() + " <> ''");
                 ResultSet rows = read.executeQuery()) {
                while (rows.next()) {
                    String stored = rows.getString(2);
                    if (!stored.startsWith(EncryptedStringConverter.PREFIX)) {
                        throw new IllegalStateException(column + " id=" + rows.getLong(1) + " is still plaintext");
                    }
                    try {
                        newKey.convertToEntityAttribute(stored);
                    } catch (IllegalStateException e) {
                        throw new IllegalStateException(column + " id=" + rows.getLong(1)
                                + " does not decrypt with the new key");
                    }
                }
            }
        }
    }

    private static boolean tableExists(Connection db, String table) throws SQLException {
        try (PreparedStatement q = db.prepareStatement("SELECT to_regclass(?) IS NOT NULL")) {
            q.setString(1, table);
            try (ResultSet r = q.executeQuery()) {
                return r.next() && r.getBoolean(1);
            }
        }
    }
}
