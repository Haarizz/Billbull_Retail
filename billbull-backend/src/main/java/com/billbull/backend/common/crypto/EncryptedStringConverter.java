package com.billbull.backend.common.crypto;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * JPA converter that AES-256-GCM encrypts a String column at rest (ARCHFIX S4).
 *
 * Applied via {@code @Convert} to secrets that must be stored reversibly (e.g. the SMTP password,
 * which has to be replayed to the mail server — so it cannot be one-way hashed like a login PIN).
 * Encryption/decryption is transparent: the entity field holds plaintext in memory; the DB column
 * holds {@code base64(iv || ciphertext)}.
 *
 * KEY MANAGEMENT: the 256-bit key is derived from the EMAIL_ENC_KEY environment variable (any
 * string; SHA-256-folded to 32 bytes). {@link EncryptionKeyPolicy} decides which values are
 * acceptable: a deployment profile must set its own key of at least 32 characters, and only a local
 * run may fall back to the public development key. {@link EncryptionKeyStartupCheck} applies the
 * same policy before the context starts. Changing the key makes existing ciphertext unreadable, so
 * re-encrypt it with {@link EncryptionKeyRotationTool}. Decryption is backward-compatible: a value that is not valid
 * ciphertext (legacy plaintext already in the column) is returned as-is, so existing rows keep
 * working and are upgraded to ciphertext the next time the entity is saved.
 */
@Converter
@Component
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;        // 96-bit IV, recommended for GCM
    private static final int TAG_LENGTH_BITS = 128; // GCM auth tag
    static final String PREFIX = "enc:v1:"; // marks values this converter produced

    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    @Autowired
    public EncryptedStringConverter(@Value("${EMAIL_ENC_KEY:}") String secret, Environment environment) {
        this(EncryptionKeyPolicy.resolve(secret, environment.getActiveProfiles()));
    }

    /** Uses {@code secret} as given, without {@link EncryptionKeyPolicy}: for tests and key rotation. */
    EncryptedStringConverter(String secret) {
        this.key = deriveKey(secret);
    }

    private static SecretKeySpec deriveKey(String secret) {
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(secret.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(hash, "AES"); // 32 bytes -> AES-256
        } catch (Exception e) {
            throw new IllegalStateException("Cannot derive email encryption key", e);
        }
    }

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return attribute;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ct = cipher.doFinal(attribute.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ct, 0, combined, iv.length, ct.length);
            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt value", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String dbValue) {
        if (dbValue == null || dbValue.isEmpty()) {
            return dbValue;
        }
        // Legacy plaintext (pre-encryption rows) — return as-is; re-save will encrypt it.
        if (!dbValue.startsWith(PREFIX)) {
            return dbValue;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(dbValue.substring(PREFIX.length()));
            byte[] iv = new byte[IV_LENGTH];
            byte[] ct = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
            System.arraycopy(combined, IV_LENGTH, ct, 0, ct.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt value", e);
        }
    }
}
