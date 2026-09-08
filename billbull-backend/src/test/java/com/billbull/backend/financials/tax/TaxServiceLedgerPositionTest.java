package com.billbull.backend.financials.tax;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.reports.FinancialReportService;

/**
 * The Tax Dashboard used to render 0.00 for an open VAT return while the VAT
 * reports showed real activity, because a filing's stored amount is seeded at
 * zero and only written when the return is actually filed. These cover the
 * ledger position now attached to each filing: the period label maps back to
 * the right date range, and the figures come from the same VAT-return
 * derivation the reports screen uses.
 */
@ExtendWith(MockitoExtension.class)
class TaxServiceLedgerPositionTest {

    @Mock
    private TaxConfigurationRepository taxConfigurationRepository;

    @Mock
    private TaxFilingRepository taxFilingRepository;

    @Mock
    private FinancialReportService financialReportService;

    @TempDir
    java.nio.file.Path tempDir;

    private TaxService service() {
        return new TaxService(taxConfigurationRepository, taxFilingRepository,
                financialReportService, tempDir.toString());
    }

    @Test
    void openVatFilingCarriesTheLedgerPositionForItsQuarter() {
        TaxConfiguration config = config("VAT", "Quarterly");
        TaxFiling filing = filing(config, "Q3 2026", BigDecimal.ZERO, "Pending");
        when(taxConfigurationRepository.findAll()).thenReturn(List.of(config));
        lenient().when(taxFilingRepository.findByTaxConfigurationId(1L)).thenReturn(List.of(filing));
        when(taxFilingRepository.findAll()).thenReturn(List.of(filing));
        when(financialReportService.generateVatReturnReport(
                eq(LocalDate.of(2026, 7, 1)), eq(LocalDate.of(2026, 9, 30)), isNull()))
                        .thenReturn(vatReport("18925.31", "6742.50", "12182.81"));

        TaxFilingDTO dto = service().getAllFilings().get(0);

        assertEquals(new BigDecimal("12182.81"), dto.getLedgerAmount());
        assertEquals(new BigDecimal("18925.31"), dto.getLedgerOutputTax());
        assertEquals(new BigDecimal("6742.50"), dto.getLedgerInputTax());
        assertEquals("2026-07-01", dto.getPeriodStart());
        assertEquals("2026-09-30", dto.getPeriodEnd());
        // The declared amount is left exactly as filed.
        assertEquals(BigDecimal.ZERO, dto.getAmount());
    }

    @Test
    void ledgerLookupIsScopedToTheRequestedBranch() {
        TaxConfiguration config = config("VAT", "Monthly");
        TaxFiling filing = filing(config, "September 2026", BigDecimal.ZERO, "Pending");
        when(taxConfigurationRepository.findAll()).thenReturn(List.of(config));
        lenient().when(taxFilingRepository.findByTaxConfigurationId(1L)).thenReturn(List.of(filing));
        when(taxFilingRepository.findAll()).thenReturn(List.of(filing));
        when(financialReportService.generateVatReturnReport(
                eq(LocalDate.of(2026, 9, 1)), eq(LocalDate.of(2026, 9, 30)), eq(7L)))
                        .thenReturn(vatReport("100.00", "40.00", "60.00"));

        TaxFilingDTO dto = service().getAllFilings(7L).get(0);

        assertEquals(new BigDecimal("60.00"), dto.getLedgerAmount());
    }

    @Test
    void aFiledReturnKeepsTheDeclaredAmountAndSkipsTheLedger() {
        TaxConfiguration config = config("VAT", "Quarterly");
        TaxFiling filing = filing(config, "Q2 2026", new BigDecimal("9000.00"), "Filed");
        filing.setFiledDate("28 Jul 2026");
        when(taxConfigurationRepository.findAll()).thenReturn(List.of(config));
        lenient().when(taxFilingRepository.findByTaxConfigurationId(1L)).thenReturn(List.of(filing));
        when(taxFilingRepository.findAll()).thenReturn(List.of(filing));

        TaxFilingDTO dto = service().getAllFilings().get(0);

        assertEquals(new BigDecimal("9000.00"), dto.getAmount());
        assertNull(dto.getLedgerAmount());
        verify(financialReportService, never()).generateVatReturnReport(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void nonVatTaxTypesGetNoLedgerFigures() {
        TaxConfiguration config = config("Corporate Tax", "Annually");
        TaxFiling filing = filing(config, "FY 2026", new BigDecimal("500.00"), "Pending");
        when(taxConfigurationRepository.findAll()).thenReturn(List.of(config));
        lenient().when(taxFilingRepository.findByTaxConfigurationId(1L)).thenReturn(List.of(filing));
        when(taxFilingRepository.findAll()).thenReturn(List.of(filing));

        TaxFilingDTO dto = service().getAllFilings().get(0);

        assertNull(dto.getLedgerAmount());
        assertNull(dto.getPeriodStart());
        verify(financialReportService, never()).generateVatReturnReport(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void resolvesTheLabelsCreateInitialFilingWrites() {
        assertEquals(LocalDate.of(2026, 1, 1), TaxService.resolvePeriodRange("Q1 2026")[0]);
        assertEquals(LocalDate.of(2026, 3, 31), TaxService.resolvePeriodRange("Q1 2026")[1]);
        assertEquals(LocalDate.of(2026, 10, 1), TaxService.resolvePeriodRange("Q4 2026")[0]);
        assertEquals(LocalDate.of(2026, 12, 31), TaxService.resolvePeriodRange("Q4 2026")[1]);
        assertEquals(LocalDate.of(2026, 2, 1), TaxService.resolvePeriodRange("February 2026")[0]);
        assertEquals(LocalDate.of(2026, 2, 28), TaxService.resolvePeriodRange("February 2026")[1]);
        assertEquals(LocalDate.of(2026, 1, 1), TaxService.resolvePeriodRange("FY 2026")[0]);
        assertEquals(LocalDate.of(2026, 12, 31), TaxService.resolvePeriodRange("FY 2026")[1]);
    }

    @Test
    void unrecognisedPeriodLabelsResolveToNothingRatherThanAWrongRange() {
        assertNull(TaxService.resolvePeriodRange(null));
        assertNull(TaxService.resolvePeriodRange("  "));
        assertNull(TaxService.resolvePeriodRange("Q5 2026"));
        assertNull(TaxService.resolvePeriodRange("2026"));
        assertNull(TaxService.resolvePeriodRange("Smorgasbord 2026"));
    }

    // ---- fixtures ----

    private TaxConfiguration config(String type, String frequency) {
        TaxConfiguration config = new TaxConfiguration();
        config.setId(1L);
        config.setType(type);
        config.setFrequency(frequency);
        config.setStatus("Active");
        config.setRate("5%");
        return config;
    }

    private TaxFiling filing(TaxConfiguration config, String period, BigDecimal amount, String status) {
        TaxFiling filing = new TaxFiling();
        filing.setId(10L);
        filing.setTaxConfiguration(config);
        filing.setPeriod(period);
        filing.setDueDate("28 Oct 2026");
        filing.setAmount(amount);
        filing.setStatus(status);
        filing.setDocuments(0);
        return filing;
    }

    private Map<String, Object> vatReport(String output, String input, String net) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("netOutputTax", new BigDecimal(output));
        report.put("netInputTax", new BigDecimal(input));
        report.put("netVatPayable", new BigDecimal(net));
        return report;
    }
}
