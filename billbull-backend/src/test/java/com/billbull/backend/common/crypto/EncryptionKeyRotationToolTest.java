package com.billbull.backend.common.crypto;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** T-P0-2: re-encrypting stored secrets from one EMAIL_ENC_KEY to another without losing them. */
class EncryptionKeyRotationToolTest {

    private static final String OLD = EncryptionKeyPolicy.DEV_FALLBACK_KEY;
    private static final String NEW = "n3W-k3y-for-this-tenant-0123456789abcdef";
    private final EncryptedStringConverter oldKey = new EncryptedStringConverter(OLD);
    private final EncryptedStringConverter newKey = new EncryptedStringConverter(NEW);

    @Test
    void aValueUnderTheOldKeyIsReEncryptedUnderTheNewOne() {
        String stored = oldKey.convertToDatabaseColumn("smtp-app-password");

        EncryptionKeyRotationTool.Rotation r = EncryptionKeyRotationTool.rotate(stored, oldKey, newKey);

        assertEquals(EncryptionKeyRotationTool.Outcome.REENCRYPTED, r.outcome());
        assertTrue(r.stored().startsWith("enc:v1:"));
        assertEquals("smtp-app-password", newKey.convertToEntityAttribute(r.stored()));
        assertThrows(IllegalStateException.class, () -> oldKey.convertToEntityAttribute(r.stored()));
    }

    @Test
    void aValueAlreadyUnderTheNewKeyIsLeftAloneSoARunCanBeRepeated() {
        String stored = newKey.convertToDatabaseColumn("meta-token");

        EncryptionKeyRotationTool.Rotation r = EncryptionKeyRotationTool.rotate(stored, oldKey, newKey);

        assertEquals(EncryptionKeyRotationTool.Outcome.ALREADY_ON_NEW_KEY, r.outcome());
        assertEquals(stored, r.stored());
    }

    @Test
    void legacyPlaintextIsEncryptedUnderTheNewKey() {
        EncryptionKeyRotationTool.Rotation r = EncryptionKeyRotationTool.rotate("plain-legacy", oldKey, newKey);

        assertEquals(EncryptionKeyRotationTool.Outcome.PLAINTEXT_ENCRYPTED, r.outcome());
        assertEquals("plain-legacy", newKey.convertToEntityAttribute(r.stored()));
    }

    @Test
    void aValueUnderAThirdKeyAbortsWithoutRevealingIt() {
        String stored = new EncryptedStringConverter("some-other-key-nobody-has-0123456789")
                .convertToDatabaseColumn("unknown-secret");

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> EncryptionKeyRotationTool.rotate(stored, oldKey, newKey));
        assertFalse(e.getMessage().contains("unknown-secret"));
        assertFalse(e.getMessage().contains(stored));
    }

    @Test
    void columnsCoverEveryEncryptedEntityField() {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        Set<String> encrypted = new TreeSet<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.billbull.backend")) {
            Class<?> type;
            try {
                type = Class.forName(bd.getBeanClassName());
            } catch (ClassNotFoundException e) {
                throw new AssertionError(e);
            }
            for (Field f : type.getDeclaredFields()) {
                Convert convert = f.getAnnotation(Convert.class);
                if (convert != null && convert.converter() == EncryptedStringConverter.class) {
                    encrypted.add(type.getAnnotation(Table.class).name() + "." + f.getAnnotation(Column.class).name());
                }
            }
        }
        Set<String> rotated = EncryptionKeyRotationTool.COLUMNS.stream()
                .map(Object::toString).collect(Collectors.toCollection(TreeSet::new));
        assertEquals(encrypted, rotated);
    }

    @Test
    void refusesAnUnusableNewKeyAndIdenticalKeysBeforeConnecting() throws Exception {
        String[] args = {"--url", "jdbc:postgresql://127.0.0.1:1/never-contacted", "--user", "u",
                "--old-key-is-dev-default"};

        assertEquals(2, run(args, Map.of()).code, "no new key");
        Result devAsNew = run(args, Map.of("EMAIL_ENC_KEY_NEW", OLD));
        assertEquals(2, devAsNew.code);
        assertFalse(devAsNew.output.contains(OLD));
        Result shortNew = run(args, Map.of("EMAIL_ENC_KEY_NEW", "short-key"));
        assertEquals(2, shortNew.code);
        assertFalse(shortNew.output.contains("short-key"));

        String[] explicitOld = {"--url", "jdbc:postgresql://127.0.0.1:1/x", "--user", "u"};
        assertEquals(2, run(explicitOld, Map.of("EMAIL_ENC_KEY_OLD", NEW, "EMAIL_ENC_KEY_NEW", NEW)).code);
        assertEquals(2, run(new String[] {"--bogus"}, Map.of()).code);
    }

    private record Result(int code, String output) {}

    private static Result run(String[] args, Map<String, String> env) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int code = EncryptionKeyRotationTool.run(args, new HashMap<>(env),
                new PrintStream(buf, true, StandardCharsets.UTF_8));
        return new Result(code, buf.toString(StandardCharsets.UTF_8));
    }
}
