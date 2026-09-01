package com.billbull.backend.pos.session.denomination;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.currency.Currency;
import com.billbull.backend.financials.currency.CurrencyRepository;
import com.billbull.backend.settings.company.CompanyProfile;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Denomination validation and the Counted Cash total.
 *
 * <p>These are the rules that make a cash count trustworthy. Before this service the browser
 * multiplied whatever keys it liked and posted the answer as {@code closingCash}, which the
 * server stored verbatim — so every case below was silently accepted.
 */
@ExtendWith(MockitoExtension.class)
class PosDenominationCountServiceTest {

    @Mock private CompanyProfileService companyProfileService;
    @Mock private CurrencyRepository currencyRepository;

    private PosDenominationCountService service;

    @BeforeEach
    void setUp() {
        service = new PosDenominationCountService(
                companyProfileService, currencyRepository, new ObjectMapper());
        CompanyProfile profile = new CompanyProfile();
        profile.setCurrency("AED");
        lenient().when(companyProfileService.getProfile()).thenReturn(profile);
    }

    // ── 1-4, 17: valid shapes and the total ──────────────────────────────────────────────

    @Test
    void validCountTotalsCorrectly() {
        PosDenominationCount count = service.count(denoms("500", 2, "100", 3, "0.25", 4), null);
        assertMoney("1301.00", count.countedCash());   // 1000 + 300 + 1
        assertEquals(3, count.denominations().size());
        assertEquals("AED", count.currencyCode());
    }

    @Test
    void anEmptyCountIsACountOfZero() {
        // Counted, and the drawer held nothing. Distinct from no count at all.
        PosDenominationCount count = service.count(new LinkedHashMap<>(), null);
        assertMoney("0.00", count.countedCash());
        assertTrue(count.denominations().isEmpty());
    }

    @Test
    void anAllZeroCountIsACountOfZero() {
        PosDenominationCount count = service.count(denoms("500", 0, "100", 0), null);
        assertMoney("0.00", count.countedCash());
    }

    @Test
    void aPartialCountIsValidAndOmittedDenominationsAreSimplyAbsent() {
        // Requiring a zero for all thirteen denominations would be busywork with no integrity
        // benefit — an omitted denomination means the drawer holds none of it.
        PosDenominationCount count = service.count(denoms("500", 2, "100", 3), null);
        assertMoney("1300.00", count.countedCash());
        assertEquals(2, count.denominations().size());
    }

    @Test
    void noPayloadAtAllIsNotACount() {
        assertNull(service.count(null, null), "absent denominations must mean NOT COUNTED");
    }

    @Test
    void equivalentSpellingsOfADenominationResolveToTheSameKey() {
        assertMoney("1.00", service.count(denoms("0.5", 2), null).countedCash());
        assertMoney("500.00", service.count(denoms("500.00", 1), null).countedCash());
    }

    // ── 5-6: unknown / unsupported denominations ─────────────────────────────────────────

    @Test
    void anUnknownDenominationIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(denoms("37", 1), null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("37"), "the message must name the offending value");
    }

    @Test
    void aDenominationThatIsNotLegalTenderInThisCurrencyIsRejected() {
        // 2 is a real denomination somewhere, but not in AED.
        assertThrows(ResponseStatusException.class, () -> service.count(denoms("2", 5), null));
    }

    // ── 7, and the locked decision: unsupported currency fails ───────────────────────────

    @Test
    void aDeclaredCurrencyThatIsNotTheDrawerCurrencyIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(denoms("500", 1), "USD"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void aCurrencyWithNoLadderCannotBeCountedAtAll() {
        // The locked decision: no permissive fallback. Accepting arbitrary positive decimals
        // for an unconfigured currency would defeat the ladder's purpose entirely.
        CompanyProfile usd = new CompanyProfile();
        usd.setCurrency("USD");
        when(companyProfileService.getProfile()).thenReturn(usd);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(denoms("500", 1), null));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("USD"));
    }

    @Test
    void anUnsupportedCurrencyCannotSmuggleInArbitraryDenominationValues() {
        CompanyProfile usd = new CompanyProfile();
        usd.setCurrency("USD");
        when(companyProfileService.getProfile()).thenReturn(usd);

        // A value that is not AED tender, under a currency with no ladder: still refused.
        assertThrows(ResponseStatusException.class, () -> service.count(denoms("37.42", 3), null));
    }

    // ── 8-11: quantity and payload validity ──────────────────────────────────────────────

    @Test
    void aNegativeQuantityIsRejectedRatherThanClampedToZero() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(denoms("100", -1), null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void aFractionalQuantityIsRejectedRatherThanRounded() {
        // Half a note does not exist; rounding it would silently change a cash figure someone
        // is accountable for.
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("100", 2.5);
        assertThrows(ResponseStatusException.class, () -> service.count(raw, null));
    }

    @Test
    void aMalformedQuantityIsRejected() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("100", "three");
        assertThrows(ResponseStatusException.class, () -> service.count(raw, null));
    }

    @Test
    void aNullQuantityIsRejected() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("100", null);
        assertThrows(ResponseStatusException.class, () -> service.count(raw, null));
    }

    @Test
    void aBlankDenominationKeyIsRejected() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("", 1);
        assertThrows(ResponseStatusException.class, () -> service.count(raw, null));
    }

    @Test
    void aNonNumericDenominationKeyIsRejected() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("five hundred", 1);
        assertThrows(ResponseStatusException.class, () -> service.count(raw, null));
    }

    @Test
    void malformedJsonIsRejected() {
        assertThrows(ResponseStatusException.class, () -> service.countFromJson("{not json", null));
    }

    // ── 12: duplicates after normalisation ───────────────────────────────────────────────

    @Test
    void theSameDenominationSpelledTwoWaysIsRejected() {
        // "0.5" and "0.50" are the same coin. Adding both would inflate the drawer by a real
        // amount while looking like two legitimate entries.
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("0.50", 2);
        raw.put("0.5", 3);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(raw, null));
        assertTrue(ex.getReason().contains("more than once"));
    }

    // ── 13: absurd quantities ────────────────────────────────────────────────────────────

    @Test
    void anAbsurdQuantityIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.count(denoms("1000", PosDenominationCountService.MAX_QUANTITY_PER_DENOMINATION + 1), null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void aLargeButPlausibleQuantityIsAccepted() {
        assertMoney("5000000.00", service.count(denoms("1000", 5000), null).countedCash());
    }

    // ── Currency resolution ──────────────────────────────────────────────────────────────

    @Test
    void currencyComesFromTheCompanyProfile() {
        assertEquals("AED", service.resolveCurrencyCode());
    }

    @Test
    void currencyFallsBackToTheAccountingBaseCurrency() {
        when(companyProfileService.getProfile()).thenReturn(new CompanyProfile());
        Currency base = new Currency();
        base.setCode("AED");
        when(currencyRepository.findByIsBaseTrue()).thenReturn(Optional.of(base));

        assertEquals("AED", service.resolveCurrencyCode());
    }

    // ── Round-trip: the persisted snapshot re-totals to the same number ──────────────────

    @Test
    void aSerializedCountRoundTripsToTheSameTotal() {
        PosDenominationCount original = service.count(denoms("500", 2, "20", 3, "0.05", 7), null);
        PosDenominationCount reread = service.countFromJson(service.toJson(original), null);
        assertEquals(0, original.countedCash().compareTo(reread.countedCash()));
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }

    /** {@code denoms("500", 2, "100", 3)} → {"500": 2, "100": 3}. */
    private static Map<String, Object> denoms(Object... keyThenQuantity) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < keyThenQuantity.length; i += 2) {
            out.put(String.valueOf(keyThenQuantity[i]), keyThenQuantity[i + 1]);
        }
        return out;
    }
}
