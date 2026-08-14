package com.billbull.backend.sales.voucher;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Year;
import java.util.List;

/**
 * Generates the two customer-facing identifiers on a voucher (§10/§11).
 *
 * <p><b>Number vs code, and why both.</b> The number ({@code CV-2026-000184}) is sequential and
 * predictable — fine to quote over the phone or print on a report, but for that same reason it
 * must never authorise a redemption: anyone holding one voucher could guess its neighbours. The
 * code ({@code 7KQ4-9PXM-2W8R}) is drawn from a CSPRNG and is the only thing that redeems.
 *
 * <p>The database primary key is deliberately never exposed as either.
 */
@Component
public class CreditVoucherCodeGenerator {

    /**
     * Crockford-style alphabet with the ambiguous glyphs removed — no I, L, O, U, 0 or 1. A
     * cashier keying a code off a smudged thermal print cannot confuse O with 0, and the excluded
     * U keeps accidental profanity out of generated codes.
     */
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

    /** 12 characters over a 30-symbol alphabet ≈ 59 bits — far beyond guessing or enumeration. */
    private static final int CODE_LENGTH = 12;
    private static final int GROUP_SIZE = 4;

    /** Retries on collision. Exhausting this many is a signal something is wrong, not bad luck. */
    private static final int MAX_ATTEMPTS = 8;

    private static final SecureRandom RANDOM = new SecureRandom();

    @Autowired
    private CreditVoucherRepository voucherRepository;

    /**
     * A unique redemption code, e.g. {@code 7KQ4-9PXM-2W8R}.
     *
     * <p>Uniqueness is checked against the table, but that check is advisory only — the unique
     * index on {@code voucher_code} is the real guarantee, since two concurrent issuances could
     * both pass this check. At 59 bits a collision is vanishingly unlikely either way.
     */
    public String generateVoucherCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String code = randomGrouped();
            if (!voucherRepository.existsByVoucherCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException(
                "Could not generate a unique voucher code after " + MAX_ATTEMPTS + " attempts. "
                + "This should be effectively impossible — check for a corrupted unique index on credit_vouchers.");
    }

    /**
     * The next voucher number in the year's series, e.g. {@code CV-2026-000184}.
     *
     * <p>Derived by scanning existing numbers for the prefix rather than a shared counter table,
     * matching how sales document numbering already works here. The unique index on
     * {@code voucher_number} catches the race if two issuances pick the same one.
     */
    public String generateVoucherNumber() {
        String prefix = "CV-" + Year.now().getValue() + "-";
        List<String> existing = voucherRepository.findNumbersByPrefixDesc(prefix);

        int highest = 0;
        for (String number : existing) {
            if (number == null || number.length() <= prefix.length()) continue;
            try {
                highest = Math.max(highest, Integer.parseInt(number.substring(prefix.length())));
            } catch (NumberFormatException ignored) {
                // A hand-edited or legacy number that doesn't parse must not stop issuance.
            }
        }
        return prefix + String.format("%06d", highest + 1);
    }

    /**
     * The scannable payload printed as a barcode/QR.
     *
     * <p>Currently the bare code, so a scan produces exactly what typing the code produces and the
     * POS lookup needs no special-casing. Kept as its own method — and stored in its own column —
     * so a future prefixed or check-digit format can be introduced without invalidating codes
     * already in customers' hands.
     */
    public String buildBarcodeValue(String voucherCode) {
        return voucherCode == null ? null : voucherCode.replace("-", "");
    }

    /** Normalises user input: uppercase, strip separators and whitespace. */
    public static String normalise(String raw) {
        if (raw == null) return null;
        return raw.trim().toUpperCase().replace(" ", "").replace("-", "");
    }

    private String randomGrouped() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH + CODE_LENGTH / GROUP_SIZE);
        for (int i = 0; i < CODE_LENGTH; i++) {
            if (i > 0 && i % GROUP_SIZE == 0) sb.append('-');
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
