package com.billbull.backend.pos.reports;

import com.billbull.backend.pos.dayclose.PosDayClose;
import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PosReportsService} — the back-office POS Reports read-only
 * browser. Covers: list projections never carry the report JSON, detail endpoints
 * replay the exact stored snapshot (never recompute), and a missing/unparsable
 * snapshot fails loudly rather than silently returning an empty report.
 */
@ExtendWith(MockitoExtension.class)
class PosReportsServiceTest {

    @Mock private PosXReportSnapshotRepository xRepo;
    @Mock private PosDayCloseRepository zRepo;

    private PosReportsService service;

    @BeforeEach
    void setUp() {
        service = new PosReportsService(xRepo, zRepo, new ObjectMapper());
    }

    private PosXReportSnapshot xSnapshot(Long id, String reportJson) {
        PosXReportSnapshot s = new PosXReportSnapshot();
        s.setId(id);
        s.setReportNumber("XR-20260101-00000" + id);
        s.setSessionId(10L + id);
        s.setBranchId(7L);
        s.setBranchName("Main Branch");
        s.setTerminalId("T1");
        s.setCounterName("Main Counter");
        s.setCashierName("cashierA");
        s.setBusinessDate(LocalDate.now());
        s.setGeneratedBy("cashierA");
        s.setGeneratedAt(LocalDateTime.now());
        s.setReportJson(reportJson);
        return s;
    }

    private PosDayClose zRow(Long id, String reportJson) {
        PosDayClose d = new PosDayClose();
        d.setId(id);
        d.setReportNumber("ZR-20260101-00000" + id);
        d.setBranchId(7L);
        d.setBranchName("Main Branch");
        d.setCloseDate(LocalDate.now());
        d.setClosedBy("supervisor1");
        d.setClosedAt(LocalDateTime.now());
        d.setzReportJson(reportJson);
        return d;
    }

    // ---------------------------------------------------------------------
    // listX / listZ — summary metadata only, never the report JSON
    // ---------------------------------------------------------------------

    @Test
    void listXReturnsSummaryRowsWithoutReportJson() {
        PosXReportSnapshot snap = xSnapshot(1L, "{\"summary\":{}}");
        when(xRepo.search(eq(7L), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(snap), PageRequest.of(0, 20), 1));

        PageResponse<PosReportSummary> result = service.listX(7L, null, null, null, null, null, null, null, null, 0, 20);

        assertEquals(1, result.getContent().size());
        PosReportSummary row = result.getContent().get(0);
        assertEquals("XR-20260101-000001", row.getReportNumber());
        assertEquals("X", row.getReportType());
        assertEquals("T1", row.getTerminalId());
        assertEquals("GENERATED", row.getStatus());
        // PosReportSummary has no report-JSON field at all — it physically cannot leak here.
    }

    @Test
    void listZReturnsSummaryRowsWithoutReportJson() {
        PosDayClose row = zRow(5L, "{\"summary\":{}}");
        when(zRepo.search(eq(7L), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(row), PageRequest.of(0, 20), 1));

        PageResponse<PosReportSummary> result = service.listZ(7L, null, null, null, null, 0, 20);

        assertEquals(1, result.getContent().size());
        PosReportSummary summary = result.getContent().get(0);
        assertEquals("ZR-20260101-000005", summary.getReportNumber());
        assertEquals("Z", summary.getReportType());
        assertEquals("COMPLETED", summary.getStatus());
    }

    // ---------------------------------------------------------------------
    // getXDetail / getZDetail — replay the stored snapshot verbatim
    // ---------------------------------------------------------------------

    @Test
    void getXDetailParsesAndReturnsTheStoredSnapshotJson() {
        PosXReportSnapshot snap = xSnapshot(1L, "{\"summary\":{\"totalSales\":123.45},\"reportNumber\":\"XR-20260101-000001\"}");
        when(xRepo.findById(1L)).thenReturn(Optional.of(snap));

        PosReportDetail detail = service.getXDetail(1L);

        assertEquals("XR-20260101-000001", detail.getReportNumber());
        assertEquals("X", detail.getReportType());
        Map<String, Object> report = detail.getReport();
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        assertEquals(123.45, ((Number) summary.get("totalSales")).doubleValue());
    }

    @Test
    void getZDetailParsesAndReturnsTheStoredSnapshotJson() {
        PosDayClose row = zRow(5L, "{\"summary\":{\"totalSales\":999.0}}");
        when(zRepo.findById(5L)).thenReturn(Optional.of(row));

        PosReportDetail detail = service.getZDetail(5L);

        assertEquals("ZR-20260101-000005", detail.getReportNumber());
        assertEquals("Z", detail.getReportType());
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) detail.getReport().get("summary");
        assertEquals(999.0, ((Number) summary.get("totalSales")).doubleValue());
    }

    @Test
    void getXDetailThrowsNotFoundForUnknownId() {
        when(xRepo.findById(999L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.getXDetail(999L));
        assertEquals(404, ex.getStatusCode().value());
    }

    @Test
    void getZDetailThrowsNotFoundForUnknownId() {
        when(zRepo.findById(999L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.getZDetail(999L));
        assertEquals(404, ex.getStatusCode().value());
    }

    @Test
    void getXDetailFailsLoudlyWhenTheStoredSnapshotJsonIsMissing() {
        // A row with no persisted JSON must never silently return an empty/regenerated
        // report — that would defeat the whole point of an immutable snapshot.
        PosXReportSnapshot snap = xSnapshot(1L, null);
        when(xRepo.findById(1L)).thenReturn(Optional.of(snap));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.getXDetail(1L));
        assertEquals(500, ex.getStatusCode().value());
    }

    @Test
    void getZDetailFailsLoudlyWhenTheStoredSnapshotJsonIsUnparsable() {
        PosDayClose row = zRow(5L, "{not valid json");
        when(zRepo.findById(5L)).thenReturn(Optional.of(row));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.getZDetail(5L));
        assertEquals(500, ex.getStatusCode().value());
    }
}
