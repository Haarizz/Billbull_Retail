package com.billbull.backend.pos.session.denomination;

import com.billbull.backend.financials.currency.CurrencyRepository;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Validates a submitted denomination count and computes Counted Cash.
 *
 * <p>The single implementation of denomination arithmetic. Before it existed the total was
 * computed in the browser — in three separate copies — and posted alongside the quantities as an
 * independent {@code closingCash} field that the server stored verbatim. Nothing checked that the
 * two agreed, so the financial figure a session was reconciled against was whatever the client
 * chose to send.
 *
 * <p>Deterministic and side-effect free: it reads configuration, validates, and returns. It
 * writes nothing and knows nothing about sessions.
 *
 * <h3>Invalid financial input is refused, never normalised</h3>
 * Every rejection names the offending denomination or quantity. Quietly coercing a negative
 * quantity to zero, or rounding a fractional one, would silently change a cash figure a person
 * is accountable for — the count would balance and the drawer would not.
 */
@Service
public class PosDenominationCountService {

    private static final Logger log = LoggerFactory.getLogger(PosDenominationCountService.class);

    /** Guards against a typo or overflow attempt turning into an absurd drawer total. */
    static final int MAX_QUANTITY_PER_DENOMINATION = 1_000_000;

    private static final String DEFAULT_CURRENCY = "AED";

    private final CompanyProfileService companyProfileService;
    private final CurrencyRepository currencyRepository;
    private final ObjectMapper objectMapper;

    public PosDenominationCountService(CompanyProfileService companyProfileService,
                                       CurrencyRepository currencyRepository,
                                       ObjectMapper objectMapper) {
        this.companyProfileService = companyProfileService;
        this.currencyRepository = currencyRepository;
        this.objectMapper = objectMapper;
    }

    // ── Currency ─────────────────────────────────────────────────────────────────────────

    /**
     * The currency a drawer is counted in.
     *
     * <p>Resolved from the company profile, then the accounting base currency, then AED. It is
     * deliberately not read from the branch: {@code Branch} carries no currency column, so a
     * per-branch currency does not exist in this schema and inventing one here would be a
     * fiction the rest of the system does not share.
     */
    public String resolveCurrencyCode() {
        try {
            var profile = companyProfileService.getProfile();
            if (profile != null && profile.getCurrency() != null && !profile.getCurrency().isBlank()) {
                return profile.getCurrency().trim().toUpperCase(Locale.ROOT);
            }
        } catch (Exception e) {
            log.warn("[Denomination] Company profile unavailable while resolving currency; "
                    + "falling back to the base currency.", e);
        }
        return currencyRepository.findByIsBaseTrue()
                .map(c -> c.getCode() != null ? c.getCode().trim().toUpperCase(Locale.ROOT) : DEFAULT_CURRENCY)
                .orElse(DEFAULT_CURRENCY);
    }

    /**
     * The ladder for a currency, or a 422 naming the currency and what is supported.
     *
     * <p>Refusing is the point. A currency with no ladder cannot have its count validated, and
     * accepting arbitrary denomination values "so the count goes through" would put an unbounded,
     * unverifiable number into the drawer reconciliation.
     */
    public PosDenominationLadder requireLadder(String currencyCode) {
        return PosDenominationLadder.forCurrency(currencyCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "No denomination ladder is configured for currency '" + currencyCode + "', so a "
                                + "cash count cannot be validated. Supported: "
                                + String.join(", ", PosDenominationLadder.supportedCurrencies())
                                + ". Add the ladder for this currency before counting drawers in it."));
    }

    // ── Counting ─────────────────────────────────────────────────────────────────────────

    /**
     * Validates a count and totals it.
     *
     * @param rawDenominations denomination keys to quantities. A partial payload is valid — an
     *      omitted denomination means the drawer holds none of it, and requiring the cashier to
     *      enter a zero for every ladder entry would be busywork with no integrity benefit.
     * @param declaredCurrencyCode optional; when present it must match the resolved currency, so
     *      a count taken against one currency's ladder can never be filed under another.
     * @return the validated count, or {@code null} when no count was submitted at all — which is
     *      "not counted", a different state from a count that totalled zero
     */
    public PosDenominationCount count(Map<String, Object> rawDenominations, String declaredCurrencyCode) {
        String currencyCode = resolveCurrencyCode();
        if (declaredCurrencyCode != null && !declaredCurrencyCode.isBlank()
                && !currencyCode.equalsIgnoreCase(declaredCurrencyCode.trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Denominations were submitted as '" + declaredCurrencyCode.trim() + "' but this "
                            + "drawer is counted in '" + currencyCode + "'. Denominations of one currency "
                            + "cannot be counted as another.");
        }

        // No payload at all is NOT a count. It must not become a zero count, which would assert
        // that someone looked in the drawer and found it empty.
        if (rawDenominations == null) return null;

        PosDenominationLadder ladder = requireLadder(currencyCode);

        Map<String, Integer> validated = new LinkedHashMap<>();
        BigDecimal total = BigDecimal.ZERO;

        for (Map.Entry<String, Object> entry : rawDenominations.entrySet()) {
            String rawKey = entry.getKey();
            BigDecimal value = parseDenominationValue(rawKey);
            String canonicalKey = ladder.canonicalKey(value).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "'" + rawKey + "' is not a " + ladder.currencyCode() + " denomination. Valid "
                                    + "denominations: " + String.join(", ", ladder.allKeys()) + "."));

            // Two spellings of the same denomination ("0.5" and "0.50") would otherwise be added
            // twice, inflating the drawer by a real amount.
            if (validated.containsKey(canonicalKey)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Denomination " + canonicalKey + " was submitted more than once (as '" + rawKey
                                + "'). Send each denomination exactly once.");
            }

            int quantity = parseQuantity(rawKey, entry.getValue());
            validated.put(canonicalKey, quantity);
            total = total.add(ladder.valueOf(canonicalKey).multiply(BigDecimal.valueOf(quantity)));
        }

        return new PosDenominationCount(validated, total.setScale(2, RoundingMode.UNNECESSARY), currencyCode);
    }

    /** Convenience for callers holding the snapshot as JSON (corrections, stored counts). */
    public PosDenominationCount countFromJson(String denominationsJson, String declaredCurrencyCode) {
        if (denominationsJson == null || denominationsJson.isBlank()) return null;
        Map<String, Object> raw;
        try {
            raw = objectMapper.readValue(denominationsJson, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The denomination payload is not a valid object of denomination-to-quantity entries.");
        }
        return count(raw, declaredCurrencyCode);
    }

    /** Serializes a validated count for persistence. */
    public String toJson(PosDenominationCount count) {
        try {
            return objectMapper.writeValueAsString(count.denominations());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to serialize the denomination count.");
        }
    }

    // ── Parsing ──────────────────────────────────────────────────────────────────────────

    private static BigDecimal parseDenominationValue(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A denomination key cannot be blank.");
        }
        BigDecimal value;
        try {
            value = new BigDecimal(rawKey.trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "'" + rawKey + "' is not a valid denomination value.");
        }
        if (value.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Denomination '" + rawKey + "' must be greater than zero.");
        }
        if (value.scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Denomination '" + rawKey + "' has more than two decimal places.");
        }
        return value;
    }

    private static int parseQuantity(String rawKey, Object rawQuantity) {
        if (rawQuantity == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Quantity for denomination " + rawKey + " is missing. Omit the denomination "
                            + "entirely if the drawer holds none of it.");
        }
        BigDecimal quantity;
        try {
            quantity = new BigDecimal(rawQuantity.toString().trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Quantity '" + rawQuantity + "' for denomination " + rawKey + " is not a number.");
        }
        if (quantity.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Quantity for denomination " + rawKey + " cannot be negative.");
        }
        if (quantity.stripTrailingZeros().scale() > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Quantity for denomination " + rawKey + " must be a whole number of notes or "
                            + "coins — '" + rawQuantity + "' is not.");
        }
        if (quantity.compareTo(BigDecimal.valueOf(MAX_QUANTITY_PER_DENOMINATION)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Quantity " + quantity.toPlainString() + " for denomination " + rawKey
                            + " exceeds the maximum of " + MAX_QUANTITY_PER_DENOMINATION + ".");
        }
        return quantity.intValueExact();
    }
}
