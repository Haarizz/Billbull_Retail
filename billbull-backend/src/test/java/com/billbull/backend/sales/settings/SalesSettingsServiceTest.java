package com.billbull.backend.sales.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * MERGE semantics on the sales-settings singleton.
 *
 * <p>These exist because the old {@code repo.save(incoming)} silently reset every field absent
 * from the request body — harmless for a display preference, not harmless for the switches that
 * decide whether POS sales are allowed. Each test writes ONE field and asserts every other field
 * survived.
 */
@ExtendWith(MockitoExtension.class)
class SalesSettingsServiceTest {

    @Mock private SalesSettingsRepository repo;
    @Mock private SalesDocumentNumberingService numberingService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SalesSettingsService service;

    @BeforeEach
    void setUp() {
        service = new SalesSettingsService(repo, numberingService, objectMapper);
        lenient().when(numberingService.saveSettings(any())).thenReturn(List.of());
        lenient().when(numberingService.getAllSettingsWithPreview()).thenReturn(List.of());
        lenient().when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    /** A stored row with every field deliberately set AWAY from its Java default. */
    private SalesSettings storedRow() {
        SalesSettings stored = new SalesSettings();
        stored.setId(1L);
        stored.setStockCheckRequired(true);
        stored.setCreditLimitPolicy(CreditLimitPolicy.BLOCK);
        stored.setSalesMode(SalesMode.WORKFLOW_DRIVEN);
        stored.setSalesItemPricePolicy(SalesItemPricePolicy.MIN_SALE);
        stored.setRoundingMode(SalesRoundingMode.UP);
        stored.setRoundingPrecision(0.25);
        stored.setZeroPricePolicy(ZeroPricePolicy.ALLOW);
        stored.setSalespersonRequiredAtPos(true);
        stored.setSalespersonRequiredAtBackOffice(true);
        stored.setMonthlyTargetRequired(true);
        return stored;
    }

    private SalesSettings save(String json) throws Exception {
        JsonNode body = objectMapper.readTree(json);
        service.saveSettings(body);
        ArgumentCaptor<SalesSettings> captor = ArgumentCaptor.forClass(SalesSettings.class);
        org.mockito.Mockito.verify(repo).save(captor.capture());
        return captor.getValue();
    }

    // ── defaults ────────────────────────────────────────────────────────────

    @Test
    void newTenantDefaultsAllThreeSwitchesToOff() {
        when(repo.findById(1L)).thenReturn(Optional.empty());

        SalesSettings settings = service.getSettings();

        assertFalse(settings.isSalespersonRequiredAtPos());
        assertFalse(settings.isSalespersonRequiredAtBackOffice());
        assertFalse(settings.isMonthlyTargetRequired());
    }

    // ── the new fields persist ──────────────────────────────────────────────

    @Test
    void persistsTheThreeNewSwitches() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.empty());

        SalesSettings saved = save("""
                {"salespersonRequiredAtPos": true,
                 "salespersonRequiredAtBackOffice": true,
                 "monthlyTargetRequired": true}
                """);

        assertTrue(saved.isSalespersonRequiredAtPos());
        assertTrue(saved.isSalespersonRequiredAtBackOffice());
        assertTrue(saved.isMonthlyTargetRequired());
    }

    // ── merge: writing a new field preserves the old ones ───────────────────

    @Test
    void changingANewSwitchPreservesEveryExistingSetting() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings saved = save("{\"salespersonRequiredAtPos\": false}");

        assertFalse(saved.isSalespersonRequiredAtPos(), "the field actually written must change");
        // ...and nothing else moved.
        assertTrue(saved.isStockCheckRequired());
        assertEquals(CreditLimitPolicy.BLOCK, saved.getCreditLimitPolicy());
        assertEquals(SalesMode.WORKFLOW_DRIVEN, saved.getSalesMode());
        assertEquals(SalesItemPricePolicy.MIN_SALE, saved.getSalesItemPricePolicy());
        assertEquals(SalesRoundingMode.UP, saved.getRoundingMode());
        assertEquals(0.25, saved.getRoundingPrecision());
        assertEquals(ZeroPricePolicy.ALLOW, saved.getZeroPricePolicy());
        assertTrue(saved.isSalespersonRequiredAtBackOffice());
        assertTrue(saved.isMonthlyTargetRequired());
    }

    // ── merge: writing an old field preserves the new ones ──────────────────

    @Test
    void changingAnExistingSettingPreservesTheThreeNewSwitches() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings saved = save("{\"stockCheckRequired\": false}");

        assertFalse(saved.isStockCheckRequired());
        // The regression this whole change exists to prevent: a partial PUT must not silently
        // switch salesperson enforcement off.
        assertTrue(saved.isSalespersonRequiredAtPos());
        assertTrue(saved.isSalespersonRequiredAtBackOffice());
        assertTrue(saved.isMonthlyTargetRequired());
    }

    @Test
    void anEmptyBodyChangesNothingAtAll() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings saved = save("{}");

        assertTrue(saved.isStockCheckRequired());
        assertEquals(CreditLimitPolicy.BLOCK, saved.getCreditLimitPolicy());
        assertEquals(SalesMode.WORKFLOW_DRIVEN, saved.getSalesMode());
        assertTrue(saved.isSalespersonRequiredAtPos());
        assertTrue(saved.isSalespersonRequiredAtBackOffice());
        assertTrue(saved.isMonthlyTargetRequired());
    }

    @Test
    void anExplicitFalseIsHonouredAndIsNotConfusedWithAbsence() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings saved = save("""
                {"monthlyTargetRequired": false, "salespersonRequiredAtPos": true}
                """);

        assertFalse(saved.isMonthlyTargetRequired());
        assertTrue(saved.isSalespersonRequiredAtPos());
        assertTrue(saved.isSalespersonRequiredAtBackOffice(), "untouched field survives");
    }

    // ── the singleton stays the singleton ───────────────────────────────────

    @Test
    void idIsAlwaysForcedToTheSingleton() throws Exception {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings saved = save("{\"id\": 99, \"stockCheckRequired\": false}");

        assertEquals(1L, saved.getId());
    }

    // ── the typed overload still behaves as a full write ────────────────────

    @Test
    void typedOverloadWritesEveryFieldItCarries() {
        when(repo.findById(1L)).thenReturn(Optional.of(storedRow()));

        SalesSettings incoming = new SalesSettings();
        incoming.setStockCheckRequired(false);
        incoming.setCreditLimitPolicy(CreditLimitPolicy.WARNING);
        incoming.setSalespersonRequiredAtPos(true);

        SalesSettings saved = service.saveSettings(incoming);

        assertFalse(saved.isStockCheckRequired());
        assertEquals(CreditLimitPolicy.WARNING, saved.getCreditLimitPolicy());
        assertTrue(saved.isSalespersonRequiredAtPos());
        // A fully-populated entity carries the Java defaults for what the caller did not set,
        // so these are written as false — replace-equivalent, which is the documented contract.
        assertFalse(saved.isMonthlyTargetRequired());
    }
}
