package com.billbull.backend.pos.offline;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

/**
 * ECDSA P-256 / SHA-256 primitives shared by lease signing and record verification.
 *
 * <p>Signatures are always the IEEE P1363 form ({@code r || s}, 64 bytes): that is what WebCrypto
 * produces and verifies, and what a JWS ES256 signature is. Java's plain {@code SHA256withECDSA}
 * expects ASN.1 DER instead and would reject every browser signature, so the
 * {@code SHA256withECDSAinP1363Format} algorithm (JDK 9+) is used throughout.
 */
public final class PosOfflineCrypto {

    public static final String SIGNATURE_ALGORITHM = "SHA256withECDSAinP1363Format";

    private PosOfflineCrypto() {}

    public static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String sha256Hex(String text) {
        return sha256Hex(text.getBytes(StandardCharsets.UTF_8));
    }

    public static byte[] base64UrlDecode(String value) {
        return Base64.getUrlDecoder().decode(value.replace('+', '-').replace('/', '_').replace("=", ""));
    }

    public static String base64Url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    /**
     * Parses a P-256 public key from its base64 (standard or url-safe) X.509 SubjectPublicKeyInfo.
     *
     * @throws IllegalArgumentException when it is not a 256-bit EC key
     */
    public static PublicKey parseP256Spki(String spkiBase64) {
        try {
            byte[] der = base64UrlDecode(spkiBase64.trim());
            PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(der));
            if (!(key instanceof ECPublicKey ec) || ec.getParams().getCurve().getField().getFieldSize() != 256) {
                throw new IllegalArgumentException("Not a P-256 public key");
            }
            return key;
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid P-256 public key: " + e.getMessage(), e);
        }
    }

    public static boolean verify(PublicKey key, byte[] data, byte[] p1363Signature) {
        if (p1363Signature == null || p1363Signature.length != 64) return false;
        try {
            Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
            verifier.initVerify(key);
            verifier.update(data);
            return verifier.verify(p1363Signature);
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    public static byte[] sign(PrivateKey key, byte[] data) {
        try {
            Signature signer = Signature.getInstance(SIGNATURE_ALGORITHM);
            signer.initSign(key);
            signer.update(data);
            return signer.sign();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Signing failed", e);
        }
    }
}
